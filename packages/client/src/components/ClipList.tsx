import { useTranslation } from 'react-i18next';
import type { Clip } from 'shared/types';

interface ClipListProps {
  clips: Clip[];
  selectedId: string;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
}

export default function ClipList({
  clips,
  selectedId,
  onSelect,
  onRemove,
  onReorder,
}: ClipListProps) {
  const { t } = useTranslation();

  const onDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.setData('text/plain', String(index));
    e.dataTransfer.effectAllowed = 'move';
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const onDrop = (e: React.DragEvent, toIndex: number) => {
    e.preventDefault();
    const fromIndex = Number(e.dataTransfer.getData('text/plain'));
    if (!Number.isNaN(fromIndex) && fromIndex !== toIndex) {
      onReorder(fromIndex, toIndex);
    }
  };

  return (
    <ul className="space-y-2">
      {clips.map((clip, index) => {
        const isSelected = clip.id === selectedId;
        const trimmed = clip.trim.end - clip.trim.start;
        return (
          <li
            key={clip.id}
            draggable
            onDragStart={(e) => onDragStart(e, index)}
            onDragOver={onDragOver}
            onDrop={(e) => onDrop(e, index)}
            onClick={() => onSelect(clip.id)}
            className={`
              p-2 rounded-lg border cursor-pointer select-none
              ${isSelected ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:bg-gray-50'}
            `}
          >
            <div className="flex items-center gap-2">
              <span className="text-gray-400">⋮⋮</span>
              <span className="flex-1 truncate text-sm font-medium text-gray-800">
                {clip.name}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(clip.id);
                }}
                className="text-gray-400 hover:text-red-600"
                aria-label={t('project.removeClip')}
              >
                ✕
              </button>
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {trimmed.toFixed(1)}s
            </div>
          </li>
        );
      })}
    </ul>
  );
}
