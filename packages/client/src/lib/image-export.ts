import type { ImageEdit } from 'shared/types';
import { FRAME_W, FRAME_H, baseCoverScale } from './image-fit';

/**
 * Render the current image edit into a 1034×1379 PNG blob using the same
 * transform convention as the preview:
 *   translate(frame-center + offset) → rotate → scale → draw image centered at origin.
 */
export async function exportImage(edit: ImageEdit): Promise<Blob> {
  const img = await loadImage(edit.src);

  const canvas = document.createElement('canvas');
  canvas.width = FRAME_W;
  canvas.height = FRAME_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');

  const cover = baseCoverScale(edit.naturalWidth, edit.naturalHeight, edit.rotation);
  const drawScale = cover * edit.scale;

  ctx.imageSmoothingQuality = 'high';

  // Compose: translate to frame center + user offset, rotate, scale, then draw centered.
  ctx.translate(FRAME_W / 2 + edit.offsetX, FRAME_H / 2 + edit.offsetY);
  ctx.rotate((edit.rotation * Math.PI) / 180);
  ctx.scale(drawScale, drawScale);
  ctx.drawImage(
    img,
    -edit.naturalWidth / 2,
    -edit.naturalHeight / 2,
    edit.naturalWidth,
    edit.naturalHeight
  );

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('toBlob returned null'))),
      'image/png'
    );
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = src;
  });
}

/** Trigger a client-side save-as for the blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
