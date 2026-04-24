import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { ImageEdit } from 'shared/types';
import { FRAME_W, FRAME_H, baseCoverScale, clampOffset } from '../lib/image-fit';

interface ImageEditorProps {
  edit: ImageEdit;
  /** Discrete change — pushes previous state to undo history. */
  onUpdate: (edit: ImageEdit) => void;
  /** Continuous mid-gesture change — no undo entry. Unused in this task; wired in 3.2. */
  onDragUpdate: (edit: ImageEdit) => void;
  onBack: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export default function ImageEditor({
  edit,
  onUpdate,
  onDragUpdate: _onDragUpdate,
  onBack,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: ImageEditorProps) {
  const { t } = useTranslation();

  // Ctrl+Z / Ctrl+Y keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === 'TEXTAREA') return;
      if (el.tagName === 'INPUT' && (el as HTMLInputElement).type !== 'range') return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        onUndo();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        onRedo();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onUndo, onRedo]);

  const cover = baseCoverScale(edit.naturalWidth, edit.naturalHeight, edit.rotation);
  const displayScale = cover * edit.scale;

  const rotate = () => {
    const nextRotation = ((edit.rotation + 90) % 360) as 0 | 90 | 180 | 270;
    const clamped = clampOffset({
      naturalW: edit.naturalWidth,
      naturalH: edit.naturalHeight,
      rotation: nextRotation,
      scale: edit.scale,
      offsetX: edit.offsetX,
      offsetY: edit.offsetY,
    });
    onUpdate({ ...edit, rotation: nextRotation, ...clamped });
  };

  const center = () => {
    onUpdate({ ...edit, scale: 1, offsetX: 0, offsetY: 0 });
  };

  return (
    <div className="space-y-4 w-full max-w-4xl mx-auto p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            {t('editor.back')}
          </button>
          <button
            onClick={onUndo}
            disabled={!canUndo}
            className="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Ctrl+Z"
          >
            ↩
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            className="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Ctrl+Y"
          >
            ↪
          </button>
        </div>
        <h2 className="text-lg font-semibold text-gray-700 truncate max-w-md">
          {t('image.title')} — {edit.name}
        </h2>
        <div className="w-20" />
      </div>

      {/* Crop frame — 1034×1379 scaled down to fit viewport */}
      <div className="flex justify-center">
        <div
          className="relative overflow-hidden bg-gray-900 shadow-lg"
          style={{
            width: FRAME_W,
            height: FRAME_H,
            maxWidth: '80vw',
            maxHeight: '70vh',
            aspectRatio: `${FRAME_W} / ${FRAME_H}`,
          }}
        >
          <img
            src={edit.src}
            alt=""
            draggable={false}
            className="absolute top-1/2 left-1/2 select-none"
            style={{
              width: edit.naturalWidth,
              height: edit.naturalHeight,
              transform: `translate(-50%, -50%) translate(${edit.offsetX}px, ${edit.offsetY}px) rotate(${edit.rotation}deg) scale(${displayScale})`,
              transformOrigin: 'center',
            }}
          />
        </div>
      </div>

      {/* Instructions */}
      <p className="text-center text-sm text-gray-500">{t('image.instructions')}</p>

      {/* Controls row */}
      <div className="flex justify-center gap-2">
        <button
          onClick={center}
          className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg"
        >
          {t('image.center')}
        </button>
        <button
          onClick={rotate}
          className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg"
        >
          {t('image.rotate')}
        </button>
      </div>
    </div>
  );
}
