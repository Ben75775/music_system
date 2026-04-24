import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import Layout from './components/Layout';
import FileInput from './components/FileInput';
import ProjectView from './components/ProjectView';
import { useHistory } from './hooks/useHistory';
import type { Clip, ImageEdit, Project } from 'shared/types';

export default function App() {
  const { t } = useTranslation();
  const projectHistory = useHistory<Project | null>(null);
  const imageHistory = useHistory<ImageEdit | null>(null);
  const project = projectHistory.current;
  const imageEdit = imageHistory.current;

  const handleFileReady = useCallback(
    (clip: Clip) => {
      const newProject: Project = {
        id: crypto.randomUUID(),
        mode: clip.type,
        clips: [clip],
      };
      projectHistory.reset(newProject);
    },
    [projectHistory]
  );

  const handleImageReady = useCallback(
    (edit: ImageEdit) => {
      imageHistory.reset(edit);
    },
    [imageHistory]
  );

  const handleBackProject = useCallback(() => {
    projectHistory.set(null);
  }, [projectHistory]);

  const handleBackImage = useCallback(() => {
    imageHistory.set(null);
  }, [imageHistory]);

  return (
    <Layout>
      {!project && !imageEdit ? (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-8">
          <h1 className="text-4xl font-bold text-primary-700">{t('app.title')}</h1>
          <p className="text-lg text-gray-500">{t('app.subtitle')}</p>
          <FileInput
            onFileReady={handleFileReady}
            onImageReady={handleImageReady}
          />
        </div>
      ) : imageEdit ? (
        <div className="p-8 text-center">
          <p className="text-lg text-gray-700">Image editor (placeholder)</p>
          <p className="text-sm text-gray-500 mt-2">
            {imageEdit.name} — {imageEdit.naturalWidth}×{imageEdit.naturalHeight}
          </p>
          <button
            onClick={handleBackImage}
            className="mt-4 px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg"
          >
            {t('editor.back')}
          </button>
        </div>
      ) : (
        <ProjectView
          project={project!}
          onUpdateProject={projectHistory.set}
          onDragUpdateProject={projectHistory.replace}
          onBack={handleBackProject}
          onUndo={projectHistory.undo}
          onRedo={projectHistory.redo}
          canUndo={projectHistory.canUndo}
          canRedo={projectHistory.canRedo}
        />
      )}
    </Layout>
  );
}
