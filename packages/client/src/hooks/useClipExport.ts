import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Project } from 'shared/types';
import { useFFmpeg } from './useFFmpeg';
import { exportProject } from '../lib/concat-export';
import {
  canUseWebCodecsPath,
  exportClipVideoWebCodecs,
} from '../lib/clip-export-webcodecs';

/**
 * Shared export state for a single-clip project. Both the regular Download
 * button and the LoopOver control inside `Controls` use this so they share
 * one ffmpeg instance, one in-flight export, and one progress counter.
 */
export type ExportTrigger = 'main' | 'loop';

export function useClipExport(project: Project) {
  const { t } = useTranslation();
  const ffmpeg = useFFmpeg();
  const [exporting, setExporting] = useState(false);
  const [stepProgress, setStepProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [activeTrigger, setActiveTrigger] = useState<ExportTrigger | null>(null);

  const useWebCodecs =
    project.clips.length === 1 &&
    canUseWebCodecsPath(project.clips[0], project);

  // Real-time view: the inner ffmpeg progress climbs continuously inside one
  // step; the step counter from concat-export jumps between clips. Show
  // whichever is higher.
  const displayProgress = Math.max(stepProgress, ffmpeg.progress);

  const exportClip = useCallback(
    async (loopCount: number = 1, trigger: ExportTrigger = 'main') => {
      setError(null);
      setActiveTrigger(trigger);
      // ffmpeg load is only needed for the ffmpeg path. WebCodecs path needs
      // no ffmpeg at all.
      if (!useWebCodecs && !ffmpeg.loaded) {
        await ffmpeg.load();
        setActiveTrigger(null);
        return;
      }
      const safeLoopCount = Math.max(1, Math.floor(loopCount));
      setExporting(true);
      setStepProgress(0);
      try {
        let blob: Blob;
        let filename: string;
        if (useWebCodecs) {
          blob = await exportClipVideoWebCodecs(
            project.clips[0],
            project,
            (ratio) => setStepProgress(Math.round(ratio * 100)),
            safeLoopCount
          );
          filename =
            safeLoopCount > 1 ? `merged_x${safeLoopCount}.mp4` : 'merged.mp4';
        } else {
          const result = await exportProject(
            project,
            {
              run: ffmpeg.run,
              writeFile: ffmpeg.writeFile,
              readFile: ffmpeg.readFile,
              deleteFile: ffmpeg.deleteFile,
            },
            setStepProgress,
            safeLoopCount
          );
          blob = result.blob;
          filename = result.filename;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[export] failed:', e);
        const msg = (e as Error).message;
        if (msg.includes('normalize_failed')) setError(t('export.clipFailed'));
        else if (msg.includes('concat_failed')) setError(t('export.concatFailed'));
        else if (msg.toLowerCase().includes('memory')) setError(t('export.tooLarge'));
        else setError(t('export.failed'));
      } finally {
        setExporting(false);
        setActiveTrigger(null);
      }
    },
    [project, useWebCodecs, ffmpeg, t]
  );

  return {
    exportClip,
    exporting,
    progress: displayProgress,
    error,
    useWebCodecs,
    ffmpegLoading: ffmpeg.loading,
    ffmpegLoaded: ffmpeg.loaded,
    activeTrigger,
  };
}
