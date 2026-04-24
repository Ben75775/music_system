# Image editor (standalone, 1034×1379 PNG export) — design spec

**Date:** 2026-04-24
**Status:** Approved for planning
**Scope:** Third landing-page flow parallel to audio/video. Drop an image → pan/zoom into a fixed 1034×1379 crop frame → download the cropped PNG. No interaction with the multi-clip project system.

## Problem

The app currently handles audio and video clips. Users who prepare event material also need to produce correctly-sized images (posters, invitations) at a fixed dimension of **1034×1379** (3:4 portrait). Today they'd have to leave the app.

## Non-goals

- Integration with projects/clips (an image is not a clip in this iteration).
- Multiple output sizes or aspect presets. 1034×1379 is the only target.
- JPEG output, quality slider, compression tuning.
- Background fill / "zoom out past cover" / blurred letterbox.
- Text overlays, watermarks, filters, color correction.
- Server-side processing. Everything is client-side.

## User flow

1. User lands on the app. Sees the existing drop zone accepting audio/video/image.
2. User drops a PNG, JPEG, or WebP file. MIME detection routes to the image flow.
3. `ImageEditor` renders: a 1034×1379 crop frame with the image placed underneath at **cover** scale, centered.
4. User adjusts:
   - Drag image behind the frame to reposition.
   - Scroll wheel / pinch to zoom (minimum = cover scale; no "empty frame").
   - Optional "Rotate 90°" button — rotates the source in 90° quadrants.
   - "Center" button — resets to initial auto-fit (scale = cover, offset = 0).
5. User clicks "Download" — browser saves `<originalName>_1034x1379.png`.
6. User can click "Back" to return to the landing page and start over.

## Architecture

### State (in `App.tsx`)

Alongside the existing `project` history, add a parallel piece of state for the image flow:

```ts
type ImageEdit = {
  src: string;           // object URL for the source image
  name: string;          // original filename (minus extension)
  naturalWidth: number;
  naturalHeight: number;
  scale: number;         // multiplier on top of base cover scale. 1.0 = exact cover
  offsetX: number;       // pixels, 0 = centered
  offsetY: number;       // pixels
  rotation: 0 | 90 | 180 | 270; // quadrant rotation of the source
};
```

App-level routing becomes a three-way switch:

| App state | Renders |
|---|---|
| `!project && !imageEdit` | Landing (`FileInput`) |
| `project` set | `ProjectView` |
| `imageEdit` set | `ImageEditor` |

At most one of `project` / `imageEdit` is set at a time. `imageEdit` uses the same `useHistory` hook wrapper for undo/redo (cheap — it's a generic hook).

### Entry point: `FileInput.tsx` changes

`FileInput.tsx` currently routes by `file.type.startsWith('video/')` → `'video'` else → `'audio'`. Add a third branch:

- `file.type === 'image/png' | 'image/jpeg' | 'image/webp'` → call a new `onImageReady(imageEdit: ImageEdit)` prop instead of `onFileReady(clip)`.
- Unsupported image types (HEIC, GIF, SVG, AVIF) → show a dedicated error: `t('image.unsupportedFormat')`.
- `ACCEPTED_TYPES` widens to include the three image MIMEs.
- `accept` attribute on the `<input type="file">` widens similarly.
- 200MB limit applies to images too.

The drop-zone copy stays the same ("Upload a file / Drag & drop a media file"); no new UI surface on the landing page.

### Component tree

```
App
├── Layout
│   ├── FileInput                 (landing only, adds image routing)
│   ├── ProjectView               (unchanged)
│   └── ImageEditor  [NEW]
│       ├── CropFrame              (1034×1379 viewport with image transform)
│       ├── ZoomControls           (slider + center button + rotate button)
│       └── Download button
```

### `ImageEditor.tsx` (new)

Props:

```ts
interface ImageEditorProps {
  edit: ImageEdit;
  onUpdate: (edit: ImageEdit) => void;       // discrete change → push history
  onDragUpdate: (edit: ImageEdit) => void;   // continuous (drag/zoom mid-gesture)
  onBack: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}
```

Internal responsibilities:

- Render the 1034×1379 frame at a responsive display scale (e.g., `min(viewport, 1034×1379)` scaled down uniformly). Coordinates inside the component are kept in **source-pixel space** so export math is straightforward.
- Mount an `<img>` inside the frame with CSS `transform: rotate(Xdeg) scale(baseCover * scale) translate(offsetX, offsetY)`. No canvas until export.
- Mouse handlers: mousedown on frame → drag mode → mousemove updates `offsetX/Y` via `onDragUpdate`; mouseup commits via `onUpdate`.
- Wheel handler: `deltaY` → multiplies `scale` (with sensible min = 1 and reasonable max, e.g., 8). Zoom is committed on wheel-stop (debounced) via `onUpdate`; live gesture frames go through `onDragUpdate`.
- Touch handlers: single-finger drag = pan; two-finger pinch = zoom.
- After every update, `offsetX`/`offsetY`/`scale` pass through `clampOffset` so the image cannot expose empty frame regions.
- Center button: `onUpdate({ ...edit, scale: 1, offsetX: 0, offsetY: 0 })`.
- Rotate button: `onUpdate({ ...edit, rotation: (edit.rotation + 90) % 360 as 0|90|180|270 })`. Rotation swaps `naturalWidth`/`naturalHeight` for fit-math purposes (see "Rotation" below).
- Download button calls a pure `exportImage(edit)` function that produces a Blob, then triggers a client-side save-as with `<name>_1034x1379.png`.

### `image-fit.ts` (new pure module, fully tested)

All math lives here, no DOM. This is what the writing-plans skill will drive as a TDD phase.

```ts
const FRAME_W = 1034;
const FRAME_H = 1379;

// 1. Base scale that makes the image cover the frame (larger of the two ratios).
export function baseCoverScale(
  naturalW: number,
  naturalH: number
): number;

// 2. Given current transform state, return the clamped offsets
//    so the rotated+scaled image fully covers the frame with no empty regions.
export function clampOffset(params: {
  naturalW: number;
  naturalH: number;
  rotation: 0 | 90 | 180 | 270;
  scale: number;                // user scale on top of base cover
  offsetX: number;
  offsetY: number;
}): { offsetX: number; offsetY: number };

// 3. For export: compute the source-image rectangle that, when drawn onto a
//    1034×1379 canvas, matches the preview exactly.
export function computeSourceRect(params: {
  naturalW: number;
  naturalH: number;
  rotation: 0 | 90 | 180 | 270;
  scale: number;
  offsetX: number;
  offsetY: number;
}): { sx: number; sy: number; sWidth: number; sHeight: number };
```

### Rotation

Rotation is always rendered via CSS `rotate()` in the preview and via canvas transforms on export. For 90°/270° rotations, the effective natural dimensions swap (portrait↔landscape). The `image-fit` helpers accept rotation as a parameter and handle the swap internally so callers don't special-case it.

### Export pipeline (`exportImage.ts`)

Pure function. Not in `image-fit.ts` because it touches DOM (`<canvas>`, `Image`).

```ts
async function exportImage(edit: ImageEdit): Promise<Blob> {
  const img = await loadImage(edit.src);                 // HTMLImageElement
  const canvas = document.createElement('canvas');
  canvas.width = FRAME_W;
  canvas.height = FRAME_H;
  const ctx = canvas.getContext('2d')!;

  // For rotation: translate to center, rotate, translate back, then drawImage.
  // Math details resolved in image-fit.computeSourceRect + a small wrapper here
  // for the rotation transform.

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'));
}
```

Save-as is triggered by a tiny utility that creates a temporary `<a href=URL.createObjectURL(blob) download=...>` and clicks it, then revokes the URL.

## i18n

New top-level `image` section in both `en.json` and `he.json`:

| Key | English | Hebrew |
|---|---|---|
| `title` | Image editor | עורך תמונות |
| `zoom` | Zoom | זום |
| `center` | Center | למרכז |
| `rotate` | Rotate 90° | סיבוב 90° |
| `download` | Download PNG | הורדת PNG |
| `unsupportedFormat` | Only PNG, JPEG, and WebP images are supported | רק תמונות PNG, JPEG ו-WebP נתמכות |
| `instructions` | Drag to reposition. Scroll to zoom. | גררו למיקום. גלילה לזום. |

## Formats

- **Input:** `image/png`, `image/jpeg`, `image/webp`. Others rejected.
- **Output:** PNG only.
- **Size cap:** 200MB (matches audio/video).

## Undo/redo

Reuse the existing `useHistory<ImageEdit | null>` hook. Drag/zoom gestures use `onDragUpdate` (no history entry) and commit via `onUpdate` on gesture end. Matches the pattern already established for audio/video trim handles.

## Testing

- **Unit (vitest, no DOM):** `image-fit.test.ts` — covers `baseCoverScale`, `clampOffset`, `computeSourceRect` for portrait and landscape sources, all four rotations, edge cases (source matching frame exactly, square source, extreme aspect ratios).
- **Smoke:** manual dev-server test — drop an image, verify cover-centered initial state, drag to reposition, zoom past cover, rotate, center button, download produces a 1034×1379 PNG. (Playwright out of scope here; we don't have it configured.)

## Phase breakdown (for writing-plans to refine)

1. **Data model + routing** — add `ImageEdit` type, update `FileInput` to route by MIME to a new `onImageReady` prop, add app state wiring in `App.tsx`.
2. **image-fit pure math module + tests** — TDD the three functions with comprehensive unit tests before any UI work.
3. **ImageEditor component + export** — build the component (pan, zoom, rotate, center), the export pipeline, i18n keys, and the landing-page smoke test.

## Open questions

None. All decisions captured above are the user's.
