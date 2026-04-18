export interface TrackEffect {
  volume: number;       // 0-2 (1 = normal)
  fadeIn: number;       // seconds
  fadeOut: number;      // seconds
  speed: number;        // 0.5-2 (1 = normal)
  pitch: number;        // 0.5-2 (1 = normal)
  eqPreset: EQPreset;
}

export type EQPreset = 'none' | 'bass-boost' | 'vocal-clarity' | 'treble-boost';

export interface TrimRange {
  start: number;  // seconds
  end: number;    // seconds
}

export interface Track {
  id: string;
  name: string;
  file: File | null;
  url: string;           // object URL for playback
  type: 'audio' | 'video';
  duration: number;      // seconds
  trim: TrimRange;
  effects: TrackEffect;
}

export interface ExportConfig {
  format: 'mp3' | 'mp4' | 'original';
  tracks: Track[];
}

export const DEFAULT_EFFECTS: TrackEffect = {
  volume: 1,
  fadeIn: 0,
  fadeOut: 0,
  speed: 1,
  pitch: 1,
  eqPreset: 'none',
};
