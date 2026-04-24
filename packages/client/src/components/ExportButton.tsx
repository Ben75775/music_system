import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Project } from 'shared/types';
import { useFFmpeg } from '../hooks/useFFmpeg';
import { exportProject } from '../lib/concat-export';

interface ExportButtonProps {
  project: Project;
}

export default function ExportButton({ project }: ExportButtonProps) {
  const { t } = useTranslation();
  const { loaded, loading, load, run, writeFile, readFile, deleteFile } = useFFmpeg();
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    setError(null);
    if (!loaded) {
      await load();
      return;
    }
    setExporting(true);
    setProgress(0);
    try {
      const { blob, filename } = await exportProject(
        project,
        { run, writeFile, readFile, deleteFile },
        setProgress
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes('normalize_failed')) setError(t('export.clipFailed'));
      else if (msg.includes('concat_failed')) setError(t('export.concatFailed'));
      else if (msg.toLowerCase().includes('memory')) setError(t('export.tooLarge'));
      else setError(t('export.failed'));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        onClick={handleExport}
        disabled={loading || exporting || project.clips.length === 0}
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
              : t('export.download')}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
