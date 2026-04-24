import { useCallback, useEffect, useRef, useState } from 'react';
import type { Project } from 'shared/types';
import { projectDuration, projectTimeToClip } from './project-time';

export interface PlaybackEngine {
  isPlaying: boolean;
  projectTime: number;
  projectDuration: number;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seek: (projectTime: number) => void;
  /** The active clip's <video>/<audio> ref should be attached to the element in the DOM. */
  bindActiveElement: (el: HTMLMediaElement | null) => void;
  activeClipId: string;
  nextClipId: string;
}

export function usePlaybackEngine(project: Project): PlaybackEngine {
  const [projectTime, setProjectTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const elementsRef = useRef<Map<string, HTMLMediaElement>>(new Map());
  const rafRef = useRef<number | null>(null);
  const startWallRef = useRef<number>(0);
  const startProjectRef = useRef<number>(0);

  const total = projectDuration(project.clips);
  const mapping = projectTimeToClip(project.clips, projectTime);
  const activeClipId = mapping.clipId;

  const bindActiveElement = useCallback((el: HTMLMediaElement | null) => {
    if (!el) {
      elementsRef.current.delete(activeClipId);
      return;
    }
    elementsRef.current.set(activeClipId, el);
  }, [activeClipId]);

  const sync = useCallback(() => {
    const el = elementsRef.current.get(activeClipId);
    if (!el) return;
    const clip = project.clips[mapping.index];
    if (!clip) return;
    // Seek element to mapping.localTime if it's off by more than 150 ms
    if (Math.abs(el.currentTime - mapping.localTime) > 0.15) {
      el.currentTime = mapping.localTime;
    }
    el.playbackRate = clip.effects.speed || 1;
    el.volume = Math.max(0, Math.min(1, clip.effects.volume || 1));
  }, [activeClipId, mapping.index, mapping.localTime, project.clips]);

  useEffect(() => {
    const el = elementsRef.current.get(activeClipId);
    if (!el) return;
    sync();
    if (isPlaying) el.play().catch(() => {});
  }, [activeClipId, isPlaying, sync]);

  const tick = useCallback(() => {
    const now = performance.now();
    const elapsed = (now - startWallRef.current) / 1000;
    const nextProjectTime = startProjectRef.current + elapsed;
    if (nextProjectTime >= total) {
      setProjectTime(total);
      setIsPlaying(false);
      const el = elementsRef.current.get(activeClipId);
      el?.pause();
      return;
    }
    const nextMapping = projectTimeToClip(project.clips, nextProjectTime);
    if (nextMapping.clipId !== activeClipId) {
      const oldEl = elementsRef.current.get(activeClipId);
      oldEl?.pause();
      // The incoming element's play() is triggered by the sync effect (see #3).
    }
    setProjectTime(nextProjectTime);
    rafRef.current = requestAnimationFrame(tick);
  }, [total, activeClipId, project.clips]);

  const play = useCallback(() => {
    if (total === 0) return;
    const el = elementsRef.current.get(activeClipId);
    if (!el) return;
    startWallRef.current = performance.now();
    startProjectRef.current = projectTime >= total ? 0 : projectTime;
    setIsPlaying(true);
    el.play().catch(() => setIsPlaying(false));
    rafRef.current = requestAnimationFrame(tick);
  }, [activeClipId, projectTime, total, tick]);

  const pause = useCallback(() => {
    const el = elementsRef.current.get(activeClipId);
    el?.pause();
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    setIsPlaying(false);
  }, [activeClipId]);

  const toggle = useCallback(() => {
    if (isPlaying) pause();
    else play();
  }, [isPlaying, pause, play]);

  const seek = useCallback((t: number) => {
    const clamped = Math.max(0, Math.min(total, t));
    setProjectTime(clamped);
    startProjectRef.current = clamped;
    startWallRef.current = performance.now();
  }, [total]);

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  const nextIndex = mapping.index + 1;
  const nextClip = project.clips[nextIndex];

  return {
    isPlaying,
    projectTime,
    projectDuration: total,
    play,
    pause,
    toggle,
    seek,
    bindActiveElement,
    activeClipId,
    nextClipId: nextClip?.id ?? '',
  };
}
