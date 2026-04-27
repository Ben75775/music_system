import type { Clip, Project } from 'shared/types';
import { outputDimensions } from './aspect';

/**
 * Build FFmpeg arguments for processing a track with all its effects.
 */
export function buildFFmpegArgs(track: Clip): string[] {
  const args: string[] = [];
  const filters: string[] = [];

  // Trim
  if (track.trim.start > 0) {
    args.push('-ss', track.trim.start.toFixed(3));
  }
  if (track.trim.end < track.duration) {
    args.push('-to', track.trim.end.toFixed(3));
  }

  const { effects } = track;

  // Volume
  if (effects.volume !== 1) {
    filters.push(`volume=${effects.volume.toFixed(2)}`);
  }

  // Fade in
  if (effects.fadeIn > 0) {
    filters.push(`afade=t=in:st=0:d=${effects.fadeIn.toFixed(2)}`);
  }

  // Fade out
  if (effects.fadeOut > 0) {
    const trimmedDuration = track.trim.end - track.trim.start;
    const fadeStart = trimmedDuration - effects.fadeOut;
    if (fadeStart > 0) {
      filters.push(
        `afade=t=out:st=${fadeStart.toFixed(2)}:d=${effects.fadeOut.toFixed(2)}`
      );
    }
  }

  // Speed (atempo supports 0.5-2.0 per filter, chain for wider range)
  if (effects.speed !== 1) {
    filters.push(`atempo=${effects.speed.toFixed(2)}`);
  }

  // EQ presets
  switch (effects.eqPreset) {
    case 'bass-boost':
      filters.push('equalizer=f=100:width_type=o:width=2:g=6');
      break;
    case 'vocal-clarity':
      filters.push('equalizer=f=3000:width_type=o:width=1.5:g=4');
      break;
    case 'treble-boost':
      filters.push('equalizer=f=8000:width_type=o:width=2:g=5');
      break;
  }

  // Apply audio filters
  if (filters.length > 0) {
    args.push('-af', filters.join(','));
  }

  // Output codec
  if (track.type === 'audio') {
    args.push('-codec:a', 'libmp3lame', '-q:a', '2');
  } else {
    // For video: copy video stream, process audio
    if (filters.length > 0) {
      args.push('-c:v', 'copy');
    } else {
      args.push('-c', 'copy');
    }
  }

  return args;
}

/**
 * Get output file extension based on track type.
 */
export function getOutputName(track: Clip): string {
  return track.type === 'audio' ? 'output.mp3' : 'output.mp4';
}

function isIdentityCrop(crop: Clip['crop']): boolean {
  if (!crop) return true;
  return crop.x === 0 && crop.y === 0 && crop.width === 1 && crop.height === 1;
}

function audioNeedsReencode(effects: Clip['effects']): boolean {
  return (
    effects.volume !== 1 ||
    effects.fadeIn > 0 ||
    effects.fadeOut > 0 ||
    effects.speed !== 1 ||
    effects.eqPreset !== 'none'
  );
}

function videoNeedsReencode(
  clip: Clip,
  project: Project,
  outDims: { w: number; h: number } | undefined
): boolean {
  if (project.mode !== 'video') return false;
  if (clip.effects.speed !== 1) return true;
  if (!isIdentityCrop(clip.crop)) return true;
  // Visual fade-in/out is baked into the video via the fade filter, so any
  // fade also forces a re-encode.
  if (clip.effects.fadeIn > 0 || clip.effects.fadeOut > 0) return true;
  const dims = outDims ?? outputDimensions(project.aspect!);
  if (clip.sourceWidth !== dims.w || clip.sourceHeight !== dims.h) return true;
  return false;
}

/**
 * Build args for the per-clip normalize pass. Input is the clip's source file;
 * output is a clip_N.<ext> file that matches the project's common format.
 *
 * Fast path: when the clip needs no transformations (no crop, no speed, no
 * audio effects, source dims already match target), we use `-c copy` and the
 * encoder is skipped entirely — a 5-minute video exports in seconds instead
 * of minutes. Trim still applies; the trim points snap to the nearest
 * keyframe under copy mode (acceptable trade-off for the speedup).
 */
export function buildNormalizeArgs(
  clip: Clip,
  project: Project,
  outDims?: { w: number; h: number }
): string[] {
  if (project.mode === 'video' && !project.aspect) {
    throw new Error('video project must have aspect set');
  }

  const args: string[] = [];

  if (clip.trim.start > 0) args.push('-ss', clip.trim.start.toFixed(3));
  if (clip.trim.end < clip.duration) args.push('-to', clip.trim.end.toFixed(3));

  const { effects } = clip;
  const audioFilters: string[] = [];
  const videoFilters: string[] = [];
  const reencodeAudio = audioNeedsReencode(effects);
  const reencodeVideo = videoNeedsReencode(clip, project, outDims);

  if (reencodeAudio) {
    if (effects.volume !== 1) audioFilters.push(`volume=${effects.volume.toFixed(2)}`);
    if (effects.fadeIn > 0) {
      audioFilters.push(`afade=t=in:st=0:d=${effects.fadeIn.toFixed(2)}`);
    }
    if (effects.fadeOut > 0) {
      const trimmed = clip.trim.end - clip.trim.start;
      const st = Math.max(0, trimmed - effects.fadeOut);
      audioFilters.push(
        `afade=t=out:st=${st.toFixed(2)}:d=${effects.fadeOut.toFixed(2)}`
      );
    }
    if (effects.speed !== 1) audioFilters.push(`atempo=${effects.speed.toFixed(2)}`);

    switch (effects.eqPreset) {
      case 'bass-boost':
        audioFilters.push('equalizer=f=100:width_type=o:width=2:g=6');
        break;
      case 'vocal-clarity':
        audioFilters.push('equalizer=f=3000:width_type=o:width=1.5:g=4');
        break;
      case 'treble-boost':
        audioFilters.push('equalizer=f=8000:width_type=o:width=2:g=5');
        break;
    }
  }

  if (reencodeVideo) {
    const dims = outDims ?? outputDimensions(project.aspect!);
    const { w, h } = dims;
    if (
      project.aspect !== 'original' &&
      !isIdentityCrop(clip.crop) &&
      clip.sourceWidth &&
      clip.sourceHeight
    ) {
      const cx = Math.round(clip.crop!.x * clip.sourceWidth);
      const cy = Math.round(clip.crop!.y * clip.sourceHeight);
      const cw = Math.round(clip.crop!.width * clip.sourceWidth);
      const ch = Math.round(clip.crop!.height * clip.sourceHeight);
      videoFilters.push(`crop=${cw}:${ch}:${cx}:${cy}`);
    }
    videoFilters.push(`scale=${w}:${h}:force_original_aspect_ratio=decrease`);
    videoFilters.push(`pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black`);
    videoFilters.push(`setsar=1`);
    if (effects.speed !== 1) {
      videoFilters.push(`setpts=${(1 / effects.speed).toFixed(4)}*PTS`);
    }
    // Visual fade — same timing as the audio afade above so the screen
    // fades in/out together with the sound.
    if (effects.fadeIn > 0) {
      videoFilters.push(
        `fade=t=in:st=0:d=${effects.fadeIn.toFixed(2)}:color=black`
      );
    }
    if (effects.fadeOut > 0) {
      const trimmed = clip.trim.end - clip.trim.start;
      const st = Math.max(0, trimmed - effects.fadeOut);
      videoFilters.push(
        `fade=t=out:st=${st.toFixed(2)}:d=${effects.fadeOut.toFixed(2)}:color=black`
      );
    }
  }

  if (audioFilters.length > 0) args.push('-af', audioFilters.join(','));
  if (videoFilters.length > 0) args.push('-vf', videoFilters.join(','));

  if (project.mode === 'audio') {
    if (reencodeAudio) {
      args.push('-c:a', 'libmp3lame', '-ar', '44100', '-ac', '2', '-q:a', '2');
    } else {
      args.push('-c', 'copy');
    }
  } else {
    if (reencodeVideo) {
      args.push(
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-tune', 'fastdecode',
        '-crf', '26'
      );
    } else {
      args.push('-c:v', 'copy');
    }
    if (reencodeAudio) {
      args.push('-c:a', 'aac', '-ar', '48000', '-ac', '2', '-b:a', '128k');
    } else {
      args.push('-c:a', 'copy');
    }
  }

  return args;
}

export function buildConcatArgs(inputFiles: string[], outputName: string): string[] {
  void inputFiles; // caller passes for intent/validation; actual list comes from list.txt
  return ['-f', 'concat', '-safe', '0', '-i', 'list.txt', '-c', 'copy', outputName];
}
