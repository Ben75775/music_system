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

export interface ImageEdit {
  /** Object URL for the source image. */
  src: string;
  /** Original filename without extension (used as export filename stem). */
  name: string;
  /** Intrinsic width of the source image in CSS pixels. */
  naturalWidth: number;
  /** Intrinsic height of the source image in CSS pixels. */
  naturalHeight: number;
  /** User zoom multiplier on top of base cover scale. 1.0 = exact cover; min 1, max 8. */
  scale: number;
  /** Screen-space horizontal offset in source pixels. 0 = centered. */
  offsetX: number;
  /** Screen-space vertical offset in source pixels. 0 = centered. */
  offsetY: number;
  /** Quadrant rotation applied before scale, in degrees. */
  rotation: 0 | 90 | 180 | 270;
}
