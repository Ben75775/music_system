import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  parseYoutubeId,
  fetchThumbnail,
  downloadThumbnail,
} from '../lib/youtube-thumbnail';

export default function YoutubeThumbnail() {
  const { t } = useTranslation();
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedId = parseYoutubeId(url);
  const canSubmit = parsedId !== null && !loading;

  const handleDownload = async () => {
    if (!parsedId) return;
    setError(null);
    setLoading(true);
    try {
      const blob = await fetchThumbnail(parsedId);
      downloadThumbnail(blob, parsedId);
    } catch {
      setError(t('youtubeThumb.error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-lg space-y-4">
      <div className="border-2 border-dashed border-gray-300 rounded-2xl p-12 transition-all">
        <div className="text-center">
          <div className="text-5xl mb-4">📺</div>
          <p className="text-lg font-semibold text-gray-700">{t('youtubeThumb.title')}</p>
          <p className="text-sm text-gray-500 mt-1">{t('youtubeThumb.subtitle')}</p>
        </div>

        <div className="flex gap-2 mt-6">
          <input
            type="url"
            value={url}
            onChange={(e) => { setUrl(e.target.value); setError(null); }}
            placeholder={t('youtubeThumb.placeholder')}
            dir="ltr"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
            disabled={loading}
          />
          <button
            type="button"
            onClick={handleDownload}
            disabled={!canSubmit}
            className="px-4 py-2 text-sm rounded-lg bg-primary-600 hover:bg-primary-700 text-white font-semibold disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {loading ? t('youtubeThumb.loading') : t('youtubeThumb.download')}
          </button>
        </div>

        {url.trim() && !parsedId && !loading && (
          <p className="text-xs text-amber-600 mt-2 text-center">{t('youtubeThumb.invalidUrl')}</p>
        )}
      </div>

      {error && (
        <p className="text-red-500 text-sm text-center font-medium">{error}</p>
      )}
    </div>
  );
}
