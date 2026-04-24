import type { ImageEdit } from 'shared/types';

export const FRAME_W = 1034;
export const FRAME_H = 1379;

/** Rotation in degrees. Any value 0-360 is valid. */
export type Rotation = number;

/**
 * Given the current image transform and the editor viewport size, return the
 * rectangle of the source image (in natural pixel coordinates, before rotation)
 * that falls inside the 1034×1379 crop frame. This is used by the export.
 *
 * The preview is:
 *   1. Center image on viewport center.
 *   2. Translate by (offsetX, offsetY).
 *   3. Rotate by `rotation` degrees.
 *   4. Scale by `scale`.
 * The crop frame is axis-aligned at the viewport center, 1034×1379 px.
 *
 * For rotation ∈ {0, 90, 180, 270}, the source rect is a simple axis-aligned
 * rectangle. For arbitrary rotations the "source rect" is actually a rotated
 * rectangle in source coords; we represent it by its four corners so the
 * exporter can use canvas transforms to render it.
 */
export interface FrameCorners {
  /** 4 corners of the crop frame mapped into source-image coords (natural px).
   *  Order: top-left, top-right, bottom-right, bottom-left of the frame. */
  corners: Array<{ x: number; y: number }>;
}

export function frameSourceCorners(edit: ImageEdit): FrameCorners {
  const halfW = FRAME_W / 2;
  const halfH = FRAME_H / 2;
  // Frame corners in viewport coords, relative to viewport center.
  const viewportPts = [
    { x: -halfW, y: -halfH }, // TL
    { x: halfW, y: -halfH },  // TR
    { x: halfW, y: halfH },   // BR
    { x: -halfW, y: halfH },  // BL
  ];
  // Inverse of the image transform: given a viewport-space point P (relative
  // to viewport center), find the source-image point S such that
  //   P = rotate(offset + scale*S, θ)
  // The actual forward pipeline in ImageEditor uses:
  //   css_translate(-50%,-50%) then translate(offsetX,offsetY) then rotate(θ) then scale(s).
  // Inverse:
  //   S = (rotate(-θ, P - offset)) / scale
  const rad = (edit.rotation * Math.PI) / 180;
  const cosR = Math.cos(rad);
  const sinR = Math.sin(rad);
  const corners = viewportPts.map((p) => {
    const dx = p.x - edit.offsetX;
    const dy = p.y - edit.offsetY;
    // Rotate by -θ (inverse)
    const ux = dx * cosR + dy * sinR;
    const uy = -dx * sinR + dy * cosR;
    return { x: ux / edit.scale, y: uy / edit.scale };
  });
  return { corners };
}
