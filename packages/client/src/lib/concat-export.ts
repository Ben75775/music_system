import type { Project } from 'shared/types';
import { buildNormalizeArgs, buildConcatArgs } from './ffmpeg-commands';

export interface ExportDeps {
  writeFile: (name: string, data: Uint8Array | File) => Promise<void>;
  readFile: (name: string) => Promise<Uint8Array>;
  deleteFile: (name: string) => Promise<void>;
  run: (args: string[]) => Promise<void>;
}

export interface ExportResult {
  blob: Blob;
  filename: string;
}

export async function exportProject(
  project: Project,
  deps: ExportDeps,
  onProgress?: (pct: number) => void
): Promise<ExportResult> {
  if (project.clips.length === 0) throw new Error('empty_project');
  if (project.mode === 'video' && !project.aspect) {
    throw new Error('video_project_needs_aspect');
  }

  const ext = project.mode === 'audio' ? 'mp3' : 'mp4';
  const mime = project.mode === 'audio' ? 'audio/mpeg' : 'video/mp4';
  const normalized: string[] = [];

  let outDims: { w: number; h: number } | undefined;
  if (project.mode === 'video' && project.aspect === 'original') {
    const first = project.clips[0];
    if (!first.sourceWidth || !first.sourceHeight) {
      throw new Error('first clip missing source dimensions (cannot compute original output)');
    }
    outDims = { w: first.sourceWidth, h: first.sourceHeight };
  }

  const steps = project.clips.length + 1;
  const bump = (i: number) => onProgress?.(Math.round((i / steps) * 100));

  for (let i = 0; i < project.clips.length; i++) {
    const clip = project.clips[i];
    if (!clip.file) throw new Error(`clip_${i}_missing_file`);

    const inputName = `input_${i}.${clip.type === 'audio' ? 'mp3' : 'mp4'}`;
    const outName = `clip_${i}.${ext}`;

    try {
      await deps.writeFile(inputName, clip.file);
      const args = ['-i', inputName, ...buildNormalizeArgs(clip, project, outDims), outName];
      await deps.run(args);
    } catch (e) {
      throw new Error(`clip_${i}_normalize_failed: ${(e as Error).message}`);
    } finally {
      await deps.deleteFile(inputName);
    }

    normalized.push(outName);
    bump(i + 1);
  }

  const listBody = normalized.map((f) => `file '${f}'`).join('\n') + '\n';
  await deps.writeFile('list.txt', new TextEncoder().encode(listBody));

  const outFile = `output.${ext}`;
  try {
    await deps.run(buildConcatArgs(normalized, outFile));
  } catch (e) {
    throw new Error(`concat_failed: ${(e as Error).message}`);
  }

  const data = await deps.readFile(outFile);

  await deps.deleteFile('list.txt');
  await deps.deleteFile(outFile);
  for (const f of normalized) await deps.deleteFile(f);

  bump(steps);

  const blob = new Blob([data.buffer as ArrayBuffer], { type: mime });
  return { blob, filename: `merged.${ext}` };
}
