import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import Layout from './components/Layout';
import FileInput from './components/FileInput';
import ImageEditor from './components/ImageEditor';
import ImageEditorEntry from './components/ImageEditorEntry';
import ProjectView from './components/ProjectView';
import YoutubeThumbnail from './components/YoutubeThumbnail';
import { useHistory } from './hooks/useHistory';
import { guessAspect } from './lib/aspect';
import { defaultCropForAspect } from './lib/crop';
import type { Clip, ImageEdit, Project } from 'shared/types';

export default function App() {
  const { t } = useTranslation();
  const projectHistory = useHistory<Project | null>(null);
  const imageHistory = useHistory<ImageEdit | null>(null);
  const project = projectHistory.current;
  const imageEdit = imageHistory.current;

  const handleFileReady = useCallback(
    (clip: Clip) => {
      // For a video drop, guess an aspect from the source dimensions and
      // apply a centered default crop — otherwise the export pipeline throws
      // `video_project_needs_aspect` if the user clicks download without
      // touching the aspect picker.
      let firstClip = clip;
      let aspect: Project['aspect'] = undefined;
      if (clip.type === 'video' && clip.sourceWidth && clip.sourceHeight) {
        aspect = guessAspect(clip.sourceWidth, clip.sourceHeight);
        firstClip = {
          ...clip,
          crop: defaultCropForAspect(
            { w: clip.sourceWidth, h: clip.sourceHeight },
            aspect
          ),
        };
      }
      const newProject: Project = {
        id: crypto.randomUUID(),
        mode: clip.type,
        clips: [firstClip],
        aspect,
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
          <FileInput onFileReady={handleFileReady} />
          <ImageEditorEntry onImageReady={handleImageReady} />
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
