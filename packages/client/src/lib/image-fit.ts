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
