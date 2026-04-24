import { describe, it, expect } from 'vitest';
import { FRAME_W, FRAME_H, baseCoverScale, clampOffset, initialScale, containScale } from './image-fit';

describe('FRAME constants', () => {
  it('are 1034 x 1379', () => {
    expect(FRAME_W).toBe(1034);
    expect(FRAME_H).toBe(1379);
  });
});

describe('baseCoverScale (no rotation)', () => {
  it('returns 1 when source exactly matches frame', () => {
    expect(baseCoverScale(1034, 1379, 0)).toBe(1);
  });
  it('scales up a tiny portrait source', () => {
    // A 517 x 689.5 source is half the frame. Cover scale = 2.
    expect(baseCoverScale(517, 689.5, 0)).toBeCloseTo(2, 5);
  });
  it('is driven by the wider aspect when source is landscape', () => {
    // 2000x1000 source into 1034x1379 frame: cover scale = 1379/1000 = 1.379
    expect(baseCoverScale(2000, 1000, 0)).toBeCloseTo(1.379, 3);
  });
  it('is driven by the taller aspect when source is narrower than frame', () => {
    // 500x2000 source: cover scale = 1034/500 = 2.068
    expect(baseCoverScale(500, 2000, 0)).toBeCloseTo(2.068, 3);
  });
});

describe('baseCoverScale (with rotation)', () => {
  it('swaps dimensions for 90° rotation', () => {
    // Source 2000x1000 landscape, rotated 90° appears as 1000x2000 portrait.
    // Cover scale for 1000x2000 into 1034x1379 = max(1034/1000, 1379/2000) = 1.034
    expect(baseCoverScale(2000, 1000, 90)).toBeCloseTo(1.034, 3);
  });
  it('matches 0° for 180° rotation', () => {
    expect(baseCoverScale(2000, 1000, 180)).toBeCloseTo(baseCoverScale(2000, 1000, 0), 6);
  });
  it('matches 90° for 270° rotation', () => {
    expect(baseCoverScale(2000, 1000, 270)).toBeCloseTo(baseCoverScale(2000, 1000, 90), 6);
  });
});

describe('clampOffset', () => {
  it('returns {0,0} at cover scale when offsets are 0', () => {
    const r = clampOffset({
      naturalW: 1034,
      naturalH: 1379,
      rotation: 0,
      scale: 1,
      offsetX: 0,
      offsetY: 0,
    });
    expect(r).toEqual({ offsetX: 0, offsetY: 0 });
  });

  it('source matches frame — any requested offset gets clamped to 0', () => {
    const r = clampOffset({
      naturalW: 1034,
      naturalH: 1379,
      rotation: 0,
      scale: 1,
      offsetX: 500,
      offsetY: -500,
    });
    expect(r.offsetX).toBeCloseTo(0, 10);
    expect(r.offsetY).toBeCloseTo(0, 10);
  });

  it('allows offset up to half the overflow in each axis', () => {
    // 2000x1000 source, rotation 0. Cover scale = 1.379 (driven by height).
    // Displayed width = 2758; overflow = 1724; max = 862.
    // Displayed height = 1379; overflow = 0; max = 0.
    const r = clampOffset({
      naturalW: 2000,
      naturalH: 1000,
      rotation: 0,
      scale: 1,
      offsetX: 1000,
      offsetY: 50,
    });
    expect(r.offsetX).toBeCloseTo(862, 0);
    expect(r.offsetY).toBe(0);
  });

  it('user zoom increases the offset slack proportionally', () => {
    // Same 2000x1000 source, rotation 0, user scale 2.
    // Total scale = 2.758. Displayed w = 5516; overflow = 4482; max = 2241.
    // Displayed h = 2758; overflow = 1379; max = 689.5.
    const r = clampOffset({
      naturalW: 2000,
      naturalH: 1000,
      rotation: 0,
      scale: 2,
      offsetX: 5000,
      offsetY: -1000,
    });
    expect(r.offsetX).toBeCloseTo(2241, 0);
    expect(r.offsetY).toBeCloseTo(-689.5, 1);
  });

  it('rotation swaps the overflow axis', () => {
    // 2000x1000 source rotated 90° is 1000x2000 effective.
    // Cover scale = 1.034. Displayed eff-w = 1034 (no slack).
    // Displayed eff-h = 2068; overflow = 689; max = 344.5.
    const r = clampOffset({
      naturalW: 2000,
      naturalH: 1000,
      rotation: 90,
      scale: 1,
      offsetX: 100,
      offsetY: 500,
    });
    expect(r.offsetX).toBe(0);
    expect(r.offsetY).toBeCloseTo(344.5, 1);
  });

  it('allows offset when image is smaller than frame (underflow)', () => {
    // 400x400 source into 1034x1379 frame. Cover scale = max(1034/400, 1379/400) = 3.4475.
    // With scale = 0.5 (user zoom out), total = 3.4475 * 0.5 = 1.72375. displayed = 400 * 1.72375 = 689.5.
    // Since 689.5 < 1034: underflow. max|offsetX| = (1034 - 689.5) / 2 = 172.25.
    const r = clampOffset({
      naturalW: 400,
      naturalH: 400,
      rotation: 0,
      scale: 0.5,
      offsetX: 500,
      offsetY: 0,
    });
    expect(r.offsetX).toBeCloseTo(172.25, 1);
    expect(r.offsetY).toBeCloseTo(0, 1);
  });

  it('underflow allows offset on the shrunken axis', () => {
    // Same 400x400, scale 0.5. displayedH = 689.5, frame = 1379, max = 344.75.
    const r = clampOffset({
      naturalW: 400,
      naturalH: 400,
      rotation: 0,
      scale: 0.5,
      offsetX: 0,
      offsetY: 500,
    });
    expect(r.offsetY).toBeCloseTo(344.75, 1);
  });
});

describe('initialScale', () => {
  it('fits large image to contain (whole image visible, letterboxed)', () => {
    // 2000x3000 portrait into 1034x1379 frame.
    // contain = min(1034/2000, 1379/3000) = min(0.517, 0.4597) = 0.4597.
    // displayScale = min(1, 0.4597) = 0.4597.
    // cover = max(0.517, 0.4597) = 0.517.
    // initialScale = 0.4597 / 0.517 = 0.8893.
    expect(initialScale(2000, 3000, 0)).toBeCloseTo(0.4597 / 0.517, 3);
  });

  it('keeps small image at natural pixel size', () => {
    // 500x500 into 1034x1379: contain = 2.068, min(1, 2.068) = 1, cover = 2.758,
    // initialScale = 1 / 2.758.
    expect(initialScale(500, 500, 0)).toBeCloseTo(1 / 2.758, 3);
  });

  it('returns 1 when source exactly matches frame', () => {
    // contain = 1, displayScale = 1, cover = 1, initial = 1.
    expect(initialScale(1034, 1379, 0)).toBe(1);
  });

  it('handles rotation by swapping effective dimensions', () => {
    // 2000x3000 rotated 90° becomes 3000x2000 effective.
    // cover = max(1034/3000, 1379/2000) = 0.6895.
    // contain = min(1034/3000, 1379/2000) = 0.3447.
    // displayScale = min(1, 0.3447) = 0.3447.
    // initialScale = 0.3447 / 0.6895 = 0.5.
    expect(initialScale(2000, 3000, 90)).toBeCloseTo(0.5, 3);
  });
});

describe('baseCoverScale (arbitrary angles)', () => {
  it('uses axis-aligned bounding box at 45°', () => {
    // Square 1000x1000 at 45° has bounding box 1000*√2 × 1000*√2 ≈ 1414×1414.
    // cover = max(1034/1414, 1379/1414) = 1379/1414 ≈ 0.9752.
    expect(baseCoverScale(1000, 1000, 45)).toBeCloseTo(1379 / (1000 * Math.SQRT2), 3);
  });
  it('is a continuous function of rotation', () => {
    // Small perturbation away from 0° shouldn't cause a discontinuity.
    const a = baseCoverScale(2000, 1000, 0);
    const b = baseCoverScale(2000, 1000, 1);
    expect(Math.abs(a - b)).toBeLessThan(0.05);
  });
});

describe('containScale', () => {
  it('matches initialScale for large images (where contain < 1)', () => {
    // 2000x3000: contain < 1, so both are equal.
    expect(containScale(2000, 3000, 0)).toBeCloseTo(initialScale(2000, 3000, 0), 5);
  });

  it('upscales small images to fit the frame (distinct from initialScale)', () => {
    // 500x500: contain = 2.068 > 1. initialScale caps at 1/cover.
    // containScale = 2.068 / 2.758 = 0.7498.
    expect(containScale(500, 500, 0)).toBeCloseTo(0.7498, 3);
    // initialScale is strictly smaller for small images.
    expect(containScale(500, 500, 0)).toBeGreaterThan(initialScale(500, 500, 0));
  });

  it('returns 1 when source exactly matches frame', () => {
    expect(containScale(1034, 1379, 0)).toBe(1);
  });
});
