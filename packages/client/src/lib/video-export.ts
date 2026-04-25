import type { ImageEdit } from 'shared/types';
import { FRAME_W, FRAME_H } from './image-fit';

// Even output dimensions — the H.264/H.265 muxers most browsers expose via
// MediaRecorder require even width and height. FRAME_H = 1379 is odd, so we
// pad to 1380 with a 1px black row at the bottom.
export const VIDEO_OUT_W = FRAME_W;
export const VIDEO_OUT_H = FRAME_H % 2 === 0 ? FRAME_H : FRAME_H + 1;

/**
 * Mime types we will try, in order of preference. MP4 first because the user
 * asked for MP4; WebM is the universal fallback. The browser's MediaRecorder
 * tells us which it actually supports.
 */
const PREFERRED_MIMES: ReadonlyArray<string> = [
  'video/mp4;codecs=avc1',
  'video/mp4;codecs=h264',
  'video/mp4',
  'video/webm;codecs=h264',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
];

export interface VideoExportResult {
  blob: Blob;
  /** File extension matching the actual encoded format. */
  extension: 'mp4' | 'webm';
}

/**
 * Render `edit` (mediaType==='video') into a 1034×1380 video with the editor's
 * pan/zoom/rotate baked in. Uses canvas + MediaRecorder, which runs at
 * roughly real-time speed (hardware-accelerated) — ffmpeg.wasm's libx264 was
 * 5–10× slower than realtime and made the export feel hung.
 *
 * `onProgress` is called with a value in [0, 1] tracking video playback position.
 */
export async function exportVideo(
  edit: ImageEdit,
  onProgress?: (ratio: number) => void
): Promise<VideoExportResult> {
  if (edit.mediaType !== 'video' || !edit.file) {
    throw new Error('exportVideo requires a video ImageEdit with a source file');
  }
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('mediarecorder_unsupported');
  }

  const mimeType = PREFERRED_MIMES.find((m) => MediaRecorder.isTypeSupported(m));
  if (!mimeType) throw new Error('no_supported_mime');
  const extension: 'mp4' | 'webm' = mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';

  // Use a fresh object URL for the source — we want the source video
  // independent of the preview element so we can drive playback for export
  // without disturbing the user's scrub position.
  const sourceUrl = URL.createObjectURL(edit.file);
  const video = document.createElement('video');
  video.src = sourceUrl;
  video.crossOrigin = 'anonymous';
  video.playsInline = true;
  video.preload = 'auto';
  video.muted = false;

  const cleanups: Array<() => void> = [
    () => URL.revokeObjectURL(sourceUrl),
  ];
  const cleanup = () => {
    while (cleanups.length) {
      try { cleanups.pop()!(); } catch { /* swallow */ }
    }
  };

  try {
    await new Promise<void>((resolve, reject) => {
      const onLoaded = () => { video.removeEventListener('error', onError); resolve(); };
      const onError = () => reject(new Error('video_load_failed'));
      video.addEventListener('loadeddata', onLoaded, { once: true });
      video.addEventListener('error', onError, { once: true });
    });

    const canvas = document.createElement('canvas');
    canvas.width = VIDEO_OUT_W;
    canvas.height = VIDEO_OUT_H;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('canvas_2d_unavailable');

    // Capture canvas as a video stream. 30 fps is a sensible default that
    // matches typical web video; the recorder samples whatever the canvas
    // contains at that rate.
    const fps = 30;
    type StreamCanvas = HTMLCanvasElement & {
      captureStream?: (frameRate?: number) => MediaStream;
    };
    type StreamVideo = HTMLVideoElement & {
      captureStream?: () => MediaStream;
      mozCaptureStream?: () => MediaStream;
    };

    const streamCanvas = canvas as StreamCanvas;
    const stream = streamCanvas.captureStream
      ? streamCanvas.captureStream(fps)
      : null;
    if (!stream) throw new Error('canvas_captureStream_unavailable');

    // Best-effort: pull audio off the source video. Some browsers don't
    // expose captureStream on <video>; in that case the export is silent
    // (still better than not exporting at all).
    try {
      const streamVideo = video as StreamVideo;
      const sourceStream =
        streamVideo.captureStream?.() ?? streamVideo.mozCaptureStream?.();
      const audioTracks = sourceStream?.getAudioTracks?.() ?? [];
      for (const track of audioTracks) stream.addTrack(track);
    } catch {
      /* no audio — accept silent export */
    }

    cleanups.push(() => {
      for (const t of stream.getTracks()) t.stop();
    });

    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 6_000_000,
    });

    const chunks: Blob[] = [];
    recorder.addEventListener('dataavailable', (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    });

    let stopRequested = false;

    const drawFrame = () => {
      ctx.fillStyle = 'black';
      ctx.fillRect(0, 0, VIDEO_OUT_W, VIDEO_OUT_H);
      ctx.save();
      // Same transform pipeline as the on-screen preview:
      //   translate → translate(offset) → rotate → scale, drawing the source
      //   centered on the origin.
      ctx.translate(FRAME_W / 2 + edit.offsetX, FRAME_H / 2 + edit.offsetY);
      ctx.rotate((edit.rotation * Math.PI) / 180);
      ctx.scale(edit.scale, edit.scale);
      ctx.drawImage(
        video,
        -edit.naturalWidth / 2,
        -edit.naturalHeight / 2,
        edit.naturalWidth,
        edit.naturalHeight
      );
      ctx.restore();
    };

    let rafHandle = 0;
    const renderLoop = () => {
      if (stopRequested) return;
      drawFrame();
      const dur = edit.duration ?? video.duration ?? 0;
      if (dur > 0) onProgress?.(Math.min(1, video.currentTime / dur));
      rafHandle = requestAnimationFrame(renderLoop);
    };

    cleanups.push(() => {
      stopRequested = true;
      cancelAnimationFrame(rafHandle);
    });

    return await new Promise<VideoExportResult>((resolve, reject) => {
      recorder.addEventListener('stop', () => {
        const blob = new Blob(chunks, { type: mimeType.split(';')[0] });
        cleanup();
        resolve({ blob, extension });
      });
      recorder.addEventListener('error', (e: Event) => {
        cleanup();
        reject(new Error(`mediarecorder_error: ${(e as ErrorEvent).message ?? 'unknown'}`));
      });

      video.addEventListener('ended', () => {
        stopRequested = true;
        // Brief flush window so MediaRecorder finalises the last frames.
        window.setTimeout(() => {
          if (recorder.state !== 'inactive') recorder.stop();
        }, 150);
      }, { once: true });

      try {
        recorder.start(250);
        video.currentTime = 0;
        video
          .play()
          .then(() => renderLoop())
          .catch((err) => {
            cleanup();
            reject(err instanceof Error ? err : new Error('video_play_failed'));
          });
      } catch (err) {
        cleanup();
        reject(err instanceof Error ? err : new Error('export_setup_failed'));
      }
    });
  } catch (err) {
    cleanup();
    throw err;
  }
}
