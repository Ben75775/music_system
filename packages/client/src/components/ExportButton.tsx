import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Track } from 'shared/types';
import { useFFmpeg } from '../hooks/useFFmpeg';
import { buildFFmpegArgs, getOutputName } from '../lib/ffmpeg-commands';

interface ExportButtonProps {
  track: Track;
}

export default function ExportButton({ track }: ExportButtonProps) {
  const { t } = useTranslation();
  const { loaded, loading, load, exec, progress } = useFFmpeg();
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    if (!loaded) {
      await load();
      return;
    }

    if (!track.file) return;

    setExporting(true);
    try {
      const args = buildFFmpegArgs(track);
      const outputName = getOutputName(track);
      const blob = await exec(track.file, args, outputName);

      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `edited_${track.name}`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } finally {
      setExporting(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={loading || exporting}
      className={`
        px-8 py-4 rounded-xl text-lg font-bold transition-all
        ${
          loading || exporting
            ? 'bg-gray-300 text-gray-500 cursor-wait'
            : 'bg-primary-600 hover:bg-primary-700 text-white shadow-lg hover:shadow-xl active:scale-95'
        }
      `}
    >
      {loading
        ? t('editor.loadingFFmpeg')
        : exporting
          ? `${t('editor.exporting')} ${progress}%`
          : !loaded
            ? t('editor.loadingFFmpeg')
            : t('editor.export')}
    </button>
  );
}
