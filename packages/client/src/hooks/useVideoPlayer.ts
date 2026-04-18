import { useEffect, useRef, useState, useCallback } from 'react';
import type { Track, EQPreset } from 'shared/types';

/** EQ preset -> BiquadFilter params */
const EQ_PRESETS: Record<EQPreset, { type: BiquadFilterType; frequency: number; gain: number; Q: number } | null> = {
  'none': null,
  'bass-boost': { type: 'lowshelf', frequency: 200, gain: 6, Q: 1 },
  'vocal-clarity': { type: 'peaking', frequency: 3000, gain: 5, Q: 1.5 },
  'treble-boost': { type: 'highshelf', frequency: 6000, gain: 5, Q: 1 },
};

function applyEQ(node: BiquadFilterNode, preset: EQPreset) {
  const params = EQ_PRESETS[preset];
  if (!params) {
    node.type = 'allpass';
    node.frequency.value = 1000;
    node.gain.value = 0;
    node.Q.value = 1;
  } else {
    node.type = params.type;
    node.frequency.value = params.frequency;
    node.gain.value = params.gain;
    node.Q.value = params.Q;
  }
}

export function useVideoPlayer(track: Track) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const eqNodeRef = useRef<BiquadFilterNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number>(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isReady, setIsReady] = useState(false);

  const trackRef = useRef(track);
  trackRef.current = track;

  const bind = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
    if (!el) return;

    el.onloadedmetadata = () => {
      setIsReady(true);

      // Set up Web Audio chain: source -> eqFilter -> gainNode -> destination
      if (!audioCtxRef.current) {
        try {
          const ctx = new AudioContext();
          const source = ctx.createMediaElementSource(el);
          const eqNode = ctx.createBiquadFilter();
          const gainNode = ctx.createGain();

          source.connect(eqNode);
          eqNode.connect(gainNode);
          gainNode.connect(ctx.destination);

          gainNodeRef.current = gainNode;
          eqNodeRef.current = eqNode;
          audioCtxRef.current = ctx;

          const t = trackRef.current;
          gainNode.gain.value = t.effects.volume;
          applyEQ(eqNode, t.effects.eqPreset);
        } catch {
          gainNodeRef.current = null;
          eqNodeRef.current = null;
        }
      }
    };
    el.onplay = () => setIsPlaying(true);
    el.onpause = () => setIsPlaying(false);
    el.onended = () => setIsPlaying(false);
  }, []);

  // Animation loop: enforce trim bounds + fade volume
  useEffect(() => {
    const tick = () => {
      const video = videoRef.current;
      const t = trackRef.current;
      if (!video || !video.duration) {
        animFrameRef.current = requestAnimationFrame(tick);
        return;
      }

      const now = video.currentTime;
      setCurrentTime(now);

      // Stop at trim end
      if (now >= t.trim.end) {
        video.pause();
        video.currentTime = t.trim.end;
      }

      // Compute fade volume
      let fadeMul = 1;
      const elapsed = now - t.trim.start;
      const remaining = t.trim.end - now;

      if (t.effects.fadeIn > 0 && elapsed >= 0 && elapsed < t.effects.fadeIn) {
        fadeMul = elapsed / t.effects.fadeIn;
      }
      if (t.effects.fadeOut > 0 && remaining < t.effects.fadeOut) {
        fadeMul = Math.min(fadeMul, remaining / t.effects.fadeOut);
      }
      fadeMul = Math.max(0, fadeMul);

      const finalVolume = t.effects.volume * fadeMul;
      if (gainNodeRef.current) {
        gainNodeRef.current.gain.value = finalVolume;
      } else {
        video.volume = Math.max(0, Math.min(1, finalVolume));
      }

      animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, []);

  // Live speed + pitch
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.preservesPitch = track.effects.pitch === 1;
      videoRef.current.playbackRate = track.effects.speed * track.effects.pitch;
    }
  }, [track.effects.speed, track.effects.pitch]);

  // Live volume
  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = track.effects.volume;
    } else if (videoRef.current) {
      videoRef.current.volume = Math.max(0, Math.min(1, track.effects.volume));
    }
  }, [track.effects.volume]);

  // Live EQ
  useEffect(() => {
    if (eqNodeRef.current) {
      applyEQ(eqNodeRef.current, track.effects.eqPreset);
    }
  }, [track.effects.eqPreset]);

  // Clean up
  useEffect(() => {
    return () => {
      if (audioCtxRef.current) {
        audioCtxRef.current.close();
        audioCtxRef.current = null;
      }
    };
  }, []);

  const resumeCtx = () => {
    if (audioCtxRef.current?.state === 'suspended') {
      audioCtxRef.current.resume();
    }
  };

  const seekTo = useCallback((time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
    resumeCtx();
  }, []);

  const togglePlayPause = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    resumeCtx();

    if (video.paused) {
      const t = trackRef.current;
      // Jump to trim start if outside trim region
      if (video.currentTime < t.trim.start || video.currentTime >= t.trim.end) {
        video.currentTime = t.trim.start;
      }
      video.play();
    } else {
      video.pause();
    }
  }, []);

  const play = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    resumeCtx();
    const t = trackRef.current;
    if (video.currentTime < t.trim.start || video.currentTime >= t.trim.end) {
      video.currentTime = t.trim.start;
    }
    video.play();
  }, []);

  const pause = useCallback(() => videoRef.current?.pause(), []);

  return {
    bind,
    isPlaying,
    isReady,
    currentTime,
    seekTo,
    togglePlayPause,
    play,
    pause,
  };
}
