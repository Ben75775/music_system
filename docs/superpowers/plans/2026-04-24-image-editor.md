# Image Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third landing-page flow parallel to audio/video that lets the user drop an image, pan/zoom into a fixed 1034×1379 crop frame, and download the cropped PNG.

**Architecture:** Image flow is entirely client-side and isolated from the multi-clip project system. MIME routing in `FileInput.tsx` dispatches images to a new `ImageEditor` component. Pan/zoom happen via CSS transforms in the preview; export uses an off-screen canvas with identical transform math. Pure math (`baseCoverScale`, `clampOffset`) lives in a vitest-covered module.

**Tech Stack:** React + TypeScript, Vite, i18next, vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-04-24-image-editor-design.md`

---

## Spec deviation noted up front

The spec listed three pure functions: `baseCoverScale`, `clampOffset`, `computeSourceRect`. This plan drops `computeSourceRect` because a rotated "source rectangle" is not a rectangle in the source's native coordinate space — `drawImage`'s 9-argument form cannot express a rotated source region. Instead, **both the preview and the export use identical transform sequences** (translate → rotate → scale → draw image centered). Math stays pure and testable; rotation handled by the canvas (and CSS) transform stack.

---

## File Structure

### New files
- `packages/client/src/lib/image-fit.ts` — pure math: `FRAME_W`, `FRAME_H`, `baseCoverScale`, `clampOffset`
- `packages/client/src/lib/image-fit.test.ts` — vitest
- `packages/client/src/lib/image-export.ts` — `exportImage(edit)` → PNG Blob; `downloadBlob(blob, filename)`
- `packages/client/src/components/ImageEditor.tsx` — the editor

### Modified files
- `shared/types.ts` — add `ImageEdit` interface
- `packages/client/src/components/FileInput.tsx` — image MIME branching, new `onImageReady` prop
- `packages/client/src/App.tsx` — add parallel `imageHistory`; 3-way route
- `packages/client/src/i18n/en.json` — new `image` section
- `packages/client/src/i18n/he.json` — new `image` section

### Transform convention (load-bearing — preview and export must match exactly)

For an `ImageEdit = { naturalWidth: W, naturalHeight: H, rotation: r, scale: s, offsetX: ox, offsetY: oy }`:

1. Translate by `(FRAME_W/2 + ox, FRAME_H/2 + oy)` — place the image center at the frame center, shifted by the user's offset.
2. Rotate by `r` degrees.
3. Scale by `baseCoverScale(W, H, r) * s`.
4. Draw the image centered at the local origin, i.e. `drawImage(img, -W/2, -H/2, W, H)`. In CSS this is the default when `transform-origin: center` and the image element is the same size as the natural pixels.

**Offset sign convention:** positive `offsetX` moves the image to the right in screen space; positive `offsetY` moves it down. Applied *after* rotation, so offsets are always in screen coordinates — what the user sees.

---

## Phase 1 — Routing + state

### Task 1.1: Add ImageEdit type, route images through FileInput, wire parallel history in App

**Files:**
- Modify: `shared/types.ts`
- Modify: `packages/client/src/components/FileInput.tsx`
- Modify: `packages/client/src/App.tsx`
- Modify: `packages/client/src/i18n/en.json`
- Modify: `packages/client/src/i18n/he.json`

- [ ] **Step 1: Add the ImageEdit interface to `shared/types.ts`**

Append to the end of `shared/types.ts` (after the existing `Project` type and `DEFAULT_EFFECTS` export):

```ts
export interface ImageEdit {
  /** Object URL for the source image. */
  src: string;
  /** Original filename without extension (used as export filename stem). */
  name: string;
  /** Intrinsic width of the source image in CSS pixels. */
  naturalWidth: number;
  /** Intrinsic height of the source image in CSS pixels. */
  naturalHeight: number;
  /** User zoom multiplier on top of base cover scale. 1.0 = exact cover; min 1, max 8. */
  scale: number;
  /** Screen-space horizontal offset in source pixels. 0 = centered. */
  offsetX: number;
  /** Screen-space vertical offset in source pixels. 0 = centered. */
  offsetY: number;
  /** Quadrant rotation applied before scale, in degrees. */
  rotation: 0 | 90 | 180 | 270;
}
```

- [ ] **Step 2: Update `FileInput.tsx` to route image MIMEs to `onImageReady`**

Replace the current `FileInputProps` and the MIME/type-detection section. Full replacement for the top of the file through the `processFile` callback:

```tsx
import { useState, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { Clip, ImageEdit } from 'shared/types';
import { DEFAULT_EFFECTS } from 'shared/types';

const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200MB
const AV_TYPES = ['audio/mpeg', 'audio/mp3', 'video/mp4'];
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

interface FileInputProps {
  onFileReady: (track: Clip) => void;
  onImageReady: (edit: ImageEdit) => void;
}

export default function FileInput({ onFileReady, onImageReady }: FileInputProps) {
  const { t } = useTranslation();
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(
    async (file: File) => {
      setError(null);

      // Size cap first — same limit for all kinds
      if (file.size > MAX_FILE_SIZE) {
        setError(t('input.fileTooLarge'));
        return;
      }

      // Image branch
      if (file.type.startsWith('image/')) {
        if (!IMAGE_TYPES.includes(file.type)) {
          setError(t('image.unsupportedFormat'));
          return;
        }
        setLoading(true);
        try {
          const url = URL.createObjectURL(file);
          const { naturalWidth, naturalHeight } = await readImageNaturalSize(url);
          const dot = file.name.lastIndexOf('.');
          const name = dot > 0 ? file.name.slice(0, dot) : file.name;
          onImageReady({
            src: url,
            name,
            naturalWidth,
            naturalHeight,
            scale: 1,
            offsetX: 0,
            offsetY: 0,
            rotation: 0,
          });
        } catch {
          setError(t('input.invalidFile'));
        } finally {
          setLoading(false);
        }
        return;
      }

      // Audio / video branch (existing)
      if (!AV_TYPES.includes(file.type)) {
        setError(t('input.invalidFile'));
        return;
      }

      setLoading(true);
      try {
        const url = URL.createObjectURL(file);
        const type: 'audio' | 'video' = file.type.startsWith('video/')
          ? 'video'
          : 'audio';
        const { duration, width, height } = await readMediaMetadata(url, type);
        const track: Clip = {
          id: crypto.randomUUID(),
          name: file.name,
          file,
          url,
          type,
          duration,
          trim: { start: 0, end: duration },
          effects: { ...DEFAULT_EFFECTS },
          ...(type === 'video' ? { sourceWidth: width, sourceHeight: height } : {}),
        };
        onFileReady(track);
      } catch {
        setError(t('input.invalidFile'));
      } finally {
        setLoading(false);
      }
    },
    [onFileReady, onImageReady, t]
  );
```

Then at the bottom of the file (below `getMediaDuration` / `readMediaMetadata` — whichever helper Task 7.3 left there), add the image-size helper:

```tsx
function readImageNaturalSize(
  url: string
): Promise<{ naturalWidth: number; naturalHeight: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () =>
      resolve({ naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight });
    img.onerror = reject;
    img.src = url;
  });
}
```

Leave the rest of `FileInput.tsx` (drop zone JSX, error rendering, loading rendering) unchanged.

- [ ] **Step 3: Add `image.unsupportedFormat` to `en.json` and `he.json`**

In `packages/client/src/i18n/en.json`, add an `image` section. Place it between `editor` and `project` (alphabetical/logical grouping with the other media sections):

```json
"image": {
  "unsupportedFormat": "Only PNG, JPEG, and WebP images are supported"
},
```

In `packages/client/src/i18n/he.json`:

```json
"image": {
  "unsupportedFormat": "רק תמונות PNG, JPEG ו-WebP נתמכות"
},
```

(Task 3.1 and 3.4 will add more keys to this section.)

- [ ] **Step 4: Wire parallel `imageHistory` + 3-way routing in `App.tsx`**

Replace `packages/client/src/App.tsx` entirely with:

```tsx
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
        /* Placeholder until Task 3.1 replaces this */
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
```

Key points:
- Two independent `useHistory` hooks. At most one is non-null at a time.
- Image branch renders a placeholder here; Task 3.1 replaces it with `<ImageEditor />`.
- The project branch uses `project!` because TS narrowing across the three-way ternary isn't perfect; this is safe because the branches are exhaustive.

- [ ] **Step 5: Build**

Run: `npm run build --workspace=packages/client`
Expected: success.

- [ ] **Step 6: Manual smoke test (quick)**

Run: `npm run dev`

- Drop a PNG → placeholder shows with filename + dimensions; Back returns to landing.
- Drop an MP3 → existing audio project flow still works.
- Drop an MP4 → existing video project flow still works.
- Drop a HEIC or GIF file (if handy — otherwise skip) → "Only PNG, JPEG, and WebP images are supported" error.

- [ ] **Step 7: Commit**

```bash
git add shared/types.ts packages/client/src/components/FileInput.tsx packages/client/src/App.tsx packages/client/src/i18n/en.json packages/client/src/i18n/he.json
git commit -m "feat(image): route image drops to ImageEdit state (placeholder UI)"
```

---

## Phase 2 — image-fit pure math (TDD)

All math lives in `packages/client/src/lib/image-fit.ts` with full vitest coverage. No DOM, no React.

### Task 2.1: `baseCoverScale` + `FRAME_W`/`FRAME_H` constants

**Files:**
- Create: `packages/client/src/lib/image-fit.test.ts`
- Create: `packages/client/src/lib/image-fit.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/client/src/lib/image-fit.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { FRAME_W, FRAME_H, baseCoverScale } from './image-fit';

describe('FRAME constants', () => {
  it('are 1034 x 1379', () => {
    expect(FRAME_W).toBe(1034);
    expect(FRAME_H).toBe(1379);
  });
});

describe('baseCoverScale (no rotation)', () => {
  it('returns 1 when source exactly matches frame', () => {
    expect(baseCoverScale(1034, 1379, 0)).toBe(1);
  });
  it('scales up a tiny portrait source', () => {
    // A 517 x 689.5 source is half the frame. Cover scale = 2.
    expect(baseCoverScale(517, 689.5, 0)).toBeCloseTo(2, 5);
  });
  it('is driven by the wider aspect when source is landscape', () => {
    // 2000x1000 source into 1034x1379 frame: to cover height 1379, scale = 1.379.
    // At that scale width = 2758 > 1034 (covers). Correct cover scale = 1379/1000 = 1.379.
    expect(baseCoverScale(2000, 1000, 0)).toBeCloseTo(1.379, 3);
  });
  it('is driven by the taller aspect when source is narrower than frame', () => {
    // 500x2000 source: to cover width 1034, scale = 2.068.
    // At that scale height = 4136 > 1379 (covers). Correct cover scale = 1034/500 = 2.068.
    expect(baseCoverScale(500, 2000, 0)).toBeCloseTo(2.068, 3);
  });
});

describe('baseCoverScale (with rotation)', () => {
  it('swaps dimensions for 90° rotation', () => {
    // Source 2000x1000 landscape, rotated 90° appears as 1000x2000 portrait.
    // Cover scale for 1000x2000 into 1034x1379 = max(1034/1000, 1379/2000) = 1.034.
    expect(baseCoverScale(2000, 1000, 90)).toBeCloseTo(1.034, 3);
  });
  it('matches 0° for 180° rotation', () => {
    expect(baseCoverScale(2000, 1000, 180)).toBeCloseTo(baseCoverScale(2000, 1000, 0), 6);
  });
  it('matches 90° for 270° rotation', () => {
    expect(baseCoverScale(2000, 1000, 270)).toBeCloseTo(baseCoverScale(2000, 1000, 90), 6);
  });
});
```

- [ ] **Step 2: Run tests — they should fail because the module doesn't exist yet**

Run: `npm run test --workspace=packages/client -- --run`
Expected: FAIL — "Cannot find module './image-fit'".

- [ ] **Step 3: Implement `image-fit.ts`**

Create `packages/client/src/lib/image-fit.ts`:

```ts
export const FRAME_W = 1034;
export const FRAME_H = 1379;

export type Rotation = 0 | 90 | 180 | 270;

function effectiveDims(
  naturalW: number,
  naturalH: number,
  rotation: Rotation
): { effW: number; effH: number } {
  if (rotation === 90 || rotation === 270) {
    return { effW: naturalH, effH: naturalW };
  }
  return { effW: naturalW, effH: naturalH };
}

/**
 * The smallest scale that makes the image fully cover the 1034×1379 frame
 * after the given rotation.
 */
export function baseCoverScale(
  naturalW: number,
  naturalH: number,
  rotation: Rotation
): number {
  const { effW, effH } = effectiveDims(naturalW, naturalH, rotation);
  return Math.max(FRAME_W / effW, FRAME_H / effH);
}
```

- [ ] **Step 4: Run tests, verify all pass**

Run: `npm run test --workspace=packages/client -- --run`
Expected: all tests in `image-fit.test.ts` pass. (arrayMove tests should also continue to pass.)

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/lib/image-fit.ts packages/client/src/lib/image-fit.test.ts
git commit -m "feat(image): image-fit baseCoverScale helper + tests"
```

### Task 2.2: `clampOffset`

**Files:**
- Modify: `packages/client/src/lib/image-fit.ts`
- Modify: `packages/client/src/lib/image-fit.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `packages/client/src/lib/image-fit.test.ts`:

```ts
import { clampOffset } from './image-fit';

describe('clampOffset', () => {
  it('returns {0,0} at cover scale when offsets are 0', () => {
    const r = clampOffset({
      naturalW: 1034,
      naturalH: 1379,
      rotation: 0,
      scale: 1,
      offsetX: 0,
      offsetY: 0,
    });
    expect(r).toEqual({ offsetX: 0, offsetY: 0 });
  });

  it('zero scale when source matches frame — any requested offset gets clamped to 0', () => {
    // displayed dim equals frame dim → no slack, any offset clamps to 0
    const r = clampOffset({
      naturalW: 1034,
      naturalH: 1379,
      rotation: 0,
      scale: 1,
      offsetX: 500,
      offsetY: -500,
    });
    expect(r).toEqual({ offsetX: 0, offsetY: 0 });
  });

  it('allows offset up to half the overflow in each axis', () => {
    // 2000x1000 source, rotation 0. Cover scale = 1.379 (driven by height).
    // Displayed width = 2000 * 1.379 = 2758; overflow width = 2758 - 1034 = 1724.
    // maxOffsetX = 862. Displayed height = 1379; overflow Y = 0; maxOffsetY = 0.
    const r = clampOffset({
      naturalW: 2000,
      naturalH: 1000,
      rotation: 0,
      scale: 1,
      offsetX: 1000, // above max
      offsetY: 50,   // Y axis has no slack
    });
    expect(r.offsetX).toBeCloseTo(862, 0);
    expect(r.offsetY).toBe(0);
  });

  it('user zoom increases the offset slack proportionally', () => {
    // Same 2000x1000 source, rotation 0, user scale 2.
    // Total scale = 1.379 * 2 = 2.758. Displayed width = 5516; overflow = 4482; max = 2241.
    // Displayed height = 2758; overflow = 1379; max = 689.5.
    const r = clampOffset({
      naturalW: 2000,
      naturalH: 1000,
      rotation: 0,
      scale: 2,
      offsetX: 5000,
      offsetY: -1000,
    });
    expect(r.offsetX).toBeCloseTo(2241, 0);
    expect(r.offsetY).toBeCloseTo(-689.5, 1);
  });

  it('rotation swaps the overflow axis', () => {
    // 2000x1000 source rotated 90° is 1000x2000 effective.
    // Cover scale = 1.034. Displayed eff-width = 1034 (matches frame, no slack).
    // Displayed eff-height = 2000 * 1.034 = 2068; overflow = 689; max = 344.5.
    const r = clampOffset({
      naturalW: 2000,
      naturalH: 1000,
      rotation: 90,
      scale: 1,
      offsetX: 100,
      offsetY: 500,
    });
    expect(r.offsetX).toBe(0);
    expect(r.offsetY).toBeCloseTo(344.5, 1);
  });
});
```

- [ ] **Step 2: Run tests — they should fail because `clampOffset` doesn't exist**

Run: `npm run test --workspace=packages/client -- --run`
Expected: FAIL — "clampOffset is not a function" or import error.

- [ ] **Step 3: Implement `clampOffset`**

Append to `packages/client/src/lib/image-fit.ts`:

```ts
/**
 * Given the current transform state, return offsets clamped so the rotated,
 * scaled image always fully covers the 1034×1379 frame (no empty regions).
 */
export function clampOffset(params: {
  naturalW: number;
  naturalH: number;
  rotation: Rotation;
  scale: number;
  offsetX: number;
  offsetY: number;
}): { offsetX: number; offsetY: number } {
  const { naturalW, naturalH, rotation, scale, offsetX, offsetY } = params;
  const cover = baseCoverScale(naturalW, naturalH, rotation);
  const { effW, effH } = effectiveDims(naturalW, naturalH, rotation);
  const displayedW = effW * cover * scale;
  const displayedH = effH * cover * scale;
  const maxX = Math.max(0, (displayedW - FRAME_W) / 2);
  const maxY = Math.max(0, (displayedH - FRAME_H) / 2);
  return {
    offsetX: Math.max(-maxX, Math.min(maxX, offsetX)),
    offsetY: Math.max(-maxY, Math.min(maxY, offsetY)),
  };
}
```

- [ ] **Step 4: Run tests, verify all pass**

Run: `npm run test --workspace=packages/client -- --run`
Expected: all tests pass (image-fit + earlier arrayMove).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/lib/image-fit.ts packages/client/src/lib/image-fit.test.ts
git commit -m "feat(image): clampOffset helper + tests"
```

---

## Phase 3 — ImageEditor component + export

### Task 3.1: ImageEditor shell — render frame with cover-fit image + Back/Center/Rotate buttons

**Files:**
- Create: `packages/client/src/components/ImageEditor.tsx`
- Modify: `packages/client/src/App.tsx` (replace placeholder)
- Modify: `packages/client/src/i18n/en.json`
- Modify: `packages/client/src/i18n/he.json`

Static layout only — no pan/zoom interactions yet. Buttons work (rotate, center, back, undo, redo).

- [ ] **Step 1: Add i18n keys**

Extend `image` section in both JSON files.

`en.json`:
```json
"image": {
  "unsupportedFormat": "Only PNG, JPEG, and WebP images are supported",
  "title": "Image editor",
  "zoom": "Zoom",
  "center": "Center",
  "rotate": "Rotate 90°",
  "download": "Download PNG",
  "instructions": "Drag to reposition. Scroll to zoom."
},
```

`he.json`:
```json
"image": {
  "unsupportedFormat": "רק תמונות PNG, JPEG ו-WebP נתמכות",
  "title": "עורך תמונות",
  "zoom": "זום",
  "center": "למרכז",
  "rotate": "סיבוב 90°",
  "download": "הורדת PNG",
  "instructions": "גררו למיקום. גלילה לזום."
},
```

- [ ] **Step 2: Create `ImageEditor.tsx`**

```tsx
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { ImageEdit } from 'shared/types';
import { FRAME_W, FRAME_H, baseCoverScale, clampOffset } from '../lib/image-fit';

interface ImageEditorProps {
  edit: ImageEdit;
  /** Discrete change — pushes previous state to undo history. */
  onUpdate: (edit: ImageEdit) => void;
  /** Continuous mid-gesture change — no undo entry. */
  onDragUpdate: (edit: ImageEdit) => void;
  onBack: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export default function ImageEditor({
  edit,
  onUpdate,
  onDragUpdate: _onDragUpdate,
  onBack,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: ImageEditorProps) {
  const { t } = useTranslation();

  // Ctrl+Z / Ctrl+Y keyboard shortcuts — same pattern as TrackEditor
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === 'TEXTAREA') return;
      if (el.tagName === 'INPUT' && (el as HTMLInputElement).type !== 'range') return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        onUndo();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        onRedo();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onUndo, onRedo]);

  const cover = baseCoverScale(edit.naturalWidth, edit.naturalHeight, edit.rotation);
  const displayScale = cover * edit.scale;

  const rotate = () => {
    const nextRotation = ((edit.rotation + 90) % 360) as 0 | 90 | 180 | 270;
    // Clamp offsets to the new rotation's overflow
    const clamped = clampOffset({
      naturalW: edit.naturalWidth,
      naturalH: edit.naturalHeight,
      rotation: nextRotation,
      scale: edit.scale,
      offsetX: edit.offsetX,
      offsetY: edit.offsetY,
    });
    onUpdate({ ...edit, rotation: nextRotation, ...clamped });
  };

  const center = () => {
    onUpdate({ ...edit, scale: 1, offsetX: 0, offsetY: 0 });
  };

  // Preview is scaled down so it fits in the viewport.
  // We render the 1034×1379 box inside a wrapper with CSS max-width/max-height,
  // and let the image element inside use transform to position itself.
  return (
    <div className="space-y-4 w-full max-w-4xl mx-auto p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            {t('editor.back')}
          </button>
          <button
            onClick={onUndo}
            disabled={!canUndo}
            className="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Ctrl+Z"
          >
            ↩
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            className="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Ctrl+Y"
          >
            ↪
          </button>
        </div>
        <h2 className="text-lg font-semibold text-gray-700 truncate max-w-md">
          {t('image.title')} — {edit.name}
        </h2>
        <div className="w-20" />
      </div>

      {/* Crop frame — 1034×1379 scaled to fit viewport */}
      <div className="flex justify-center">
        <div
          className="relative overflow-hidden bg-gray-900 shadow-lg"
          style={{
            width: FRAME_W,
            height: FRAME_H,
            maxWidth: '80vw',
            maxHeight: '70vh',
            aspectRatio: `${FRAME_W} / ${FRAME_H}`,
          }}
        >
          <img
            src={edit.src}
            alt=""
            draggable={false}
            className="absolute top-1/2 left-1/2 select-none"
            style={{
              width: edit.naturalWidth,
              height: edit.naturalHeight,
              transform: `translate(-50%, -50%) translate(${edit.offsetX}px, ${edit.offsetY}px) rotate(${edit.rotation}deg) scale(${displayScale})`,
              transformOrigin: 'center',
            }}
          />
        </div>
      </div>

      {/* Instructions */}
      <p className="text-center text-sm text-gray-500">{t('image.instructions')}</p>

      {/* Controls row */}
      <div className="flex justify-center gap-2">
        <button
          onClick={center}
          className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg"
        >
          {t('image.center')}
        </button>
        <button
          onClick={rotate}
          className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg"
        >
          {t('image.rotate')}
        </button>
      </div>
    </div>
  );
}
```

Key details to verify when reading the code:
- The `<img>` is sized to its natural pixel dimensions, then CSS transforms scale it. This means `offsetX`/`offsetY` are in source-pixel units, matching `image-fit`'s math.
- `translate(-50%, -50%)` centers the image element on the frame center *before* user offsets/rotation/scale, because transforms apply right-to-left (scale first, then rotate, then two translates).
- The frame uses `max-width: 80vw; max-height: 70vh` plus `aspect-ratio`; inside, the image lives in source-pixel space. Browsers handle the outer scaling via CSS container, so source-pixel math inside works without extra scaling in JS.
- `_onDragUpdate` is unused in this task (pan/zoom lands in Task 3.2). Prefixed to satisfy `noUnusedLocals`.

- [ ] **Step 3: Replace the placeholder in `App.tsx`**

Open `packages/client/src/App.tsx`. Add import at the top with the other imports:

```tsx
import ImageEditor from './components/ImageEditor';
```

Replace the placeholder `imageEdit` branch (the `<div>` with "Image editor (placeholder)") with:

```tsx
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
```

- [ ] **Step 4: Build**

Run: `npm run build --workspace=packages/client`
Expected: success.

- [ ] **Step 5: Manual smoke test**

Run: `npm run dev`.

- Drop a PNG that is portrait, landscape, and square (three files, three runs).
- In each case, the full frame is filled with no empty regions (cover-fit works).
- Click Rotate — image rotates 90° each click; after four clicks returns to original.
- Click Center — if you were rotated away from 0°, it stays rotated but resets scale/offset (or rotation back to 0 — spec says only scale+offset reset). (This task's Center resets only `scale`/`offset`, keeping `rotation`.)
- Undo/redo work for Rotate/Center.
- Back button returns to landing.

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/components/ImageEditor.tsx packages/client/src/App.tsx packages/client/src/i18n/en.json packages/client/src/i18n/he.json
git commit -m "feat(image): ImageEditor shell with cover-fit preview + rotate/center/back"
```

### Task 3.2: Mouse pan + wheel zoom

**Files:**
- Modify: `packages/client/src/components/ImageEditor.tsx`

- [ ] **Step 1: Replace the component body's `const rotate = …` / `const center = …` block with full interaction handling**

Replace the stub `_onDragUpdate` destructure with `onDragUpdate`. Then, below the existing `cover` / `displayScale` / `rotate` / `center` declarations, add:

```tsx
const MIN_SCALE = 1;
const MAX_SCALE = 8;

// Mouse pan — track whether we're mid-drag and commit on mouseup.
const onMouseDown = (e: React.MouseEvent) => {
  e.preventDefault();
  const startX = e.clientX;
  const startY = e.clientY;
  const startOffsetX = edit.offsetX;
  const startOffsetY = edit.offsetY;

  // Convert screen-pixel drag into source-pixel drag using the on-screen frame's
  // rendered size. The frame element is styled with max-width/max-height so
  // we need to read its actual width at drag-start time.
  const frameEl = e.currentTarget as HTMLElement;
  const rect = frameEl.getBoundingClientRect();
  const screenToSource = FRAME_W / rect.width;

  const onMove = (ev: MouseEvent) => {
    const dx = (ev.clientX - startX) * screenToSource;
    const dy = (ev.clientY - startY) * screenToSource;
    const clamped = clampOffset({
      naturalW: edit.naturalWidth,
      naturalH: edit.naturalHeight,
      rotation: edit.rotation,
      scale: edit.scale,
      offsetX: startOffsetX + dx,
      offsetY: startOffsetY + dy,
    });
    onDragUpdate({ ...edit, ...clamped });
  };
  const onUp = (ev: MouseEvent) => {
    const dx = (ev.clientX - startX) * screenToSource;
    const dy = (ev.clientY - startY) * screenToSource;
    const clamped = clampOffset({
      naturalW: edit.naturalWidth,
      naturalH: edit.naturalHeight,
      rotation: edit.rotation,
      scale: edit.scale,
      offsetX: startOffsetX + dx,
      offsetY: startOffsetY + dy,
    });
    onUpdate({ ...edit, ...clamped });
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
};

// Wheel zoom — continuous updates via onDragUpdate, commit on a short idle.
let wheelTimer: ReturnType<typeof setTimeout> | null = null;
const onWheel = (e: React.WheelEvent) => {
  e.preventDefault();
  const delta = e.deltaY;
  const factor = Math.pow(1.0015, -delta);
  const nextScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, edit.scale * factor));
  const clamped = clampOffset({
    naturalW: edit.naturalWidth,
    naturalH: edit.naturalHeight,
    rotation: edit.rotation,
    scale: nextScale,
    offsetX: edit.offsetX,
    offsetY: edit.offsetY,
  });
  const next = { ...edit, scale: nextScale, ...clamped };
  onDragUpdate(next);
  if (wheelTimer) clearTimeout(wheelTimer);
  wheelTimer = setTimeout(() => onUpdate(next), 150);
};
```

**Important:** the `let wheelTimer` cannot sit at module top-level in React-land. Put it in a `useRef<ReturnType<typeof setTimeout> | null>(null)` instead:

```tsx
const wheelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
```

and use `wheelTimer.current` everywhere in the wheel handler. Add `useRef` to the imports:

```tsx
import { useEffect, useRef } from 'react';
```

- [ ] **Step 2: Attach handlers to the frame element**

In the JSX, change the frame `<div>` to:

```tsx
<div
  className="relative overflow-hidden bg-gray-900 shadow-lg cursor-grab active:cursor-grabbing"
  style={{
    width: FRAME_W,
    height: FRAME_H,
    maxWidth: '80vw',
    maxHeight: '70vh',
    aspectRatio: `${FRAME_W} / ${FRAME_H}`,
  }}
  onMouseDown={onMouseDown}
  onWheel={onWheel}
>
```

- [ ] **Step 3: Build**

Run: `npm run build --workspace=packages/client`
Expected: success.

- [ ] **Step 4: Manual smoke test**

Run: `npm run dev`.

- Drop an image larger than 1034×1379 (or use any image and zoom in).
- Click and drag — image pans; can't pan past the clamp (image edge always touches frame edge at extremes).
- Scroll wheel over the frame — image zooms in/out around center. Can zoom from 1× (cover) up to 8×.
- Undo after a pan commits to the previous position. Drag-in-progress doesn't pollute history.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/components/ImageEditor.tsx
git commit -m "feat(image): mouse pan + wheel zoom with clamping + undo-aware commit"
```

### Task 3.3: Touch pan + pinch zoom

**Files:**
- Modify: `packages/client/src/components/ImageEditor.tsx`

Add touch handlers. Design: single touch = pan (reuses mouse-pan logic pattern); two touches = pinch zoom with mid-point-preserving scale.

- [ ] **Step 1: Add touch handlers inside the component**

Below the wheel handler, add:

```tsx
const onTouchStart = (e: React.TouchEvent) => {
  if (e.touches.length === 0) return;
  e.preventDefault();

  const frameEl = e.currentTarget as HTMLElement;
  const rect = frameEl.getBoundingClientRect();
  const screenToSource = FRAME_W / rect.width;

  if (e.touches.length === 1) {
    // Single-touch pan — mirror the mouse path
    const startX = e.touches[0].clientX;
    const startY = e.touches[0].clientY;
    const startOffsetX = edit.offsetX;
    const startOffsetY = edit.offsetY;

    const onMove = (ev: TouchEvent) => {
      if (ev.touches.length !== 1) return;
      ev.preventDefault();
      const dx = (ev.touches[0].clientX - startX) * screenToSource;
      const dy = (ev.touches[0].clientY - startY) * screenToSource;
      const clamped = clampOffset({
        naturalW: edit.naturalWidth,
        naturalH: edit.naturalHeight,
        rotation: edit.rotation,
        scale: edit.scale,
        offsetX: startOffsetX + dx,
        offsetY: startOffsetY + dy,
      });
      onDragUpdate({ ...edit, ...clamped });
    };
    const onEnd = (ev: TouchEvent) => {
      // Use the last-known move position by reading from the most recent onMove;
      // here we just commit with the current edit state, since onMove already
      // reported the freshest value via onDragUpdate.
      const last = ev.changedTouches[0];
      const dx = (last.clientX - startX) * screenToSource;
      const dy = (last.clientY - startY) * screenToSource;
      const clamped = clampOffset({
        naturalW: edit.naturalWidth,
        naturalH: edit.naturalHeight,
        rotation: edit.rotation,
        scale: edit.scale,
        offsetX: startOffsetX + dx,
        offsetY: startOffsetY + dy,
      });
      onUpdate({ ...edit, ...clamped });
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);
  } else if (e.touches.length >= 2) {
    // Two-touch pinch zoom
    const [a, b] = [e.touches[0], e.touches[1]];
    const startDist = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
    const startScale = edit.scale;
    let lastNext: ImageEdit = edit;

    const onMove = (ev: TouchEvent) => {
      if (ev.touches.length < 2) return;
      ev.preventDefault();
      const [a2, b2] = [ev.touches[0], ev.touches[1]];
      const dist = Math.hypot(b2.clientX - a2.clientX, b2.clientY - a2.clientY);
      if (startDist === 0) return;
      const nextScale = Math.max(
        MIN_SCALE,
        Math.min(MAX_SCALE, startScale * (dist / startDist))
      );
      const clamped = clampOffset({
        naturalW: edit.naturalWidth,
        naturalH: edit.naturalHeight,
        rotation: edit.rotation,
        scale: nextScale,
        offsetX: edit.offsetX,
        offsetY: edit.offsetY,
      });
      lastNext = { ...edit, scale: nextScale, ...clamped };
      onDragUpdate(lastNext);
    };
    const onEnd = () => {
      onUpdate(lastNext);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);
  }
};
```

Add `ImageEdit` to the imports at the top:

```tsx
import type { ImageEdit } from 'shared/types';
```

(`ImageEdit` is already imported; the `lastNext` binding above uses it explicitly.)

- [ ] **Step 2: Attach `onTouchStart` on the frame element**

Update the frame `<div>` to also pass `onTouchStart={onTouchStart}`:

```tsx
<div
  className="relative overflow-hidden bg-gray-900 shadow-lg cursor-grab active:cursor-grabbing touch-none"
  ...
  onMouseDown={onMouseDown}
  onWheel={onWheel}
  onTouchStart={onTouchStart}
>
```

The `touch-none` class disables browser native touch-scrolling so our handlers have full control.

- [ ] **Step 3: Build**

Run: `npm run build --workspace=packages/client`
Expected: success.

- [ ] **Step 4: Manual smoke test**

Touch device required for full coverage — optional. On desktop, Chrome DevTools → Device toolbar → emulate touch works for single-touch pan. Pinch requires a real device or trackpad gesture.

- Single-finger drag pans.
- Two-finger pinch zooms in/out.
- Clamping still applies.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/components/ImageEditor.tsx
git commit -m "feat(image): touch pan + pinch zoom"
```

### Task 3.4: Canvas export + Download button

**Files:**
- Create: `packages/client/src/lib/image-export.ts`
- Modify: `packages/client/src/components/ImageEditor.tsx`

- [ ] **Step 1: Create `image-export.ts`**

```ts
import type { ImageEdit } from 'shared/types';
import { FRAME_W, FRAME_H, baseCoverScale } from './image-fit';

/**
 * Render the current image edit into a 1034×1379 PNG blob using the same
 * transform convention as the preview (translate-center → offset → rotate →
 * scale → drawImage centered).
 */
export async function exportImage(edit: ImageEdit): Promise<Blob> {
  const img = await loadImage(edit.src);

  const canvas = document.createElement('canvas');
  canvas.width = FRAME_W;
  canvas.height = FRAME_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');

  const cover = baseCoverScale(edit.naturalWidth, edit.naturalHeight, edit.rotation);
  const drawScale = cover * edit.scale;

  ctx.imageSmoothingQuality = 'high';

  // Match the preview's transform composition:
  //   translate(frame-center) -> translate(offset) -> rotate -> scale -> draw-centered
  ctx.translate(FRAME_W / 2 + edit.offsetX, FRAME_H / 2 + edit.offsetY);
  ctx.rotate((edit.rotation * Math.PI) / 180);
  ctx.scale(drawScale, drawScale);
  ctx.drawImage(
    img,
    -edit.naturalWidth / 2,
    -edit.naturalHeight / 2,
    edit.naturalWidth,
    edit.naturalHeight
  );

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('toBlob returned null'))),
      'image/png'
    );
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = src;
  });
}

/** Trigger a client-side save-as for the blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 2: Wire the Download button in `ImageEditor.tsx`**

Add imports:

```tsx
import { exportImage, downloadBlob } from '../lib/image-export';
import { useState } from 'react';
```

Inside the component, add:

```tsx
const [exporting, setExporting] = useState(false);

const handleDownload = async () => {
  if (exporting) return;
  setExporting(true);
  try {
    const blob = await exportImage(edit);
    downloadBlob(blob, `${edit.name}_1034x1379.png`);
  } finally {
    setExporting(false);
  }
};
```

Change the controls row (the one with Center and Rotate) to:

```tsx
<div className="flex justify-center gap-2">
  <button
    onClick={center}
    className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg"
  >
    {t('image.center')}
  </button>
  <button
    onClick={rotate}
    className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg"
  >
    {t('image.rotate')}
  </button>
  <button
    onClick={handleDownload}
    disabled={exporting}
    className="px-4 py-2 text-sm bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-semibold disabled:opacity-50"
  >
    {exporting ? t('editor.exporting') : t('image.download')}
  </button>
</div>
```

(`editor.exporting` already exists in i18n — it reads "Processing..." / "מעבד...".)

- [ ] **Step 3: Build**

Run: `npm run build --workspace=packages/client`
Expected: success.

- [ ] **Step 4: Manual smoke test — the big one**

Run: `npm run dev`. Prepare a test image whose aspect ratio differs from 3:4 (e.g. a 1920×1080 landscape).

- Drop it → see cover-fit preview.
- Pan/zoom/rotate to a non-default state.
- Click "Download PNG". File downloads as `<name>_1034x1379.png`.
- Open the downloaded file. Verify:
  - Dimensions are exactly 1034×1379.
  - Visible content matches what was inside the preview frame — same crop, same rotation, same zoom.
- Repeat with a PNG (transparent background source) — confirm transparency is preserved in the output where source was transparent.
- Repeat with rotation ≠ 0 — confirm the exported image matches the rotated preview.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/lib/image-export.ts packages/client/src/components/ImageEditor.tsx
git commit -m "feat(image): canvas export + Download button"
```

---

## Final build + test gate

After Task 3.4 is complete:

```bash
npm run build --workspace=packages/client
npm run test --workspace=packages/client -- --run
```

Both must succeed. Tests should show image-fit + arrayMove suites passing.

---

## Self-review (plan author checklist)

Before handoff, the plan author checked:

**Spec coverage:**
- Landing-page routing: Task 1.1 ✓
- ImageEdit type: Task 1.1 ✓
- MIME filtering (PNG/JPEG/WebP, reject others): Task 1.1 ✓
- 3-way App.tsx routing: Task 1.1 ✓
- Cover-fit initial display: Task 3.1 ✓
- Drag-to-reposition: Task 3.2 (mouse), 3.3 (touch) ✓
- Wheel/pinch zoom: Task 3.2 (wheel), 3.3 (pinch) ✓
- Min-scale = cover (can't expose empty frame): `clampOffset` handles it; `MIN_SCALE = 1` in Task 3.2 ✓
- Rotate 90° button: Task 3.1 ✓
- Center button: Task 3.1 ✓
- Download button + export: Task 3.4 ✓
- Undo/redo (useHistory): Task 1.1 (wiring), Task 3.1 (keyboard shortcuts) ✓
- i18n keys: Tasks 1.1, 3.1 ✓
- Pure image-fit math with tests: Tasks 2.1, 2.2 ✓
- 200MB size cap: Task 1.1 ✓
- Non-goal — `computeSourceRect`: deliberately dropped; rationale documented above ✓
- Non-goal — JPEG output, bg fill, text overlays: not in plan ✓

**Placeholder scan:** no TBD/TODO; all code steps show concrete code; all commands have expected output.

**Type consistency:** `ImageEdit` shape is identical everywhere it appears (type def in shared/types, constructor call in FileInput, prop use in ImageEditor, arg to exportImage). `Rotation` type (`0 | 90 | 180 | 270`) is consistent. `baseCoverScale` / `clampOffset` signatures match their test cases.
