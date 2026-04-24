import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import Layout from './components/Layout';
import FileInput from './components/FileInput';
import TrackEditor from './components/TrackEditor';
import { useHistory } from './hooks/useHistory';
import type { Clip, Project } from 'shared/types';

export default function App() {
  const { t } = useTranslation();
  const history = useHistory<Project | null>(null);
  const project = history.current;

  const handleFileReady = useCallback(
    (clip: Clip) => {
      const newProject: Project = {
        id: crypto.randomUUID(),
        mode: clip.type,
        clips: [clip],
      };
      history.reset(newProject);
    },
    [history]
  );

  const handleBack = useCallback(() => {
    history.set(null);
  }, [history]);

  // For Phase 5 we still render the single-clip editor on the project's first clip.
  // Phase 6 replaces this branch with ProjectView.
  const activeClip = project?.clips[0] ?? null;
  const updateActiveClip = useCallback(
    (clip: Clip) => {
      if (!project) return;
      history.set({ ...project, clips: [clip, ...project.clips.slice(1)] });
    },
    [history, project]
  );
  const dragUpdateActiveClip = useCallback(
    (clip: Clip) => {
      if (!project) return;
      history.replace({ ...project, clips: [clip, ...project.clips.slice(1)] });
    },
    [history, project]
  );

  return (
    <Layout>
      {!project || !activeClip ? (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-8">
          <h1 className="text-4xl font-bold text-primary-700">{t('app.title')}</h1>
          <p className="text-lg text-gray-500">{t('app.subtitle')}</p>
          <FileInput onFileReady={handleFileReady} />
        </div>
      ) : (
        <TrackEditor
          track={activeClip}
          onUpdateTrack={updateActiveClip}
          onDragUpdateTrack={dragUpdateActiveClip}
          onBack={handleBack}
          onUndo={history.undo}
          onRedo={history.redo}
          canUndo={history.canUndo}
          canRedo={history.canRedo}
        />
      )}
    </Layout>
  );
}
