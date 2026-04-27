import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import type { Clip, Project } from 'shared/types';
import { outputDimensions } from './aspect';
import { demuxMp4, type DemuxedAudio } from './mp4-demuxer';

const KEYFRAME_INTERVAL = 60;
const VIDEO_BITRATE = 4_000_000;
const AUDIO_BITRATE = 128_000;
const DECODER_QUEUE_LIMIT = 4;
const ENCODER_QUEUE_LIMIT = 2;
const EMPTY_BUFFER = new Uint8Array(0);
const AAC_FRAME = 1024;

export type ProgressCallback = (ratio: number) => void;

/** True iff this clip+project combo can use the WebCodecs path. */
export function canUseWebCodecsPath(clip: Clip, project: Project): boolean {
  if (typeof VideoEncoder === 'undefined' || typeof VideoDecoder === 'undefined') return false;
  if (typeof AudioEncoder === 'undefined' || typeof AudioDecoder === 'undefined') return false;
  if (clip.type !== 'video' || !clip.file) return false;
  if (project.mode !== 'video' || !project.aspect) return false;
  // atempo + setpts via WebAudio + frame-time rebasing is doable but adds
  // complexity we don't need yet. Speed change falls back to ffmpeg.
  if (clip.effects.speed !== 1) return false;
  return true;
}

/**
 * Single-clip video export via WebCodecs. ~5-10× realtime on hardware-
 * accelerated H.264 vs ~0.3-0.5× realtime for ffmpeg.wasm + libx264 ultrafast.
 *
 * Pipeline:
 *  1. mp4box demuxes source into encoded video samples + AAC audio chunks.
 *  2. VideoDecoder → canvas (crop + scale + pad + container rotation) →
 *     VideoEncoder. Frames outside the trim window are skipped on the way out.
 *  3. AudioDecoder → OfflineAudioContext (volume + fade gain automation +
 *     EQ peaking filter) → AudioEncoder (AAC).
 *  4. mp4-muxer assembles into a clean MP4.
 *
 * `loopCount`: if > 1, the entire trimmed+edited clip is concatenated N times
 * back-to-back into a single output file (each iteration includes the same
 * fades — they re-trigger at every loop boundary, which is what the user
 * asked for).
 */
export async function exportClipVideoWebCodecs(
  clip: Clip,
  project: Project,
  onProgress?: ProgressCallback,
  loopCount: number = 1
): Promise<Blob> {
  if (!canUseWebCodecsPath(clip, project)) {
    throw new Error('webcodecs_path_unsupported');
  }
  const safeLoopCount = Math.max(1, Math.floor(loopCount));

  const demux = await demuxMp4(clip.file!);

  const codedW = demux.video.codedWidth;
  const codedH = demux.video.codedHeight;
  const rotationDeg = ((demux.video.rotationDeg % 360) + 360) % 360;
  const isRotated = rotationDeg === 90 || rotationDeg === 270;
  const viewW = isRotated ? codedH : codedW;
  const viewH = isRotated ? codedW : codedH;

  // Output dims: 'original' uses the clip's source dims (what the user sees);
  // any other aspect uses the canonical 1080-baseline output.
  const baseOutDims =
    project.aspect === 'original'
      ? { w: clip.sourceWidth ?? viewW, h: clip.sourceHeight ?? viewH }
      : outputDimensions(project.aspect!);
  // H.264 requires even dimensions.
  const outW = baseOutDims.w + (baseOutDims.w % 2);
  const outH = baseOutDims.h + (baseOutDims.h % 2);

  // Crop in view coordinates (post container-rotation).
  const cropNorm = clip.crop ?? { x: 0, y: 0, width: 1, height: 1 };
  const cropX = cropNorm.x * viewW;
  const cropY = cropNorm.y * viewH;
  const cropW = cropNorm.width * viewW;
  const cropH = cropNorm.height * viewH;

  // Letterbox: scale crop to fit output, center it.
  const fitScale = Math.min(outW / cropW, outH / cropH);
  const dstW = cropW * fitScale;
  const dstH = cropH * fitScale;
  const offX = (outW - dstW) / 2;
  const offY = (outH - dstH) / 2;

  // Trim window in microseconds (re-base output to start at 0).
  const trimStartUs = Math.max(0, Math.round(clip.trim.start * 1_000_000));
  const trimEndUs = Math.round(clip.trim.end * 1_000_000);
  const baseDurationUs = Math.max(0, trimEndUs - trimStartUs);

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width: outW, height: outH },
    audio: demux.audio
      ? {
          codec: 'aac',
          numberOfChannels: demux.audio.channelCount,
          sampleRate: demux.audio.sampleRate,
        }
      : undefined,
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
  });

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('canvas_2d_unavailable');

  let pipelineError: Error | null = null;
  let encodedFrames = 0;

  // Frames per loop iteration = those whose decoded timestamp lies in [trimStart, trimEnd).
  const framesPerIteration =
    demux.video.samples.filter(
      (s) => s.timestamp >= trimStartUs && s.timestamp < trimEndUs
    ).length || demux.video.samples.length;
  const totalEncodeFrames = framesPerIteration * safeLoopCount;
  let lastProgressEmit = 0;
  let currentLoopShiftUs = 0; // updated per loop iteration

  const videoEncoder = new VideoEncoder({
    output: (chunk, metadata) => {
      try {
        muxer.addVideoChunk(chunk, metadata);
      } catch (e) {
        pipelineError = pipelineError ?? (e instanceof Error ? e : new Error(String(e)));
      }
    },
    error: (e) => {
      pipelineError = pipelineError ?? e;
    },
  });
  videoEncoder.configure({
    codec: 'avc1.42E029',
    width: outW,
    height: outH,
    bitrate: VIDEO_BITRATE,
    framerate: 30,
    hardwareAcceleration: 'prefer-hardware',
    latencyMode: 'realtime',
  });

  const fadeInSec = clip.effects.fadeIn;
  const fadeOutSec = clip.effects.fadeOut;
  const iterationDurationSec = baseDurationUs / 1_000_000;

  const drawAndEncode = (frame: VideoFrame, frameIndex: number): void => {
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, outW, outH);
    ctx.save();
    // letterbox positioning in output
    ctx.translate(offX, offY);
    // crop → dst scale
    ctx.scale(fitScale, fitScale);
    // align crop top-left to origin
    ctx.translate(-cropX, -cropY);
    // coded → view rotation (matches phone container rotation)
    switch (rotationDeg) {
      case 90:
        ctx.translate(viewW, 0);
        ctx.rotate(Math.PI / 2);
        break;
      case 180:
        ctx.translate(viewW, viewH);
        ctx.rotate(Math.PI);
        break;
      case 270:
        ctx.translate(0, viewH);
        ctx.rotate((3 * Math.PI) / 2);
        break;
    }
    ctx.drawImage(frame, 0, 0);
    ctx.restore();

    // Visual fade — black overlay alpha computed from the iteration-local
    // time. Each loop iteration starts at trim.start in source space, so
    // localSec is independent of currentLoopShiftUs.
    const localSec = (frame.timestamp - trimStartUs) / 1_000_000;
    let alpha = 0;
    if (fadeInSec > 0 && localSec < fadeInSec) {
      alpha = Math.max(alpha, 1 - localSec / fadeInSec);
    }
    if (
      fadeOutSec > 0 &&
      localSec > iterationDurationSec - fadeOutSec
    ) {
      const into = localSec - (iterationDurationSec - fadeOutSec);
      alpha = Math.max(alpha, Math.min(1, into / fadeOutSec));
    }
    if (alpha > 0) {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = 'black';
      ctx.fillRect(0, 0, outW, outH);
      ctx.globalAlpha = 1;
    }

    const newTs = frame.timestamp - trimStartUs + currentLoopShiftUs;
    const encoded = new VideoFrame(canvas, {
      timestamp: newTs,
      ...(frame.duration && frame.duration > 0 ? { duration: frame.duration } : {}),
    });
    try {
      videoEncoder.encode(encoded, {
        keyFrame: frameIndex % KEYFRAME_INTERVAL === 0,
      });
    } finally {
      encoded.close();
    }
  };

  // Make a fresh VideoDecoder for each loop iteration. After flush() the
  // decoder is technically reusable but creating a new one each time is the
  // safest bet against subtle internal-state issues.
  const buildDecoder = () => new VideoDecoder({
    output: (frame) => {
      if (pipelineError) {
        frame.close();
        return;
      }
      try {
        if (frame.timestamp < trimStartUs || frame.timestamp >= trimEndUs) {
          frame.close();
          return;
        }
        drawAndEncode(frame, encodedFrames);
        encodedFrames++;
        const now = performance.now();
        if (totalEncodeFrames > 0 && now - lastProgressEmit > 100) {
          // Reserve final 5% for audio + mux.
          onProgress?.(Math.min(0.95, (encodedFrames / totalEncodeFrames) * 0.95));
          lastProgressEmit = now;
        }
      } catch (e) {
        pipelineError = pipelineError ?? (e instanceof Error ? e : new Error(String(e)));
      } finally {
        frame.close();
      }
    },
    error: (e) => {
      pipelineError = pipelineError ?? e;
    },
  });

  // For loops > 1 we need the sample data again on each iteration, so we
  // can't clear it after the first feed. For loopCount === 1 we still clear
  // to keep memory tight on long single-shot exports.
  for (let loopIdx = 0; loopIdx < safeLoopCount; loopIdx++) {
    if (pipelineError) break;
    currentLoopShiftUs = loopIdx * baseDurationUs;

    const videoDecoder = buildDecoder();
    videoDecoder.configure({
      codec: demux.video.codec,
      codedWidth: codedW,
      codedHeight: codedH,
      description: demux.video.description,
    });

    for (const sample of demux.video.samples) {
      if (pipelineError) break;
      if (sample.timestamp >= trimEndUs) break;
      // If a previous loop cleared this, skip — shouldn't happen now since
      // we only clear when loopCount === 1.
      if (sample.data === EMPTY_BUFFER) continue;
      while (
        (videoDecoder.decodeQueueSize > DECODER_QUEUE_LIMIT ||
          videoEncoder.encodeQueueSize > ENCODER_QUEUE_LIMIT) &&
        !pipelineError
      ) {
        await new Promise<void>((r) => setTimeout(r, 10));
      }
      videoDecoder.decode(
        new EncodedVideoChunk({
          type: sample.isKey ? 'key' : 'delta',
          timestamp: sample.timestamp,
          duration: sample.duration,
          data: sample.data,
        })
      );
      if (safeLoopCount === 1) {
        sample.data = EMPTY_BUFFER;
      }
    }

    await videoDecoder.flush();
    videoDecoder.close();
    if (pipelineError) throw pipelineError;
  }

  await videoEncoder.flush();
  videoEncoder.close();
  if (pipelineError) throw pipelineError;

  // Audio path: AAC source decoded → effects via OfflineAudioContext → AAC re-encoded.
  if (demux.audio && demux.audio.samples.length > 0) {
    const codec = demux.audio.codec.toLowerCase();
    if (codec.startsWith('mp4a') || codec === 'opus') {
      try {
        await processAudioWithEffects(
          demux.audio,
          clip,
          muxer,
          trimStartUs,
          trimEndUs,
          safeLoopCount
        );
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[webcodecs] audio failed, exporting silent:', e);
      }
    } else {
      // eslint-disable-next-line no-console
      console.warn(
        `[webcodecs] unsupported audio codec "${demux.audio.codec}", exporting silently`
      );
    }
  }

  muxer.finalize();
  onProgress?.(1);

  return new Blob([muxer.target.buffer], { type: 'video/mp4' });
}

async function processAudioWithEffects(
  audio: DemuxedAudio,
  clip: Clip,
  muxer: Muxer<ArrayBufferTarget>,
  trimStartUs: number,
  trimEndUs: number,
  loopCount: number
): Promise<void> {
  const sampleRate = audio.sampleRate;
  const numChannels = audio.channelCount;

  // 1. Decode source audio → planar PCM chunks
  let pipelineError: Error | null = null;
  const decodedChunks: Float32Array[][] = [];
  let totalSourceFrames = 0;

  const audioDecoder = new AudioDecoder({
    output: (data) => {
      try {
        const numFrames = data.numberOfFrames;
        const channelData: Float32Array[] = [];
        for (let ch = 0; ch < numChannels; ch++) {
          const buf = new Float32Array(numFrames);
          data.copyTo(buf, { planeIndex: ch, format: 'f32-planar' });
          channelData.push(buf);
        }
        decodedChunks.push(channelData);
        totalSourceFrames += numFrames;
      } catch (e) {
        pipelineError = pipelineError ?? (e instanceof Error ? e : new Error(String(e)));
      } finally {
        data.close();
      }
    },
    error: (e) => {
      pipelineError = pipelineError ?? e;
    },
  });

  const decoderCodec = audio.codec.toLowerCase().startsWith('mp4a')
    ? 'mp4a.40.2'
    : audio.codec;
  audioDecoder.configure({
    codec: decoderCodec,
    sampleRate,
    numberOfChannels: numChannels,
    ...(audio.description ? { description: audio.description } : {}),
  });

  for (const sample of audio.samples) {
    if (pipelineError) break;
    audioDecoder.decode(
      new EncodedAudioChunk({
        type: 'key',
        timestamp: sample.timestamp,
        duration: sample.duration,
        data: sample.data,
      })
    );
  }
  await audioDecoder.flush();
  audioDecoder.close();
  if (pipelineError) throw pipelineError;

  if (totalSourceFrames === 0) return;

  // 2. Trim window in seconds + samples
  const trimStartSec = trimStartUs / 1_000_000;
  const trimEndSec = trimEndUs / 1_000_000;
  const trimDurationSec = Math.max(0, trimEndSec - trimStartSec);
  const trimSamples = Math.max(1, Math.round(trimDurationSec * sampleRate));

  // 3. OfflineAudioContext renders only the trim slice.
  const offlineCtx = new OfflineAudioContext(numChannels, trimSamples, sampleRate);
  const sourceBuffer = offlineCtx.createBuffer(numChannels, totalSourceFrames, sampleRate);
  for (let ch = 0; ch < numChannels; ch++) {
    const channelData = sourceBuffer.getChannelData(ch);
    let offset = 0;
    for (const chunk of decodedChunks) {
      if (chunk[ch]) {
        channelData.set(chunk[ch], offset);
        offset += chunk[ch].length;
      }
    }
  }

  const sourceNode = offlineCtx.createBufferSource();
  sourceNode.buffer = sourceBuffer;

  // 4. Effects chain: source → [EQ] → gain (volume + fades) → destination
  let lastNode: AudioNode = sourceNode;
  switch (clip.effects.eqPreset) {
    case 'bass-boost': {
      const eq = offlineCtx.createBiquadFilter();
      eq.type = 'peaking';
      eq.frequency.value = 100;
      eq.Q.value = 2;
      eq.gain.value = 6;
      lastNode.connect(eq);
      lastNode = eq;
      break;
    }
    case 'vocal-clarity': {
      const eq = offlineCtx.createBiquadFilter();
      eq.type = 'peaking';
      eq.frequency.value = 3000;
      eq.Q.value = 1.5;
      eq.gain.value = 4;
      lastNode.connect(eq);
      lastNode = eq;
      break;
    }
    case 'treble-boost': {
      const eq = offlineCtx.createBiquadFilter();
      eq.type = 'peaking';
      eq.frequency.value = 8000;
      eq.Q.value = 2;
      eq.gain.value = 5;
      lastNode.connect(eq);
      lastNode = eq;
      break;
    }
  }

  const gainNode = offlineCtx.createGain();
  const volume = clip.effects.volume;
  const fadeIn = Math.min(clip.effects.fadeIn, trimDurationSec);
  const fadeOut = Math.min(clip.effects.fadeOut, Math.max(0, trimDurationSec - fadeIn));

  if (fadeIn > 0) {
    gainNode.gain.setValueAtTime(0, 0);
    gainNode.gain.linearRampToValueAtTime(volume, fadeIn);
  } else {
    gainNode.gain.setValueAtTime(volume, 0);
  }
  if (fadeOut > 0) {
    const fadeOutStart = trimDurationSec - fadeOut;
    gainNode.gain.setValueAtTime(volume, fadeOutStart);
    gainNode.gain.linearRampToValueAtTime(0, trimDurationSec);
  }

  lastNode.connect(gainNode);
  gainNode.connect(offlineCtx.destination);

  // Play just the trim slice of the source.
  sourceNode.start(0, trimStartSec, trimDurationSec);

  const rendered = await offlineCtx.startRendering();

  // 5. Encode the rendered AudioBuffer to AAC (1024-sample frames).
  const audioEncoder = new AudioEncoder({
    output: (chunk, metadata) => {
      try {
        muxer.addAudioChunk(chunk, metadata);
      } catch (e) {
        pipelineError = pipelineError ?? (e instanceof Error ? e : new Error(String(e)));
      }
    },
    error: (e) => {
      pipelineError = pipelineError ?? e;
    },
  });
  audioEncoder.configure({
    codec: 'mp4a.40.2',
    sampleRate,
    numberOfChannels: numChannels,
    bitrate: AUDIO_BITRATE,
  });

  const renderedLen = rendered.length;
  const channelBuffers: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channelBuffers.push(rendered.getChannelData(ch));
  }

  // Encode N copies back-to-back, shifting timestamps by the rendered slice
  // duration on each iteration.
  const iterationDurationUs = Math.round((renderedLen / sampleRate) * 1_000_000);
  for (let loopIdx = 0; loopIdx < loopCount; loopIdx++) {
    if (pipelineError) break;
    const tsShiftUs = loopIdx * iterationDurationUs;
    for (let i = 0; i < renderedLen; i += AAC_FRAME) {
      if (pipelineError) break;
      const frameLen = Math.min(AAC_FRAME, renderedLen - i);
      const planarData = new Float32Array(frameLen * numChannels);
      for (let ch = 0; ch < numChannels; ch++) {
        planarData.set(channelBuffers[ch].subarray(i, i + frameLen), ch * frameLen);
      }
      const audioData = new AudioData({
        format: 'f32-planar',
        sampleRate,
        numberOfFrames: frameLen,
        numberOfChannels: numChannels,
        timestamp: tsShiftUs + Math.round((i / sampleRate) * 1_000_000),
        data: planarData,
      });
      try {
        audioEncoder.encode(audioData);
      } finally {
        audioData.close();
      }
    }
  }

  await audioEncoder.flush();
  audioEncoder.close();
  if (pipelineError) throw pipelineError;
}
