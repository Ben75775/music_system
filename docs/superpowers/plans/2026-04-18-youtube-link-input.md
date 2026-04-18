# YouTube Link Input Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users paste a YouTube URL on the landing page, pick MP3 or MP4, and land in the editor with the media loaded — completing the stubbed YouTube feature already referenced in i18n files and `api/youtube.ts`.

**Architecture:** Serverless `/api/youtube` proxies the public Cobalt API (`api.cobalt.tools`), streams the media bytes through the Vercel function with a `Cross-Origin-Resource-Policy: cross-origin` header so the COEP `require-corp` page can consume it. Frontend adds a URL input + format-choice step to `FileInput.tsx`, pipes the streamed response into a `Blob`, and constructs the same `Track` object the file-upload path builds — downstream editor unchanged.

**Tech Stack:** React 18 + Vite 6 + TypeScript 5 · Tailwind · i18next (he/en) · Vercel Functions (Node.js) · native `fetch` + Web Streams · Cobalt public API.

**Testing note:** The project has no test framework configured (no vitest/jest in `packages/client/package.json`). The spec §5 explicitly specifies manual browser verification at `http://localhost:5173` and a production smoke test; that is the project's current convention and this plan follows it. Adding a test framework is out of scope.

**Design spec:** `docs/superpowers/specs/2026-04-18-youtube-link-input-design.md` (commit `c5d7200`).

---

## File Structure

| Path | Responsibility | Change |
|------|---------------|--------|
| `packages/client/src/i18n/en.json` | English strings | Modify: add 9 keys under `input.*` |
| `packages/client/src/i18n/he.json` | Hebrew strings | Modify: add 9 keys under `input.*` |
| `packages/client/src/components/FileInput.tsx` | Landing-page entry — file upload + (new) YouTube URL + format choice + fetch | Modify: grows from ~140 → ~230 lines; still one component because the landing-page entry is one user-flow unit |
| `api/youtube.ts` | Serverless function: validate, call Cobalt, stream bytes back with CORP header | Rewrite: replace 501 stub |

---

## Task 1: Add i18n keys (he + en)

**Files:**
- Modify: `packages/client/src/i18n/en.json`
- Modify: `packages/client/src/i18n/he.json`

- [ ] **Step 1: Add keys to `en.json`**

Open `packages/client/src/i18n/en.json` and replace the `input` object with:

```json
"input": {
  "uploadTitle": "Upload a file",
  "uploadDesc": "Drag & drop an MP3 or MP4 file here, or click to browse",
  "orYoutube": "Or paste a YouTube link",
  "youtubePlaceholder": "https://www.youtube.com/watch?v=...",
  "edit": "Edit",
  "loading": "Loading...",
  "invalidFile": "Please upload an MP3 or MP4 file",
  "fileTooLarge": "File is too large (max 200MB)",
  "invalidUrl": "Please paste a valid YouTube link",
  "chooseFormat": "Choose format for",
  "formatMp3Label": "MP3 (audio only)",
  "formatMp4Label": "MP4 (video)",
  "fetch": "Fetch",
  "cancel": "Cancel",
  "ytUnavailable": "This video can't be downloaded",
  "ytTimeout": "Download timed out. Try a shorter video.",
  "ytNetwork": "Network error. Check connection and try again."
}
```

- [ ] **Step 2: Add the same keys to `he.json`**

Open `packages/client/src/i18n/he.json` and replace the `input` object with:

```json
"input": {
  "uploadTitle": "העלאת קובץ",
  "uploadDesc": "גררו קובץ MP3 או MP4 לכאן, או לחצו לבחירה",
  "orYoutube": "או הדביקו לינק מיוטיוב",
  "youtubePlaceholder": "https://www.youtube.com/watch?v=...",
  "edit": "ערוך",
  "loading": "טוען...",
  "invalidFile": "יש להעלות קובץ MP3 או MP4",
  "fileTooLarge": "הקובץ גדול מדי (מקסימום 200MB)",
  "invalidUrl": "הדביקו לינק תקין של יוטיוב",
  "chooseFormat": "בחרו פורמט עבור",
  "formatMp3Label": "MP3 (אודיו בלבד)",
  "formatMp4Label": "MP4 (וידאו)",
  "fetch": "הבא",
  "cancel": "ביטול",
  "ytUnavailable": "לא ניתן להוריד את הסרטון הזה",
  "ytTimeout": "ההורדה ארכה זמן רב מדי. נסו סרטון קצר יותר.",
  "ytNetwork": "שגיאת רשת. בדקו את החיבור ונסו שוב."
}
```

- [ ] **Step 3: Verify JSON parses**

Run: `node -e "JSON.parse(require('fs').readFileSync('packages/client/src/i18n/en.json')); JSON.parse(require('fs').readFileSync('packages/client/src/i18n/he.json')); console.log('ok')"`

Expected output: `ok`

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/i18n/en.json packages/client/src/i18n/he.json
git commit -m "i18n: add YouTube input + format-choice strings (he/en)"
```

---

## Task 2: Rewrite `api/youtube.ts` — Cobalt proxy with streaming

**Files:**
- Rewrite: `api/youtube.ts`

- [ ] **Step 1: Replace the entire file contents**

Overwrite `api/youtube.ts` with:

```ts
export const config = { runtime: 'nodejs' };

const YT_URL_RE = /^https?:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//i;
const MAX_BYTES = 200 * 1024 * 1024; // 200 MB
const UPSTREAM_TIMEOUT_MS = 25_000;
const COBALT_ENDPOINT = 'https://api.cobalt.tools/';

type Body = { url?: unknown; format?: unknown };

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad_json' }, 400);
  }

  const url = typeof body.url === 'string' ? body.url.trim() : '';
  const format = body.format === 'mp4' ? 'mp4' : body.format === 'mp3' ? 'mp3' : null;
  if (!YT_URL_RE.test(url) || !format) {
    return json({ error: 'bad_input' }, 400);
  }

  const cobaltBody =
    format === 'mp3'
      ? { url, downloadMode: 'audio', audioFormat: 'mp3' }
      : { url, downloadMode: 'auto', videoQuality: '720' };

  let cobaltRes: Response;
  try {
    cobaltRes = await fetch(COBALT_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(cobaltBody),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (e) {
    const msg = isTimeout(e) ? 'timeout' : 'cobalt_unreachable';
    return json({ error: msg }, msg === 'timeout' ? 504 : 502);
  }

  let cobaltJson: any;
  try {
    cobaltJson = await cobaltRes.json();
  } catch {
    return json({ error: 'cobalt_bad_response' }, 502);
  }

  const status = cobaltJson?.status;
  if (status !== 'tunnel' && status !== 'redirect') {
    const reason = typeof cobaltJson?.error?.code === 'string'
      ? cobaltJson.error.code
      : typeof cobaltJson?.text === 'string'
        ? cobaltJson.text.slice(0, 60)
        : status ?? 'unknown';
    return json({ error: 'cobalt_refused', reason }, 502);
  }

  const mediaUrl = typeof cobaltJson.url === 'string' ? cobaltJson.url : '';
  const filename = typeof cobaltJson.filename === 'string' ? cobaltJson.filename : `youtube.${format}`;
  if (!mediaUrl) return json({ error: 'cobalt_bad_response' }, 502);

  let upstream: Response;
  try {
    upstream = await fetch(mediaUrl, {
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (e) {
    return json({ error: isTimeout(e) ? 'timeout' : 'upstream_unreachable' }, isTimeout(e) ? 504 : 502);
  }

  if (!upstream.ok || !upstream.body) {
    return json({ error: 'upstream_error', status: upstream.status }, 502);
  }

  const lenHeader = upstream.headers.get('content-length');
  if (lenHeader) {
    const len = Number(lenHeader);
    if (Number.isFinite(len) && len > MAX_BYTES) {
      return json({ error: 'too_large' }, 413);
    }
  }

  const contentType = format === 'mp3' ? 'audio/mpeg' : 'video/mp4';

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'content-type': contentType,
      'content-disposition': `attachment; filename="${filename.replace(/"/g, '')}"`,
      'cross-origin-resource-policy': 'cross-origin',
      'cache-control': 'no-store',
    },
  });
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

function isTimeout(e: unknown): boolean {
  return e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');
}
```

- [ ] **Step 2: Typecheck the API file locally**

The client `tsconfig.json` does not include `api/`, so `npm run build` does not check this file. Run a one-off typecheck:

`npx --yes -p typescript@5.9.3 tsc --noEmit --strict --target ES2022 --module ESNext --moduleResolution node --lib ES2022,DOM api/youtube.ts`

Expected: no output (exit code 0). If errors appear, fix them before continuing — this is the same check Vercel runs at deploy time, so catching it here avoids a failed deploy.

- [ ] **Step 3: Commit**

```bash
git add api/youtube.ts
git commit -m "feat(api): proxy YouTube downloads via Cobalt with streaming"
```

---

## Task 3: Frontend — add YouTube URL input and format-choice panel

**Files:**
- Modify: `packages/client/src/components/FileInput.tsx`

This task replaces the entire `FileInput.tsx` file. Read the current file first (`packages/client/src/components/FileInput.tsx`) so you understand the `processFile` / `getMediaDuration` / `Track` construction you're keeping, then overwrite with the version below which keeps that logic and adds the YouTube flow alongside it.

- [ ] **Step 1: Replace `FileInput.tsx` entirely**

```tsx
import { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { Track } from 'shared/types';
import { DEFAULT_EFFECTS } from 'shared/types';

const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200MB
const ACCEPTED_TYPES = ['audio/mpeg', 'audio/mp3', 'video/mp4'];
const YT_URL_RE = /^https?:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//i;

type YTFormat = 'mp3' | 'mp4';
type YTStage = 'idle' | 'choose' | 'loading';

interface FileInputProps {
  onFileReady: (track: Track) => void;
}

export default function FileInput({ onFileReady }: FileInputProps) {
  const { t } = useTranslation();
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // YouTube flow state
  const [ytUrl, setYtUrl] = useState('');
  const [ytStage, setYtStage] = useState<YTStage>('idle');
  const [ytFormat, setYtFormat] = useState<YTFormat>('mp3');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const processFile = useCallback(
    async (file: File) => {
      setError(null);
      if (!ACCEPTED_TYPES.includes(file.type)) {
        setError(t('input.invalidFile'));
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        setError(t('input.fileTooLarge'));
        return;
      }
      setLoading(true);
      try {
        const url = URL.createObjectURL(file);
        const type: 'audio' | 'video' = file.type.startsWith('video/')
          ? 'video'
          : 'audio';
        const duration = await getMediaDuration(url, type);
        const track: Track = {
          id: crypto.randomUUID(),
          name: file.name,
          file,
          url,
          type,
          duration,
          trim: { start: 0, end: duration },
          effects: { ...DEFAULT_EFFECTS },
        };
        onFileReady(track);
      } catch {
        setError(t('input.invalidFile'));
      } finally {
        setLoading(false);
      }
    },
    [onFileReady, t]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const submitUrl = useCallback(() => {
    setError(null);
    const trimmed = ytUrl.trim();
    if (!YT_URL_RE.test(trimmed)) {
      setError(t('input.invalidUrl'));
      return;
    }
    setYtStage('choose');
  }, [ytUrl, t]);

  const cancelYoutube = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setYtStage('idle');
    setError(null);
  }, []);

  const fetchYoutube = useCallback(async () => {
    setError(null);
    setYtStage('loading');
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch('/api/youtube', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: ytUrl.trim(), format: ytFormat }),
        signal: controller.signal,
      });
      if (!res.ok) {
        if (res.status === 413) setError(t('input.fileTooLarge'));
        else if (res.status === 504) setError(t('input.ytTimeout'));
        else setError(t('input.ytUnavailable'));
        setYtStage('idle');
        return;
      }
      const blob = await res.blob();
      if (blob.size > MAX_FILE_SIZE) {
        setError(t('input.fileTooLarge'));
        setYtStage('idle');
        return;
      }
      const type: 'audio' | 'video' = ytFormat === 'mp3' ? 'audio' : 'video';
      const mime = ytFormat === 'mp3' ? 'audio/mpeg' : 'video/mp4';
      const filename = guessFilename(res.headers.get('content-disposition'), ytFormat);
      const file = new File([blob], filename, { type: mime });
      const url = URL.createObjectURL(file);
      const duration = await getMediaDuration(url, type);
      const track: Track = {
        id: crypto.randomUUID(),
        name: filename,
        file,
        url,
        type,
        duration,
        trim: { start: 0, end: duration },
        effects: { ...DEFAULT_EFFECTS },
      };
      setYtStage('idle');
      setYtUrl('');
      onFileReady(track);
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') {
        setYtStage('idle');
        return;
      }
      setError(t('input.ytNetwork'));
      setYtStage('idle');
    } finally {
      abortRef.current = null;
    }
  }, [ytUrl, ytFormat, onFileReady, t]);

  const busy = loading || ytStage === 'loading';

  return (
    <div className="w-full max-w-lg space-y-4">
      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        onClick={() => !busy && fileInputRef.current?.click()}
        className={`
          border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all
          ${dragActive
            ? 'border-primary-500 bg-primary-50'
            : 'border-gray-300 hover:border-primary-400 hover:bg-gray-50'}
          ${busy ? 'opacity-50 pointer-events-none' : ''}
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".mp3,.mp4,audio/mpeg,video/mp4"
          onChange={handleFileChange}
          className="hidden"
        />
        <div className="text-5xl mb-4">🎵</div>
        <p className="text-lg font-semibold text-gray-700">
          {t('input.uploadTitle')}
        </p>
        <p className="text-sm text-gray-500 mt-1">{t('input.uploadDesc')}</p>
      </div>

      {/* Divider */}
      <div className="flex items-center gap-3 text-gray-400 text-sm">
        <div className="flex-1 h-px bg-gray-200" />
        <span>{t('input.orYoutube')}</span>
        <div className="flex-1 h-px bg-gray-200" />
      </div>

      {/* YouTube input or format-choice panel */}
      {ytStage === 'idle' && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submitUrl();
          }}
        >
          <input
            type="url"
            value={ytUrl}
            onChange={(e) => setYtUrl(e.target.value)}
            placeholder={t('input.youtubePlaceholder')}
            className="flex-1 border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:border-primary-500"
            dir="ltr"
            disabled={busy}
          />
          <button
            type="submit"
            disabled={busy || !ytUrl.trim()}
            className="px-5 py-3 rounded-xl bg-primary-600 text-white font-semibold hover:bg-primary-700 disabled:bg-gray-300"
          >
            {t('input.edit')}
          </button>
        </form>
      )}

      {ytStage === 'choose' && (
        <div className="border border-gray-200 rounded-2xl p-5 space-y-4 bg-white">
          <p className="text-sm text-gray-600">
            {t('input.chooseFormat')}{' '}
            <span className="font-mono text-gray-800 break-all">{shortenUrl(ytUrl)}</span>
          </p>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="ytformat"
                checked={ytFormat === 'mp3'}
                onChange={() => setYtFormat('mp3')}
              />
              <span>{t('input.formatMp3Label')}</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="ytformat"
                checked={ytFormat === 'mp4'}
                onChange={() => setYtFormat('mp4')}
              />
              <span>{t('input.formatMp4Label')}</span>
            </label>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={cancelYoutube}
              className="px-4 py-2 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              {t('input.cancel')}
            </button>
            <button
              type="button"
              onClick={fetchYoutube}
              className="px-5 py-2 rounded-xl bg-primary-600 text-white font-semibold hover:bg-primary-700"
            >
              {t('input.fetch')}
            </button>
          </div>
        </div>
      )}

      {ytStage === 'loading' && (
        <div className="border border-gray-200 rounded-2xl p-5 space-y-3 bg-white">
          <p className="text-primary-600 animate-pulse text-center">
            {t('input.loading')}
          </p>
          <div className="flex justify-center">
            <button
              type="button"
              onClick={cancelYoutube}
              className="px-4 py-2 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              {t('input.cancel')}
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-red-500 text-sm text-center font-medium">{error}</p>
      )}

      {/* File-upload loading (local file only) */}
      {loading && ytStage === 'idle' && (
        <p className="text-primary-600 text-sm text-center animate-pulse">
          {t('input.loading')}
        </p>
      )}
    </div>
  );
}

function getMediaDuration(
  url: string,
  type: 'audio' | 'video'
): Promise<number> {
  return new Promise((resolve, reject) => {
    const el = document.createElement(type === 'audio' ? 'audio' : 'video');
    el.preload = 'metadata';
    el.onloadedmetadata = () => resolve(el.duration);
    el.onerror = reject;
    el.src = url;
  });
}

function guessFilename(disposition: string | null, format: YTFormat): string {
  if (disposition) {
    const m = /filename\*?=(?:UTF-8'')?["']?([^"';]+)["']?/i.exec(disposition);
    if (m) {
      try {
        return decodeURIComponent(m[1]);
      } catch {
        return m[1];
      }
    }
  }
  return `youtube.${format}`;
}

function shortenUrl(u: string): string {
  return u.length > 60 ? u.slice(0, 57) + '...' : u;
}
```

- [ ] **Step 2: Verify build and typecheck pass**

Run: `npm run build 2>&1 | tail -10`

Expected: `✓ built in ...`. If TypeScript errors appear, fix them before continuing.

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/components/FileInput.tsx
git commit -m "feat(client): add YouTube URL input + format-choice panel to landing page"
```

---

## Task 4: Local verification at http://localhost:5173

**Files:** none

- [ ] **Step 1: Start the Vite dev server**

Run (in its own terminal): `cd D:/Users/music_system && npm run dev`

Expected: vite prints `Local: http://localhost:5173/`.

Note: `/api/youtube` is a Vercel Function and is **not served by Vite**. For local end-to-end testing, run `npx vercel dev` instead of `npm run dev` (it serves both the static client and the API function). For a UI-only smoke test, `npm run dev` is enough to verify the landing-page layout and client-side URL validation.

- [ ] **Step 2: Smoke-test the landing page UI**

Open http://localhost:5173 in a browser. Confirm:
- Drop zone renders as before
- "— Or paste a YouTube link —" divider appears below the drop zone
- URL input + Edit button visible below the divider

- [ ] **Step 3: Test client-side URL validation**

Paste `https://example.com` into the input, press Enter.
Expected: red "Please paste a valid YouTube link" message, no network request (check DevTools Network tab).

- [ ] **Step 4: Test format-choice panel**

Paste `https://www.youtube.com/watch?v=dQw4w9WgXcQ` (or any real YouTube URL), click Edit.
Expected: panel appears with MP3/MP4 radios (MP3 selected by default), Fetch and Cancel buttons.

Click Cancel.
Expected: returns to the URL input, no error.

- [ ] **Step 5: End-to-end via `vercel dev`**

Stop `npm run dev`. Run: `npx --yes vercel dev`

Open http://localhost:3000 (port printed by vercel dev). Repeat: paste real YouTube URL → Edit → keep MP3 → Fetch.
Expected: "Loading..." appears; within ~10-25 seconds the editor screen appears with the audio loaded; Play works; Export MP3 works.

Repeat with MP4 selected.
Expected: editor shows the video preview + waveform; Play works; Export MP4 works.

- [ ] **Step 6: Test the Cancel-during-fetch flow**

Paste a real YouTube URL → Edit → Fetch. While "Loading..." is showing, click Cancel.
Expected: returns to URL input without a visible error.

- [ ] **Step 7: If any test fails, fix and re-verify**

If any of the above fail, debug locally first. Common issues:
- API returns 502 with `cobalt_refused` → the specific video may be region-locked or rate-limited; try a different one
- CORS/COEP error in console on the blob URL → `Cross-Origin-Resource-Policy` header not making it through; inspect the function response headers in DevTools

---

## Task 5: Deploy

**Files:** none

- [ ] **Step 1: Confirm clean working tree**

Run: `git status --porcelain`
Expected: empty output (all commits from Tasks 1-3 already pushed? if not, push now).

- [ ] **Step 2: Push to `main`**

Run: `git push origin main`
Expected: branches update; Vercel's Git integration auto-triggers a production deploy.

- [ ] **Step 3: Watch the deploy land**

Run: `npx --yes vercel ls music-system 2>&1 | head -15`

Look for a new row with age "just now" or "1m" and state `Building` or `Ready`. Re-run the command every ~30s until state is `Ready`. Alternatively open https://vercel.com/bens-projects-c0a21ddf/music-system in the browser and watch the latest deployment's build logs stream to completion.

- [ ] **Step 4: Production smoke test**

Run: `curl -sI https://music-system-alpha.vercel.app/`
Expected: `HTTP/1.1 200 OK` and headers include `Cross-Origin-Embedder-Policy: require-corp`.

Open https://music-system-alpha.vercel.app/ in a browser, paste a real YouTube URL, pick MP3, click Fetch.
Expected: within ~10-25s the editor screen loads with the audio.

- [ ] **Step 5: Mark the feature done**

If the production smoke test passes, the feature is shipped. No separate commit — the push in Step 2 is the release.

---

## Spec coverage self-review

| Spec section | Task(s) |
|---|---|
| §UX — landing page drop zone unchanged, divider, URL input + Edit | Task 3 |
| §UX — format choice panel (MP3/MP4, default MP3, Fetch/Cancel) | Task 3 |
| §UX — successful fetch constructs same `Track` as file upload | Task 3 |
| §Backend — POST body validation | Task 2 |
| §Backend — Cobalt call with MP3/MP4-specific params | Task 2 |
| §Backend — stream response with CORP header | Task 2 |
| §Backend — 400/502/504/413 error codes | Task 2 |
| §Errors — client-side `invalidUrl` | Task 3 |
| §Errors — server-side → user-facing i18n keys | Task 1 + Task 3 |
| §Errors — Cancel during fetch silent | Task 3 |
| §Verification — local dev smoke | Task 4 |
| §Verification — production smoke | Task 5 |
| §Files touched | Tasks 1-3 cover the four files listed |
