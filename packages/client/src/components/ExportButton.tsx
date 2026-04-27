import { useTranslation } from 'react-i18next';

interface ExportButtonProps {
  exporting: boolean;
  progress: number;
  error: string | null;
  /** True when the WebCodecs path is in play (no ffmpeg load needed). */
  useWebCodecs: boolean;
  ffmpegLoading: boolean;
  ffmpegLoaded: boolean;
  onExport: () => void;
}

export default function ExportButton({
  exporting,
  progress,
  error,
  useWebCodecs,
  ffmpegLoading,
  ffmpegLoaded,
  onExport,
}: ExportButtonProps) {
  const { t } = useTranslation();
  const ready = useWebCodecs || ffmpegLoaded;

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        onClick={onExport}
        disabled={ffmpegLoading || exporting}
        className={`
          px-8 py-4 rounded-xl text-lg font-bold transition-all
          ${
            ffmpegLoading || exporting
              ? 'bg-gray-300 text-gray-500 cursor-wait'
              : 'bg-primary-600 hover:bg-primary-700 text-white shadow-lg hover:shadow-xl active:scale-95'
          }
        `}
      >
        {ffmpegLoading
          ? t('editor.loadingFFmpeg')
          : exporting
            ? `${t('editor.exporting')} ${progress}%`
            : !ready
              ? t('editor.loadingFFmpeg')
              : t('export.download')}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
