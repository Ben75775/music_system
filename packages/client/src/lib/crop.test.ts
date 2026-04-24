import { describe, it, expect } from 'vitest';
import { defaultCropForAspect, cropToCss } from './crop';

describe('defaultCropForAspect', () => {
  it('returns full frame when source matches project aspect', () => {
    // 1920x1080 source in 16:9 project
    const crop = defaultCropForAspect({ w: 1920, h: 1080 }, '16:9');
    expect(crop).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  });

  it('centers a max-fit rectangle when source is wider than project', () => {
    // 1920x1080 source (16:9) in 1:1 project → max-fit is 1080x1080 centered
    const crop = defaultCropForAspect({ w: 1920, h: 1080 }, '1:1');
    // width = 1080/1920 = 0.5625, height = 1, x = (1 - 0.5625)/2, y = 0
    expect(crop.width).toBeCloseTo(1080 / 1920);
    expect(crop.height).toBe(1);
    expect(crop.x).toBeCloseTo((1 - 1080 / 1920) / 2);
    expect(crop.y).toBe(0);
  });

  it('centers a max-fit rectangle when source is taller than project', () => {
    // 1080x1920 source (9:16) in 16:9 project
    const crop = defaultCropForAspect({ w: 1080, h: 1920 }, '16:9');
    expect(crop.width).toBe(1);
    expect(crop.height).toBeCloseTo(1080 * (9 / 16) / 1920);
  });
});

describe('cropToCss', () => {
  it('full frame = no clipping', () => {
    expect(cropToCss({ x: 0, y: 0, width: 1, height: 1 })).toEqual({
      clipPath: 'inset(0% 0% 0% 0%)',
    });
  });
  it('centered half', () => {
    const css = cropToCss({ x: 0.25, y: 0.25, width: 0.5, height: 0.5 });
    expect(css.clipPath).toBe('inset(25% 25% 25% 25%)');
  });
});
