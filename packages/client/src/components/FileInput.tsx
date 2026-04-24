import { useState, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { Clip, ImageEdit } from 'shared/types';
import { DEFAULT_EFFECTS } from 'shared/types';

const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200MB
const AV_TYPES = ['audio/mpeg', 'audio/mp3', 'video/mp4'];
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

interface FileInputProps {
  onFileReady: (track: Clip) => void;
  onImageReady: (edit: ImageEdit) => void;
}

export default function FileInput({ onFileReady, onImageReady }: FileInputProps) {
  const { t } = useTranslation();
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(
    async (file: File) => {
      setError(null);

      if (file.size > MAX_FILE_SIZE) {
        setError(t('input.fileTooLarge'));
        return;
      }

      // Image branch
      if (file.type.startsWith('image/')) {
        if (!IMAGE_TYPES.includes(file.type)) {
          setError(t('image.unsupportedFormat'));
          return;
        }
        setLoading(true);
        try {
          const url = URL.createObjectURL(file);
          const { naturalWidth, naturalHeight } = await readImageNaturalSize(url);
          const dot = file.name.lastIndexOf('.');
          const name = dot > 0 ? file.name.slice(0, dot) : file.name;
          onImageReady({
            src: url,
            name,
            naturalWidth,
            naturalHeight,
            scale: 1,
            offsetX: 0,
            offsetY: 0,
            rotation: 0,
          });
        } catch {
          setError(t('input.invalidFile'));
        } finally {
          setLoading(false);
        }
        return;
      }

      // Audio / video branch
      if (!AV_TYPES.includes(file.type)) {
        setError(t('input.invalidFile'));
        return;
      }

      setLoading(true);
      try {
        const url = URL.createObjectURL(file);
        const type: 'audio' | 'video' = file.type.startsWith('video/') ? 'video' : 'audio';
        const { duration, width, height } = await readMediaMetadata(url, type);
        const track: Clip = {
          id: crypto.randomUUID(),
          name: file.name,
          file,
          url,
          type,
          duration,
          trim: { start: 0, end: duration },
          effects: { ...DEFAULT_EFFECTS },
          ...(type === 'video' ? { sourceWidth: width, sourceHeight: height } : {}),
        };
        onFileReady(track);
      } catch {
        setError(t('input.invalidFile'));
      } finally {
        setLoading(false);
      }
    },
    [onFileReady, onImageReady, t]
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
          accept=".mp3,.mp4,.png,.jpg,.jpeg,.webp,audio/mpeg,video/mp4,image/png,image/jpeg,image/webp"
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

function readMediaMetadata(
  url: string,
  type: 'audio' | 'video'
): Promise<{ duration: number; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    if (type === 'audio') {
      const el = document.createElement('audio');
      el.preload = 'metadata';
      el.onloadedmetadata = () =>
        resolve({ duration: el.duration, width: 0, height: 0 });
      el.onerror = reject;
      el.src = url;
    } else {
      const el = document.createElement('video');
      el.preload = 'metadata';
      el.onloadedmetadata = () =>
        resolve({
          duration: el.duration,
          width: el.videoWidth,
          height: el.videoHeight,
        });
      el.onerror = reject;
      el.src = url;
    }
  });
}

function readImageNaturalSize(
  url: string
): Promise<{ naturalWidth: number; naturalHeight: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () =>
      resolve({ naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight });
    img.onerror = reject;
    img.src = url;
  });
}
