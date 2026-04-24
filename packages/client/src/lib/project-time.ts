import type { Clip } from 'shared/types';

export function clipTrimmedDuration(clip: Clip): number {
  const raw = Math.max(0, clip.trim.end - clip.trim.start);
  const speed = clip.effects.speed || 1;
  return raw / speed;
}

export function projectDuration(clips: readonly Clip[]): number {
  return clips.reduce((sum, c) => sum + clipTrimmedDuration(c), 0);
}

export interface ProjectTimeMapping {
  index: number;
  clipId: string;
  /** Absolute currentTime on the media element. Includes trim.start offset; accounts for speed. */
  localTime: number;
}

export function projectTimeToClip(
  clips: readonly Clip[],
  projectTime: number
): ProjectTimeMapping {
  if (clips.length === 0) {
    return { index: 0, clipId: '', localTime: 0 };
  }
  let elapsed = 0;
  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    const dur = clipTrimmedDuration(clip);
    if (projectTime < elapsed + dur || i === clips.length - 1) {
      const offsetWithinClip = Math.min(dur, Math.max(0, projectTime - elapsed));
      const speed = clip.effects.speed || 1;
      const localTime = clip.trim.start + offsetWithinClip * speed;
      return { index: i, clipId: clip.id, localTime };
    }
    elapsed += dur;
  }
  // Unreachable due to i === length-1 guard
  return { index: clips.length - 1, clipId: clips[clips.length - 1].id, localTime: 0 };
}

export function clipTimeToProject(
  clips: readonly Clip[],
  clipIndex: number,
  offsetWithinTrim: number
): number {
  let before = 0;
  for (let i = 0; i < clipIndex; i++) before += clipTrimmedDuration(clips[i]);
  return before + offsetWithinTrim;
}
