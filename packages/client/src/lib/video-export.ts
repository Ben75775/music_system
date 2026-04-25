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
      '-filter_complex', filter,
      '-map', '[out]',
      '-map', '0:a?',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '23',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-ar', '48000',
      '-ac', '2',
      '-b:a', '128k',
      '-movflags', '+faststart',
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
 * Build the ffmpeg filter_complex string that bakes the edit transform.
 *
 * Mirrors the CSS pipeline used in the preview:
 *   1. scale source by `edit.scale` (uniform)
 *   2. rotate by `edit.rotation` degrees, expanding the bbox so nothing clips
 *   3. composite onto a FRAME_W × FRAME_H black canvas, with the rotated image
 *      centered and offset by (offsetX, offsetY) — same coordinate system as
 *      the on-screen viewport
 *   4. pad to even height (yuv420p requirement) and force yuv420p
 */
export function buildFilterComplex(edit: ImageEdit): string {
  const scaledW = Math.max(2, Math.round(edit.naturalWidth * edit.scale));
  const scaledH = Math.max(2, Math.round(edit.naturalHeight * edit.scale));
  const angle = edit.rotation;
  const offX = Math.round(edit.offsetX);
  const offY = Math.round(edit.offsetY);
  const dur = Math.max(1, Math.ceil((edit.duration ?? 0) + 1));

  const padPart =
    VIDEO_OUT_H !== FRAME_H
      ? `,pad=${VIDEO_OUT_W}:${VIDEO_OUT_H}:0:0:black`
      : '';

  return [
    `[0:v]scale=${scaledW}:${scaledH},rotate=${angle}*PI/180:ow=rotw(${angle}*PI/180):oh=roth(${angle}*PI/180):c=black[r]`,
    `color=c=black:s=${FRAME_W}x${FRAME_H}:d=${dur}[bg]`,
    `[bg][r]overlay=x=(W-w)/2+${offX}:y=(H-h)/2+${offY}:shortest=1${padPart},format=yuv420p,setsar=1[out]`,
  ].join(';');
}
