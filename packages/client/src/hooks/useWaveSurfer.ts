import { useEffect, useRef, useState, useCallback } from 'react';
import WaveSurfer from 'wavesurfer.js';
import type { Track, EQPreset } from 'shared/types';

interface UseWaveSurferOptions {
  track: Track;
  container: HTMLElement | null;
}

/** EQ preset -> BiquadFilter params */
const EQ_PRESETS: Record<EQPreset, { type: BiquadFilterType; frequency: number; gain: number; Q: number } | null> = {
  'none': null,
  'bass-boost': { type: 'lowshelf', frequency: 200, gain: 6, Q: 1 },
  'vocal-clarity': { type: 'peaking', frequency: 3000, gain: 5, Q: 1.5 },
  'treble-boost': { type: 'highshelf', frequency: 6000, gain: 5, Q: 1 },
};

export function useWaveSurfer({ track, container }: UseWaveSurferOptions) {
  const wsRef = useRef<WaveSurfer | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const eqNodeRef = useRef<BiquadFilterNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const trackRef = useRef(track);
  trackRef.current = track;

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isReady, setIsReady] = useState(false);

  // Create WaveSurfer instance
  useEffect(() => {
    if (!container) return;

    const ws = WaveSurfer.create({
      container,
      waveColor: '#93c5fd',
      progressColor: '#3b82f6',
      cursorColor: '#1d4ed8',
      height: 120,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      normalize: true,
      url: track.url,
    });

    ws.on('ready', () => {
      setIsReady(true);

      // Set up Web Audio chain: source -> eqFilter -> gainNode -> destination
      try {
        const mediaEl = ws.getMediaElement();
        const ctx = new AudioContext();
        const source = ctx.createMediaElementSource(mediaEl);

        const eqNode = ctx.createBiquadFilter();
        const gainNode = ctx.createGain();

        source.connect(eqNode);
        eqNode.connect(gainNode);
        gainNode.connect(ctx.destination);

        gainNodeRef.current = gainNode;
        eqNodeRef.current = eqNode;
        audioCtxRef.current = ctx;

        // Apply initial values
        const t = trackRef.current;
        gainNode.gain.value = t.effects.volume;
        mediaEl.playbackRate = t.effects.speed;
        applyEQ(eqNode, t.effects.eqPreset);
      } catch {
        gainNodeRef.current = null;
        eqNodeRef.current = null;
      }
    });

    ws.on('play', () => setIsPlaying(true));
    ws.on('pause', () => setIsPlaying(false));
    ws.on('finish', () => setIsPlaying(false));

    // Real-time monitoring: trim bounds + fade volume
    ws.on('timeupdate', (time) => {
      setCurrentTime(time);
      const t = trackRef.current;

      // Stop at trim end
      if (time >= t.trim.end) {
        ws.pause();
        ws.seekTo(t.trim.end / ws.getDuration());
        return;
      }

      // Compute fade volume multiplier
      let fadeMul = 1;
      const elapsed = time - t.trim.start;
      const remaining = t.trim.end - time;

      if (t.effects.fadeIn > 0 && elapsed >= 0 && elapsed < t.effects.fadeIn) {
        fadeMul = elapsed / t.effects.fadeIn;
      }
      if (t.effects.fadeOut > 0 && remaining < t.effects.fadeOut) {
        fadeMul = Math.min(fadeMul, remaining / t.effects.fadeOut);
      }
      fadeMul = Math.max(0, fadeMul);

      // Apply volume through GainNode (supports > 1.0)
      const finalVolume = t.effects.volume * fadeMul;
      if (gainNodeRef.current) {
        gainNodeRef.current.gain.value = finalVolume;
      } else {
        ws.setVolume(Math.min(1, finalVolume));
      }
    });

    wsRef.current = ws;

    return () => {
      ws.destroy();
      wsRef.current = null;
      gainNodeRef.current = null;
      eqNodeRef.current = null;
      if (audioCtxRef.current) {
        audioCtxRef.current.close();
        audioCtxRef.current = null;
      }
      setIsReady(false);
      setIsPlaying(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track.url, container]);

  // Live speed
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws) return;
    try {
      const mediaEl = ws.getMediaElement();
      mediaEl.playbackRate = track.effects.speed;
    } catch {
      ws.setPlaybackRate(track.effects.speed);
    }
  }, [track.effects.speed]);

  // Live volume
  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = track.effects.volume;
    } else {
      wsRef.current?.setVolume(Math.min(1, track.effects.volume));
    }
  }, [track.effects.volume]);

  // Live EQ
  useEffect(() => {
    if (eqNodeRef.current) {
      applyEQ(eqNodeRef.current, track.effects.eqPreset);
    }
  }, [track.effects.eqPreset]);

  const seekTo = useCallback((time: number) => {
    const ws = wsRef.current;
    if (ws) {
      const duration = ws.getDuration();
      if (duration > 0) ws.seekTo(time / duration);
    }
    if (audioCtxRef.current?.state === 'suspended') {
      audioCtxRef.current.resume();
    }
  }, []);

  const togglePlayPause = useCallback(() => {
    const ws = wsRef.current;
    if (!ws) return;
    if (audioCtxRef.current?.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    if (ws.isPlaying()) {
      ws.pause();
    } else {
      const t = trackRef.current;
      const cur = ws.getCurrentTime();
      // Jump to trim start if outside trim region
      if (cur < t.trim.start || cur >= t.trim.end) {
        ws.seekTo(t.trim.start / ws.getDuration());
      }
      ws.play();
    }
  }, []);

  const play = useCallback(() => {
    const ws = wsRef.current;
    if (!ws) return;
    if (audioCtxRef.current?.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    const t = trackRef.current;
    const cur = ws.getCurrentTime();
    if (cur < t.trim.start || cur >= t.trim.end) {
      ws.seekTo(t.trim.start / ws.getDuration());
    }
    ws.play();
  }, []);

  const pause = useCallback(() => wsRef.current?.pause(), []);

  return {
    isPlaying,
    isReady,
    currentTime,
    play,
    pause,
    togglePlayPause,
    seekTo,
  };
}

function applyEQ(node: BiquadFilterNode, preset: EQPreset) {
  const params = EQ_PRESETS[preset];
  if (!params) {
    // "none" -- make the filter transparent (allpass)
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
