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
  it('includes trim, audio codec libmp3lame, 44100 Hz stereo', () => {
    const project: Project = { id: 'p', mode: 'audio', clips: [] };
    const clip = audioClip({ trim: { start: 1, end: 9 } });
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
});

describe('buildNormalizeArgs (video)', () => {
  it('includes crop + scale to output dims + AAC 48000 stereo', () => {
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
    expect(args).toContain('-c:a');
    expect(args).toContain('aac');
    expect(args).toContain('-ar');
    expect(args).toContain('48000');
  });
});

describe('buildConcatArgs', () => {
  it('produces concat demuxer args', () => {
    const args = buildConcatArgs(['clip_0.mp3', 'clip_1.mp3'], 'output.mp3');
    expect(args).toEqual(['-f', 'concat', '-safe', '0', '-i', 'list.txt', '-c', 'copy', 'output.mp3']);
  });
});
