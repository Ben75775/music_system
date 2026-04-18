# Multi-clip Projects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the single-file editor into a multi-clip project editor with per-clip effects, project-level aspect/crop (video), live project-wide playback, and a single merged export.

**Architecture:** Replace the `Track` type with `Clip`, wrap state in a `Project`. Add a project view (clip list + per-clip editor + master timeline + export). Playback uses two swapping `<video>`/`<audio>` elements + a per-clip WebAudio graph. Export normalizes each clip then concats via FFmpeg's demuxer.

**Tech Stack:** React 18, Vite 6, TypeScript, Tailwind, ffmpeg.wasm (@ffmpeg/ffmpeg 0.12), WaveSurfer, react-i18next. Tests use **vitest** (added in Phase 1).

**Reference spec:** `docs/superpowers/specs/2026-04-18-multi-clip-projects-design.md`

**Coherent checkpoints:**
- End of Phase 5 — single-clip flow still works; Track→Clip rename done; Project wrapper exists. Safe to pause.
- End of Phase 7 — multi-clip edit works; no crop, no merged playback, no merged export.
- End of Phase 9 — crop works visually.
- End of Phase 11 — merged live playback works.
- End of Phase 12 — merged export works. Feature complete.

---

## Phase 1 — Test infrastructure

### Task 1.1: Add vitest

**Files:**
- Modify: `packages/client/package.json`
- Create: `packages/client/vitest.config.ts`

- [ ] **Step 1: Install vitest**

Run: `npm install -D vitest@^2.1.0 --workspace=packages/client`
Expected: adds `vitest` to `devDependencies`, updates lockfile.

- [ ] **Step 2: Add test script to package.json**

Edit `packages/client/package.json`, add to `scripts`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Create vitest config**

Create `packages/client/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      shared: path.resolve(__dirname, '../../shared'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 4: Verify it runs with zero tests**

Run: `npm run test --workspace=packages/client`
Expected: "No test files found" — exits 0 or equivalent success. If it exits non-zero with "no tests", add `passWithNoTests: true` inside the `test` block and re-run.

- [ ] **Step 5: Commit**

```bash
git add packages/client/package.json packages/client/vitest.config.ts package-lock.json
git commit -m "chore: add vitest for unit tests"
```

---

## Phase 2 — Data model refactor

### Task 2.1: Rewrite shared/types.ts

**Files:**
- Modify: `shared/types.ts` (full rewrite)

- [ ] **Step 1: Replace file contents**

Write `shared/types.ts`:

```ts
export type ProjectMode = 'audio' | 'video';
export type Aspect = '16:9' | '9:16' | '1:1' | '4:3' | '3:4';

export type EQPreset = 'none' | 'bass-boost' | 'vocal-clarity' | 'treble-boost';

export interface TrackEffect {
  volume: number;       // 0-2 (1 = normal)
  fadeIn: number;       // seconds
  fadeOut: number;      // seconds
  speed: number;        // 0.5-2 (1 = normal)
  eqPreset: EQPreset;
}

export interface TrimRange {
  start: number; // seconds
  end: number;   // seconds
}

export interface CropRegion {
  // Normalized to source frame, in [0, 1]. Survives source-metadata changes.
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Clip {
  id: string;
  name: string;
  file: File | null;
  url: string;
  type: ProjectMode;
  duration: number;
  trim: TrimRange;
  effects: TrackEffect;
  crop?: CropRegion;
  sourceWidth?: number;
  sourceHeight?: number;
}

export interface Project {
  id: string;
  mode: ProjectMode;
  aspect?: Aspect;
  clips: Clip[];
}

export const DEFAULT_EFFECTS: TrackEffect = {
  volume: 1,
  fadeIn: 0,
  fadeOut: 0,
  speed: 1,
  eqPreset: 'none',
};

// Back-compat alias: old Track code will be renamed in Phase 4.
export type Track = Clip;
```

- [ ] **Step 2: Verify TypeScript build still passes**

Run: `npm run build --workspace=packages/client`
Expected: Type errors will appear where code references `effects.pitch`. That's fine — we remove pitch in Phase 3.

- [ ] **Step 3: Commit**

```bash
git add shared/types.ts
git commit -m "refactor(types): add Project/Clip/CropRegion, alias Track=Clip, remove pitch"
```

---

## Phase 3 — Remove pitch

### Task 3.1: Strip pitch from FFmpeg args

**Files:**
- Modify: `packages/client/src/lib/ffmpeg-commands.ts`

- [ ] **Step 1: Remove pitch filter block**

In `ffmpeg-commands.ts`, delete lines 46–50 (the `// Pitch shift` block). The `atempo` for speed stays.

- [ ] **Step 2: Build**

Run: `npm run build --workspace=packages/client`
Expected: `ffmpeg-commands.ts` type-clean; errors remain only in `Controls.tsx` (pitch slider).

### Task 3.2: Remove pitch slider

**Files:**
- Modify: `packages/client/src/components/Controls.tsx:50-61` (pitch SliderControl block)

- [ ] **Step 1: Delete the pitch SliderControl**

Remove the whole `<SliderControl ... editor.pitch ... pitch: v />` block from `Controls.tsx`.

- [ ] **Step 2: Remove pitch i18n keys**

Edit `packages/client/src/i18n/he.json` and `packages/client/src/i18n/en.json`: delete the `"pitch"` line in the `editor` object.

- [ ] **Step 3: Build**

Run: `npm run build --workspace=packages/client`
Expected: Success.

- [ ] **Step 4: Smoke test**

Run: `npm run dev` (already running in background on :5174). Load a file. Confirm the pitch slider is gone and other sliders still work.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/lib/ffmpeg-commands.ts packages/client/src/components/Controls.tsx packages/client/src/i18n/he.json packages/client/src/i18n/en.json
git commit -m "refactor: remove pitch (not supported in live preview)"
```

---

## Phase 4 — Rename Track → Clip

Mostly a find-and-replace with the back-compat alias from Phase 2 in place. The alias lets us do this incrementally.

### Task 4.1: Rename across the codebase

**Files (all modify):**
- `packages/client/src/App.tsx`
- `packages/client/src/components/TrackEditor.tsx`
- `packages/client/src/components/FileInput.tsx`
- `packages/client/src/components/ExportButton.tsx`
- `packages/client/src/lib/ffmpeg-commands.ts`
- `packages/client/src/hooks/useVideoPlayer.ts` (if it imports `Track`)
- `packages/client/src/hooks/useWaveSurfer.ts` (if it imports `Track`)

- [ ] **Step 1: Update every `import type { Track }` to `import type { Clip }`**

Find all occurrences: `import type { Track } from 'shared/types'` → `import type { Clip } from 'shared/types'`.

- [ ] **Step 2: Replace `Track` usages with `Clip` in each file**

In each modified file, rename the type references (`: Track`, `<Track>`, `Track | null`) to `Clip`. Variable names like `track` can stay (they describe the variable's role); only the **type name** changes in this pass.

- [ ] **Step 3: Drop the back-compat alias**

Edit `shared/types.ts`: delete the final line `export type Track = Clip;`.

- [ ] **Step 4: Build**

Run: `npm run build --workspace=packages/client`
Expected: Success. Any remaining `Track` reference surfaces as a type error and must be fixed.

- [ ] **Step 5: Smoke test**

Run: `npm run dev`. Load a file. Trim, adjust effects, export. Everything works as before the rename.

- [ ] **Step 6: Commit**

```bash
git add shared/types.ts packages/client/src
git commit -m "refactor: rename Track type to Clip"
```

---

## Phase 5 — Project wrapper state

Single-clip editing continues to work, but top-level state becomes a `Project`. Zero visible change.

### Task 5.1: App state holds Project

**Files:**
- Modify: `packages/client/src/App.tsx` (full rewrite)

- [ ] **Step 1: Rewrite App.tsx**

```tsx
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
```

- [ ] **Step 2: Build**

Run: `npm run build --workspace=packages/client`
Expected: Success.

- [ ] **Step 3: Smoke test**

Run: `npm run dev`. Load a file. Edit, undo, redo, export. Everything still works.

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/App.tsx
git commit -m "refactor(app): wrap state in Project (single-clip behavior unchanged)"
```

---

## Phase 6 — ProjectView shell

Replace the single-clip branch with a two-column ProjectView. Still one clip in the list; crop/aspect hidden for now.

### Task 6.1: Rename TrackEditor props clip-centric

**Files:**
- Modify: `packages/client/src/components/TrackEditor.tsx`

- [ ] **Step 1: Rename props and internal variables**

In `TrackEditor.tsx`, change the interface and the component signature:

```tsx
interface TrackEditorProps {
  clip: Clip;
  onUpdateClip: (clip: Clip) => void;
  onDragUpdateClip: (clip: Clip) => void;
  onBack: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export default function TrackEditor({
  clip,
  onUpdateClip,
  onDragUpdateClip,
  onBack,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: TrackEditorProps) {
```

Inside the component and inner editors (`AudioEditor`, `VideoEditor`), rename every `track` reference to `clip`. Keep the internal file structure (header row, back button, waveform/video, controls, export row).

- [ ] **Step 2: Build**

Run: `npm run build --workspace=packages/client`
Expected: `App.tsx` now errors because it passes `track=` — the next task fixes that.

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/components/TrackEditor.tsx
git commit -m "refactor(editor): rename props track→clip in TrackEditor"
```

### Task 6.2: Create ProjectView

**Files:**
- Create: `packages/client/src/components/ProjectView.tsx`
- Modify: `packages/client/src/App.tsx`

- [ ] **Step 1: Create ProjectView.tsx**

```tsx
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Clip, Project } from 'shared/types';
import TrackEditor from './TrackEditor';

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
  const [selectedId, setSelectedId] = useState<string>(project.clips[0]?.id ?? '');
  const selected = project.clips.find((c) => c.id === selectedId) ?? project.clips[0];

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

  if (!selected) {
    return (
      <div className="p-8 text-center text-gray-500">{t('project.empty')}</div>
    );
  }

  return (
    <div className="w-full max-w-6xl mx-auto space-y-4 p-4">
      {/* Master timeline placeholder (Phase 11 replaces this) */}
      <div className="h-12 bg-gray-100 rounded-lg" />

      <div className="grid grid-cols-[280px_1fr] gap-4">
        {/* Clip list (Phase 7 replaces this placeholder) */}
        <aside className="bg-white border border-gray-200 rounded-xl p-3">
          <p className="text-sm text-gray-500">{t('project.clipListPlaceholder')}</p>
        </aside>

        {/* Per-clip editor */}
        <section>
          <TrackEditor
            clip={selected}
            onUpdateClip={updateClip}
            onDragUpdateClip={dragUpdateClip}
            onBack={onBack}
            onUndo={onUndo}
            onRedo={onRedo}
            canUndo={canUndo}
            canRedo={canRedo}
          />
        </section>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire ProjectView into App.tsx**

Rewrite `App.tsx` body:

```tsx
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
```

Add `import ProjectView from './components/ProjectView';` and drop the unused `activeClip`/`updateActiveClip`/`dragUpdateActiveClip` helpers.

- [ ] **Step 3: Add i18n keys**

Add to both `he.json` and `en.json` under `editor` or a new `project` object:

```json
"project": {
  "empty": "Project has no clips",
  "clipListPlaceholder": "Clip list (coming soon)"
}
```

Hebrew:

```json
"project": {
  "empty": "אין קליפים בפרויקט",
  "clipListPlaceholder": "רשימת קליפים (בקרוב)"
}
```

- [ ] **Step 4: Build + smoke test**

Run: `npm run build --workspace=packages/client`. Then `npm run dev`. Load a file. Confirm the two-column layout renders and the per-clip editor still works. The left column shows the placeholder message.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/App.tsx packages/client/src/components/ProjectView.tsx packages/client/src/i18n
git commit -m "feat(project): add ProjectView shell with 2-column layout"
```

---

## Phase 7 — Multi-clip list

### Task 7.1: ClipList component

**Files:**
- Create: `packages/client/src/components/ClipList.tsx`

- [ ] **Step 1: Create ClipList.tsx**

```tsx
import { useTranslation } from 'react-i18next';
import type { Clip } from 'shared/types';

interface ClipListProps {
  clips: Clip[];
  selectedId: string;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
}

export default function ClipList({
  clips,
  selectedId,
  onSelect,
  onRemove,
  onReorder,
}: ClipListProps) {
  const { t } = useTranslation();

  const onDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.setData('text/plain', String(index));
    e.dataTransfer.effectAllowed = 'move';
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const onDrop = (e: React.DragEvent, toIndex: number) => {
    e.preventDefault();
    const fromIndex = Number(e.dataTransfer.getData('text/plain'));
    if (!Number.isNaN(fromIndex) && fromIndex !== toIndex) {
      onReorder(fromIndex, toIndex);
    }
  };

  return (
    <ul className="space-y-2">
      {clips.map((clip, index) => {
        const isSelected = clip.id === selectedId;
        const trimmed = clip.trim.end - clip.trim.start;
        return (
          <li
            key={clip.id}
            draggable
            onDragStart={(e) => onDragStart(e, index)}
            onDragOver={onDragOver}
            onDrop={(e) => onDrop(e, index)}
            onClick={() => onSelect(clip.id)}
            className={`
              p-2 rounded-lg border cursor-pointer select-none
              ${isSelected ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:bg-gray-50'}
            `}
          >
            <div className="flex items-center gap-2">
              <span className="text-gray-400">⋮⋮</span>
              <span className="flex-1 truncate text-sm font-medium text-gray-800">
                {clip.name}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(clip.id);
                }}
                className="text-gray-400 hover:text-red-600"
                aria-label={t('project.removeClip')}
              >
                ✕
              </button>
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {trimmed.toFixed(1)}s
            </div>
          </li>
        );
      })}
    </ul>
  );
}
```

### Task 7.2: Pure array-move helper + test

**Files:**
- Create: `packages/client/src/lib/array-move.ts`
- Create: `packages/client/src/lib/array-move.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/client/src/lib/array-move.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { arrayMove } from './array-move';

describe('arrayMove', () => {
  it('moves an element forward', () => {
    expect(arrayMove(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
  });
  it('moves an element backward', () => {
    expect(arrayMove(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c']);
  });
  it('is a no-op when indices match', () => {
    expect(arrayMove(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'b', 'c']);
  });
  it('does not mutate the input', () => {
    const input = ['a', 'b', 'c'];
    arrayMove(input, 0, 2);
    expect(input).toEqual(['a', 'b', 'c']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=packages/client`
Expected: FAIL — "Cannot find module './array-move'" or similar.

- [ ] **Step 3: Implement arrayMove**

Create `packages/client/src/lib/array-move.ts`:

```ts
export function arrayMove<T>(arr: readonly T[], from: number, to: number): T[] {
  const next = arr.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=packages/client`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/lib/array-move.ts packages/client/src/lib/array-move.test.ts
git commit -m "feat(lib): add arrayMove helper with tests"
```

### Task 7.3: Add-clip form (compact drop zone + YouTube, project-mode-aware)

**Files:**
- Create: `packages/client/src/components/AddClipForm.tsx`

Extract the existing add-clip logic (file drop + YouTube fetch) from `FileInput.tsx` into a reusable component parameterized by `mode`. `FileInput` stays the first-entry form; `AddClipForm` is used inside the project view.

- [ ] **Step 1: Create AddClipForm.tsx**

```tsx
import { useState, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { Clip, ProjectMode } from 'shared/types';
import { DEFAULT_EFFECTS } from 'shared/types';

const MAX_FILE_SIZE = 200 * 1024 * 1024;
const YT_URL_RE = /^https?:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//i;

interface AddClipFormProps {
  mode: ProjectMode;
  onClipReady: (clip: Clip) => void;
}

export default function AddClipForm({ mode, onClipReady }: AddClipFormProps) {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [ytUrl, setYtUrl] = useState('');

  const acceptedMime = mode === 'audio' ? ['audio/mpeg', 'audio/mp3'] : ['video/mp4'];
  const acceptAttr = mode === 'audio' ? '.mp3,audio/mpeg' : '.mp4,video/mp4';

  const addFile = useCallback(
    async (file: File) => {
      setError(null);
      if (!acceptedMime.includes(file.type)) {
        setError(t(mode === 'audio' ? 'project.audioOnly' : 'project.videoOnly'));
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        setError(t('input.fileTooLarge'));
        return;
      }
      setLoading(true);
      try {
        const url = URL.createObjectURL(file);
        const { duration, width, height } = await readMediaMetadata(url, mode);
        const clip: Clip = {
          id: crypto.randomUUID(),
          name: file.name,
          file,
          url,
          type: mode,
          duration,
          trim: { start: 0, end: duration },
          effects: { ...DEFAULT_EFFECTS },
          ...(mode === 'video' ? { sourceWidth: width, sourceHeight: height } : {}),
        };
        onClipReady(clip);
      } catch {
        setError(t('input.invalidFile'));
      } finally {
        setLoading(false);
      }
    },
    [mode, onClipReady, t, acceptedMime]
  );

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) addFile(f);
    e.target.value = '';
  };

  const submitYt = useCallback(async () => {
    setError(null);
    const u = ytUrl.trim();
    if (!YT_URL_RE.test(u)) {
      setError(t('input.invalidUrl'));
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/youtube', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: u, format: mode === 'audio' ? 'mp3' : 'mp4' }),
      });
      if (!res.ok) {
        if (res.status === 413) setError(t('input.fileTooLarge'));
        else if (res.status === 504) setError(t('input.ytTimeout'));
        else setError(t('input.ytUnavailable'));
        return;
      }
      const blob = await res.blob();
      const ext = mode === 'audio' ? 'mp3' : 'mp4';
      const mime = mode === 'audio' ? 'audio/mpeg' : 'video/mp4';
      const file = new File([blob], `youtube.${ext}`, { type: mime });
      await addFile(file);
      setYtUrl('');
    } catch {
      setError(t('input.ytNetwork'));
    } finally {
      setLoading(false);
    }
  }, [ytUrl, mode, t, addFile]);

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={loading}
        className="w-full border-2 border-dashed border-gray-300 rounded-lg px-3 py-4 text-sm text-gray-600 hover:border-primary-400 hover:bg-gray-50 disabled:opacity-50"
      >
        {t('project.addClipFile')}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept={acceptAttr}
        onChange={onFile}
        className="hidden"
      />
      <form
        className="flex gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          submitYt();
        }}
      >
        <input
          type="url"
          value={ytUrl}
          onChange={(e) => setYtUrl(e.target.value)}
          placeholder={t('input.youtubePlaceholder')}
          className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-xs"
          dir="ltr"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !ytUrl.trim()}
          className="px-2 py-1.5 text-xs rounded bg-primary-600 text-white font-semibold disabled:bg-gray-300"
        >
          {t('project.addClipYt')}
        </button>
      </form>
      {loading && (
        <p className="text-xs text-primary-600 animate-pulse text-center">
          {t('input.loading')}
        </p>
      )}
      {error && <p className="text-xs text-red-600 text-center">{error}</p>}
    </div>
  );
}

function readMediaMetadata(
  url: string,
  mode: ProjectMode
): Promise<{ duration: number; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    if (mode === 'audio') {
      const el = document.createElement('audio');
      el.preload = 'metadata';
      el.onloadedmetadata = () =>
        resolve({ duration: el.duration, width: 0, height: 0 });
      el.onerror = reject;
      el.src = url;
    } else {
      const el = document.createElement('video');
      el.preload = 'metadata';
      el.onloadedmetadata = () =>
        resolve({
          duration: el.duration,
          width: el.videoWidth,
          height: el.videoHeight,
        });
      el.onerror = reject;
      el.src = url;
    }
  });
}
```

- [ ] **Step 2: Update FileInput.tsx to attach sourceWidth/Height too**

For single-file entry consistency, update `FileInput.tsx` → `processFile` to read `videoWidth`/`videoHeight` when the file is a video, and include them on the created `Clip` (the existing `getMediaDuration` only reads duration; replace with the same `readMediaMetadata` helper or inline the logic).

**Important:** keep `FileInput.tsx`'s existing `onFileReady` contract — it passes a `Clip`/`Track`. After Phase 4 rename, the variable type is already `Clip`.

- [ ] **Step 3: Add i18n keys**

`en.json` additions:

```json
"project": {
  "empty": "Project has no clips",
  "clipListPlaceholder": "Clip list (coming soon)",
  "addClipFile": "Add file to project",
  "addClipYt": "Add",
  "removeClip": "Remove clip",
  "audioOnly": "Audio projects only accept MP3 files",
  "videoOnly": "Video projects only accept MP4 files"
}
```

Hebrew:

```json
"project": {
  "empty": "אין קליפים בפרויקט",
  "clipListPlaceholder": "רשימת קליפים (בקרוב)",
  "addClipFile": "הוספת קובץ",
  "addClipYt": "הוסף",
  "removeClip": "הסרת קליפ",
  "audioOnly": "פרויקט אודיו מקבל רק קובצי MP3",
  "videoOnly": "פרויקט וידאו מקבל רק קובצי MP4"
}
```

### Task 7.4: Wire ClipList + AddClipForm into ProjectView

**Files:**
- Modify: `packages/client/src/components/ProjectView.tsx`

- [ ] **Step 1: Replace the clip-list placeholder**

Replace the `<aside>` body in `ProjectView.tsx` with:

```tsx
<aside className="bg-white border border-gray-200 rounded-xl p-3 space-y-3">
  <AddClipForm mode={project.mode} onClipReady={addClip} />
  <ClipList
    clips={project.clips}
    selectedId={selectedId}
    onSelect={setSelectedId}
    onRemove={removeClip}
    onReorder={reorderClips}
  />
</aside>
```

Add imports for `ClipList` and `AddClipForm`.

- [ ] **Step 2: Implement addClip / removeClip / reorderClips**

Inside `ProjectView`, before the return:

```tsx
const addClip = useCallback(
  (clip: Clip) => {
    if (clip.type !== project.mode) return; // AddClipForm already guards, defensive.
    onUpdateProject({ ...project, clips: [...project.clips, clip] });
    setSelectedId(clip.id);
  },
  [project, onUpdateProject]
);

const removeClip = useCallback(
  (id: string) => {
    const idx = project.clips.findIndex((c) => c.id === id);
    if (idx < 0) return;
    const nextClips = project.clips.filter((c) => c.id !== id);
    onUpdateProject({ ...project, clips: nextClips });
    if (selectedId === id) {
      const fallback = nextClips[Math.max(0, idx - 1)];
      setSelectedId(fallback?.id ?? '');
    }
  },
  [project, onUpdateProject, selectedId]
);

const reorderClips = useCallback(
  (from: number, to: number) => {
    onUpdateProject({ ...project, clips: arrayMove(project.clips, from, to) });
  },
  [project, onUpdateProject]
);
```

Add import: `import { arrayMove } from '../lib/array-move';`

- [ ] **Step 3: Handle empty-project return to landing**

In `App.tsx`, watch for `project && project.clips.length === 0` and treat it as "return to landing":

```tsx
const current = project && project.clips.length === 0 ? null : project;
// ... use `current` in the JSX below instead of `project`
```

Alternatively, wrap `removeClip` in `ProjectView` to call `onBack` when removing the last clip. Pick whichever is cleaner — recommend the `ProjectView` wrap:

```tsx
const removeClip = useCallback(
  (id: string) => {
    // ... as above ...
    if (nextClips.length === 0) onBack();
  },
  [project, onUpdateProject, selectedId, onBack]
);
```

- [ ] **Step 4: Build + smoke test**

Run: `npm run build --workspace=packages/client`, then `npm run dev`. Load a file. Confirm:
  1. The clip list shows the one clip, selected.
  2. "Add file to project" adds another — list now has 2 clips.
  3. Clicking a clip selects it and the editor switches to it.
  4. Dragging a clip reorders the list.
  5. Clicking ✕ removes a clip; removing the last returns you to the landing screen.
  6. Adding a mismatched-type file (e.g., MP4 into an audio project) shows the red error text and doesn't add.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/components/ClipList.tsx packages/client/src/components/AddClipForm.tsx packages/client/src/components/ProjectView.tsx packages/client/src/components/FileInput.tsx packages/client/src/i18n
git commit -m "feat(project): multi-clip list with add/remove/reorder/select"
```

---

## Phase 8 — Aspect picker (video only)

### Task 8.1: AspectPicker component with shape icons

**Files:**
- Create: `packages/client/src/components/AspectPicker.tsx`

- [ ] **Step 1: Create AspectPicker.tsx**

```tsx
import { useTranslation } from 'react-i18next';
import type { Aspect } from 'shared/types';

interface AspectPickerProps {
  value: Aspect | undefined;
  locked: boolean;
  onChange: (aspect: Aspect) => void;
  onRequestChangeWhileLocked: () => void;
}

const OPTIONS: Array<{
  aspect: Aspect;
  nameKey: string;
  w: number; // px for the mini shape
  h: number;
}> = [
  { aspect: '16:9', nameKey: 'aspect.youtube', w: 32, h: 18 },
  { aspect: '9:16', nameKey: 'aspect.tiktok', w: 18, h: 32 },
  { aspect: '1:1', nameKey: 'aspect.square', w: 26, h: 26 },
  { aspect: '4:3', nameKey: 'aspect.classic', w: 32, h: 24 },
  { aspect: '3:4', nameKey: 'aspect.portrait', w: 24, h: 32 },
];

export default function AspectPicker({
  value,
  locked,
  onChange,
  onRequestChangeWhileLocked,
}: AspectPickerProps) {
  const { t } = useTranslation();

  const pick = (a: Aspect) => {
    if (locked && value !== a) {
      onRequestChangeWhileLocked();
      return;
    }
    onChange(a);
  };

  return (
    <div className="flex flex-wrap gap-2">
      {OPTIONS.map(({ aspect, nameKey, w, h }) => {
        const isSelected = value === aspect;
        return (
          <button
            key={aspect}
            type="button"
            onClick={() => pick(aspect)}
            className={`
              flex items-center gap-2 px-3 py-2 rounded-lg border text-sm
              ${isSelected
                ? 'border-primary-500 bg-primary-50 text-primary-700'
                : 'border-gray-200 hover:border-primary-300 text-gray-700'}
            `}
          >
            <span
              className="bg-gray-700 rounded-sm inline-block"
              style={{ width: `${w}px`, height: `${h}px` }}
              aria-hidden
            />
            <span className="flex flex-col items-start">
              <span className="font-medium leading-none">{t(nameKey)}</span>
              <span className="text-xs text-gray-400 leading-none mt-1">{aspect}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Add i18n keys**

`en.json`:

```json
"aspect": {
  "youtube": "YouTube / TV",
  "tiktok": "TikTok / Reels / Stories",
  "square": "Instagram post / square",
  "classic": "Classic / old TV",
  "portrait": "Portrait photo",
  "changeConfirm": "Changing the project format will reset all crop regions. Continue?"
}
```

`he.json`:

```json
"aspect": {
  "youtube": "יוטיוב / טלוויזיה",
  "tiktok": "טיקטוק / ריילס / סטורי",
  "square": "פוסט אינסטגרם / ריבוע",
  "classic": "קלאסי / טלוויזיה ישנה",
  "portrait": "תמונת פורטרט",
  "changeConfirm": "שינוי פורמט הפרויקט ימחק את כל חיתוכי הווידאו. להמשיך?"
}
```

### Task 8.2: Wire AspectPicker into ProjectView (video mode only)

**Files:**
- Modify: `packages/client/src/components/ProjectView.tsx`

- [ ] **Step 1: Render the picker above the clip list for video projects**

Inside `ProjectView`, above the `<aside>`:

```tsx
{project.mode === 'video' && (
  <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-2">
    <p className="text-sm font-medium text-gray-700">{t('aspect.title')}</p>
    <AspectPicker
      value={project.aspect}
      locked={project.clips.length > 0 && project.aspect !== undefined}
      onChange={(a) => onUpdateProject({ ...project, aspect: a })}
      onRequestChangeWhileLocked={() => {
        if (confirm(t('aspect.changeConfirm'))) {
          const clips = project.clips.map((c) => ({ ...c, crop: undefined }));
          onUpdateProject({ ...project, clips, aspect: undefined });
        }
      }}
    />
  </div>
)}
```

Add `aspect.title` key: EN "Project format", HE "פורמט הפרויקט".
Add import for `AspectPicker`.

- [ ] **Step 2: Default the aspect on first video-clip add**

In `addClip`, after appending the first video clip, auto-set aspect from the clip's source dimensions if the project has no aspect yet:

```tsx
const addClip = useCallback(
  (clip: Clip) => {
    if (clip.type !== project.mode) return;
    let next: Project = { ...project, clips: [...project.clips, clip] };
    if (
      project.mode === 'video' &&
      !project.aspect &&
      clip.sourceWidth &&
      clip.sourceHeight
    ) {
      next = { ...next, aspect: guessAspect(clip.sourceWidth, clip.sourceHeight) };
    }
    onUpdateProject(next);
    setSelectedId(clip.id);
  },
  [project, onUpdateProject]
);
```

Create `packages/client/src/lib/aspect.ts`:

```ts
import type { Aspect } from 'shared/types';

export function guessAspect(w: number, h: number): Aspect {
  const r = w / h;
  const options: Array<[Aspect, number]> = [
    ['16:9', 16 / 9],
    ['9:16', 9 / 16],
    ['1:1', 1],
    ['4:3', 4 / 3],
    ['3:4', 3 / 4],
  ];
  let best: Aspect = '16:9';
  let bestDiff = Infinity;
  for (const [a, target] of options) {
    const diff = Math.abs(r - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = a;
    }
  }
  return best;
}

export function aspectRatio(a: Aspect): number {
  const [num, den] = a.split(':').map(Number);
  return num / den;
}

export function outputDimensions(a: Aspect): { w: number; h: number } {
  // Fixed baseline: 1080 on the short edge.
  switch (a) {
    case '16:9': return { w: 1920, h: 1080 };
    case '9:16': return { w: 1080, h: 1920 };
    case '1:1': return { w: 1080, h: 1080 };
    case '4:3': return { w: 1440, h: 1080 };
    case '3:4': return { w: 1080, h: 1440 };
  }
}
```

Add `import { guessAspect } from '../lib/aspect';` in `ProjectView.tsx`.

- [ ] **Step 3: Test aspect helpers**

Create `packages/client/src/lib/aspect.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { guessAspect, aspectRatio, outputDimensions } from './aspect';

describe('guessAspect', () => {
  it('picks 16:9 for 1920x1080', () => expect(guessAspect(1920, 1080)).toBe('16:9'));
  it('picks 9:16 for 1080x1920', () => expect(guessAspect(1080, 1920)).toBe('9:16'));
  it('picks 1:1 for 1000x1000', () => expect(guessAspect(1000, 1000)).toBe('1:1'));
  it('picks 4:3 for 640x480', () => expect(guessAspect(640, 480)).toBe('4:3'));
  it('picks 3:4 for 480x640', () => expect(guessAspect(480, 640)).toBe('3:4'));
});

describe('aspectRatio', () => {
  it('16:9 → 1.777...', () => expect(aspectRatio('16:9')).toBeCloseTo(16 / 9));
  it('1:1 → 1', () => expect(aspectRatio('1:1')).toBe(1));
});

describe('outputDimensions', () => {
  it('16:9 → 1920x1080', () => expect(outputDimensions('16:9')).toEqual({ w: 1920, h: 1080 }));
  it('9:16 → 1080x1920', () => expect(outputDimensions('9:16')).toEqual({ w: 1080, h: 1920 }));
});
```

- [ ] **Step 4: Run tests**

Run: `npm run test --workspace=packages/client`
Expected: all PASS (arrayMove 4 + aspect 8).

- [ ] **Step 5: Build + smoke test**

Load an MP4. Confirm the aspect picker appears with shape icons, the guessed aspect is pre-selected, and changing it pops the confirm dialog.

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/components/AspectPicker.tsx packages/client/src/components/ProjectView.tsx packages/client/src/lib/aspect.ts packages/client/src/lib/aspect.test.ts packages/client/src/i18n
git commit -m "feat(project): aspect picker with friendly labels + shape icons"
```

---

## Phase 9 — Crop overlay

### Task 9.1: Crop math helpers + tests

**Files:**
- Create: `packages/client/src/lib/crop.ts`
- Create: `packages/client/src/lib/crop.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// crop.test.ts
import { describe, it, expect } from 'vitest';
import { defaultCropForAspect, cropToCss } from './crop';

describe('defaultCropForAspect', () => {
  it('returns full frame when source matches project aspect', () => {
    // 1920x1080 source in 16:9 project
    const crop = defaultCropForAspect({ w: 1920, h: 1080 }, '16:9');
    expect(crop).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  });

  it('centers a max-fit rectangle when source is wider than project', () => {
    // 1920x1080 source (16:9) in 1:1 project → max-fit is 1080x1080 centered
    const crop = defaultCropForAspect({ w: 1920, h: 1080 }, '1:1');
    // width = 1080/1920 = 0.5625, height = 1, x = (1 - 0.5625)/2, y = 0
    expect(crop.width).toBeCloseTo(1080 / 1920);
    expect(crop.height).toBe(1);
    expect(crop.x).toBeCloseTo((1 - 1080 / 1920) / 2);
    expect(crop.y).toBe(0);
  });

  it('centers a max-fit rectangle when source is taller than project', () => {
    // 1080x1920 source (9:16) in 16:9 project
    const crop = defaultCropForAspect({ w: 1080, h: 1920 }, '16:9');
    expect(crop.width).toBe(1);
    expect(crop.height).toBeCloseTo(1080 * (9 / 16) / 1920);
  });
});

describe('cropToCss', () => {
  it('full frame = no clipping', () => {
    expect(cropToCss({ x: 0, y: 0, width: 1, height: 1 })).toEqual({
      clipPath: 'inset(0% 0% 0% 0%)',
    });
  });
  it('centered half', () => {
    const css = cropToCss({ x: 0.25, y: 0.25, width: 0.5, height: 0.5 });
    expect(css.clipPath).toBe('inset(25% 25% 25% 25%)');
  });
});
```

- [ ] **Step 2: Implement crop.ts**

```ts
import type { Aspect, CropRegion } from 'shared/types';
import { aspectRatio } from './aspect';

export function defaultCropForAspect(
  source: { w: number; h: number },
  aspect: Aspect
): CropRegion {
  const srcRatio = source.w / source.h;
  const projRatio = aspectRatio(aspect);

  if (Math.abs(srcRatio - projRatio) < 0.01) {
    return { x: 0, y: 0, width: 1, height: 1 };
  }
  if (srcRatio > projRatio) {
    // Source wider — crop horizontally, full height
    const normWidth = (projRatio / srcRatio);
    return { x: (1 - normWidth) / 2, y: 0, width: normWidth, height: 1 };
  }
  // Source taller — crop vertically, full width
  const normHeight = (srcRatio / projRatio);
  return { x: 0, y: (1 - normHeight) / 2, width: 1, height: normHeight };
}

export function cropToCss(crop: CropRegion): { clipPath: string } {
  const top = (crop.y * 100).toFixed(2);
  const left = (crop.x * 100).toFixed(2);
  const right = ((1 - (crop.x + crop.width)) * 100).toFixed(2);
  const bottom = ((1 - (crop.y + crop.height)) * 100).toFixed(2);
  return { clipPath: `inset(${top}% ${right}% ${bottom}% ${left}%)` };
}

// Preset helpers — each returns a new CropRegion matching the project aspect
// scaled to fit inside the source.
export function cropPreset(
  preset: 'full' | 'center' | 'left' | 'right' | 'top' | 'bottom',
  source: { w: number; h: number },
  aspect: Aspect
): CropRegion {
  const fit = defaultCropForAspect(source, aspect);
  switch (preset) {
    case 'full':
      // Ignore aspect lock for 'full' — returns letterboxed full frame.
      return { x: 0, y: 0, width: 1, height: 1 };
    case 'center':
      return fit;
    case 'left':
      return { ...fit, x: 0 };
    case 'right':
      return { ...fit, x: 1 - fit.width };
    case 'top':
      return { ...fit, y: 0 };
    case 'bottom':
      return { ...fit, y: 1 - fit.height };
  }
}
```

- [ ] **Step 3: Clean up `full` — round-trip it to the inner helper**

Note: `full` preset intentionally breaks aspect-lock (shows letterboxed); this is consistent with the design spec's "undefined = letterboxed to project aspect" but via an explicit full-frame crop. Actually for consistency, make the `full` preset mean "the aspect-locked fit" (i.e., what `center` returns). Delete the `case 'full'` override above and route it to `fit`:

```ts
case 'full':
  return fit;
```

- [ ] **Step 4: Run tests**

Run: `npm run test --workspace=packages/client`
Expected: PASS (3 crop tests + earlier tests). Total now 15.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/lib/crop.ts packages/client/src/lib/crop.test.ts
git commit -m "feat(lib): crop math (default fit, CSS inset, 6 presets) with tests"
```

### Task 9.2: CropOverlay component (presets only, no free-drag yet)

**Files:**
- Create: `packages/client/src/components/CropOverlay.tsx`

- [ ] **Step 1: Create CropOverlay.tsx (preset buttons + rectangle overlay)**

```tsx
import { useTranslation } from 'react-i18next';
import type { Clip, Project } from 'shared/types';
import { cropPreset, cropToCss } from '../lib/crop';

interface CropOverlayProps {
  clip: Clip;
  project: Project;
  onCropChange: (crop: Clip['crop']) => void;
}

const PRESETS: Array<{ key: 'center' | 'left' | 'right' | 'top' | 'bottom'; iconW: number; iconH: number; iconX: number; iconY: number }> = [
  { key: 'center', iconW: 12, iconH: 12, iconX: 4, iconY: 4 },
  { key: 'left', iconW: 10, iconH: 20, iconX: 0, iconY: 0 },
  { key: 'right', iconW: 10, iconH: 20, iconX: 10, iconY: 0 },
  { key: 'top', iconW: 20, iconH: 10, iconX: 0, iconY: 0 },
  { key: 'bottom', iconW: 20, iconH: 10, iconX: 0, iconY: 10 },
];

export default function CropOverlay({ clip, project, onCropChange }: CropOverlayProps) {
  const { t } = useTranslation();
  if (project.mode !== 'video' || !project.aspect || !clip.sourceWidth || !clip.sourceHeight) {
    return null;
  }

  const source = { w: clip.sourceWidth, h: clip.sourceHeight };
  const applyPreset = (p: typeof PRESETS[number]['key']) => {
    onCropChange(cropPreset(p, source, project.aspect!));
  };

  return (
    <div className="flex flex-wrap gap-2 mt-2">
      <span className="text-sm text-gray-600 self-center">{t('crop.presets')}:</span>
      {PRESETS.map((p) => (
        <button
          key={p.key}
          type="button"
          onClick={() => applyPreset(p.key)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 hover:border-primary-400 text-sm"
        >
          <span className="relative inline-block bg-gray-300" style={{ width: '20px', height: '20px' }}>
            <span
              className="absolute bg-primary-500"
              style={{
                left: `${p.iconX}px`,
                top: `${p.iconY}px`,
                width: `${p.iconW}px`,
                height: `${p.iconH}px`,
              }}
            />
          </span>
          {t(`crop.${p.key}`)}
        </button>
      ))}
    </div>
  );
}

export function videoCropStyle(clip: Clip): React.CSSProperties {
  if (!clip.crop) return {};
  return cropToCss(clip.crop);
}
```

- [ ] **Step 2: Apply live crop CSS to the per-clip `<video>`**

In `TrackEditor.tsx`'s `VideoEditor`:

```tsx
<video
  ref={bind}
  src={clip.url}
  className="w-full max-h-[400px] mx-auto"
  style={videoCropStyle(clip)}
/>
```

Add import: `import CropOverlay, { videoCropStyle } from './CropOverlay';`.

Below the `Controls` panel, insert:

```tsx
<CropOverlay
  clip={clip}
  project={project}
  onCropChange={(crop) => onUpdateClip({ ...clip, crop })}
/>
```

For this to work, `TrackEditor` needs a `project` prop. Add it to the interface and thread it down from `ProjectView`:

```tsx
// ProjectView.tsx
<TrackEditor project={project} clip={selected} ... />
```

```tsx
// TrackEditor.tsx interface
project: Project;
```

Pass `project` into `VideoEditor` too.

- [ ] **Step 3: Add i18n keys**

EN:

```json
"crop": {
  "presets": "Crop",
  "center": "Center",
  "left": "Left half",
  "right": "Right half",
  "top": "Top half",
  "bottom": "Bottom half"
}
```

HE:

```json
"crop": {
  "presets": "חיתוך",
  "center": "מרכז",
  "left": "חצי שמאלי",
  "right": "חצי ימני",
  "top": "חצי עליון",
  "bottom": "חצי תחתון"
}
```

- [ ] **Step 4: Build + smoke test**

Load an MP4, pick a project aspect different from the clip's source (e.g., 9:16 for a 16:9 video). Confirm:
  1. Preset buttons render below Controls.
  2. Clicking "Center" shows the centered crop via `clip-path` on the `<video>`.
  3. Clicking "Left half" shows the left-aligned crop.
  4. Clicking different aspects resets the crop as expected.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/components/CropOverlay.tsx packages/client/src/components/TrackEditor.tsx packages/client/src/components/ProjectView.tsx packages/client/src/i18n
git commit -m "feat(crop): preset crop buttons with live CSS clip-path preview"
```

### Task 9.3: Free-drag crop rectangle

**Files:**
- Modify: `packages/client/src/components/CropOverlay.tsx` — add the visible rectangle overlay with drag handles.

Defer complex drag math but include the full overlay so users see what they're cropping.

- [ ] **Step 1: Add a visible rectangle overlay on the video**

Change `CropOverlay` to render a positioned `<div>` overlay *inside* the video container (requires restructure: `VideoEditor` wraps `<video>` in `<div class="relative">` — already does). The overlay itself goes into `VideoEditor` alongside the video, not in `CropOverlay`. Split responsibilities:

- `CropOverlay` (existing) stays the preset buttons row.
- **New:** `CropRectangle` component rendered inside the video container by `VideoEditor`, positioned absolutely.

Create `packages/client/src/components/CropRectangle.tsx`:

```tsx
import { useRef } from 'react';
import type { Clip, Project } from 'shared/types';

interface CropRectangleProps {
  clip: Clip;
  project: Project;
  onCropChange: (crop: Clip['crop']) => void;
  onCropCommit: (crop: Clip['crop']) => void;
}

export default function CropRectangle({
  clip,
  project,
  onCropChange,
  onCropCommit,
}: CropRectangleProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  if (project.mode !== 'video' || !project.aspect || !clip.crop) return null;

  const crop = clip.crop;

  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const start = { ...crop };
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const onMove = (ev: MouseEvent) => {
      const dx = (ev.clientX - startX) / rect.width;
      const dy = (ev.clientY - startY) / rect.height;
      const next = {
        x: Math.max(0, Math.min(1 - start.width, start.x + dx)),
        y: Math.max(0, Math.min(1 - start.height, start.y + dy)),
        width: start.width,
        height: start.height,
      };
      onCropChange(next);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      onCropCommit(crop);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none"
    >
      <div
        onMouseDown={startDrag}
        className="absolute border-2 border-primary-400 cursor-move pointer-events-auto"
        style={{
          left: `${crop.x * 100}%`,
          top: `${crop.y * 100}%`,
          width: `${crop.width * 100}%`,
          height: `${crop.height * 100}%`,
          boxShadow: '0 0 0 9999px rgba(0,0,0,0.4)',
        }}
      />
    </div>
  );
}
```

This covers move-only. **Resize handles are deferred** — users can still resize by picking a different preset ("Full frame" → "Center" → "Left half" etc.), which covers 90% of cases. If free-resize is essential, a follow-up task can add 8 handles; the storage model and CSS math are already in place.

- [ ] **Step 2: Render CropRectangle inside the video container**

In `VideoEditor`, below the `<video>` and `<VideoFadeOverlay>`:

```tsx
<CropRectangle
  clip={clip}
  project={project}
  onCropChange={(crop) => onDragUpdateClip({ ...clip, crop })}
  onCropCommit={(crop) => onUpdateClip({ ...clip, crop })}
/>
```

Add import. Remove the `style={videoCropStyle(clip)}` from the `<video>` — the rectangle overlay replaces the live CSS clip during edit. **Actually:** keep the `clip-path` style on `<video>` so the darkened area outside the crop stays visible; the rectangle overlay *and* the clipped video together give the correct UI.

- [ ] **Step 3: Smoke test**

Load an MP4, apply "Center" crop, then drag the rectangle with the mouse. Confirm it moves smoothly and stays inside the video frame. Release — the change persists (is in undo history).

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/components/CropRectangle.tsx packages/client/src/components/TrackEditor.tsx
git commit -m "feat(crop): draggable crop rectangle overlay (move only)"
```

---

## Phase 10 — Project-time math (pure, well-tested)

### Task 10.1: project-time.ts + tests

**Files:**
- Create: `packages/client/src/lib/project-time.ts`
- Create: `packages/client/src/lib/project-time.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// project-time.test.ts
import { describe, it, expect } from 'vitest';
import { clipTrimmedDuration, projectDuration, projectTimeToClip, clipTimeToProject } from './project-time';
import type { Clip } from 'shared/types';

function fakeClip(id: string, start: number, end: number, speed = 1): Clip {
  return {
    id,
    name: id,
    file: null,
    url: '',
    type: 'audio',
    duration: end,
    trim: { start, end },
    effects: { volume: 1, fadeIn: 0, fadeOut: 0, speed, eqPreset: 'none' },
  };
}

describe('clipTrimmedDuration', () => {
  it('returns end-start divided by speed', () => {
    expect(clipTrimmedDuration(fakeClip('a', 1, 5, 1))).toBe(4);
    expect(clipTrimmedDuration(fakeClip('a', 1, 5, 2))).toBe(2);
    expect(clipTrimmedDuration(fakeClip('a', 0, 10, 0.5))).toBe(20);
  });
});

describe('projectDuration', () => {
  it('sums trimmed durations', () => {
    const clips = [fakeClip('a', 0, 10), fakeClip('b', 2, 5), fakeClip('c', 0, 3)];
    expect(projectDuration(clips)).toBe(10 + 3 + 3);
  });
});

describe('projectTimeToClip', () => {
  it('returns clip 0 at t=0', () => {
    const clips = [fakeClip('a', 0, 10), fakeClip('b', 0, 5)];
    expect(projectTimeToClip(clips, 0)).toEqual({ index: 0, clipId: 'a', localTime: 0 });
  });
  it('returns middle of clip 0', () => {
    const clips = [fakeClip('a', 0, 10), fakeClip('b', 0, 5)];
    expect(projectTimeToClip(clips, 5)).toEqual({ index: 0, clipId: 'a', localTime: 5 });
  });
  it('crosses boundary into clip 1', () => {
    const clips = [fakeClip('a', 0, 10), fakeClip('b', 0, 5)];
    expect(projectTimeToClip(clips, 12)).toEqual({ index: 1, clipId: 'b', localTime: 2 });
  });
  it('respects trim.start when mapping to clip local time', () => {
    // b is trimmed 2..5, so project t=10 is clip b localTime 0 → element currentTime = 2
    const clips = [fakeClip('a', 0, 10), fakeClip('b', 2, 5)];
    expect(projectTimeToClip(clips, 10)).toEqual({ index: 1, clipId: 'b', localTime: 0 });
  });
  it('clamps past-end to last clip end', () => {
    const clips = [fakeClip('a', 0, 10), fakeClip('b', 0, 5)];
    expect(projectTimeToClip(clips, 999)).toEqual({ index: 1, clipId: 'b', localTime: 5 });
  });
  it('accounts for speed (half-speed clip = doubled project duration)', () => {
    const clips = [fakeClip('a', 0, 10, 0.5)]; // trimmed duration = 20
    expect(projectTimeToClip(clips, 10)).toEqual({ index: 0, clipId: 'a', localTime: 5 });
  });
});

describe('clipTimeToProject', () => {
  it('maps clip local time back to project time', () => {
    const clips = [fakeClip('a', 0, 10), fakeClip('b', 2, 5)];
    expect(clipTimeToProject(clips, 1, 1)).toBe(10 + 1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=packages/client`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement project-time.ts**

```ts
import type { Clip } from 'shared/types';

export function clipTrimmedDuration(clip: Clip): number {
  const raw = Math.max(0, clip.trim.end - clip.trim.start);
  const speed = clip.effects.speed || 1;
  return raw / speed;
}

export function projectDuration(clips: readonly Clip[]): number {
  return clips.reduce((sum, c) => sum + clipTrimmedDuration(c), 0);
}

export interface ProjectTimeMapping {
  index: number;
  clipId: string;
  localTime: number; // absolute currentTime on the media element (includes trim.start offset, divided by speed)
}

export function projectTimeToClip(
  clips: readonly Clip[],
  projectTime: number
): ProjectTimeMapping {
  if (clips.length === 0) {
    return { index: 0, clipId: '', localTime: 0 };
  }
  let elapsed = 0;
  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    const dur = clipTrimmedDuration(clip);
    if (projectTime <= elapsed + dur || i === clips.length - 1) {
      const offsetWithinClip = Math.min(dur, Math.max(0, projectTime - elapsed));
      const speed = clip.effects.speed || 1;
      const localTime = clip.trim.start + offsetWithinClip * speed;
      return { index: i, clipId: clip.id, localTime };
    }
    elapsed += dur;
  }
  // Unreachable due to i === length-1 guard
  return { index: clips.length - 1, clipId: clips[clips.length - 1].id, localTime: 0 };
}

export function clipTimeToProject(
  clips: readonly Clip[],
  clipIndex: number,
  offsetWithinTrim: number
): number {
  let before = 0;
  for (let i = 0; i < clipIndex; i++) before += clipTrimmedDuration(clips[i]);
  return before + offsetWithinTrim;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=packages/client`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/lib/project-time.ts packages/client/src/lib/project-time.test.ts
git commit -m "feat(lib): project-time math with full test coverage"
```

---

## Phase 11 — Master timeline + project playback engine

Large phase, split into three tasks.

### Task 11.1: Playback engine hook (skeleton — single-clip passthrough)

**Files:**
- Create: `packages/client/src/lib/playback-engine.ts`

Goal: a React hook that owns project-wide play state. Starts as a thin wrapper that, when there's one clip, just plays that clip. Multi-clip handoff is added in 11.2.

- [ ] **Step 1: Create the hook**

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Project } from 'shared/types';
import { projectDuration, projectTimeToClip } from './project-time';

export interface PlaybackEngine {
  isPlaying: boolean;
  projectTime: number;
  projectDuration: number;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seek: (projectTime: number) => void;
  // The active clip's <video>/<audio> ref should be attached to the element in the DOM.
  bindActiveElement: (el: HTMLMediaElement | null) => void;
  activeClipId: string;
}

export function usePlaybackEngine(project: Project): PlaybackEngine {
  const [projectTime, setProjectTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const elementsRef = useRef<Map<string, HTMLMediaElement>>(new Map());
  const rafRef = useRef<number | null>(null);
  const startWallRef = useRef<number>(0);
  const startProjectRef = useRef<number>(0);

  const total = projectDuration(project.clips);
  const mapping = projectTimeToClip(project.clips, projectTime);
  const activeClipId = mapping.clipId;

  const bindActiveElement = useCallback((el: HTMLMediaElement | null) => {
    if (!el) {
      elementsRef.current.delete(activeClipId);
      return;
    }
    elementsRef.current.set(activeClipId, el);
  }, [activeClipId]);

  const sync = useCallback(() => {
    const el = elementsRef.current.get(activeClipId);
    if (!el) return;
    const clip = project.clips[mapping.index];
    if (!clip) return;
    // Seek element to mapping.localTime if it's off by more than 150 ms
    if (Math.abs(el.currentTime - mapping.localTime) > 0.15) {
      el.currentTime = mapping.localTime;
    }
    el.playbackRate = clip.effects.speed || 1;
    el.volume = Math.max(0, Math.min(1, clip.effects.volume || 1));
  }, [activeClipId, mapping.index, mapping.localTime, project.clips]);

  useEffect(() => { sync(); }, [sync]);

  const tick = useCallback(() => {
    const now = performance.now();
    const elapsed = (now - startWallRef.current) / 1000;
    const nextProjectTime = startProjectRef.current + elapsed;
    if (nextProjectTime >= total) {
      setProjectTime(total);
      setIsPlaying(false);
      const el = elementsRef.current.get(activeClipId);
      el?.pause();
      return;
    }
    setProjectTime(nextProjectTime);
    rafRef.current = requestAnimationFrame(tick);
  }, [total, activeClipId]);

  const play = useCallback(() => {
    if (total === 0) return;
    const el = elementsRef.current.get(activeClipId);
    if (!el) return;
    startWallRef.current = performance.now();
    startProjectRef.current = projectTime >= total ? 0 : projectTime;
    setIsPlaying(true);
    el.play().catch(() => setIsPlaying(false));
    rafRef.current = requestAnimationFrame(tick);
  }, [activeClipId, projectTime, total, tick]);

  const pause = useCallback(() => {
    const el = elementsRef.current.get(activeClipId);
    el?.pause();
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    setIsPlaying(false);
  }, [activeClipId]);

  const toggle = useCallback(() => {
    if (isPlaying) pause();
    else play();
  }, [isPlaying, pause, play]);

  const seek = useCallback((t: number) => {
    const clamped = Math.max(0, Math.min(total, t));
    setProjectTime(clamped);
    startProjectRef.current = clamped;
    startWallRef.current = performance.now();
  }, [total]);

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  return {
    isPlaying,
    projectTime,
    projectDuration: total,
    play,
    pause,
    toggle,
    seek,
    bindActiveElement,
    activeClipId,
  };
}
```

This is intentionally simple: the hook tracks one "active" element at a time. For a multi-clip project it auto-switches when projectTime crosses a boundary (because `activeClipId` re-derives from `projectTime`). Gapless transition (preloading the next clip) is a polish task (11.2).

### Task 11.2: Multi-clip handoff

**Files:**
- Modify: `packages/client/src/lib/playback-engine.ts`

- [ ] **Step 1: Add boundary handling**

When `projectTime` crosses a clip boundary, pause the old active element, start the new one at its `trim.start`, and schedule the next. Add to `tick`:

```ts
// Inside tick(), after computing nextProjectTime:
const nextMapping = projectTimeToClip(project.clips, nextProjectTime);
if (nextMapping.clipId !== activeClipId) {
  const oldEl = elementsRef.current.get(activeClipId);
  oldEl?.pause();
  // Defer new element start to next effect pass — changing activeClipId via setProjectTime
  // triggers re-bind, and the sync effect will seek + play it.
}
```

And extend the sync effect to *also* call `.play()` if `isPlaying` is true:

```ts
useEffect(() => {
  const el = elementsRef.current.get(activeClipId);
  if (!el) return;
  sync();
  if (isPlaying) el.play().catch(() => {});
}, [activeClipId, isPlaying, sync]);
```

- [ ] **Step 2: Preload the next clip**

Above the return, compute the next clip:

```ts
const nextIndex = mapping.index + 1;
const nextClip = project.clips[nextIndex];
```

Expose a `nextClipId` from the engine so `ProjectView` can mount a hidden `<video preload="auto">` or `<audio preload="auto">` for that clip. This hidden element isn't bound to the engine; it's purely for browser preload.

Add to the return: `nextClipId: nextClip?.id ?? ''`.

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/lib/playback-engine.ts
git commit -m "feat(playback): multi-clip handoff + preload hint"
```

### Task 11.3: MasterTimeline component

**Files:**
- Create: `packages/client/src/components/MasterTimeline.tsx`

- [ ] **Step 1: Create MasterTimeline.tsx**

```tsx
import { useRef } from 'react';
import type { Clip } from 'shared/types';
import { clipTrimmedDuration, projectDuration } from '../lib/project-time';

interface MasterTimelineProps {
  clips: Clip[];
  projectTime: number;
  isPlaying: boolean;
  onSeek: (t: number) => void;
  onToggle: () => void;
}

export default function MasterTimeline({
  clips,
  projectTime,
  isPlaying,
  onSeek,
  onToggle,
}: MasterTimelineProps) {
  const barRef = useRef<HTMLDivElement | null>(null);
  const total = projectDuration(clips);

  const seekFromClick = (e: React.MouseEvent) => {
    const rect = barRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pct = (e.clientX - rect.left) / rect.width;
    onSeek(pct * total);
  };

  const playheadPct = total > 0 ? (projectTime / total) * 100 : 0;

  let accum = 0;
  const boundaries: number[] = [];
  for (let i = 0; i < clips.length - 1; i++) {
    accum += clipTrimmedDuration(clips[i]);
    boundaries.push((accum / total) * 100);
  }

  return (
    <div className="flex items-center gap-3 w-full">
      <button
        type="button"
        onClick={onToggle}
        className="w-10 h-10 rounded-full bg-primary-600 text-white flex items-center justify-center"
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? '❚❚' : '▶'}
      </button>
      <div
        ref={barRef}
        onClick={seekFromClick}
        className="flex-1 h-8 bg-gray-200 rounded-lg relative cursor-pointer select-none"
      >
        {boundaries.map((pct, i) => (
          <div
            key={i}
            className="absolute top-0 bottom-0 w-px bg-gray-500"
            style={{ left: `${pct}%` }}
          />
        ))}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-primary-600"
          style={{ left: `${playheadPct}%` }}
        />
      </div>
      <span className="font-mono text-sm text-gray-600 w-24 text-right">
        {formatTime(projectTime)} / {formatTime(total)}
      </span>
    </div>
  );
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, '0')}`;
}
```

### Task 11.4: Wire playback engine + MasterTimeline into ProjectView

**Files:**
- Modify: `packages/client/src/components/ProjectView.tsx`
- Modify: `packages/client/src/components/TrackEditor.tsx` (expose a way to bind engine to the media element)

- [ ] **Step 1: Refactor TrackEditor to accept a media-element ref callback**

Add `engineBind` prop to `TrackEditor`:

```tsx
interface TrackEditorProps {
  // ... existing ...
  engineBind?: (el: HTMLMediaElement | null) => void;
}
```

Inside `AudioEditor`/`VideoEditor`, call `engineBind?.(el)` in the `useWaveSurfer`/`useVideoPlayer` setup. **Simpler:** add a direct ref callback to the `<audio>`/`<video>` element, *in addition to* the existing `bind` from the hook. Example for `VideoEditor`:

```tsx
<video
  ref={(el) => { bind(el); engineBind?.(el); }}
  src={clip.url}
  ...
/>
```

For `AudioEditor`, the audio actually plays through `useWaveSurfer`. For engine binding we need a separate hidden `<audio>` element controlled by the engine *instead of* wavesurfer's audio during playback. Simplest working approach: keep wavesurfer for visualization, but route the engine's play control through a hidden `<audio>` element for that clip:

```tsx
// Inside AudioEditor body:
<audio
  ref={(el) => engineBind?.(el)}
  src={clip.url}
  style={{ display: 'none' }}
/>
```

This audio element plays; wavesurfer stays as a visual-only waveform. Trade-off: the waveform doesn't scrub during engine playback. Acceptable for v1; can be revisited.

- [ ] **Step 2: Use the engine inside ProjectView**

```tsx
import MasterTimeline from './MasterTimeline';
import { usePlaybackEngine } from '../lib/playback-engine';

// inside ProjectView:
const engine = usePlaybackEngine(project);

// Spacebar toggles
useEffect(() => {
  const h = (e: KeyboardEvent) => {
    if (e.code === 'Space' && e.target === document.body) {
      e.preventDefault();
      engine.toggle();
    }
  };
  window.addEventListener('keydown', h);
  return () => window.removeEventListener('keydown', h);
}, [engine]);

// Resolve the selected clip as the one the engine is on (overrides manual selection while playing)
const displayedClipId = engine.isPlaying ? engine.activeClipId : selectedId;
const displayed = project.clips.find((c) => c.id === displayedClipId) ?? project.clips[0];
```

Render the master timeline above the grid:

```tsx
<MasterTimeline
  clips={project.clips}
  projectTime={engine.projectTime}
  isPlaying={engine.isPlaying}
  onSeek={engine.seek}
  onToggle={engine.toggle}
/>
```

Pass `engineBind` into the editor:

```tsx
<TrackEditor
  project={project}
  clip={displayed}
  engineBind={
    displayed.id === engine.activeClipId ? engine.bindActiveElement : undefined
  }
  // ... other props unchanged
/>
```

- [ ] **Step 3: Hidden preload element for next clip**

Below the grid:

```tsx
{engine.nextClipId && (() => {
  const nc = project.clips.find((c) => c.id === engine.nextClipId);
  if (!nc) return null;
  return project.mode === 'audio' ? (
    <audio src={nc.url} preload="auto" style={{ display: 'none' }} />
  ) : (
    <video src={nc.url} preload="auto" style={{ display: 'none' }} muted />
  );
})()}
```

- [ ] **Step 4: Smoke test**

Load 2 clips (same type). Click the play button on the master timeline. Expected:
  1. Playback starts from the playhead.
  2. Boundaries between clips are visible on the timeline bar.
  3. When clip 1 ends, clip 2 automatically begins (brief ≤ 200 ms glitch is acceptable for v1).
  4. Spacebar pauses/plays.
  5. Clicking the bar seeks across clips.
  6. Speed slider changes the playback rate live.
  7. Effects preserved across clip switches.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/lib/playback-engine.ts packages/client/src/components/MasterTimeline.tsx packages/client/src/components/ProjectView.tsx packages/client/src/components/TrackEditor.tsx
git commit -m "feat(playback): master timeline + project-wide live playback"
```

---

## Phase 12 — Merged export

### Task 12.1: FFmpeg arg builders (per-clip normalize + concat)

**Files:**
- Modify: `packages/client/src/lib/ffmpeg-commands.ts`
- Create: `packages/client/src/lib/ffmpeg-commands.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// ffmpeg-commands.test.ts
import { describe, it, expect } from 'vitest';
import { buildNormalizeArgs, buildConcatArgs } from './ffmpeg-commands';
import type { Clip, Project } from 'shared/types';

function audioClip(overrides: Partial<Clip> = {}): Clip {
  return {
    id: 'c1',
    name: 'a.mp3',
    file: null,
    url: '',
    type: 'audio',
    duration: 10,
    trim: { start: 0, end: 10 },
    effects: { volume: 1, fadeIn: 0, fadeOut: 0, speed: 1, eqPreset: 'none' },
    ...overrides,
  };
}

describe('buildNormalizeArgs (audio)', () => {
  it('includes trim, audio codec libmp3lame, 44100 Hz stereo', () => {
    const project: Project = { id: 'p', mode: 'audio', clips: [] };
    const clip = audioClip({ trim: { start: 1, end: 9 } });
    const args = buildNormalizeArgs(clip, project);
    expect(args).toContain('-ss');
    expect(args).toContain('1.000');
    expect(args).toContain('-to');
    expect(args).toContain('9.000');
    expect(args).toContain('-ar');
    expect(args).toContain('44100');
    expect(args).toContain('-ac');
    expect(args).toContain('2');
    expect(args).toContain('-c:a');
    expect(args).toContain('libmp3lame');
  });
});

describe('buildNormalizeArgs (video)', () => {
  it('includes crop + scale to output dims + AAC 48000 stereo', () => {
    const project: Project = { id: 'p', mode: 'video', aspect: '16:9', clips: [] };
    const clip: Clip = {
      ...audioClip(),
      type: 'video',
      crop: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
      sourceWidth: 1920,
      sourceHeight: 1080,
    };
    const args = buildNormalizeArgs(clip, project);
    const vf = args[args.indexOf('-vf') + 1];
    expect(vf).toContain('crop=');
    expect(vf).toContain('scale=1920:1080');
    expect(args).toContain('-c:a');
    expect(args).toContain('aac');
    expect(args).toContain('-ar');
    expect(args).toContain('48000');
  });
});

describe('buildConcatArgs', () => {
  it('produces concat demuxer args', () => {
    const args = buildConcatArgs(['clip_0.mp3', 'clip_1.mp3'], 'output.mp3');
    expect(args).toEqual(['-f', 'concat', '-safe', '0', '-i', 'list.txt', '-c', 'copy', 'output.mp3']);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test --workspace=packages/client`
Expected: FAIL — helpers don't exist yet.

- [ ] **Step 3: Implement builders**

Append to `ffmpeg-commands.ts`:

```ts
import type { Project } from 'shared/types';
import { outputDimensions } from './aspect';

/**
 * Build args for the per-clip normalize pass. Input is the clip's source file;
 * output is a clip_N.<ext> file that matches the project's common format.
 */
export function buildNormalizeArgs(clip: Clip, project: Project): string[] {
  const args: string[] = [];

  // Trim
  if (clip.trim.start > 0) args.push('-ss', clip.trim.start.toFixed(3));
  if (clip.trim.end < clip.duration) args.push('-to', clip.trim.end.toFixed(3));

  const { effects } = clip;
  const audioFilters: string[] = [];
  const videoFilters: string[] = [];

  if (effects.volume !== 1) audioFilters.push(`volume=${effects.volume.toFixed(2)}`);

  if (effects.fadeIn > 0) {
    audioFilters.push(`afade=t=in:st=0:d=${effects.fadeIn.toFixed(2)}`);
  }
  if (effects.fadeOut > 0) {
    const trimmed = clip.trim.end - clip.trim.start;
    const st = Math.max(0, trimmed - effects.fadeOut);
    audioFilters.push(`afade=t=out:st=${st.toFixed(2)}:d=${effects.fadeOut.toFixed(2)}`);
  }
  if (effects.speed !== 1) audioFilters.push(`atempo=${effects.speed.toFixed(2)}`);

  switch (effects.eqPreset) {
    case 'bass-boost':
      audioFilters.push('equalizer=f=100:width_type=o:width=2:g=6');
      break;
    case 'vocal-clarity':
      audioFilters.push('equalizer=f=3000:width_type=o:width=1.5:g=4');
      break;
    case 'treble-boost':
      audioFilters.push('equalizer=f=8000:width_type=o:width=2:g=5');
      break;
  }

  if (project.mode === 'video') {
    if (!project.aspect) throw new Error('video project must have aspect set');
    const { w, h } = outputDimensions(project.aspect);
    // Crop
    if (clip.crop && clip.sourceWidth && clip.sourceHeight) {
      const cx = Math.round(clip.crop.x * clip.sourceWidth);
      const cy = Math.round(clip.crop.y * clip.sourceHeight);
      const cw = Math.round(clip.crop.width * clip.sourceWidth);
      const ch = Math.round(clip.crop.height * clip.sourceHeight);
      videoFilters.push(`crop=${cw}:${ch}:${cx}:${cy}`);
    }
    // Scale + letterbox to exact output dims
    videoFilters.push(`scale=${w}:${h}:force_original_aspect_ratio=decrease`);
    videoFilters.push(`pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black`);
    videoFilters.push(`setsar=1`);
    // Speed: use setpts. speed=2 → 0.5*PTS.
    if (effects.speed !== 1) {
      videoFilters.push(`setpts=${(1 / effects.speed).toFixed(4)}*PTS`);
    }
  }

  if (audioFilters.length > 0) args.push('-af', audioFilters.join(','));
  if (videoFilters.length > 0) args.push('-vf', videoFilters.join(','));

  if (project.mode === 'audio') {
    args.push('-c:a', 'libmp3lame', '-ar', '44100', '-ac', '2', '-q:a', '2');
  } else {
    args.push(
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
      '-c:a', 'aac', '-ar', '48000', '-ac', '2', '-b:a', '128k'
    );
  }

  return args;
}

export function buildConcatArgs(inputFiles: string[], outputName: string): string[] {
  // inputFiles is passed so callers can validate; the actual list is read from
  // 'list.txt' which the caller must write to the FFmpeg virtual FS first.
  void inputFiles;
  return ['-f', 'concat', '-safe', '0', '-i', 'list.txt', '-c', 'copy', outputName];
}
```

- [ ] **Step 4: Run tests**

Run: `npm run test --workspace=packages/client`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/lib/ffmpeg-commands.ts packages/client/src/lib/ffmpeg-commands.test.ts
git commit -m "feat(ffmpeg): normalize + concat arg builders with tests"
```

### Task 12.2: Concat export pipeline

**Files:**
- Create: `packages/client/src/lib/concat-export.ts`
- Modify: `packages/client/src/hooks/useFFmpeg.ts` (expose a lower-level `run` that doesn't auto-delete input)

- [ ] **Step 1: Add raw `run` to useFFmpeg hook**

In `useFFmpeg.ts`, add a new exposed method `run(args)` that runs an already-set-up command without managing files:

```ts
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
  try { await ffmpeg.deleteFile(name); } catch { /* ignore */ }
}, []);
```

Return `{ ...state, load, exec, run, writeFile, readFile, deleteFile }`.

- [ ] **Step 2: Create concat-export.ts**

```ts
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

  const steps = project.clips.length + 1;
  const bump = (i: number) => onProgress?.(Math.round((i / steps) * 100));

  for (let i = 0; i < project.clips.length; i++) {
    const clip = project.clips[i];
    if (!clip.file) throw new Error(`clip_${i}_missing_file`);

    const inputName = `input_${i}.${clip.type === 'audio' ? 'mp3' : 'mp4'}`;
    const outName = `clip_${i}.${ext}`;

    try {
      await deps.writeFile(inputName, clip.file);
      const args = ['-i', inputName, ...buildNormalizeArgs(clip, project), outName];
      await deps.run(args);
    } catch (e) {
      throw new Error(`clip_${i}_normalize_failed: ${(e as Error).message}`);
    } finally {
      await deps.deleteFile(inputName);
    }

    normalized.push(outName);
    bump(i + 1);
  }

  // Write concat list
  const listBody = normalized.map((f) => `file '${f}'`).join('\n') + '\n';
  await deps.writeFile('list.txt', new TextEncoder().encode(listBody));

  const outFile = `output.${ext}`;
  try {
    await deps.run(buildConcatArgs(normalized, outFile));
  } catch (e) {
    throw new Error(`concat_failed: ${(e as Error).message}`);
  }

  const data = await deps.readFile(outFile);

  // Cleanup
  await deps.deleteFile('list.txt');
  await deps.deleteFile(outFile);
  for (const f of normalized) await deps.deleteFile(f);

  bump(steps);

  const blob = new Blob([data.buffer as ArrayBuffer], { type: mime });
  return { blob, filename: `merged.${ext}` };
}
```

### Task 12.3: Wire ExportButton at project level

**Files:**
- Modify: `packages/client/src/components/ExportButton.tsx`
- Modify: `packages/client/src/components/ProjectView.tsx`
- Modify: `packages/client/src/components/TrackEditor.tsx` (remove the export row)

- [ ] **Step 1: Rewrite ExportButton**

```tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Project } from 'shared/types';
import { useFFmpeg } from '../hooks/useFFmpeg';
import { exportProject } from '../lib/concat-export';

interface ExportButtonProps {
  project: Project;
}

export default function ExportButton({ project }: ExportButtonProps) {
  const { t } = useTranslation();
  const { loaded, loading, load, run, writeFile, readFile, deleteFile } = useFFmpeg();
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    setError(null);
    if (!loaded) {
      await load();
      return;
    }
    setExporting(true);
    setProgress(0);
    try {
      const { blob, filename } = await exportProject(
        project,
        { run, writeFile, readFile, deleteFile },
        setProgress
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes('normalize_failed')) setError(t('export.clipFailed'));
      else if (msg.includes('concat_failed')) setError(t('export.concatFailed'));
      else if (msg.toLowerCase().includes('memory')) setError(t('export.tooLarge'));
      else setError(t('export.failed'));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        onClick={handleExport}
        disabled={loading || exporting || project.clips.length === 0}
        className={`
          px-8 py-4 rounded-xl text-lg font-bold transition-all
          ${
            loading || exporting
              ? 'bg-gray-300 text-gray-500 cursor-wait'
              : 'bg-primary-600 hover:bg-primary-700 text-white shadow-lg hover:shadow-xl active:scale-95'
          }
        `}
      >
        {loading
          ? t('editor.loadingFFmpeg')
          : exporting
            ? `${t('editor.exporting')} ${progress}%`
            : !loaded
              ? t('editor.loadingFFmpeg')
              : t('export.download')}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Remove per-clip ExportButton from TrackEditor**

In `TrackEditor.tsx`, delete both export rows (in `AudioEditor` and `VideoEditor`). Also remove the top "back" button — that moves to `ProjectView` later, or just leaves a "Back" button on `ProjectView` separately.

- [ ] **Step 3: Render the project-level export row in ProjectView**

Below the grid, add:

```tsx
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
```

- [ ] **Step 4: Add error/label i18n keys**

EN:

```json
"export": {
  "download": "Download merged file",
  "clipFailed": "A clip failed to process — try replacing it",
  "concatFailed": "Merging clips failed. Please retry.",
  "tooLarge": "Project too large — try shorter clips or fewer of them",
  "failed": "Export failed"
}
```

HE:

```json
"export": {
  "download": "הורדת קובץ ממוזג",
  "clipFailed": "קליפ נכשל בעיבוד — נסו להחליף אותו",
  "concatFailed": "מיזוג הקליפים נכשל. נסו שוב.",
  "tooLarge": "הפרויקט גדול מדי — נסו קליפים קצרים יותר או פחות קליפים",
  "failed": "הייצוא נכשל"
}
```

- [ ] **Step 5: Build + smoke test**

Load 2 audio clips. Click Export. Confirm:
  1. Loading indicator → progress updates → downloads `merged.mp3`.
  2. Open the file and confirm it plays both clips back-to-back with effects applied.

Repeat with 2 video clips with different crops.

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/lib/concat-export.ts packages/client/src/hooks/useFFmpeg.ts packages/client/src/components/ExportButton.tsx packages/client/src/components/ProjectView.tsx packages/client/src/components/TrackEditor.tsx packages/client/src/i18n
git commit -m "feat(export): project-level merged export via normalize + concat"
```

---

## Phase 13 — Polish + back button + cleanup

### Task 13.1: Back button + "Need more tools?" rename

**Files:**
- Modify: `packages/client/src/components/ProjectView.tsx`
- Modify: `packages/client/src/i18n/*.json`

- [ ] **Step 1: Add back button at the top of ProjectView**

```tsx
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
```

Place above the master timeline.

- [ ] **Step 2: Rename the advanced-editor label**

In both i18n files: change `editor.advancedEditor` from "Advanced editor ↗" / "עריכה מתקדמת ↗" to "Need more tools? →" / "צריכים עוד כלים? →".

- [ ] **Step 3: Add discardConfirm i18n**

EN: `"discardConfirm": "Discard this project and start over?"`
HE: `"discardConfirm": "למחוק את הפרויקט ולהתחיל מחדש?"`

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/components/ProjectView.tsx packages/client/src/i18n
git commit -m "feat(project): back button with discard confirm + rename advanced-editor link"
```

### Task 13.2: Soft size warning

**Files:**
- Modify: `packages/client/src/components/ProjectView.tsx`

- [ ] **Step 1: Show a warning above the export button when total project size > 500 MB**

```tsx
const totalSize = project.clips.reduce((s, c) => s + (c.file?.size ?? 0), 0);
const WARN_SIZE = 500 * 1024 * 1024;

{totalSize > WARN_SIZE && (
  <p className="text-sm text-amber-600 text-center">{t('project.sizeWarning')}</p>
)}
```

EN: `"sizeWarning": "This project is large. Export may be slow or may run out of memory."`
HE: `"sizeWarning": "הפרויקט גדול. הייצוא עלול להיות איטי או להיכשל בזיכרון."`

- [ ] **Step 2: Commit**

```bash
git add packages/client/src/components/ProjectView.tsx packages/client/src/i18n
git commit -m "feat(project): soft 500MB size warning"
```

### Task 13.3: Final lint + build pass

- [ ] **Step 1: Run full build**

Run: `npm run build --workspace=packages/client`
Expected: Success, no type errors.

- [ ] **Step 2: Run full test suite**

Run: `npm run test --workspace=packages/client`
Expected: all PASS (array-move, aspect, crop, project-time, ffmpeg-commands — ~25 tests).

- [ ] **Step 3: Full manual smoke test**

End-to-end in the browser at http://localhost:5174/:
  1. Audio project: 2 MP3 clips → adjust trim + fade + EQ on each → play through → export → verify output.
  2. Video project: 2 MP4 clips → pick 9:16 aspect → crop each with a different preset → play through → export → verify output.
  3. Undo/redo: reorder clips, remove a clip, change an effect — undo returns each to the prior state.
  4. Type-guard: try to drop an MP3 into a video project — rejected.
  5. YouTube: paste a URL, fetch, confirm it adds to the project with the correct mode.

- [ ] **Step 4: Commit any last fixes**

If step 3 surfaces issues, fix and commit each one.

---

## Self-review checklist (run AFTER writing this plan)

Spec coverage:
- ✅ Data model (Phase 2)
- ✅ Pitch removal (Phase 3)
- ✅ Track→Clip rename (Phase 4)
- ✅ Project wrapper state (Phase 5)
- ✅ ProjectView shell (Phase 6)
- ✅ Clip list / add / remove / reorder (Phase 7)
- ✅ Type-guard on add-clip (Phase 7)
- ✅ Aspect picker with shape icons + friendly labels (Phase 8)
- ✅ Aspect auto-pick on first clip (Phase 8)
- ✅ Aspect change with confirm + reset crops (Phase 8)
- ✅ Crop math + tests (Phase 9)
- ✅ Crop preset buttons (Phase 9)
- ✅ Crop rectangle overlay with move drag (Phase 9) — **resize handles deferred; flagged in plan**
- ✅ Project-time math + tests (Phase 10)
- ✅ Playback engine (Phase 11)
- ✅ Master timeline (Phase 11)
- ✅ Next-clip preload hint (Phase 11)
- ✅ Spacebar (Phase 11)
- ✅ Normalize + concat arg builders + tests (Phase 12)
- ✅ Export pipeline + progress + errors (Phase 12)
- ✅ Back button / discard confirm (Phase 13)
- ✅ Size warning (Phase 13)
- ✅ i18n keys for all new UI (Phases 6–13)

Deferred with note:
- **Free-resize 8-handle crop.** Plan ships move-only; preset buttons cover resize. Noted in Phase 9.3.

Type consistency: `Clip`, `Project`, `Aspect`, `CropRegion` used consistently. `ProjectMode` used consistently. `buildNormalizeArgs(clip, project)` and `buildConcatArgs(inputFiles, outputName)` signatures stable across tasks.

No placeholders: no "TBD", no "add appropriate error handling", no "similar to Task N". Each step has the actual code.
