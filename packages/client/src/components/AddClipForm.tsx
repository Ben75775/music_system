import { useState, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { Clip, ProjectMode } from 'shared/types';
import { DEFAULT_EFFECTS } from 'shared/types';

const MAX_FILE_SIZE = 200 * 1024 * 1024;

interface AddClipFormProps {
  mode: ProjectMode;
  onClipReady: (clip: Clip) => void;
}

export default function AddClipForm({ mode, onClipReady }: AddClipFormProps) {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const acceptedMime = mode === 'audio' ? ['audio/mpeg', 'audio/mp3'] : ['video/mp4'];
  const acceptAttr = mode === 'audio' ? '.mp3,audio/mpeg' : '.mp4,video/mp4';

  const addFile = useCallback(
    async (file: File) => {
      setError(null);
      if (!acceptedMime.includes(file.type)) {
        setError(t(mode === 'audio' ? 'project.audioOnly' : 'project.videoOnly'));
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        setError(t('input.fileTooLarge'));
        return;
      }
      setLoading(true);
      try {
        const url = URL.createObjectURL(file);
        const { duration, width, height } = await readMediaMetadata(url, mode);
        const clip: Clip = {
          id: crypto.randomUUID(),
          name: file.name,
          file,
          url,
          type: mode,
          duration,
          trim: { start: 0, end: duration },
          effects: { ...DEFAULT_EFFECTS },
          ...(mode === 'video' ? { sourceWidth: width, sourceHeight: height } : {}),
        };
        onClipReady(clip);
      } catch {
        setError(t('input.invalidFile'));
      } finally {
        setLoading(false);
      }
    },
    [mode, onClipReady, t, acceptedMime]
  );

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) addFile(f);
    e.target.value = '';
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={loading}
        className="w-full border-2 border-dashed border-gray-300 rounded-lg px-3 py-4 text-sm text-gray-600 hover:border-primary-400 hover:bg-gray-50 disabled:opacity-50"
      >
        {t('project.addClipFile')}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept={acceptAttr}
        onChange={onFile}
        className="hidden"
      />
      {loading && (
        <p className="text-xs text-primary-600 animate-pulse text-center">
          {t('input.loading')}
        </p>
      )}
      {error && <p className="text-xs text-red-600 text-center">{error}</p>}
    </div>
  );
}

function readMediaMetadata(
  url: string,
  mode: ProjectMode
): Promise<{ duration: number; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    if (mode === 'audio') {
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
