import { describe, it, expect } from 'vitest';
import { FRAME_W, FRAME_H, baseCoverScale, clampOffset } from './image-fit';

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
});
