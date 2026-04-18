# Multi-clip projects: merge + crop + per-clip effects

**Date:** 2026-04-18
**Status:** Approved (brainstorming complete, ready for plan)

## Goal

Turn the app from "one file → edit → export" into "N clips → edit each → merge → export." Each clip keeps the full existing effect set (trim, volume, fade in/out, speed, EQ). Video projects also gain a project-level aspect ratio and per-clip crop. The full project plays back live (seamlessly across clips) and exports as a single concatenated file.

Non-goals: multi-track timelines, overlaps, transitions, text/stickers, real-time pitch shifting. The "Advanced editor ↗" link on the video editor covers those via online-video-cutter.com.

## Scope decisions (from brainstorming)

- **Trim and speed already exist** and are unchanged. New work is merge + crop + refactor to multi-clip.
- **Single-type projects.** A project is either all-audio (exports one MP3) or all-video (exports one MP4). Adding a mismatched file type is rejected with a toast.
- **Project-level aspect ratio** for video projects. Each clip's crop is locked to that aspect. Changing the project aspect requires explicit confirm + resets all crop regions.
- **Crop UX:** presets and free both supported, always aspect-locked to the project.
- **No real-time pitch.** The existing pitch slider is removed entirely — it was rarely used and keeping it live would require adding SoundTouch.js. Can be reintroduced later if users ask.
- **Project preview is in scope:** play/pause/seek across the whole project with effects live. Export remains the ground truth.
- **No mobile-responsive layout.** Desktop-width-only for v1.
- **Labels for non-technical users** (kids/teachers): aspect and crop buttons show a mini shape icon + a familiar name (e.g., "TikTok / Reels / Stories") rather than bare ratios.

## Data model (`shared/types.ts`)

The existing `Track` type goes away entirely — replaced by `Clip`. `ExportConfig` goes away too; projects know their own mode.

```ts
export type ProjectMode = 'audio' | 'video';
export type Aspect = '16:9' | '9:16' | '1:1' | '4:3' | '3:4';

export interface CropRegion {
  // Normalized to source frame, in [0, 1]. Survives source-metadata changes.
  x: number;      // left edge
  y: number;      // top edge
  width: number;  // 0 < w ≤ 1
  height: number; // 0 < h ≤ 1
}

export interface TrackEffect {
  volume: number;       // 0-2 (1 = normal)
  fadeIn: number;       // seconds
  fadeOut: number;      // seconds
  speed: number;        // 0.5-2
  eqPreset: EQPreset;
  // Note: `pitch` removed. See scope decisions.
}

export type EQPreset = 'none' | 'bass-boost' | 'vocal-clarity' | 'treble-boost';

export interface TrimRange { start: number; end: number; }

export interface Clip {
  id: string;
  name: string;
  file: File | null;
  url: string;
  type: ProjectMode;
  duration: number;
  trim: TrimRange;
  effects: TrackEffect;
  crop?: CropRegion;         // video-only; undefined = no crop (letterboxed to project aspect)
  sourceWidth?: number;      // video-only; read from metadata on load
  sourceHeight?: number;     // video-only
}

export interface Project {
  id: string;
  mode: ProjectMode;
  aspect?: Aspect;           // video-only; undefined until user picks one
  clips: Clip[];             // render order = array order
}

export const DEFAULT_EFFECTS: TrackEffect = {
  volume: 1,
  fadeIn: 0,
  fadeOut: 0,
  speed: 1,
  eqPreset: 'none',
};
```

## UI shell

Top-level state: `useHistory<Project | null>` (replaces the current `useHistory<Track | null>`). Undo/redo snapshots the whole project — clip order, per-clip edits, crop regions, aspect ratio.

### Three screens

1. **Landing (`project == null`)** — current screen unchanged: drop zone + YouTube input. The first file/YT clip added *creates* the project, sets `mode` from the file type, and transitions to screen 2.

2. **Project view (`project != null`)** — new, the core of the feature:
   - **Left column — clip list:** each entry shows a thumbnail (video) or waveform (audio), name, trimmed duration, drag-handle to reorder, trash to remove. At the top: a compact "add clip" form with drop zone + YouTube input, accepting only the project's `mode`. One clip is always selected.
   - For video projects: an **aspect-ratio picker** above the clip list (see Crop section for labels). Locked once clips exist; changing it requires confirm + resets crops.
   - **Right column — per-clip editor:** the existing `TrackEditor` UI bound to the selected clip.
   - **Master timeline** above both columns, spanning the full width: one long bar showing all clips end-to-end with boundaries marked. Playhead is the single source of truth for project time. Click to seek. Spacebar plays/pauses.
   - **Bottom:** a single **"Download merged file"** button. The "Need more tools? →" link (renamed from "Advanced editor") sits next to it.

3. **Back to landing** — prompts "Discard project?" if clips exist.

### State flows

- **Add clip** → validates type matches `project.mode` → appends to `project.clips` → new clip selected.
- **Remove clip** → if selected, select the previous (or first remaining). Empty project returns to landing.
- **Reorder** → drag `clip-id` in the list; pure array move.
- **Per-clip edit** → updates `project.clips[i]`. Slider drag = `replace` (no undo entry mid-drag); commit = `set` (snapshot). Same pattern the app already uses.

## Per-clip editor

Refactor `TrackEditor.tsx`:
- Accepts `clip: Clip` and `project: Project` (for aspect ratio in the crop overlay).
- Drops its internal `ExportButton` and "Back" button. The project view owns those now.
- Renames props `track`/`onUpdateTrack` → `clip`/`onUpdateClip`.
- Pitch slider removed from `Controls.tsx`.
- The "Advanced editor ↗" link (added in an earlier PR) moves to the project view's export row.

Internal audio/video editors otherwise unchanged — waveform, timeline, trim handles, remaining effects panel all work as-is against a `Clip` instead of a `Track`.

## Playback engine (project-wide preview)

### Architecture

- **Two hidden `<video>` or `<audio>` elements** (current + next). Next clip preloads in the background and seeks to its `trim.start` so the handoff is gapless.
- **One WebAudio graph per clip**, rebuilt on clip activation. Chain: `MediaElementSource → gain (volume + fade automation) → BiquadFilter (EQ preset) → destination`. `playbackRate` on the element handles speed.
- **Fade in/out** via WebAudio gain automation (`gain.linearRampToValueAtTime`), scheduled on clip activation. For video, a black overlay div sits on top of the active `<video>` for visual fade.
- **Seek across project** — project time `T` maps to `(clip, localTime)` by walking clip durations. Seek = activate that clip, set its `currentTime`, rebuild audio graph.
- **Crop preview** — CSS `clip-path: inset(...)` + `transform: scale + translate` on the `<video>` element to show only the crop region. Same math drives both the clip editor overlay and project playback.
- **End of clip** — detected via `timeupdate` when `currentTime >= trim.end`. Swap visibility to the preloaded next element, activate its audio graph, start preloading the clip *after* that one. Last clip → pause at project end.

### Audio projects

Same architecture with `<audio>` elements, no overlay or crop logic.

## Crop

### Project aspect picker (video projects only)

Above the clip list. Buttons show a **mini CSS shape icon** (rectangle in actual proportions), a **familiar name**, and the **raw ratio** as a gray subtitle.

| Ratio | EN label | HE label | Subtitle |
|---|---|---|---|
| 16:9 | YouTube / TV | יוטיוב / טלוויזיה | 16:9 landscape |
| 9:16 | TikTok / Reels / Stories | טיקטוק / ריילס / סטורי | 9:16 vertical |
| 1:1 | Instagram post / square | פוסט אינסטגרם / ריבוע | 1:1 square |
| 4:3 | Classic / old TV | קלאסי / טלוויזיה ישנה | 4:3 |
| 3:4 | Portrait photo | תמונת פורטרט | 3:4 vertical |

Locked once the first clip is added; changing it pops a "this will reset all crop regions, continue?" confirm.

### Per-clip crop overlay

Shown on the video editor when a clip is selected and project has an aspect:
- Rectangle overlay on the `<video>` with colored border + darkened area outside.
- Aspect is **locked to the project aspect** — user can't draw an off-aspect crop.
- 8 drag handles (4 corners + 4 edges) to resize; dragging the interior moves it. Handles snap to element boundaries.
- Above the overlay: preset buttons — "Full frame", "Center", "Left half", "Right half", "Top half", "Bottom half". Each has a tiny shape icon showing where the crop sits inside the frame. Plus a "Free" toggle that turns off preset-snap (resize/move stay aspect-locked).

### Defaults

- Source aspect matches project aspect → default crop = full frame.
- Source aspect differs from project aspect → default crop = centered max-fit rectangle of the project aspect inside the source.

### Storage

`crop` is stored as normalized `{x, y, width, height}` in `[0, 1]` against the source frame (per data model).

## Export pipeline

One button on the project view: **"Download merged file"**.

### Per-clip normalize pass

For each clip, in order:

1. Run the **existing per-clip FFmpeg pipeline** (trim, volume, fades, speed, EQ) via `buildFFmpegArgs`. Pitch removed.
2. **Video clips** additionally append `crop=W:H:X:Y,scale=<projectW>:<projectH>,setsar=1` to normalize every clip to the project's exact output resolution and pixel aspect.
3. All clips re-encode audio to a common codec / sample rate / channel layout so concat accepts them:
   - **Video projects:** AAC `48000 Hz` stereo in the MP4 container.
   - **Audio projects:** MP3 `44100 Hz` stereo.
4. Write each normalized clip to ffmpeg.wasm's virtual FS as `clip_0.<ext>`, `clip_1.<ext>`, etc.

### Target output resolution (video)

Fixed baseline: **1080 on the short edge**. Derived per aspect:
- `16:9` → `1920×1080`
- `9:16` → `1080×1920`
- `1:1` → `1080×1080`
- `4:3` → `1440×1080`
- `3:4` → `1080×1440`

### Concat pass

- Create `list.txt` listing the normalized clip files in order.
- Run `ffmpeg -f concat -safe 0 -i list.txt -c copy output.<mp3|mp4>`. Since normalize already matched codec + resolution + sample rate, concat demuxer copies streams — no re-encode, fast.
- Download the resulting blob. Filename = `merged.<mp3|mp4>` for now (project name is a future iteration).

### Progress

Total progress = weighted average across the `N + 1` FFmpeg runs (`N` normalize passes + 1 concat). Shown in the existing progress UI the current `ExportButton` uses.

### Memory

Peak memory ≈ sum of input sizes + normalized sizes. With the existing 200 MB per-clip cap and ffmpeg.wasm's ~2 GB tab limit, **4–6 clips at max size is realistic**. Soft warning shown at "project total > 500 MB."

### Error handling

- Any clip's normalize step fails → export aborts, toast reads "Clip #N failed to process — try replacing it."
- Concat fails → toast + leave the normalized intermediates so a retry is fast.
- OOM → catch ffmpeg.wasm exception, show "Project too large — try shorter clips or fewer of them."

## Testing

Lightweight — this is a solo app, not a library. Not every module gets a test.

- **Unit tests on pure functions:** `buildFFmpegArgs` (updated, no pitch), new `buildNormalizeArgs`, new `buildConcatCommand`, and the project-time → (clip, localTime) mapper. These are pure input → argv / input → output transforms; easy to cover.
- **One integration smoke test:** render a 2-clip audio project (tiny test fixtures, ~1 s each to keep it fast) end-to-end in a test runner and diff the output against a committed reference file. This is the single test that actually catches regressions across the whole pipeline.
- **No component tests for crop overlay / clip list / playback engine.** They'd be brittle and the value is visual — manual browser verification covers them.

## i18n

New keys added to both `he.json` and `en.json`:
- Project-view UI: add clip prompts, aspect picker, master timeline labels, export button label, "Need more tools? →" link.
- Aspect options (5 entries, see table above).
- Crop presets (6 entries: full/center/left/right/top/bottom halves).
- Errors: mismatched-type toast, clip-process-failed, concat-failed, OOM, project-too-large warning.

Existing key `editor.loadingFFmpeg` and friends remain.

## Files touched (inventory)

Approximate — refined during plan writing:

- `shared/types.ts` — rewrite (Track → Clip, add Project/CropRegion/Aspect, remove pitch).
- `packages/client/src/App.tsx` — swap Track state for Project state, add project-view branch.
- `packages/client/src/components/TrackEditor.tsx` — rename props, drop Export/Back, pitch removed from Controls.
- `packages/client/src/components/Controls.tsx` — remove pitch slider.
- `packages/client/src/components/FileInput.tsx` — "first add creates project", "type-mismatch rejected."
- `packages/client/src/components/ExportButton.tsx` — becomes project-level; uses new concat pipeline.
- `packages/client/src/lib/ffmpeg-commands.ts` — update `buildFFmpegArgs` (no pitch), add `buildNormalizeArgs`, add concat helper.
- **New:** `packages/client/src/components/ProjectView.tsx` — layout shell.
- **New:** `packages/client/src/components/ClipList.tsx` — clip list + add-clip form + reorder.
- **New:** `packages/client/src/components/AspectPicker.tsx` — the 5-button picker with shape icons.
- **New:** `packages/client/src/components/CropOverlay.tsx` — drag-to-resize/move overlay + presets.
- **New:** `packages/client/src/components/MasterTimeline.tsx` — project-wide seekbar.
- **New:** `packages/client/src/lib/playback-engine.ts` — two-element swap, WebAudio graph, project-time clock.
- **New:** `packages/client/src/lib/project-time.ts` — project-time ↔ (clip, localTime) math.
- `packages/client/src/i18n/he.json` + `en.json` — new keys.
- Remove `pitch` references from tests and fixtures if any.

## Open questions / deferred

- **Project name / rename.** Filename is `merged.<ext>` for v1. Adding a name field is trivial later.
- **Project save / reload.** Out of scope. Reloading the page loses the project. IndexedDB persistence can come later.
- **Shared-effects shortcut** (e.g., "apply this fade-out to all clips"). Out of scope; easy to add once the multi-clip state exists.
- **Clip duplication.** Out of scope; easy later.
