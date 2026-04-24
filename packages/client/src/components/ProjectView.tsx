import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Clip, Project } from 'shared/types';
import TrackEditor from './TrackEditor';

interface ProjectViewProps {
  project: Project;
  onUpdateProject: (project: Project) => void;
  onDragUpdateProject: (project: Project) => void;
  onBack: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export default function ProjectView({
  project,
  onUpdateProject,
  onDragUpdateProject,
  onBack,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: ProjectViewProps) {
  const { t } = useTranslation();
  const [selectedId, _setSelectedId] = useState<string>(project.clips[0]?.id ?? '');
  const selected = project.clips.find((c) => c.id === selectedId) ?? project.clips[0];

  const updateClip = useCallback(
    (next: Clip) => {
      const clips = project.clips.map((c) => (c.id === next.id ? next : c));
      onUpdateProject({ ...project, clips });
    },
    [project, onUpdateProject]
  );

  const dragUpdateClip = useCallback(
    (next: Clip) => {
      const clips = project.clips.map((c) => (c.id === next.id ? next : c));
      onDragUpdateProject({ ...project, clips });
    },
    [project, onDragUpdateProject]
  );

  if (!selected) {
    return (
      <div className="p-8 text-center text-gray-500">{t('project.empty')}</div>
    );
  }

  return (
    <div className="w-full max-w-6xl mx-auto space-y-4 p-4">
      {/* Master timeline placeholder (Phase 11 replaces this) */}
      <div className="h-12 bg-gray-100 rounded-lg" />

      <div className="grid grid-cols-[280px_1fr] gap-4">
        {/* Clip list (Phase 7 replaces this placeholder) */}
        <aside className="bg-white border border-gray-200 rounded-xl p-3">
          <p className="text-sm text-gray-500">{t('project.clipListPlaceholder')}</p>
        </aside>

        {/* Per-clip editor */}
        <section>
          <TrackEditor
            clip={selected}
            onUpdateClip={updateClip}
            onDragUpdateClip={dragUpdateClip}
            onBack={onBack}
            onUndo={onUndo}
            onRedo={onRedo}
            canUndo={canUndo}
            canRedo={canRedo}
          />
        </section>
      </div>
    </div>
  );
}
