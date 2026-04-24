export const FRAME_W = 1034;
export const FRAME_H = 1379;

export type Rotation = 0 | 90 | 180 | 270;

function effectiveDims(
  naturalW: number,
  naturalH: number,
  rotation: Rotation
): { effW: number; effH: number } {
  if (rotation === 90 || rotation === 270) {
    return { effW: naturalH, effH: naturalW };
  }
  return { effW: naturalW, effH: naturalH };
}

/**
 * The smallest scale that makes the image fully cover the 1034×1379 frame
 * after the given rotation.
 */
export function baseCoverScale(
  naturalW: number,
  naturalH: number,
  rotation: Rotation
): number {
  const { effW, effH } = effectiveDims(naturalW, naturalH, rotation);
  return Math.max(FRAME_W / effW, FRAME_H / effH);
}

/**
 * Given the current transform state, return offsets clamped so the rotated,
 * scaled image always fully covers the 1034×1379 frame (no empty regions).
 */
export function clampOffset(params: {
  naturalW: number;
  naturalH: number;
  rotation: Rotation;
  scale: number;
  offsetX: number;
  offsetY: number;
}): { offsetX: number; offsetY: number } {
  const { naturalW, naturalH, rotation, scale, offsetX, offsetY } = params;
  const cover = baseCoverScale(naturalW, naturalH, rotation);
  const { effW, effH } = effectiveDims(naturalW, naturalH, rotation);
  const displayedW = effW * cover * scale;
  const displayedH = effH * cover * scale;
  const maxX = Math.abs(displayedW - FRAME_W) / 2;
  const maxY = Math.abs(displayedH - FRAME_H) / 2;
  return {
    offsetX: Math.max(-maxX, Math.min(maxX, offsetX)),
    offsetY: Math.max(-maxY, Math.min(maxY, offsetY)),
  };
}
