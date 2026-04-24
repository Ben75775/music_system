export const FRAME_W = 1034;
export const FRAME_H = 1379;

/** Rotation in degrees. Any value 0-360 is valid. */
export type Rotation = number;

function effectiveDims(
  naturalW: number,
  naturalH: number,
  rotation: Rotation
): { effW: number; effH: number } {
  // Axis-aligned bounding box of a rotated rectangle.
  const rad = (rotation * Math.PI) / 180;
  const cosR = Math.abs(Math.cos(rad));
  const sinR = Math.abs(Math.sin(rad));
  return {
    effW: naturalW * cosR + naturalH * sinR,
    effH: naturalW * sinR + naturalH * cosR,
  };
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
 * Fit-to-contain scale: the image is fully visible in the frame, touching
 * one pair of frame edges and letterboxed on the other. Returned as a
 * multiplier relative to `baseCoverScale`.
 */
export function containScale(
  naturalW: number,
  naturalH: number,
  rotation: Rotation
): number {
  const cover = baseCoverScale(naturalW, naturalH, rotation);
  const { effW, effH } = effectiveDims(naturalW, naturalH, rotation);
  const contain = Math.min(FRAME_W / effW, FRAME_H / effH);
  return contain / cover;
}

/**
 * Initial scale on upload: whole image visible in the frame. For images larger
 * than the frame this is fit-to-contain (letterboxed). For images smaller than
 * the frame this is natural pixel size (no upscaling). Returned as a multiplier
 * relative to `baseCoverScale` so the ImageEdit.scale field stays consistent.
 */
export function initialScale(
  naturalW: number,
  naturalH: number,
  rotation: Rotation
): number {
  const cover = baseCoverScale(naturalW, naturalH, rotation);
  const { effW, effH } = effectiveDims(naturalW, naturalH, rotation);
  const contain = Math.min(FRAME_W / effW, FRAME_H / effH);
  const displayScale = Math.min(1, contain);
  return displayScale / cover;
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
