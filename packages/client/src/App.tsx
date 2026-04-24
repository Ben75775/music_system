import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import Layout from './components/Layout';
import FileInput from './components/FileInput';
import ImageEditor from './components/ImageEditor';
import ProjectView from './components/ProjectView';
import YoutubeThumbnail from './components/YoutubeThumbnail';
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
          <YoutubeThumbnail />
        </div>
      ) : imageEdit ? (
        <ImageEditor
          edit={imageEdit}
          onUpdate={imageHistory.set}
          onDragUpdate={imageHistory.replace}
          onBack={handleBackImage}
          onUndo={imageHistory.undo}
          onRedo={imageHistory.redo}
          canUndo={imageHistory.canUndo}
          canRedo={imageHistory.canRedo}
        />
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
