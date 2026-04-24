import { useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { Clip, Project } from 'shared/types';
import TrackEditor from './TrackEditor';
import ClipList from './ClipList';
import AddClipForm from './AddClipForm';
import AspectPicker from './AspectPicker';
import { arrayMove } from '../lib/array-move';
import { guessAspect } from '../lib/aspect';
import { defaultCropForAspect } from '../lib/crop';
import MasterTimeline from './MasterTimeline';
import { usePlaybackEngine } from '../lib/playback-engine';
import ExportButton from './ExportButton';
import { clipTimeToProject } from '../lib/project-time';

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

  const engine = usePlaybackEngine(project);
  const totalSize = project.clips.reduce((s, c) => s + (c.file?.size ?? 0), 0);
  const WARN_SIZE = 500 * 1024 * 1024;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === 'Space' && e.target === document.body) {
        e.preventDefault();
        engine.toggle();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [engine]);

  const active = project.clips.find((c) => c.id === engine.activeClipId) ?? project.clips[0];

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

  const addClip = useCallback(
    (clip: Clip) => {
      if (clip.type !== project.mode) return;
      let nextClip = clip;
      let nextAspect = project.aspect;

      // On first video clip, auto-guess the aspect.
      if (
        project.mode === 'video' &&
        !nextAspect &&
        clip.sourceWidth &&
        clip.sourceHeight
      ) {
        nextAspect = guessAspect(clip.sourceWidth, clip.sourceHeight);
      }

      // For every video clip with known source dimensions, apply a default centered crop
      // matching the project aspect — so the UI has a live preview immediately.
      if (
        project.mode === 'video' &&
        nextAspect &&
        clip.sourceWidth &&
        clip.sourceHeight
      ) {
        nextClip = {
          ...clip,
          crop: defaultCropForAspect(
            { w: clip.sourceWidth, h: clip.sourceHeight },
            nextAspect
          ),
        };
      }

      const next: Project = {
        ...project,
        clips: [...project.clips, nextClip],
        aspect: nextAspect,
      };
      onUpdateProject(next);
    },
    [project, onUpdateProject]
  );

  const removeClip = useCallback(
    (id: string) => {
      const nextClips = project.clips.filter((c) => c.id !== id);
      onUpdateProject({ ...project, clips: nextClips });
      if (nextClips.length === 0) {
        onBack();
      }
      // No need to manage selectedId — engine.activeClipId derives from projectTime.
    },
    [project, onUpdateProject, onBack]
  );

  const reorderClips = useCallback(
    (from: number, to: number) => {
      onUpdateProject({ ...project, clips: arrayMove(project.clips, from, to) });
    },
    [project, onUpdateProject]
  );

  if (!active) {
    return (
      <div className="p-8 text-center text-gray-500">{t('project.empty')}</div>
    );
  }

  return (
    <div className="w-full max-w-6xl mx-auto space-y-4 p-4">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            if (project.clips.length > 0 && !confirm(t('project.discardConfirm'))) return;
            onBack();
          }}
          className="px-3 py-2 rounded-lg text-gray-600 hover:bg-gray-100"
        >
          ← {t('editor.back')}
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-3">
        <MasterTimeline
          clips={project.clips}
          projectTime={engine.projectTime}
          isPlaying={engine.isPlaying}
          onSeek={engine.seek}
          onToggle={engine.toggle}
        />
      </div>

      {project.mode === 'video' && (
        <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-2">
          <p className="text-sm font-medium text-gray-700">{t('aspect.title')}</p>
          <AspectPicker
            value={project.aspect}
            onChange={(a) => {
              const clips = project.clips.map((c) => {
                if (c.type === 'video' && c.sourceWidth && c.sourceHeight) {
                  return {
                    ...c,
                    crop: defaultCropForAspect({ w: c.sourceWidth, h: c.sourceHeight }, a),
                  };
                }
                return c;
              });
              onUpdateProject({ ...project, aspect: a, clips });
            }}
          />
        </div>
      )}

      <div className="grid grid-cols-[280px_1fr] gap-4">
        {/* Clip list */}
        <aside className="bg-white border border-gray-200 rounded-xl p-3 space-y-3">
          <AddClipForm mode={project.mode} onClipReady={addClip} />
          <ClipList
            clips={project.clips}
            selectedId={engine.activeClipId}
            onSelect={(id) => {
              const idx = project.clips.findIndex((c) => c.id === id);
              if (idx < 0) return;
              engine.seek(clipTimeToProject(project.clips, idx, 0));
            }}
            onRemove={removeClip}
            onReorder={reorderClips}
          />
        </aside>

        {/* Per-clip editor */}
        <section>
          <TrackEditor
            clip={active}
            project={project}
            engineBind={engine.bindActiveElement}
            onUpdateClip={updateClip}
            onDragUpdateClip={dragUpdateClip}
            onUndo={onUndo}
            onRedo={onRedo}
            canUndo={canUndo}
            canRedo={canRedo}
          />
        </section>
      </div>

      {totalSize > WARN_SIZE && (
        <p className="text-sm text-amber-600 text-center">{t('project.sizeWarning')}</p>
      )}

      <div className="flex flex-wrap justify-center items-center gap-3 pt-4">
        <ExportButton project={project} />
        <a
          href="https://online-video-cutter.com/video-editor"
          target="_blank"
          rel="noopener noreferrer"
          className="px-5 py-3 rounded-xl border border-primary-600 text-primary-700 font-semibold hover:bg-primary-50"
        >
          {t('editor.advancedEditor')}
        </a>
      </div>

      {engine.nextClipId && (() => {
        const nc = project.clips.find((c) => c.id === engine.nextClipId);
        if (!nc) return null;
        return project.mode === 'audio' ? (
          <audio key={nc.id} src={nc.url} preload="auto" style={{ display: 'none' }} />
        ) : (
          <video key={nc.id} src={nc.url} preload="auto" style={{ display: 'none' }} muted />
        );
      })()}
    </div>
  );
}
