import type { Track } from 'shared/types';

/**
 * Build FFmpeg arguments for processing a track with all its effects.
 */
export function buildFFmpegArgs(track: Track): string[] {
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

  // Pitch shift
  if (effects.pitch !== 1) {
    const rate = Math.round(44100 * effects.pitch);
    filters.push(`asetrate=${rate},aresample=44100`);
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
export function getOutputName(track: Track): string {
  return track.type === 'audio' ? 'output.mp3' : 'output.mp4';
}
