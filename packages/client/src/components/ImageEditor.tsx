import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ImageEdit } from 'shared/types';
import { FRAME_W, FRAME_H } from '../lib/image-fit';
import { exportImage, downloadBlob } from '../lib/image-export';

interface ImageEditorProps {
  edit: ImageEdit;
  /** Discrete change — pushes previous state to undo history. */
  onUpdate: (edit: ImageEdit) => void;
  /** Continuous mid-gesture change — no undo entry. */
  onDragUpdate: (edit: ImageEdit) => void;
  onBack: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

const MIN_SCALE = 0.1;
const MAX_SCALE = 16;

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

  const rotationCommitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onRotationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextRotation = Number(e.target.value);
    const next = { ...edit, rotation: nextRotation };
    onDragUpdate(next);
    if (rotationCommitTimer.current) clearTimeout(rotationCommitTimer.current);
    rotationCommitTimer.current = setTimeout(() => onUpdate(next), 150);
  };

  const reset = () => {
    onUpdate({ ...edit, scale: 1, offsetX: 0, offsetY: 0, rotation: 0 });
  };

  const fit = () => {
    // Cover: image fills the 1034×1379 frame completely, overflow cropped.
    // Use max() so the smaller image dimension matches the larger frame dim.
    const rad = (edit.rotation * Math.PI) / 180;
    const cosR = Math.abs(Math.cos(rad));
    const sinR = Math.abs(Math.sin(rad));
    const bboxW = edit.naturalWidth * cosR + edit.naturalHeight * sinR;
    const bboxH = edit.naturalWidth * sinR + edit.naturalHeight * cosR;
    const nextScale = Math.max(FRAME_W / bboxW, FRAME_H / bboxH);
    onUpdate({ ...edit, scale: nextScale, offsetX: 0, offsetY: 0 });
  };

  const wheelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  // Keep a live ref to the current edit so the native wheel listener (below) can
  // read fresh state without having to be re-attached on every edit change.
  const editRef = useRef(edit);
  useEffect(() => {
    editRef.current = edit;
  }, [edit]);

  // Stage = max(frame, image) in each axis. Image always renders at natural
  // pixel size (no displayScale shrink). If the stage exceeds the browser
  // window, the page scrolls — the user can scroll / pan / zoom to see
  // what they want. This guarantees the preview is 1:1 with the export for
  // every resolution, no forced browser-fit shrink.
  const stageW = Math.max(FRAME_W, edit.naturalWidth);
  const stageH = Math.max(FRAME_H, edit.naturalHeight);

  // Wheel zoom — attach a NON-passive native listener so we can call preventDefault
  // (React synthetic onWheel is passive by default, so e.preventDefault() there
  // is a no-op and the browser scrolls the page behind the editor). Non-passive
  // captures the wheel on the viewport only; outside it, the page scrolls normally.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const handler = (ev: WheelEvent) => {
      ev.preventDefault();
      const current = editRef.current;
      const factor = Math.pow(1.0015, -ev.deltaY);
      const nextScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, current.scale * factor));
      const next = { ...current, scale: nextScale };
      onDragUpdate(next);
      if (wheelTimer.current) clearTimeout(wheelTimer.current);
      wheelTimer.current = setTimeout(() => onUpdate(next), 150);
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [onDragUpdate, onUpdate]);

  // Mouse pan — track drag start state, emit onDragUpdate during, onUpdate on release.
  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startOffsetX = edit.offsetX;
    const startOffsetY = edit.offsetY;

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      onDragUpdate({ ...edit, offsetX: startOffsetX + dx, offsetY: startOffsetY + dy });
    };
    const onUp = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      onUpdate({ ...edit, offsetX: startOffsetX + dx, offsetY: startOffsetY + dy });
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 0) return;
    e.preventDefault();

    if (e.touches.length === 1) {
      // Single-touch pan
      const startX = e.touches[0].clientX;
      const startY = e.touches[0].clientY;
      const startOffsetX = edit.offsetX;
      const startOffsetY = edit.offsetY;

      const onMove = (ev: TouchEvent) => {
        if (ev.touches.length !== 1) return;
        ev.preventDefault();
        const dx = ev.touches[0].clientX - startX;
        const dy = ev.touches[0].clientY - startY;
        onDragUpdate({ ...edit, offsetX: startOffsetX + dx, offsetY: startOffsetY + dy });
      };
      const onEnd = (ev: TouchEvent) => {
        const last = ev.changedTouches[0];
        const dx = last.clientX - startX;
        const dy = last.clientY - startY;
        onUpdate({ ...edit, offsetX: startOffsetX + dx, offsetY: startOffsetY + dy });
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
        lastNext = { ...edit, scale: nextScale };
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
    <div className="space-y-4 w-full">
      {/* Header — constrained to max-w-4xl for readability */}
      <div className="max-w-4xl mx-auto px-4 pt-4 flex items-center justify-between">
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

      {/* Editor viewport — 1:1 with source coords. Image always at natural
          pixel size, no displayScale. If the stage is wider/taller than the
          browser, the page scrolls. shrink-0 prevents any flex parent from
          squeezing the viewport. */}
      <div className="flex justify-center w-full overflow-auto">
        <div
          ref={viewportRef}
          className="relative overflow-hidden cursor-grab active:cursor-grabbing touch-none shrink-0"
          style={{
            width: stageW,
            height: stageH,
          }}
          onMouseDown={onMouseDown}
          onTouchStart={onTouchStart}
        >
          {/* Image — natural pixel size, same transform as the export canvas. */}
          <img
            src={edit.src}
            alt=""
            draggable={false}
            className="absolute top-1/2 left-1/2 select-none"
            style={{
              width: edit.naturalWidth,
              height: edit.naturalHeight,
              transform: `translate(-50%, -50%) translate(${edit.offsetX}px, ${edit.offsetY}px) rotate(${edit.rotation}deg) scale(${edit.scale})`,
              transformOrigin: 'center',
            }}
          />
          {/* Crop-area indicator — dims what's outside the 1034×1379 region. */}
          <div
            style={{
              position: 'absolute',
              width: FRAME_W,
              height: FRAME_H,
              left: `calc(50% - ${FRAME_W / 2}px)`,
              top: `calc(50% - ${FRAME_H / 2}px)`,
              boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)',
              pointerEvents: 'none',
            }}
          />
        </div>
      </div>

      {/* Instructions + controls — back inside the max-w-4xl constraint */}
      <div className="max-w-4xl mx-auto px-4 pb-4 space-y-4">
        <p className="text-center text-sm text-gray-500">{t('image.instructions')}</p>

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
            onClick={handleDownload}
            disabled={exporting}
            className="px-4 py-2 text-sm bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-semibold disabled:opacity-50"
          >
            {exporting ? t('editor.exporting') : t('image.download')}
          </button>
        </div>

        <div className="flex items-center gap-3 px-2">
          <span className="text-sm text-gray-700 shrink-0">{t('image.rotate')}</span>
          <input
            type="range"
            min={0}
            max={360}
            step={1}
            value={edit.rotation}
            onChange={onRotationChange}
            className="flex-1"
            aria-label={t('image.rotate')}
            dir="ltr"
          />
          <input
            type="number"
            min={0}
            max={360}
            step={1}
            value={Math.round(edit.rotation)}
            onChange={onRotationChange}
            className="w-16 text-right font-mono text-sm border border-gray-300 rounded px-2 py-1"
            aria-label={t('image.rotate')}
            dir="ltr"
          />
          <span className="font-mono text-xs text-gray-500 shrink-0">°</span>
        </div>
      </div>
    </div>
  );
}
