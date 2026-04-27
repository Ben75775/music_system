import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { Clip, Project } from 'shared/types';
import TrackEditor from './TrackEditor';
import AspectPicker from './AspectPicker';
import { defaultCropForAspect } from '../lib/crop';
import ExportButton from './ExportButton';
import { useClipExport } from '../hooks/useClipExport';

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

const WARN_SIZE = 500 * 1024 * 1024;

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
  const xport = useClipExport(project);

  const clip = project.clips[0];
  const totalSize = clip?.file?.size ?? 0;

  const updateClip = useCallback(
    (next: Clip) => {
      onUpdateProject({ ...project, clips: [next] });
    },
    [project, onUpdateProject]
  );

  const dragUpdateClip = useCallback(
    (next: Clip) => {
      onDragUpdateProject({ ...project, clips: [next] });
    },
    [project, onDragUpdateProject]
  );

  if (!clip) {
    return null;
  }

  return (
    <div className="w-full max-w-4xl mx-auto space-y-4 p-4">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            if (!confirm(t('project.discardConfirm'))) return;
            onBack();
          }}
          className="px-3 py-2 rounded-lg text-gray-600 hover:bg-gray-100"
        >
          ← {t('editor.back')}
        </button>
      </div>

      {project.mode === 'video' && (
        <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-2">
          <p className="text-sm font-medium text-gray-700">{t('aspect.title')}</p>
          <AspectPicker
            value={project.aspect}
            onChange={(a) => {
              const nextClip: Clip =
                clip.type === 'video' && clip.sourceWidth && clip.sourceHeight
                  ? {
                      ...clip,
                      crop: defaultCropForAspect(
                        { w: clip.sourceWidth, h: clip.sourceHeight },
                        a
                      ),
                    }
                  : clip;
              onUpdateProject({ ...project, aspect: a, clips: [nextClip] });
            }}
          />
        </div>
      )}

      <TrackEditor
        clip={clip}
        project={project}
        onUpdateClip={updateClip}
        onDragUpdateClip={dragUpdateClip}
        onUndo={onUndo}
        onRedo={onRedo}
        canUndo={canUndo}
        canRedo={canRedo}
        onLoopExport={(count) => xport.exportClip(count, 'loop')}
        exporting={xport.exporting || xport.ffmpegLoading}
        loopBusy={xport.activeTrigger === 'loop'}
        loopProgress={xport.activeTrigger === 'loop' ? xport.progress : 0}
      />

      {totalSize > WARN_SIZE && (
        <p className="text-sm text-amber-600 text-center">{t('project.sizeWarning')}</p>
      )}

      <div className="flex flex-wrap justify-center items-center gap-3 pt-4">
        <ExportButton
          exporting={xport.exporting}
          progress={xport.activeTrigger === 'main' ? xport.progress : 0}
          error={xport.error}
          useWebCodecs={xport.useWebCodecs}
          ffmpegLoading={xport.ffmpegLoading}
          ffmpegLoaded={xport.ffmpegLoaded}
          onExport={() => xport.exportClip(1, 'main')}
        />
        <a
          href="https://online-video-cutter.com/video-editor"
          target="_blank"
          rel="noopener noreferrer"
          className="px-5 py-3 rounded-xl border border-primary-600 text-primary-700 font-semibold hover:bg-primary-50"
        >
          {t('editor.advancedEditor')}
        </a>
      </div>
    </div>
  );
}
