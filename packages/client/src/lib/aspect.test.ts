import { describe, it, expect } from 'vitest';
import { guessAspect, aspectRatio, outputDimensions } from './aspect';

describe('guessAspect', () => {
  it('picks 16:9 for 1920x1080', () => expect(guessAspect(1920, 1080)).toBe('16:9'));
  it('picks 9:16 for 1080x1920', () => expect(guessAspect(1080, 1920)).toBe('9:16'));
  it('picks 1:1 for 1000x1000', () => expect(guessAspect(1000, 1000)).toBe('1:1'));
  it('picks 4:3 for 640x480', () => expect(guessAspect(640, 480)).toBe('4:3'));
  it('picks 3:4 for 480x640', () => expect(guessAspect(480, 640)).toBe('3:4'));
});

describe('aspectRatio', () => {
  it('16:9 → 1.777...', () => expect(aspectRatio('16:9')).toBeCloseTo(16 / 9));
  it('1:1 → 1', () => expect(aspectRatio('1:1')).toBe(1));
});

describe('outputDimensions', () => {
  it('16:9 → 1920x1080', () => expect(outputDimensions('16:9')).toEqual({ w: 1920, h: 1080 }));
  it('9:16 → 1080x1920', () => expect(outputDimensions('9:16')).toEqual({ w: 1080, h: 1920 }));
});
