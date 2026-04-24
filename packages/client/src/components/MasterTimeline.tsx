import { useRef } from 'react';
import type { Clip } from 'shared/types';
import { clipTrimmedDuration, projectDuration } from '../lib/project-time';

interface MasterTimelineProps {
  clips: Clip[];
  projectTime: number;
  isPlaying: boolean;
  onSeek: (t: number) => void;
  onToggle: () => void;
}

export default function MasterTimeline({
  clips,
  projectTime,
  isPlaying,
  onSeek,
  onToggle,
}: MasterTimelineProps) {
  const barRef = useRef<HTMLDivElement | null>(null);
  const total = projectDuration(clips);

  const seekFromClick = (e: React.MouseEvent) => {
    const rect = barRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pct = (e.clientX - rect.left) / rect.width;
    onSeek(pct * total);
  };

  const playheadPct = total > 0 ? (projectTime / total) * 100 : 0;

  let accum = 0;
  const boundaries: number[] = [];
  for (let i = 0; i < clips.length - 1; i++) {
    accum += clipTrimmedDuration(clips[i]);
    if (total > 0) boundaries.push((accum / total) * 100);
  }

  return (
    <div className="flex items-center gap-3 w-full">
      <button
        type="button"
        onClick={onToggle}
        className="w-10 h-10 rounded-full bg-primary-600 text-white flex items-center justify-center"
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? '❚❚' : '▶'}
      </button>
      <div
        ref={barRef}
        onClick={seekFromClick}
        className="flex-1 h-8 bg-gray-200 rounded-lg relative cursor-pointer select-none"
      >
        {boundaries.map((pct, i) => (
          <div
            key={i}
            className="absolute top-0 bottom-0 w-px bg-gray-500"
            style={{ left: `${pct}%` }}
          />
        ))}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-primary-600"
          style={{ left: `${playheadPct}%` }}
        />
      </div>
      <span className="font-mono text-sm text-gray-600 w-24 text-right">
        {formatTime(projectTime)} / {formatTime(total)}
      </span>
    </div>
  );
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, '0')}`;
}
