import type { Aspect, CropRegion } from 'shared/types';
import { aspectRatio } from './aspect';

export function defaultCropForAspect(
  source: { w: number; h: number },
  aspect: Aspect
): CropRegion {
  if (aspect === 'original') {
    return { x: 0, y: 0, width: 1, height: 1 };
  }
  const srcRatio = source.w / source.h;
  const projRatio = aspectRatio(aspect);

  if (Math.abs(srcRatio - projRatio) < 0.01) {
    return { x: 0, y: 0, width: 1, height: 1 };
  }
  if (srcRatio > projRatio) {
    // Source wider — crop horizontally, full height
    const normWidth = projRatio / srcRatio;
    return { x: (1 - normWidth) / 2, y: 0, width: normWidth, height: 1 };
  }
  // Source taller — crop vertically, full width
  const normHeight = srcRatio / projRatio;
  return { x: 0, y: (1 - normHeight) / 2, width: 1, height: normHeight };
}

function pct(n: number): string {
  return String(Math.round(n * 10000) / 100);
}

export function cropToCss(crop: CropRegion): { clipPath: string } {
  const top = pct(crop.y);
  const left = pct(crop.x);
  const right = pct(1 - (crop.x + crop.width));
  const bottom = pct(1 - (crop.y + crop.height));
  return { clipPath: `inset(${top}% ${right}% ${bottom}% ${left}%)` };
}

export function cropPreset(
  preset: 'full' | 'center' | 'left' | 'right' | 'top' | 'bottom',
  source: { w: number; h: number },
  aspect: Aspect
): CropRegion {
  const fit = defaultCropForAspect(source, aspect);
  switch (preset) {
    case 'full':
      return fit;
    case 'center':
      return fit;
    case 'left':
      return { ...fit, x: 0 };
    case 'right':
      return { ...fit, x: 1 - fit.width };
    case 'top':
      return { ...fit, y: 0 };
    case 'bottom':
      return { ...fit, y: 1 - fit.height };
  }
}
