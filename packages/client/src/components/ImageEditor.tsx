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

  // Display scale: shrink the on-screen representation of the 1034×1379 frame
  // to fit comfortably in the browser window. The export math is unaffected
  // (the canvas is always 1034×1379). Mouse/touch drag deltas divide by this
  // factor to convert screen pixels back to source pixels.
  const [displayScale, setDisplayScale] = useState(1);
  useEffect(() => {
    const recompute = () => {
      // Want the scaled frame to fit in ~70% of the viewport height and
      // ~65% of the viewport width, whichever is tighter.
      const s = Math.min(
        1,
        (window.innerWidth * 0.65) / FRAME_W,
        (window.innerHeight * 0.7) / FRAME_H
      );
      setDisplayScale(s);
    };
    recompute();
    window.addEventListener('resize', recompute);
    return () => window.removeEventListener('resize', recompute);
  }, []);
  const displayScaleRef = useRef(displayScale);
  useEffect(() => {
    displayScaleRef.current = displayScale;
  }, [displayScale]);

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
      const s = displayScaleRef.current || 1;
      const dx = (ev.clientX - startX) / s;
      const dy = (ev.clientY - startY) / s;
      onDragUpdate({ ...edit, offsetX: startOffsetX + dx, offsetY: startOffsetY + dy });
    };
    const onUp = (ev: MouseEvent) => {
      const s = displayScaleRef.current || 1;
      const dx = (ev.clientX - startX) / s;
      const dy = (ev.clientY - startY) / s;
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
        const s = displayScaleRef.current || 1;
        const dx = (ev.touches[0].clientX - startX) / s;
        const dy = (ev.touches[0].clientY - startY) / s;
        onDragUpdate({ ...edit, offsetX: startOffsetX + dx, offsetY: startOffsetY + dy });
      };
      const onEnd = (ev: TouchEvent) => {
        const last = ev.changedTouches[0];
        const s = displayScaleRef.current || 1;
        const dx = (last.clientX - startX) / s;
        const dy = (last.clientY - startY) / s;
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

      {/* Editor viewport — visually scaled-down so the crop frame fits the
          browser comfortably. Source-space math (1034×1379 frame, image scale)
          is unchanged; only the CSS transform scales the rendered pixels. */}
      <div className="flex justify-center">
        <div
          ref={viewportRef}
          className="relative overflow-hidden bg-gray-900 shadow-lg cursor-grab active:cursor-grabbing touch-none"
          style={{
            width: FRAME_W * 1.4 * displayScale,
            height: FRAME_H * 1.2 * displayScale,
          }}
          onMouseDown={onMouseDown}
          onTouchStart={onTouchStart}
        >
          {/* Image — source-pixel coords times the display scale so everything
              inside the viewport shares the same on-screen factor. */}
          <img
            src={edit.src}
            alt=""
            draggable={false}
            className="absolute top-1/2 left-1/2 select-none"
            style={{
              width: edit.naturalWidth,
              height: edit.naturalHeight,
              transform: `translate(-50%, -50%) translate(${edit.offsetX * displayScale}px, ${edit.offsetY * displayScale}px) rotate(${edit.rotation}deg) scale(${edit.scale * displayScale})`,
              transformOrigin: 'center',
            }}
          />
          {/* Crop frame indicator — scaled to match the display factor */}
          <div
            style={{
              position: 'absolute',
              width: FRAME_W * displayScale,
              height: FRAME_H * displayScale,
              left: `calc(50% - ${(FRAME_W * displayScale) / 2}px)`,
              top: `calc(50% - ${(FRAME_H * displayScale) / 2}px)`,
              border: '2px solid white',
              boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)',
              pointerEvents: 'none',
            }}
          />
        </div>
      </div>

      {/* Instructions */}
      <p className="text-center text-sm text-gray-500">{t('image.instructions')}</p>

      {/* Action buttons row */}
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

      {/* Rotation row — wide slider for per-degree precision + number input for exact entry */}
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
  );
}
