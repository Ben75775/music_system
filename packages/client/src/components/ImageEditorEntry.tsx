import { useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { ImageEdit } from 'shared/types';

const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200MB
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const VIDEO_TYPES = ['video/mp4'];

interface ImageEditorEntryProps {
  onImageReady: (edit: ImageEdit) => void;
}

/**
 * "Resolution for screen" entry block — accepts an image or an MP4 and opens
 * the same 1034×1379 editor. Images export as PNG; videos export as MP4 with
 * the same pan/zoom/rotate baked in (via ffmpeg).
 */
export default function ImageEditorEntry({ onImageReady }: ImageEditorEntryProps) {
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

      const isImage = IMAGE_TYPES.includes(file.type);
      const isVideo = VIDEO_TYPES.includes(file.type);

      if (!isImage && !isVideo) {
        setError(t('imageEntry.unsupported'));
        return;
      }

      setLoading(true);
      try {
        const dot = file.name.lastIndexOf('.');
        const name = dot > 0 ? file.name.slice(0, dot) : file.name;
        const url = URL.createObjectURL(file);

        if (isImage) {
          const { naturalWidth, naturalHeight } = await readImageNaturalSize(url);
          onImageReady({
            src: url,
            name,
            mediaType: 'image',
            naturalWidth,
            naturalHeight,
            scale: 1,
            offsetX: 0,
            offsetY: 0,
            rotation: 0,
          });
        } else {
          const meta = await readVideoMetadata(url);
          onImageReady({
            src: url,
            name,
            mediaType: 'video',
            file,
            duration: meta.duration,
            naturalWidth: meta.width,
            naturalHeight: meta.height,
            scale: 1,
            offsetX: 0,
            offsetY: 0,
            rotation: 0,
          });
        }
      } catch {
        setError(isVideo ? t('imageEntry.videoFailed') : t('imageEntry.error'));
      } finally {
        setLoading(false);
      }
    },
    [onImageReady, t]
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragActive(false);
        const f = e.dataTransfer.files[0];
        if (f) processFile(f);
      }}
      className={`w-full max-w-lg flex flex-col gap-2 p-4 rounded-2xl border transition-colors ${
        dragActive
          ? 'border-primary-500 bg-primary-50'
          : 'border-gray-200 bg-white'
      }`}
    >
      <p className="text-sm font-semibold text-gray-700">{t('imageEntry.title')}</p>
      <p className="text-xs text-gray-500">{t('imageEntry.subtitle')}</p>
      <input
        ref={fileInputRef}
        type="file"
        accept=".png,.jpg,.jpeg,.webp,.mp4,image/png,image/jpeg,image/webp,video/mp4"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) processFile(f);
        }}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={loading}
        className="px-4 py-2 text-sm rounded-lg bg-primary-600 hover:bg-primary-700 text-white font-semibold disabled:bg-gray-300 disabled:cursor-not-allowed"
      >
        {loading ? t('imageEntry.loading') : t('imageEntry.pick')}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
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

function readVideoMetadata(
  url: string
): Promise<{ duration: number; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.muted = true;
    v.onloadedmetadata = () =>
      resolve({
        duration: v.duration,
        width: v.videoWidth,
        height: v.videoHeight,
      });
    v.onerror = () => reject(new Error('video_metadata_failed'));
    v.src = url;
  });
}
