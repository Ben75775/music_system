import { useState, useRef, useCallback } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL, fetchFile } from '@ffmpeg/util';

interface FFmpegState {
  loaded: boolean;
  loading: boolean;
  progress: number;
  error: string | null;
}

export function useFFmpeg() {
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const [state, setState] = useState<FFmpegState>({
    loaded: false,
    loading: false,
    progress: 0,
    error: null,
  });

  const load = useCallback(async () => {
    if (ffmpegRef.current || state.loading) return;

    setState((s) => ({ ...s, loading: true, error: null }));

    try {
      const ffmpeg = new FFmpeg();

      ffmpeg.on('progress', ({ progress }) => {
        setState((s) => ({ ...s, progress: Math.round(progress * 100) }));
      });

      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });

      ffmpegRef.current = ffmpeg;
      setState({ loaded: true, loading: false, progress: 0, error: null });
    } catch (err) {
      setState({
        loaded: false,
        loading: false,
        progress: 0,
        error: err instanceof Error ? err.message : 'Failed to load FFmpeg',
      });
    }
  }, [state.loading]);

  const exec = useCallback(
    async (
      inputFile: File,
      args: string[],
      outputName: string
    ): Promise<Blob | null> => {
      const ffmpeg = ffmpegRef.current;
      if (!ffmpeg) return null;

      setState((s) => ({ ...s, progress: 0 }));

      const inputName = 'input' + getExtension(inputFile.name);
      await ffmpeg.writeFile(inputName, await fetchFile(inputFile));
      await ffmpeg.exec(['-i', inputName, ...args, outputName]);

      const data = await ffmpeg.readFile(outputName);
      await ffmpeg.deleteFile(inputName);
      await ffmpeg.deleteFile(outputName);

      const blob = new Blob([(data as Uint8Array).buffer as ArrayBuffer], {
        type: outputName.endsWith('.mp3') ? 'audio/mpeg' : 'video/mp4',
      });
      return blob;
    },
    []
  );

  const run = useCallback(async (args: string[]) => {
    const ffmpeg = ffmpegRef.current;
    if (!ffmpeg) throw new Error('ffmpeg not loaded');
    await ffmpeg.exec(args);
  }, []);

  const writeFile = useCallback(async (name: string, data: Uint8Array | File) => {
    const ffmpeg = ffmpegRef.current;
    if (!ffmpeg) throw new Error('ffmpeg not loaded');
    const buf = data instanceof File ? await fetchFile(data) : data;
    await ffmpeg.writeFile(name, buf);
  }, []);

  const readFile = useCallback(async (name: string): Promise<Uint8Array> => {
    const ffmpeg = ffmpegRef.current;
    if (!ffmpeg) throw new Error('ffmpeg not loaded');
    return (await ffmpeg.readFile(name)) as Uint8Array;
  }, []);

  const deleteFile = useCallback(async (name: string) => {
    const ffmpeg = ffmpegRef.current;
    if (!ffmpeg) return;
    try {
      await ffmpeg.deleteFile(name);
    } catch {
      /* ignore — deleting non-existent files is fine */
    }
  }, []);

  return { ...state, load, exec, run, writeFile, readFile, deleteFile };
}

function getExtension(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext === 'mp3') return '.mp3';
  if (ext === 'mp4') return '.mp4';
  return '.mp3';
}
