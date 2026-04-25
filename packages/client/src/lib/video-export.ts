import type { ImageEdit } from 'shared/types';
import { FRAME_W, FRAME_H } from './image-fit';

export interface VideoExportDeps {
  writeFile: (name: string, data: Uint8Array | File) => Promise<void>;
  readFile: (name: string) => Promise<Uint8Array>;
  deleteFile: (name: string) => Promise<void>;
  run: (args: string[]) => Promise<void>;
}

// libx264 + yuv420p needs even dimensions on both axes.
// FRAME_H = 1379 is odd, so we pad to 1380 with a 1px black row at the bottom.
export const VIDEO_OUT_W = FRAME_W;
export const VIDEO_OUT_H = FRAME_H % 2 === 0 ? FRAME_H : FRAME_H + 1;

/**
 * Render `edit` (mediaType==='video') into a 1034×{1379→1380} MP4 with the
 * editor's pan/zoom/rotate baked in. Audio is re-encoded to AAC.
 */
export async function exportVideo(
  edit: ImageEdit,
  deps: VideoExportDeps
): Promise<Blob> {
  if (edit.mediaType !== 'video' || !edit.file) {
    throw new Error('exportVideo requires a video ImageEdit with a source file');
  }

  const inputName = 'input.mp4';
  const outputName = 'output.mp4';

  await deps.writeFile(inputName, edit.file);

  try {
    const filter = buildFilterComplex(edit);
    await deps.run([
      '-i', inputName,
      '-vf', filter,
      '-map', '0:v:0',
      '-map', '0:a?',
      '-c:v', 'libx264',
      // ultrafast: ffmpeg.wasm is single-threaded; libx264 is the bottleneck,
      // so use the cheapest preset. Higher CRF keeps output size sane.
      '-preset', 'ultrafast',
      '-tune', 'fastdecode',
      '-crf', '26',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-ar', '48000',
      '-ac', '2',
      '-b:a', '128k',
      '-movflags', '+faststart',
      '-shortest',
      outputName,
    ]);

    const data = await deps.readFile(outputName);
    return new Blob([data.buffer as ArrayBuffer], { type: 'video/mp4' });
  } finally {
    await deps.deleteFile(inputName);
    await deps.deleteFile(outputName);
  }
}

/**
 * Build the ffmpeg `-vf` (single-stream) filter chain that bakes the edit
 * transform. Mirrors the CSS pipeline used in the preview:
 *   1. scale source by `edit.scale` (uniform) — skipped when scale = 1
 *   2. rotate by `edit.rotation` degrees, expanding the bbox so nothing clips
 *      — skipped when angle = 0
 *   3. pad to a canvas large enough to cover the FRAME at the requested offset
 *   4. crop to FRAME_W × FRAME_H (so the rotated video is centered+offset
 *      in the same coordinate system as the on-screen viewport)
 *   5. pad to even height (yuv420p requirement) and force yuv420p
 *
 * Single-stream is intentional — a color+overlay multi-input chain could hang
 * in ffmpeg.wasm because the synthetic color source's framerate never aligned
 * with the input video's PTS, which prevented EOF propagation.
 */
export function buildFilterComplex(edit: ImageEdit): string {
  const scaledW = Math.max(2, Math.round(edit.naturalWidth * edit.scale));
  const scaledH = Math.max(2, Math.round(edit.naturalHeight * edit.scale));
  const angle = edit.rotation;
  const offX = Math.round(edit.offsetX);
  const offY = Math.round(edit.offsetY);

  // After scale + rotate (with bbox expansion), match ffmpeg's rotw/roth:
  //   rotw(a) = |iw·cos a| + |ih·sin a|
  // Use ceil so any sub-pixel rounding lands inside our pad canvas.
  const rad = (angle * Math.PI) / 180;
  const cosR = Math.abs(Math.cos(rad));
  const sinR = Math.abs(Math.sin(rad));
  const bboxW = Math.ceil(scaledW * cosR + scaledH * sinR);
  const bboxH = Math.ceil(scaledW * sinR + scaledH * cosR);

  // Top-left of the rotated video bbox in output FRAME coords (may be negative
  // if the video extends past the frame's left/top edges).
  const vtlx = Math.round(FRAME_W / 2 + offX - bboxW / 2);
  const vtly = Math.round(FRAME_H / 2 + offY - bboxH / 2);

  // pad places the rotated video at (padX, padY) inside (padW, padH); crop
  // then selects FRAME_W × FRAME_H from (cropX, cropY). pad coords must be
  // ≥ 0, so any negative vtl is absorbed by shifting cropX/cropY instead.
  const padX = Math.max(0, vtlx);
  const padY = Math.max(0, vtly);
  const cropX = Math.max(0, -vtlx);
  const cropY = Math.max(0, -vtly);
  // +2px slack covers any rotw/roth rounding mismatch with ours.
  const padW = Math.max(padX + bboxW, cropX + FRAME_W) + 2;
  const padH = Math.max(padY + bboxH, cropY + FRAME_H) + 2;

  const evenPadPart =
    VIDEO_OUT_H !== FRAME_H
      ? `,pad=${VIDEO_OUT_W}:${VIDEO_OUT_H}:0:0:black`
      : '';

  const parts: string[] = [];
  if (scaledW !== edit.naturalWidth || scaledH !== edit.naturalHeight) {
    parts.push(`scale=${scaledW}:${scaledH}`);
  }
  if (angle !== 0) {
    parts.push(
      `rotate=${angle}*PI/180:ow=rotw(${angle}*PI/180):oh=roth(${angle}*PI/180):c=black`
    );
  }
  parts.push(
    `pad=${padW}:${padH}:${padX}:${padY}:black`,
    `crop=${FRAME_W}:${FRAME_H}:${cropX}:${cropY}`
  );
  return parts.join(',') + `${evenPadPart},format=yuv420p,setsar=1`;
}
