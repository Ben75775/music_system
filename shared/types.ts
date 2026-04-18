export type ProjectMode = 'audio' | 'video';
export type Aspect = '16:9' | '9:16' | '1:1' | '4:3' | '3:4';

export type EQPreset = 'none' | 'bass-boost' | 'vocal-clarity' | 'treble-boost';

export interface TrackEffect {
  volume: number;       // 0-2 (1 = normal)
  fadeIn: number;       // seconds
  fadeOut: number;      // seconds
  speed: number;        // 0.5-2 (1 = normal)
  eqPreset: EQPreset;
}

export interface TrimRange {
  start: number; // seconds
  end: number;   // seconds
}

export interface CropRegion {
  // Normalized to source frame, in [0, 1]. Survives source-metadata changes.
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Clip {
  id: string;
  name: string;
  file: File | null;
  url: string;
  type: ProjectMode;
  duration: number;
  trim: TrimRange;
  effects: TrackEffect;
  crop?: CropRegion;
  sourceWidth?: number;
  sourceHeight?: number;
}

export interface Project {
  id: string;
  mode: ProjectMode;
  aspect?: Aspect;
  clips: Clip[];
}

export const DEFAULT_EFFECTS: TrackEffect = {
  volume: 1,
  fadeIn: 0,
  fadeOut: 0,
  speed: 1,
  eqPreset: 'none',
};

// Back-compat alias: old Track code will be renamed in Phase 4.
export type Track = Clip;
