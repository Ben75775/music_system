import { describe, it, expect } from 'vitest';
import { clipTrimmedDuration, projectDuration, projectTimeToClip, clipTimeToProject } from './project-time';
import type { Clip } from 'shared/types';

function fakeClip(id: string, start: number, end: number, speed = 1): Clip {
  return {
    id,
    name: id,
    file: null,
    url: '',
    type: 'audio',
    duration: end,
    trim: { start, end },
    effects: { volume: 1, fadeIn: 0, fadeOut: 0, speed, eqPreset: 'none' },
  };
}

describe('clipTrimmedDuration', () => {
  it('returns end-start divided by speed', () => {
    expect(clipTrimmedDuration(fakeClip('a', 1, 5, 1))).toBe(4);
    expect(clipTrimmedDuration(fakeClip('a', 1, 5, 2))).toBe(2);
    expect(clipTrimmedDuration(fakeClip('a', 0, 10, 0.5))).toBe(20);
  });
});

describe('projectDuration', () => {
  it('sums trimmed durations', () => {
    const clips = [fakeClip('a', 0, 10), fakeClip('b', 2, 5), fakeClip('c', 0, 3)];
    expect(projectDuration(clips)).toBe(10 + 3 + 3);
  });
});

describe('projectTimeToClip', () => {
  it('returns clip 0 at t=0', () => {
    const clips = [fakeClip('a', 0, 10), fakeClip('b', 0, 5)];
    expect(projectTimeToClip(clips, 0)).toEqual({ index: 0, clipId: 'a', localTime: 0 });
  });
  it('returns middle of clip 0', () => {
    const clips = [fakeClip('a', 0, 10), fakeClip('b', 0, 5)];
    expect(projectTimeToClip(clips, 5)).toEqual({ index: 0, clipId: 'a', localTime: 5 });
  });
  it('crosses boundary into clip 1', () => {
    const clips = [fakeClip('a', 0, 10), fakeClip('b', 0, 5)];
    expect(projectTimeToClip(clips, 12)).toEqual({ index: 1, clipId: 'b', localTime: 2 });
  });
  it('respects trim.start when mapping to clip local time', () => {
    // b is trimmed 2..5, so project t=10 is clip b localTime 0 → element currentTime = 2
    const clips = [fakeClip('a', 0, 10), fakeClip('b', 2, 5)];
    expect(projectTimeToClip(clips, 10)).toEqual({ index: 1, clipId: 'b', localTime: 2 });
  });
  it('clamps past-end to last clip end', () => {
    const clips = [fakeClip('a', 0, 10), fakeClip('b', 0, 5)];
    expect(projectTimeToClip(clips, 999)).toEqual({ index: 1, clipId: 'b', localTime: 5 });
  });
  it('accounts for speed (half-speed clip = doubled project duration)', () => {
    const clips = [fakeClip('a', 0, 10, 0.5)]; // trimmed duration = 20
    expect(projectTimeToClip(clips, 10)).toEqual({ index: 0, clipId: 'a', localTime: 5 });
  });
});

describe('clipTimeToProject', () => {
  it('maps clip local time back to project time', () => {
    const clips = [fakeClip('a', 0, 10), fakeClip('b', 2, 5)];
    expect(clipTimeToProject(clips, 1, 1)).toBe(10 + 1);
  });
});
