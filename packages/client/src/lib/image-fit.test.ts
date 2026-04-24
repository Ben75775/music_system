import { describe, it, expect } from 'vitest';
import { FRAME_W, FRAME_H, baseCoverScale } from './image-fit';

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
