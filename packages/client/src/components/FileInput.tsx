import { useState, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { Clip } from 'shared/types';
import { DEFAULT_EFFECTS } from 'shared/types';

const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200MB
const ACCEPTED_TYPES = ['audio/mpeg', 'audio/mp3', 'video/mp4'];

interface FileInputProps {
  onFileReady: (track: Clip) => void;
}

export default function FileInput({ onFileReady }: FileInputProps) {
  const { t } = useTranslation();
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(
    async (file: File) => {
      setError(null);

      if (!ACCEPTED_TYPES.includes(file.type)) {
        setError(t('input.invalidFile'));
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        setError(t('input.fileTooLarge'));
        return;
      }

      setLoading(true);
      try {
        const url = URL.createObjectURL(file);
        const type: 'audio' | 'video' = file.type.startsWith('video/')
          ? 'video'
          : 'audio';

        // Get duration
        const duration = await getMediaDuration(url, type);

        const track: Clip = {
          id: crypto.randomUUID(),
          name: file.name,
          file,
          url,
          type,
          duration,
          trim: { start: 0, end: duration },
          effects: { ...DEFAULT_EFFECTS },
        };

        onFileReady(track);
      } catch {
        setError(t('input.invalidFile'));
      } finally {
        setLoading(false);
      }
    },
    [onFileReady, t]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  return (
    <div className="w-full max-w-lg space-y-4">
      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`
          border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all
          ${
            dragActive
              ? 'border-primary-500 bg-primary-50'
              : 'border-gray-300 hover:border-primary-400 hover:bg-gray-50'
          }
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".mp3,.mp4,audio/mpeg,video/mp4"
          onChange={handleFileChange}
          className="hidden"
        />
        <div className="text-5xl mb-4">🎵</div>
        <p className="text-lg font-semibold text-gray-700">
          {t('input.uploadTitle')}
        </p>
        <p className="text-sm text-gray-500 mt-1">{t('input.uploadDesc')}</p>
      </div>

      {/* Error */}
      {error && (
        <p className="text-red-500 text-sm text-center font-medium">{error}</p>
      )}

      {/* Loading */}
      {loading && (
        <p className="text-primary-600 text-sm text-center animate-pulse">
          {t('input.loading')}
        </p>
      )}
    </div>
  );
}

function getMediaDuration(
  url: string,
  type: 'audio' | 'video'
): Promise<number> {
  return new Promise((resolve, reject) => {
    const el = document.createElement(type === 'audio' ? 'audio' : 'video');
    el.preload = 'metadata';
    el.onloadedmetadata = () => {
      resolve(el.duration);
    };
    el.onerror = reject;
    el.src = url;
  });
}
