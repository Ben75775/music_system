import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import Layout from './components/Layout';
import FileInput from './components/FileInput';
import TrackEditor from './components/TrackEditor';
import { useHistory } from './hooks/useHistory';
import type { Track } from 'shared/types';

export default function App() {
  const { t } = useTranslation();
  const [hasTrack, setHasTrack] = useState(false);
  const history = useHistory<Track | null>(null);

  const handleFileReady = useCallback(
    (track: Track) => {
      history.reset(track);
      setHasTrack(true);
    },
    [history]
  );

  const handleBack = useCallback(() => {
    history.set(null);
    setHasTrack(false);
  }, [history]);

  const track = history.current;

  return (
    <Layout>
      {!track || !hasTrack ? (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-8">
          <h1 className="text-4xl font-bold text-primary-700">
            {t('app.title')}
          </h1>
          <p className="text-lg text-gray-500">{t('app.subtitle')}</p>
          <FileInput onFileReady={handleFileReady} />
        </div>
      ) : (
        <TrackEditor
          track={track}
          onUpdateTrack={history.set}
          onDragUpdateTrack={history.replace}
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
