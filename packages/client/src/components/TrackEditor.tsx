import { useRef, useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { Clip, TrackEffect, Project } from 'shared/types';
import CropOverlay, { videoCropStyle } from './CropOverlay';
import CropRectangle from './CropRectangle';
import { useWaveSurfer } from '../hooks/useWaveSurfer';
import { useVideoPlayer } from '../hooks/useVideoPlayer';
import { useSpacebar } from '../hooks/useSpacebar';
import Controls from './Controls';

interface TrackEditorProps {
  clip: Clip;
  project: Project;
  /** Discrete change -- pushes previous state to undo history */
  onUpdateClip: (clip: Clip) => void;
  /** Continuous drag change -- updates value without creating undo entry */
  onDragUpdateClip: (clip: Clip) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** Optional ref callback for the project playback engine. */
  engineBind?: (el: HTMLMediaElement | null) => void;
}

export default function TrackEditor({
  clip,
  project,
  onUpdateClip,
  onDragUpdateClip,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  engineBind,
}: TrackEditorProps) {
  // Ctrl+Z / Ctrl+Y keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't capture if typing in a text input (but allow for range sliders)
      const el = e.target as HTMLElement;
      if (el.tagName === 'TEXTAREA') return;
      if (el.tagName === 'INPUT' && (el as HTMLInputElement).type !== 'range') return;

      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        onUndo();
      }
      if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === 'y' || (e.key === 'z' && e.shiftKey))
      ) {
        e.preventDefault();
        onRedo();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onUndo, onRedo]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
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
          {clip.name}
        </h2>
        <div className="w-20" />
      </div>

      {clip.type === 'audio' ? (
        <AudioEditor clip={clip} onUpdateClip={onUpdateClip} onDragUpdateClip={onDragUpdateClip} engineBind={engineBind} />
      ) : (
        <VideoEditor clip={clip} project={project} onUpdateClip={onUpdateClip} onDragUpdateClip={onDragUpdateClip} engineBind={engineBind} />
      )}
    </div>
  );
}

// ─── Audio Editor ────────────────────────────────────────────────

function AudioEditor({
  clip,
  onUpdateClip,
  onDragUpdateClip,
  engineBind,
}: {
  clip: Clip;
  onUpdateClip: (clip: Clip) => void;
  onDragUpdateClip: (clip: Clip) => void;
  engineBind?: (el: HTMLMediaElement | null) => void;
}) {
  const { t } = useTranslation();
  const waveformRef = useRef<HTMLDivElement>(null);
  const [container, setContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setContainer(waveformRef.current);
  }, []);

  const { isPlaying, isReady, currentTime, togglePlayPause, seekTo } =
    useWaveSurfer({ track: clip, container });

  useSpacebar(togglePlayPause);

  // Discrete effect changes (EQ dropdown, editable input commit) -> creates undo entry
  const updateEffects = useCallback(
    (effects: TrackEffect) => onUpdateClip({ ...clip, effects }),
    [clip, onUpdateClip]
  );

  // Slider drag effect changes -> no undo entry until release
  const dragUpdateEffects = useCallback(
    (effects: TrackEffect) => onDragUpdateClip({ ...clip, effects }),
    [clip, onDragUpdateClip]
  );

  // Trim drag -> no undo entry (TimelineBar handles set/replace via onTrimDragStart/onTrimDrag)
  const handleTrimChange = useCallback(
    (start: number, end: number) => {
      onDragUpdateClip({ ...clip, trim: { start, end } });
    },
    [clip, onDragUpdateClip]
  );

  const handleTrimCommit = useCallback(
    (start: number, end: number) => {
      onUpdateClip({ ...clip, trim: { start, end } });
    },
    [clip, onUpdateClip]
  );

  const handleSeek = useCallback(
    (time: number) => {
      // Constrain to trim region
      const clamped = Math.max(clip.trim.start, Math.min(clip.trim.end, time));
      seekTo(clamped);
    },
    [clip.trim.start, clip.trim.end, seekTo]
  );

  return (
    <>
      {/* Waveform with trim region overlay */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
        <div className="relative" dir="ltr">
          <div ref={waveformRef} className="w-full" />
          {/* Gray out before trim start */}
          {isReady && clip.trim.start > 0 && (
            <div
              className="absolute top-0 bottom-0 left-0 bg-gray-100/90 pointer-events-none z-10"
              style={{ width: `${(clip.trim.start / clip.duration) * 100}%` }}
            />
          )}
          {/* Gray out after trim end */}
          {isReady && clip.trim.end < clip.duration && (
            <div
              className="absolute top-0 bottom-0 right-0 bg-gray-100/90 pointer-events-none z-10"
              style={{ width: `${((clip.duration - clip.trim.end) / clip.duration) * 100}%` }}
            />
          )}
        </div>
        {!isReady && (
          <p className="text-center text-gray-400 py-8 animate-pulse">
            {t('input.loading')}
          </p>
        )}
      </div>

      {/* Timeline with trim handles + playback */}
      <TimelineBar
        currentTime={currentTime}
        trimStart={clip.trim.start}
        trimEnd={clip.trim.end}
        duration={clip.duration}
        isPlaying={isPlaying}
        isReady={isReady}
        onSeek={handleSeek}
        onTrimChange={handleTrimChange}
        onTrimCommit={handleTrimCommit}
        onTogglePlay={togglePlayPause}
      />

      {/* Effects */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
        <Controls effects={clip.effects} onChange={updateEffects} onDragChange={dragUpdateEffects} />
      </div>

      {engineBind && (
        <audio
          ref={engineBind}
          src={clip.url}
          style={{ display: 'none' }}
        />
      )}
    </>
  );
}

// ─── Video Editor ────────────────────────────────────────────────

function VideoEditor({
  clip,
  project,
  onUpdateClip,
  onDragUpdateClip,
  engineBind,
}: {
  clip: Clip;
  project: Project;
  onUpdateClip: (clip: Clip) => void;
  onDragUpdateClip: (clip: Clip) => void;
  engineBind?: (el: HTMLMediaElement | null) => void;
}) {
  const { bind, isPlaying, isReady, currentTime, togglePlayPause, seekTo } =
    useVideoPlayer(clip);

  useSpacebar(togglePlayPause);

  const updateEffects = useCallback(
    (effects: TrackEffect) => onUpdateClip({ ...clip, effects }),
    [clip, onUpdateClip]
  );

  const dragUpdateEffects = useCallback(
    (effects: TrackEffect) => onDragUpdateClip({ ...clip, effects }),
    [clip, onDragUpdateClip]
  );

  const handleTrimChange = useCallback(
    (start: number, end: number) => {
      onDragUpdateClip({ ...clip, trim: { start, end } });
    },
    [clip, onDragUpdateClip]
  );

  const handleTrimCommit = useCallback(
    (start: number, end: number) => {
      onUpdateClip({ ...clip, trim: { start, end } });
    },
    [clip, onUpdateClip]
  );

  const handleSeek = useCallback(
    (time: number) => {
      const clamped = Math.max(clip.trim.start, Math.min(clip.trim.end, time));
      seekTo(clamped);
    },
    [clip.trim.start, clip.trim.end, seekTo]
  );

  return (
    <>
      {/* Video Player with visual fade overlay */}
      <div className="bg-black rounded-xl overflow-hidden shadow-sm relative">
        <video
          ref={(el) => { bind(el); engineBind?.(el); }}
          src={clip.url}
          className="w-full max-h-[400px] mx-auto"
          style={videoCropStyle(clip)}
        />
        {/* Black overlay for visual fade in/out */}
        <VideoFadeOverlay
          currentTime={currentTime}
          trimStart={clip.trim.start}
          trimEnd={clip.trim.end}
          fadeIn={clip.effects.fadeIn}
          fadeOut={clip.effects.fadeOut}
        />
        <CropRectangle
          clip={clip}
          project={project}
          onCropChange={(crop) => onDragUpdateClip({ ...clip, crop })}
          onCropCommit={(crop) => onUpdateClip({ ...clip, crop })}
        />
      </div>

      {/* Timeline with trim handles + playback */}
      <TimelineBar
        currentTime={currentTime}
        trimStart={clip.trim.start}
        trimEnd={clip.trim.end}
        duration={clip.duration}
        isPlaying={isPlaying}
        isReady={isReady}
        onSeek={handleSeek}
        onTrimChange={handleTrimChange}
        onTrimCommit={handleTrimCommit}
        onTogglePlay={togglePlayPause}
      />

      {/* Effects */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
        <Controls effects={clip.effects} onChange={updateEffects} onDragChange={dragUpdateEffects} />
      </div>

      <CropOverlay
        clip={clip}
        project={project}
        onCropChange={(crop) => onUpdateClip({ ...clip, crop })}
      />
    </>
  );
}

// ─── Timeline Bar (custom scrubber with trim handles) ────────────

function TimelineBar({
  currentTime,
  trimStart,
  trimEnd,
  duration,
  isPlaying,
  isReady,
  onSeek,
  onTrimChange,
  onTrimCommit,
  onTogglePlay,
}: {
  currentTime: number;
  trimStart: number;
  trimEnd: number;
  duration: number;
  isPlaying: boolean;
  isReady: boolean;
  onSeek: (time: number) => void;
  onTrimChange: (start: number, end: number) => void;
  onTrimCommit: (start: number, end: number) => void;
  onTogglePlay: () => void;
}) {
  const { t } = useTranslation();
  const barRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<'start' | 'end' | 'seek' | null>(null);

  // Editable trim inputs
  const [editingStart, setEditingStart] = useState(false);
  const [editingEnd, setEditingEnd] = useState(false);
  const [editStartVal, setEditStartVal] = useState('');
  const [editEndVal, setEditEndVal] = useState('');

  const toPct = (time: number) => (duration > 0 ? (time / duration) * 100 : 0);
  const trimStartPct = toPct(trimStart);
  const trimEndPct = toPct(trimEnd);
  // Playback cursor: show position relative to full bar, but clamp inside trim
  const clampedTime = Math.max(trimStart, Math.min(trimEnd, currentTime));
  const cursorPct = toPct(clampedTime);

  const getTimeFromX = useCallback(
    (clientX: number): number => {
      const bar = barRef.current;
      if (!bar || duration <= 0) return 0;
      const rect = bar.getBoundingClientRect();
      const x = clientX - rect.left;
      const pct = Math.max(0, Math.min(1, x / rect.width));
      return pct * duration;
    },
    [duration]
  );

  // Mouse/touch handlers for dragging
  useEffect(() => {
    if (!dragging) return;

    const onMove = (e: MouseEvent | TouchEvent) => {
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const time = getTimeFromX(clientX);

      if (dragging === 'start') {
        const newStart = Math.max(0, Math.min(time, trimEnd - 0.1));
        onTrimChange(newStart, trimEnd);
        onSeek(newStart);
      } else if (dragging === 'end') {
        const newEnd = Math.min(duration, Math.max(time, trimStart + 0.1));
        onTrimChange(trimStart, newEnd);
        onSeek(newEnd);
      } else if (dragging === 'seek') {
        // Constrain seeking to trim region
        const clamped = Math.max(trimStart, Math.min(trimEnd, time));
        onSeek(clamped);
      }
    };

    const onUp = () => setDragging(null);

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove);
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
  }, [dragging, trimStart, trimEnd, duration, getTimeFromX, onSeek, onTrimChange]);

  const handleBarClick = (e: React.MouseEvent) => {
    // Don't handle if clicking on a handle
    if ((e.target as HTMLElement).dataset.handle) return;
    const time = getTimeFromX(e.clientX);
    // Only seek within trim region
    const clamped = Math.max(trimStart, Math.min(trimEnd, time));
    onSeek(clamped);
    setDragging('seek');
  };

  // Editable trim start
  const commitStartEdit = () => {
    setEditingStart(false);
    const parsed = parseTimeMs(editStartVal);
    if (parsed !== null) {
      const clamped = Math.max(0, Math.min(parsed, trimEnd - 0.1));
      onTrimCommit(clamped, trimEnd);
      onSeek(clamped);
    }
  };

  // Editable trim end
  const commitEndEdit = () => {
    setEditingEnd(false);
    const parsed = parseTimeMs(editEndVal);
    if (parsed !== null) {
      const clamped = Math.min(duration, Math.max(parsed, trimStart + 0.1));
      onTrimCommit(trimStart, clamped);
      onSeek(clamped);
    }
  };

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200 space-y-3" dir="ltr">
      {/* The timeline track */}
      <div
        ref={barRef}
        className="relative h-12 rounded-lg cursor-pointer select-none"
        style={{ background: '#e5e7eb' }}
        onMouseDown={handleBarClick}
      >
        {/* Grayed-out left area (before trim start) */}
        <div
          className="absolute top-0 bottom-0 left-0 bg-gray-300/70 rounded-l-lg z-10 pointer-events-none"
          style={{ width: `${trimStartPct}%` }}
        />

        {/* Active trim region */}
        <div
          className="absolute top-0 bottom-0 bg-primary-200 z-0"
          style={{
            left: `${trimStartPct}%`,
            width: `${trimEndPct - trimStartPct}%`,
          }}
        />

        {/* Played portion inside trim region */}
        <div
          className="absolute top-0 bottom-0 bg-primary-400/50 z-0"
          style={{
            left: `${trimStartPct}%`,
            width: `${Math.max(0, cursorPct - trimStartPct)}%`,
          }}
        />

        {/* Grayed-out right area (after trim end) */}
        <div
          className="absolute top-0 bottom-0 right-0 bg-gray-300/70 rounded-r-lg z-10 pointer-events-none"
          style={{ width: `${100 - trimEndPct}%` }}
        />

        {/* Trim START handle */}
        <div
          data-handle="start"
          className="absolute top-0 bottom-0 w-3 bg-primary-600 hover:bg-primary-700 cursor-ew-resize z-30 rounded-l-md flex items-center justify-center"
          style={{ left: `calc(${trimStartPct}% - 12px)` }}
          onMouseDown={(e) => { e.stopPropagation(); onTrimCommit(trimStart, trimEnd); onSeek(trimStart); setDragging('start'); }}
          onTouchStart={(e) => { e.stopPropagation(); onTrimCommit(trimStart, trimEnd); onSeek(trimStart); setDragging('start'); }}
        >
          <div className="w-0.5 h-5 bg-white rounded-full" />
        </div>

        {/* Trim END handle */}
        <div
          data-handle="end"
          className="absolute top-0 bottom-0 w-3 bg-primary-600 hover:bg-primary-700 cursor-ew-resize z-30 rounded-r-md flex items-center justify-center"
          style={{ left: `${trimEndPct}%` }}
          onMouseDown={(e) => { e.stopPropagation(); onTrimCommit(trimStart, trimEnd); onSeek(Math.max(trimStart, trimEnd - 0.01)); setDragging('end'); }}
          onTouchStart={(e) => { e.stopPropagation(); onTrimCommit(trimStart, trimEnd); onSeek(Math.max(trimStart, trimEnd - 0.01)); setDragging('end'); }}
        >
          <div className="w-0.5 h-5 bg-white rounded-full" />
        </div>

        {/* Playback cursor (thin red line) */}
        <div
          className="absolute top-0 bottom-0 w-px bg-red-500 z-20 pointer-events-none"
          style={{ left: `${cursorPct}%` }}
        />
      </div>

      {/* Controls row: play button + trim times + current time */}
      <div className="flex items-center justify-between gap-3">
        {/* Play/Pause */}
        <button
          onClick={onTogglePlay}
          disabled={!isReady}
          className="px-6 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-base font-bold transition-all active:scale-95 disabled:opacity-50 shrink-0"
        >
          {isPlaying ? t('editor.pause') : t('editor.play')}
        </button>

        {/* Trim start - editable */}
        <div className="flex items-center gap-1 text-xs">
          <span className="text-gray-500">{t('editor.start')}:</span>
          {editingStart ? (
            <input
              type="text"
              value={editStartVal}
              onChange={(e) => setEditStartVal(e.target.value)}
              onBlur={commitStartEdit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitStartEdit();
                if (e.key === 'Escape') setEditingStart(false);
              }}
              autoFocus
              className="min-w-[6rem] font-mono text-primary-600 border border-primary-400 rounded px-2 py-1 text-center bg-white focus:outline-none focus:ring-2 focus:ring-primary-400"
            />
          ) : (
            <button
              onClick={() => { setEditStartVal(formatTimeMs(trimStart)); setEditingStart(true); }}
              className="font-mono text-primary-600 hover:bg-primary-50 px-2 py-1 rounded border border-gray-300 bg-white cursor-text min-w-[6rem] text-center"
            >
              {formatTimeMs(trimStart)}
            </button>
          )}
        </div>

        {/* Current playback time */}
        <div className="font-mono text-sm">
          <span className="text-primary-700 font-semibold">{formatTimeMs(clampedTime)}</span>
          <span className="text-gray-400 mx-1">/</span>
          <span className="text-gray-500">{formatTimeMs(duration)}</span>
        </div>

        {/* Trim end - editable */}
        <div className="flex items-center gap-1 text-xs">
          <span className="text-gray-500">{t('editor.end')}:</span>
          {editingEnd ? (
            <input
              type="text"
              value={editEndVal}
              onChange={(e) => setEditEndVal(e.target.value)}
              onBlur={commitEndEdit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitEndEdit();
                if (e.key === 'Escape') setEditingEnd(false);
              }}
              autoFocus
              className="min-w-[6rem] font-mono text-primary-600 border border-primary-400 rounded px-2 py-1 text-center bg-white focus:outline-none focus:ring-2 focus:ring-primary-400"
            />
          ) : (
            <button
              onClick={() => { setEditEndVal(formatTimeMs(trimEnd)); setEditingEnd(true); }}
              className="font-mono text-primary-600 hover:bg-primary-50 px-2 py-1 rounded border border-gray-300 bg-white cursor-text min-w-[6rem] text-center"
            >
              {formatTimeMs(trimEnd)}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Video Fade Overlay (visual black fade) ──────────────────────

function VideoFadeOverlay({
  currentTime,
  trimStart,
  trimEnd,
  fadeIn,
  fadeOut,
}: {
  currentTime: number;
  trimStart: number;
  trimEnd: number;
  fadeIn: number;
  fadeOut: number;
}) {
  // Compute how opaque the black overlay should be
  // fadeIn: overlay goes from 1 (fully black) to 0 (transparent)
  // fadeOut: overlay goes from 0 (transparent) to 1 (fully black)
  let opacity = 0;

  const elapsed = currentTime - trimStart;
  const remaining = trimEnd - currentTime;

  if (fadeIn > 0 && elapsed >= 0 && elapsed < fadeIn) {
    // During fade-in: start black, become transparent
    opacity = 1 - elapsed / fadeIn;
  }

  if (fadeOut > 0 && remaining >= 0 && remaining < fadeOut) {
    // During fade-out: become black
    const fadeOutOpacity = 1 - remaining / fadeOut;
    opacity = Math.max(opacity, fadeOutOpacity);
  }

  if (opacity <= 0) return null;

  return (
    <div
      className="absolute inset-0 bg-black pointer-events-none transition-none"
      style={{ opacity }}
    />
  );
}

// ─── Time Formatting / Parsing ───────────────────────────────────

function formatTimeMs(seconds: number): string {
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${min}:${sec.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
}

/** Parse "M:SS.mmm" or "SS.mmm" or "SS" back to seconds */
function parseTimeMs(str: string): number | null {
  str = str.trim();
  const colonMatch = str.match(/^(\d+):(\d{1,2})(?:\.(\d{1,3}))?$/);
  if (colonMatch) {
    const min = parseInt(colonMatch[1], 10);
    const sec = parseInt(colonMatch[2], 10);
    const msStr = (colonMatch[3] || '0').padEnd(3, '0');
    const ms = parseInt(msStr, 10);
    return min * 60 + sec + ms / 1000;
  }
  const num = parseFloat(str);
  if (!isNaN(num) && num >= 0) return num;
  return null;
}
