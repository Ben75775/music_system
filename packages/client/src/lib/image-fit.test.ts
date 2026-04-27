import { describe, it, expect } from 'vitest';
import { FRAME_W, FRAME_H, frameSourceCorners } from './image-fit';
import type { ImageEdit } from 'shared/types';

function edit(overrides: Partial<ImageEdit> = {}): ImageEdit {
  return {
    src: '',
    name: '',
    mediaType: 'image',
    naturalWidth: 2000,
    naturalHeight: 3000,
    rotation: 0,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    ...overrides,
  };
}

describe('FRAME constants', () => {
  it('are 1440 x 1080', () => {
    expect(FRAME_W).toBe(1440);
    expect(FRAME_H).toBe(1080);
  });
});

describe('frameSourceCorners (no rotation)', () => {
  it('at scale 1, offsets 0 → corners are centered on source origin', () => {
    const { corners } = frameSourceCorners(edit());
    expect(corners[0]).toEqual({ x: -FRAME_W / 2, y: -FRAME_H / 2 });
    expect(corners[1]).toEqual({ x: FRAME_W / 2, y: -FRAME_H / 2 });
    expect(corners[2]).toEqual({ x: FRAME_W / 2, y: FRAME_H / 2 });
    expect(corners[3]).toEqual({ x: -FRAME_W / 2, y: FRAME_H / 2 });
  });

  it('at scale 2, corners are half the distance (frame covers less source area)', () => {
    const { corners } = frameSourceCorners(edit({ scale: 2 }));
    expect(corners[0].x).toBeCloseTo(-FRAME_W / 4);
    expect(corners[0].y).toBeCloseTo(-FRAME_H / 4);
  });

  it('panning image right shifts source rect left', () => {
    const { corners } = frameSourceCorners(edit({ offsetX: 100 }));
    expect(corners[0].x).toBeCloseTo(-FRAME_W / 2 - 100);
    expect(corners[1].x).toBeCloseTo(FRAME_W / 2 - 100);
  });
});

describe('frameSourceCorners (with rotation)', () => {
  it('90° rotation maps frame width to source height', () => {
    const { corners } = frameSourceCorners(edit({ rotation: 90 }));
    // At 90°, the frame's axis-aligned corners in viewport space project onto
    // the source image rotated 90° backward: viewport X becomes source -Y,
    // viewport Y becomes source X.
    // TL viewport (-517, -689.5) → source ( -689.5, 517 ) after inverse rotate by 90°.
    expect(corners[0].x).toBeCloseTo(-FRAME_H / 2, 1);
    expect(corners[0].y).toBeCloseTo(FRAME_W / 2, 1);
  });
});
