import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ImageEdit } from 'shared/types';
import { FRAME_W, FRAME_H, baseCoverScale, clampOffset, initialScale, containScale } from '../lib/image-fit';
import { exportImage, downloadBlob } from '../lib/image-export';

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
  onDragUpdate,
  onBack,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: ImageEditorProps) {
  const { t } = useTranslation();

  const [exporting, setExporting] = useState(false);

  const handleDownload = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const blob = await exportImage(edit);
      downloadBlob(blob, `${edit.name}_1034x1379.png`);
    } finally {
      setExporting(false);
    }
  };

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

  const reset = () => {
    onUpdate({
      ...edit,
      rotation: 0,
      scale: initialScale(edit.naturalWidth, edit.naturalHeight, 0),
      offsetX: 0,
      offsetY: 0,
    });
  };

  const fit = () => {
    onUpdate({
      ...edit,
      scale: containScale(edit.naturalWidth, edit.naturalHeight, edit.rotation),
      offsetX: 0,
      offsetY: 0,
    });
  };

  const MIN_SCALE = 0.05;
  const MAX_SCALE = 8;

  const wheelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mouse pan — track drag start state, emit onDragUpdate during, onUpdate on release.
  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startOffsetX = edit.offsetX;
    const startOffsetY = edit.offsetY;

    // The outer frame's rendered width (after max-width: 80vw scaling) is used
    // to convert screen-pixel drags into source-pixel drags.
    const frameEl = e.currentTarget as HTMLElement;
    const rect = frameEl.getBoundingClientRect();
    const screenToSource = FRAME_W / rect.width;

    const onMove = (ev: MouseEvent) => {
      const dx = (ev.clientX - startX) * screenToSource;
      const dy = (ev.clientY - startY) * screenToSource;
      const clamped = clampOffset({
        naturalW: edit.naturalWidth,
        naturalH: edit.naturalHeight,
        rotation: edit.rotation,
        scale: edit.scale,
        offsetX: startOffsetX + dx,
        offsetY: startOffsetY + dy,
      });
      onDragUpdate({ ...edit, ...clamped });
    };
    const onUp = (ev: MouseEvent) => {
      const dx = (ev.clientX - startX) * screenToSource;
      const dy = (ev.clientY - startY) * screenToSource;
      const clamped = clampOffset({
        naturalW: edit.naturalWidth,
        naturalH: edit.naturalHeight,
        rotation: edit.rotation,
        scale: edit.scale,
        offsetX: startOffsetX + dx,
        offsetY: startOffsetY + dy,
      });
      onUpdate({ ...edit, ...clamped });
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // Wheel zoom — continuous updates via onDragUpdate, commit on short idle.
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = Math.pow(1.0015, -e.deltaY);
    const nextScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, edit.scale * factor));
    const clamped = clampOffset({
      naturalW: edit.naturalWidth,
      naturalH: edit.naturalHeight,
      rotation: edit.rotation,
      scale: nextScale,
      offsetX: edit.offsetX,
      offsetY: edit.offsetY,
    });
    const next = { ...edit, scale: nextScale, ...clamped };
    onDragUpdate(next);
    if (wheelTimer.current) clearTimeout(wheelTimer.current);
    wheelTimer.current = setTimeout(() => onUpdate(next), 150);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 0) return;
    e.preventDefault();

    const frameEl = e.currentTarget as HTMLElement;
    const rect = frameEl.getBoundingClientRect();
    const screenToSource = FRAME_W / rect.width;

    if (e.touches.length === 1) {
      // Single-touch pan
      const startX = e.touches[0].clientX;
      const startY = e.touches[0].clientY;
      const startOffsetX = edit.offsetX;
      const startOffsetY = edit.offsetY;

      const onMove = (ev: TouchEvent) => {
        if (ev.touches.length !== 1) return;
        ev.preventDefault();
        const dx = (ev.touches[0].clientX - startX) * screenToSource;
        const dy = (ev.touches[0].clientY - startY) * screenToSource;
        const clamped = clampOffset({
          naturalW: edit.naturalWidth,
          naturalH: edit.naturalHeight,
          rotation: edit.rotation,
          scale: edit.scale,
          offsetX: startOffsetX + dx,
          offsetY: startOffsetY + dy,
        });
        onDragUpdate({ ...edit, ...clamped });
      };
      const onEnd = (ev: TouchEvent) => {
        const last = ev.changedTouches[0];
        const dx = (last.clientX - startX) * screenToSource;
        const dy = (last.clientY - startY) * screenToSource;
        const clamped = clampOffset({
          naturalW: edit.naturalWidth,
          naturalH: edit.naturalHeight,
          rotation: edit.rotation,
          scale: edit.scale,
          offsetX: startOffsetX + dx,
          offsetY: startOffsetY + dy,
        });
        onUpdate({ ...edit, ...clamped });
        window.removeEventListener('touchmove', onMove);
        window.removeEventListener('touchend', onEnd);
        window.removeEventListener('touchcancel', onEnd);
      };
      window.addEventListener('touchmove', onMove, { passive: false });
      window.addEventListener('touchend', onEnd);
      window.addEventListener('touchcancel', onEnd);
    } else if (e.touches.length >= 2) {
      // Two-touch pinch zoom
      const [a, b] = [e.touches[0], e.touches[1]];
      const startDist = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
      const startScale = edit.scale;
      let lastNext: ImageEdit = edit;

      const onMove = (ev: TouchEvent) => {
        if (ev.touches.length < 2) return;
        ev.preventDefault();
        const [a2, b2] = [ev.touches[0], ev.touches[1]];
        const dist = Math.hypot(b2.clientX - a2.clientX, b2.clientY - a2.clientY);
        if (startDist === 0) return;
        const nextScale = Math.max(
          MIN_SCALE,
          Math.min(MAX_SCALE, startScale * (dist / startDist))
        );
        const clamped = clampOffset({
          naturalW: edit.naturalWidth,
          naturalH: edit.naturalHeight,
          rotation: edit.rotation,
          scale: nextScale,
          offsetX: edit.offsetX,
          offsetY: edit.offsetY,
        });
        lastNext = { ...edit, scale: nextScale, ...clamped };
        onDragUpdate(lastNext);
      };
      const onEnd = () => {
        onUpdate(lastNext);
        window.removeEventListener('touchmove', onMove);
        window.removeEventListener('touchend', onEnd);
        window.removeEventListener('touchcancel', onEnd);
      };
      window.addEventListener('touchmove', onMove, { passive: false });
      window.addEventListener('touchend', onEnd);
      window.addEventListener('touchcancel', onEnd);
    }
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
          className="relative overflow-hidden bg-gray-900 shadow-lg cursor-grab active:cursor-grabbing touch-none"
          style={{
            width: FRAME_W,
            height: FRAME_H,
            maxWidth: '80vw',
            maxHeight: '70vh',
            aspectRatio: `${FRAME_W} / ${FRAME_H}`,
          }}
          onMouseDown={onMouseDown}
          onWheel={onWheel}
          onTouchStart={onTouchStart}
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
          onClick={reset}
          className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg"
        >
          {t('image.reset')}
        </button>
        <button
          onClick={fit}
          className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg"
        >
          {t('image.fit')}
        </button>
        <button
          onClick={rotate}
          className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg"
        >
          {t('image.rotate')}
        </button>
        <button
          onClick={handleDownload}
          disabled={exporting}
          className="px-4 py-2 text-sm bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-semibold disabled:opacity-50"
        >
          {exporting ? t('editor.exporting') : t('image.download')}
        </button>
      </div>
    </div>
  );
}
