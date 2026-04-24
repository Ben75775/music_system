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
    <div className="w-full max-w-lg flex flex-col gap-2 p-4 bg-white rounded-2xl border border-gray-200">
      <p className="text-sm font-semibold text-gray-700">{t('youtubeThumb.title')}</p>
      <p className="text-xs text-gray-500">{t('youtubeThumb.subtitle')}</p>
      <div className="flex gap-2">
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
        <p className="text-xs text-amber-600">{t('youtubeThumb.invalidUrl')}</p>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
