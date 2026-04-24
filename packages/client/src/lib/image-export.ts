import type { ImageEdit } from 'shared/types';
import { FRAME_W, FRAME_H } from './image-fit';

export async function exportImage(edit: ImageEdit): Promise<Blob> {
  const img = await loadImage(edit.src);

  const canvas = document.createElement('canvas');
  canvas.width = FRAME_W;
  canvas.height = FRAME_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');

  ctx.imageSmoothingQuality = 'high';

  // Reproduce the preview sequence: translate to frame center + offset,
  // rotate, scale, draw image centered at origin.
  ctx.translate(FRAME_W / 2 + edit.offsetX, FRAME_H / 2 + edit.offsetY);
  ctx.rotate((edit.rotation * Math.PI) / 180);
  ctx.scale(edit.scale, edit.scale);
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
