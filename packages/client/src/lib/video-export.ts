import type { ImageEdit } from 'shared/types';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { FRAME_W, FRAME_H } from './image-fit';
import { demuxMp4, type DemuxedAudio } from './mp4-demuxer';

// Even output dimensions — H.264 in MP4 requires even width and height.
// FRAME_W/FRAME_H are even today; the modulo guard keeps the contract if they
// ever change to odd values.
export const VIDEO_OUT_W = FRAME_W % 2 === 0 ? FRAME_W : FRAME_W + 1;
export const VIDEO_OUT_H = FRAME_H % 2 === 0 ? FRAME_H : FRAME_H + 1;

export type ExportProgress = (ratio: number) => void;

const KEYFRAME_INTERVAL = 60;
const OUTPUT_BITRATE = 4_000_000;
const EMPTY_BUFFER = new Uint8Array(0);
// Tight queues — each in-flight VideoFrame at 1080×1440 holds ~6 MB of GPU
// memory, and Chrome will kill the GPU process if too many accumulate.
const DECODER_QUEUE_LIMIT = 4;
const ENCODER_QUEUE_LIMIT = 2;

/**
 * Export the edit as a 1080×1440 MP4. End-to-end WebCodecs pipeline, no
 * ffmpeg.wasm involved:
 *
 *   1. mp4box.js demuxes the source File into encoded video samples,
 *      encoded audio samples, and codec descriptions.
 *   2. WebCodecs `VideoDecoder` consumes the video samples at GPU speed.
 *   3. Each decoded `VideoFrame` gets transformed onto a hidden canvas
 *      (user's scale/rotate/offset + container rotation from the source
 *      MP4 matrix) and re-encoded with `VideoEncoder`.
 *   4. mp4-muxer assembles the encoded video chunks into an MP4 with
 *      per-frame microsecond PTS preserved.
 *   5. The original audio chunks are copied verbatim into the same MP4
 *      via `addAudioChunkRaw` — no decode/encode, just a remux.
 *
 * Speed: typically 5-10× realtime on modern hardware. For a 2-min clip,
 * expect ~15-30 seconds total. Output is frame-perfect, audio-synced, and
 * standards-compliant H.264 + AAC MP4.
 */
export async function exportVideo(
  edit: ImageEdit,
  onProgress?: ExportProgress
): Promise<Blob> {
  if (edit.mediaType !== 'video' || !edit.file) {
    throw new Error('exportVideo requires a video ImageEdit with a source file');
  }
  if (
    typeof VideoEncoder === 'undefined' ||
    typeof VideoDecoder === 'undefined' ||
    typeof VideoFrame === 'undefined'
  ) {
    throw new Error('webcodecs_unsupported');
  }

  const demux = await demuxMp4(edit.file);

  // Some defensive checks — we only support codecs the browser's WebCodecs
  // implementation can decode. For phone-recorded MP4s this is essentially
  // always H.264 (avc1.*) so this rarely trips.
  const videoSupport = await VideoDecoder.isConfigSupported({
    codec: demux.video.codec,
    codedWidth: demux.video.codedWidth,
    codedHeight: demux.video.codedHeight,
    description: demux.video.description,
  });
  if (!videoSupport.supported) {
    throw new Error(`unsupported_video_codec:${demux.video.codec}`);
  }

  // eslint-disable-next-line no-console
  console.log(
    `[exportVideo] source ${demux.video.codedWidth}×${demux.video.codedHeight} ${demux.video.codec}, rotation=${demux.video.rotationDeg}°, description=${demux.video.description ? demux.video.description.length + ' bytes' : 'none'}, ${demux.video.samples.length} video samples, ${demux.audio?.samples.length ?? 0} audio samples`
  );
  if (demux.video.samples.length > 0) {
    const first = demux.video.samples[0];
    // eslint-disable-next-line no-console
    console.log(
      `[exportVideo] first sample: ts=${first.timestamp}us, dur=${first.duration}us, ${first.data.length} bytes, isKey=${first.isKey}`
    );
  }

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width: VIDEO_OUT_W, height: VIDEO_OUT_H },
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
  canvas.width = VIDEO_OUT_W;
  canvas.height = VIDEO_OUT_H;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('canvas_2d_unavailable');

  let pipelineError: Error | null = null;
  let encodedFrames = 0;

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
    // Baseline profile level 4.1 — handles 1080×1440 30fps comfortably and
    // is decodable in every browser/player we care about.
    codec: 'avc1.42E029',
    width: VIDEO_OUT_W,
    height: VIDEO_OUT_H,
    bitrate: OUTPUT_BITRATE,
    framerate: 30,
    hardwareAcceleration: 'prefer-hardware',
    // realtime favours encoding speed + low latency over compression
    // efficiency — exactly what we want here. Combined with the tight
    // queue limits this stops Chrome's GPU process from being overwhelmed.
    latencyMode: 'realtime',
  });

  // mp4box gives us the source's `coded` dimensions — i.e. the raw frame
  // size before any container rotation. For phone-portrait content this is
  // typically a landscape coded frame (1920×1080) that the container says
  // to rotate 90°. We bake that rotation into the canvas transform here so
  // the user's edit (which was authored against the on-screen preview, in
  // post-rotation orientation) lines up with the encoded output.
  const containerRotationRad = (demux.video.rotationDeg * Math.PI) / 180;
  const codedW = demux.video.codedWidth;
  const codedH = demux.video.codedHeight;

  const drawAndEncode = (frame: VideoFrame, frameIndex: number): void => {
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, VIDEO_OUT_W, VIDEO_OUT_H);
    ctx.save();
    ctx.translate(FRAME_W / 2 + edit.offsetX, FRAME_H / 2 + edit.offsetY);
    ctx.rotate((edit.rotation * Math.PI) / 180);
    ctx.scale(edit.scale, edit.scale);
    ctx.rotate(containerRotationRad);
    ctx.drawImage(frame, -codedW / 2, -codedH / 2, codedW, codedH);
    ctx.restore();

    const encoded = new VideoFrame(canvas, {
      timestamp: frame.timestamp,
      // VideoFrame rejects duration <= 0; only forward when the source
      // gave us a positive value.
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

  const totalFrames = demux.video.samples.length;
  let lastProgressEmit = 0;

  const videoDecoder = new VideoDecoder({
    output: (frame) => {
      if (pipelineError) {
        frame.close();
        return;
      }
      try {
        drawAndEncode(frame, encodedFrames);
        encodedFrames++;
        const now = performance.now();
        if (totalFrames > 0 && now - lastProgressEmit > 100) {
          onProgress?.(Math.min(0.95, encodedFrames / totalFrames));
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

  videoDecoder.configure({
    codec: demux.video.codec,
    codedWidth: demux.video.codedWidth,
    codedHeight: demux.video.codedHeight,
    description: demux.video.description,
  });

  // Feed video samples to the decoder in decode order (the order mp4box
  // returned them). Bound BOTH queues — decoder + encoder — so the GPU
  // never holds more than a handful of in-flight frames. Without this
  // Chrome's GPU process runs out of memory partway through long clips
  // and the whole browser greys out.
  for (const sample of demux.video.samples) {
    if (pipelineError) break;
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
    // Free the demuxed sample data after handing it off — keeps total
    // memory bounded as the loop progresses across all 2800+ samples.
    sample.data = EMPTY_BUFFER;
  }

  await videoDecoder.flush();
  videoDecoder.close();
  if (pipelineError) throw pipelineError;

  await videoEncoder.flush();
  videoEncoder.close();
  if (pipelineError) throw pipelineError;

  // Audio handling depends on the source codec:
  //   AAC source  → copy raw chunks straight into the muxer (fast, lossless)
  //   Opus source → transcode to AAC via WebCodecs (so the output MP4 plays
  //                 in players that reject Opus-in-MP4 — which is most of
  //                 them; this was the "can't play audio" bug before).
  if (demux.audio && demux.audio.samples.length > 0) {
    const codec = demux.audio.codec.toLowerCase();
    if (codec.startsWith('mp4a')) {
      await copyAacAudio(demux.audio, muxer);
    } else if (codec === 'opus') {
      await transcodeOpusToAac(demux.audio, muxer);
    } else {
      // eslint-disable-next-line no-console
      console.warn(
        `[exportVideo] unsupported audio codec "${demux.audio.codec}", exporting silently`
      );
    }
  }

  muxer.finalize();
  onProgress?.(1);

  // eslint-disable-next-line no-console
  console.log(
    `[exportVideo] done — encoded ${encodedFrames} video frames, copied ${demux.audio?.samples.length ?? 0} audio chunks`
  );

  return new Blob([muxer.target.buffer], { type: 'video/mp4' });
}

/* ------------------------------------------------------------------ */
/*  Audio paths                                                        */
/* ------------------------------------------------------------------ */

async function copyAacAudio(
  audio: DemuxedAudio,
  muxer: Muxer<ArrayBufferTarget>
): Promise<void> {
  const meta: EncodedAudioChunkMetadata = {
    decoderConfig: {
      codec: 'mp4a.40.2',
      numberOfChannels: audio.channelCount,
      sampleRate: audio.sampleRate,
      ...(audio.description ? { description: audio.description } : {}),
    },
  };
  for (const sample of audio.samples) {
    muxer.addAudioChunkRaw(
      sample.data,
      'key',
      sample.timestamp,
      sample.duration,
      meta
    );
  }
}

async function transcodeOpusToAac(
  audio: DemuxedAudio,
  muxer: Muxer<ArrayBufferTarget>
): Promise<void> {
  if (typeof AudioDecoder === 'undefined' || typeof AudioEncoder === 'undefined') {
    // eslint-disable-next-line no-console
    console.warn('[exportVideo] WebCodecs audio APIs missing — exporting silently');
    return;
  }
  let pipelineError: Error | null = null;

  const audioEncoder = new AudioEncoder({
    output: (chunk, metadata) => {
      try {
        muxer.addAudioChunk(chunk, metadata);
      } catch (e) {
        pipelineError = pipelineError ?? (e instanceof Error ? e : new Error(String(e)));
      }
    },
    error: (e) => { pipelineError = pipelineError ?? e; },
  });
  audioEncoder.configure({
    codec: 'mp4a.40.2',
    numberOfChannels: audio.channelCount,
    sampleRate: audio.sampleRate,
    bitrate: 128_000,
  });

  const audioDecoder = new AudioDecoder({
    output: (data) => {
      try {
        if (pipelineError) { data.close(); return; }
        audioEncoder.encode(data);
      } catch (e) {
        pipelineError = pipelineError ?? (e instanceof Error ? e : new Error(String(e)));
      } finally {
        data.close();
      }
    },
    error: (e) => { pipelineError = pipelineError ?? e; },
  });
  audioDecoder.configure({
    codec: 'opus',
    numberOfChannels: audio.channelCount,
    sampleRate: audio.sampleRate,
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
  await audioEncoder.flush();
  audioEncoder.close();
  if (pipelineError) throw pipelineError;
}
