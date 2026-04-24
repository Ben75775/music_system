import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import Layout from './components/Layout';
import FileInput from './components/FileInput';
import ProjectView from './components/ProjectView';
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

  return (
    <Layout>
      {!project ? (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-8">
          <h1 className="text-4xl font-bold text-primary-700">{t('app.title')}</h1>
          <p className="text-lg text-gray-500">{t('app.subtitle')}</p>
          <FileInput onFileReady={handleFileReady} />
        </div>
      ) : (
        <ProjectView
          project={project}
          onUpdateProject={history.set}
          onDragUpdateProject={history.replace}
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
