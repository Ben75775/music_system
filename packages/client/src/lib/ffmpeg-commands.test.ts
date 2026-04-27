import { describe, it, expect } from 'vitest';
import { buildNormalizeArgs, buildConcatArgs } from './ffmpeg-commands';
import type { Clip, Project } from 'shared/types';

function audioClip(overrides: Partial<Clip> = {}): Clip {
  return {
    id: 'c1',
    name: 'a.mp3',
    file: null,
    url: '',
    type: 'audio',
    duration: 10,
    trim: { start: 0, end: 10 },
    effects: { volume: 1, fadeIn: 0, fadeOut: 0, speed: 1, eqPreset: 'none' },
    ...overrides,
  };
}

describe('buildNormalizeArgs (audio)', () => {
  it('with effects: includes trim + libmp3lame re-encode at 44100 Hz stereo', () => {
    const project: Project = { id: 'p', mode: 'audio', clips: [] };
    const clip = audioClip({
      trim: { start: 1, end: 9 },
      effects: { volume: 0.8, fadeIn: 0, fadeOut: 0, speed: 1, eqPreset: 'none' },
    });
    const args = buildNormalizeArgs(clip, project);
    expect(args).toContain('-ss');
    expect(args).toContain('1.000');
    expect(args).toContain('-to');
    expect(args).toContain('9.000');
    expect(args).toContain('-ar');
    expect(args).toContain('44100');
    expect(args).toContain('-ac');
    expect(args).toContain('2');
    expect(args).toContain('-c:a');
    expect(args).toContain('libmp3lame');
  });

  it('trim-only (no effects) uses -c copy fast path', () => {
    const project: Project = { id: 'p', mode: 'audio', clips: [] };
    const clip = audioClip({ trim: { start: 1, end: 9 } });
    const args = buildNormalizeArgs(clip, project);
    expect(args).toContain('-ss');
    expect(args).toContain('1.000');
    expect(args).toContain('-c');
    expect(args).toContain('copy');
    expect(args).not.toContain('libmp3lame');
    expect(args).not.toContain('-af');
  });
});

describe('buildNormalizeArgs (video)', () => {
  it('with crop: re-encodes with libx264 + aac, includes scale/crop filters', () => {
    const project: Project = { id: 'p', mode: 'video', aspect: '16:9', clips: [] };
    const clip: Clip = {
      ...audioClip(),
      type: 'video',
      crop: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
      sourceWidth: 1920,
      sourceHeight: 1080,
    };
    const args = buildNormalizeArgs(clip, project);
    const vf = args[args.indexOf('-vf') + 1];
    expect(vf).toContain('crop=');
    expect(vf).toContain('scale=1920:1080');
    expect(args).toContain('-c:v');
    expect(args).toContain('libx264');
    // Crop is not an audio change; audio side stays as copy.
    const caIdx = args.indexOf('-c:a');
    expect(args[caIdx + 1]).toBe('copy');
  });

  it('source dims match target + identity crop + no effects → full -c copy', () => {
    const project: Project = { id: 'p', mode: 'video', aspect: '16:9', clips: [] };
    const clip: Clip = {
      ...audioClip(),
      type: 'video',
      crop: { x: 0, y: 0, width: 1, height: 1 },
      sourceWidth: 1920,
      sourceHeight: 1080,
    };
    const args = buildNormalizeArgs(clip, project);
    expect(args).not.toContain('-vf');
    expect(args).not.toContain('-af');
    expect(args).not.toContain('libx264');
    const cvIdx = args.indexOf('-c:v');
    expect(args[cvIdx + 1]).toBe('copy');
    const caIdx = args.indexOf('-c:a');
    expect(args[caIdx + 1]).toBe('copy');
  });
});

describe('buildNormalizeArgs (original)', () => {
  it('aspect=original with non-identity crop re-encodes; no crop filter still', () => {
    const project: Project = { id: 'p', mode: 'video', aspect: 'original', clips: [] };
    const clip: Clip = {
      ...audioClip(),
      type: 'video',
      // Force re-encode by giving source dims that don't match outDims.
      sourceWidth: 1920,
      sourceHeight: 1080,
    };
    const args = buildNormalizeArgs(clip, project, { w: 1280, h: 720 });
    const vf = args[args.indexOf('-vf') + 1];
    expect(vf).toContain('scale=1280:720');
    // aspect=original never emits crop filter even on re-encode
    expect(vf).not.toContain('crop=');
  });
});

describe('buildConcatArgs', () => {
  it('produces concat demuxer args', () => {
    const args = buildConcatArgs(['clip_0.mp3', 'clip_1.mp3'], 'output.mp3');
    expect(args).toEqual(['-f', 'concat', '-safe', '0', '-i', 'list.txt', '-c', 'copy', 'output.mp3']);
  });
});
