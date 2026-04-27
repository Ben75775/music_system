import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TrackEffect, EQPreset } from 'shared/types';

interface ControlsProps {
  effects: TrackEffect;
  /** Discrete change (dropdown, typed input) -- creates undo entry */
  onChange: (effects: TrackEffect) => void;
  /** Continuous slider drag -- no undo entry until release */
  onDragChange: (effects: TrackEffect) => void;
  /** Triggers a looped export of the current clip. Hides the cell when undefined. */
  onLoopExport?: (count: number) => void;
  /** True while any export is in flight — disables the LoopOver button. */
  exporting?: boolean;
  /** True while the LoopOver button is the trigger that's still loading ffmpeg. */
  loopBusy?: boolean;
  /** Live progress %, only shown on the loop button when it triggered the export. */
  loopProgress?: number;
}

const LOOP_MIN = 2;
const LOOP_MAX = 20;
const LOOP_DEFAULT = 2;

export default function Controls({
  effects,
  onChange,
  onDragChange,
  onLoopExport,
  exporting,
  loopBusy,
  loopProgress,
}: ControlsProps) {
  const { t } = useTranslation();

  // Discrete: for typed input commits and dropdown
  const update = (partial: Partial<TrackEffect>) =>
    onChange({ ...effects, ...partial });

  // Drag: for slider movement
  const dragUpdate = (partial: Partial<TrackEffect>) =>
    onDragChange({ ...effects, ...partial });

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      <SliderControl
        label={t('editor.volume')}
        value={effects.volume}
        min={0}
        max={2}
        step={0.05}
        displaySuffix="%"
        displayMultiplier={100}
        decimals={0}
        onCommit={(v) => update({ volume: v })}
        onDrag={(v) => dragUpdate({ volume: v })}
      />
      <SliderControl
        label={t('editor.speed')}
        value={effects.speed}
        min={0.5}
        max={2}
        step={0.05}
        displaySuffix="x"
        displayMultiplier={1}
        decimals={2}
        onCommit={(v) => update({ speed: v })}
        onDrag={(v) => dragUpdate({ speed: v })}
      />
      <SliderControl
        label={t('editor.fadeIn')}
        value={effects.fadeIn}
        min={0}
        max={10}
        step={0.1}
        displaySuffix="s"
        displayMultiplier={1}
        decimals={1}
        onCommit={(v) => update({ fadeIn: v })}
        onDrag={(v) => dragUpdate({ fadeIn: v })}
      />
      <SliderControl
        label={t('editor.fadeOut')}
        value={effects.fadeOut}
        min={0}
        max={10}
        step={0.1}
        displaySuffix="s"
        displayMultiplier={1}
        decimals={1}
        onCommit={(v) => update({ fadeOut: v })}
        onDrag={(v) => dragUpdate({ fadeOut: v })}
      />

      {/* EQ Preset -- discrete action, always creates undo entry */}
      <div className="space-y-1">
        <label className="text-sm font-medium text-gray-600">
          {t('editor.eq')}
        </label>
        <select
          value={effects.eqPreset}
          onChange={(e) => update({ eqPreset: e.target.value as EQPreset })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm"
        >
          <option value="none">{t('editor.eqNone')}</option>
          <option value="bass-boost">{t('editor.eqBass')}</option>
          <option value="vocal-clarity">{t('editor.eqVocal')}</option>
          <option value="treble-boost">{t('editor.eqTreble')}</option>
        </select>
      </div>

      {/* LoopOver — repeats the edited clip back-to-back N times. */}
      {onLoopExport && (
        <LoopOverControl
          onExport={onLoopExport}
          exporting={!!exporting}
          loopBusy={!!loopBusy}
          loopProgress={loopProgress ?? 0}
        />
      )}
    </div>
  );
}

function LoopOverControl({
  onExport,
  exporting,
  loopBusy,
  loopProgress,
}: {
  onExport: (count: number) => void;
  exporting: boolean;
  loopBusy: boolean;
  loopProgress: number;
}) {
  const { t } = useTranslation();
  const [count, setCount] = useState(LOOP_DEFAULT);

  const clamp = (n: number) => Math.max(LOOP_MIN, Math.min(LOOP_MAX, n));
  const disabled = exporting;

  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-gray-600">
        {t('editor.loopOver')}
      </label>
      <div className="flex gap-1">
        <input
          type="number"
          min={LOOP_MIN}
          max={LOOP_MAX}
          value={count}
          onChange={(e) => {
            const parsed = parseInt(e.target.value, 10);
            if (!isNaN(parsed)) setCount(clamp(parsed));
          }}
          disabled={disabled}
          className="w-16 px-2 py-2 border border-gray-300 rounded-lg bg-white text-sm text-center disabled:bg-gray-100 disabled:text-gray-400"
        />
        <button
          type="button"
          onClick={() => onExport(clamp(count))}
          disabled={disabled}
          className={`flex-1 px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
            disabled
              ? 'bg-gray-200 text-gray-500 cursor-wait'
              : 'bg-primary-600 hover:bg-primary-700 text-white'
          }`}
        >
          {loopBusy
            ? `${t('editor.exporting')} ${loopProgress}%`
            : `🔁 ${t('editor.loopGo')}`}
        </button>
      </div>
    </div>
  );
}

function SliderControl({
  label,
  value,
  min,
  max,
  step,
  displaySuffix,
  displayMultiplier,
  decimals,
  onCommit,
  onDrag,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  displaySuffix: string;
  displayMultiplier: number;
  decimals: number;
  /** Called on typed input commit -- creates undo entry */
  onCommit: (value: number) => void;
  /** Called during slider drag -- no undo entry */
  onDrag: (value: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  const displayVal = (value * displayMultiplier).toFixed(decimals);

  const startEdit = () => {
    setEditValue(displayVal);
    setEditing(true);
  };

  const commitEdit = () => {
    setEditing(false);
    const parsed = parseFloat(editValue);
    if (!isNaN(parsed)) {
      const raw = parsed / displayMultiplier;
      onCommit(Math.max(min, Math.min(max, raw)));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') commitEdit();
    if (e.key === 'Escape') setEditing(false);
  };

  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center">
        <label className="text-sm font-medium text-gray-600">{label}</label>
        {editing ? (
          <div className="flex items-center gap-0.5">
            <input
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={handleKeyDown}
              autoFocus
              className="w-14 text-sm font-mono text-primary-600 border border-primary-300 rounded px-1 py-0.5 text-center bg-white focus:outline-none focus:ring-1 focus:ring-primary-400"
            />
            <span className="text-xs text-gray-400">{displaySuffix}</span>
          </div>
        ) : (
          <button
            onClick={startEdit}
            className="text-sm text-primary-600 font-mono hover:bg-primary-50 px-1.5 py-0.5 rounded cursor-text transition-colors"
            title="Click to edit"
          >
            {displayVal}{displaySuffix}
          </button>
        )}
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onMouseDown={() => {
          setIsDragging(true);
          // Save current state as undo snapshot on first grab
          onCommit(value);
        }}
        onMouseUp={() => setIsDragging(false)}
        onTouchStart={() => {
          setIsDragging(true);
          onCommit(value);
        }}
        onTouchEnd={() => setIsDragging(false)}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (isDragging) {
            onDrag(v);
          } else {
            onCommit(v);
          }
        }}
        className="w-full accent-primary-500"
      />
    </div>
  );
}
