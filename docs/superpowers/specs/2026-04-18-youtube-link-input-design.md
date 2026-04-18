# YouTube link input on the landing page

## Context

The landing page today exposes only a drag-and-drop / file-picker for local MP3 and MP4 files. The i18n files (`he.json`, `en.json`) already carry strings for a YouTube option (`input.orYoutube`, `input.youtubePlaceholder`, `input.edit`) and `api/youtube.ts` is a 501 stub commented "Placeholder for Phase 3 — YouTube download via Cobalt API proxy." This spec completes that feature: users paste a YouTube URL, choose MP3 or MP4, and the downloaded media enters the editor through the same `Track` pipeline as a local file.

## UX

### Landing page

Existing drop zone remains unchanged. Below it, separated by a faint "— or —" divider:

```
[  https://www.youtube.com/watch?v=...   ]  [  Edit  ]
```

- Single-line text input + "Edit" button (label from existing `input.edit` key).
- Enter key submits (equivalent to clicking Edit).
- Inline error area below, reusing the existing error styling used for file-upload failures.

### Format choice (before any network request)

When the user clicks **Edit** with a non-empty, YouTube-shaped URL, the input transforms in place into a format-chooser panel:

```
Choose format for <short URL>

(•) MP3 (audio only)    ( ) MP4 (video)

[ Cancel ]              [ Fetch ]
```

- Default: **MP3** (primary use case is music editing; smaller downloads).
- **Fetch** starts the backend request; the panel becomes a loading spinner with a Cancel button.
- **Cancel** before Fetch returns to the input; Cancel during loading aborts the in-flight request via `AbortController`.
- No format panel for local file uploads — those already have a known type.

### Success handoff

The backend response body is streamed into a `Blob`. The client then constructs a `Track` identical in shape to the file-upload code path (same `id`, `name` from response's filename, `url = URL.createObjectURL(blob)`, `duration` probed via hidden `<audio>`/`<video>` element, default `trim` and `effects`). Control transfers to the existing editor with no other code changes.

## Backend: `/api/youtube.ts`

Single serverless function. No new npm dependencies — native `fetch`, `ReadableStream`, `AbortSignal.timeout`.

### Contract

- **Request:** `POST /api/youtube`, body `{ "url": string, "format": "mp3" | "mp4" }`
- **Success:** `200` streaming the media bytes
  - `Content-Type: audio/mpeg` or `video/mp4`
  - `Content-Disposition: attachment; filename="<from-cobalt>"`
  - `Cross-Origin-Resource-Policy: cross-origin` (required because the page is served with `Cross-Origin-Embedder-Policy: require-corp` per `vercel.json`)
- **Errors:** `400` invalid body / non-YouTube URL · `502` Cobalt error or picker response · `504` upstream timeout · `413` upstream `Content-Length` exceeds 200 MB

### Flow

1. Parse body; validate `url` matches `^https?://(www\.|m\.)?(youtube\.com|youtu\.be)/` and `format` is `mp3` or `mp4`. Otherwise `400`.
2. `POST https://api.cobalt.tools/` with `Accept: application/json`, body:
   - MP3: `{ url, downloadMode: "audio", audioFormat: "mp3" }`
   - MP4: `{ url, downloadMode: "auto", videoQuality: "720" }`
3. Cobalt reply `{ status, url, filename }`:
   - `tunnel` or `redirect` → proceed with `url` and `filename`
   - `error` or `picker` → `502` with Cobalt's reason string (truncated)
4. `fetch(cobaltUrl, { signal: AbortSignal.timeout(25_000) })`. 25 s leaves headroom under the 30 s cap from `vercel.json`'s `functions["api/*.ts"].maxDuration`.
5. If upstream `Content-Length` > 200 MB → abort and respond `413`.
6. Pipe upstream body straight to response (`new Response(upstream.body, { headers })`) — no buffering, no memory pressure on the function.

### Why this design

- **Proxy, don't redirect:** a redirect to Cobalt's CDN would be cheaper, but the page's `COEP: require-corp` blocks cross-origin resources without the right CORP header. Proxying lets us add `Cross-Origin-Resource-Policy: cross-origin` ourselves. Keeps the existing FFmpeg-WASM-compatible COOP/COEP untouched.
- **Stream, don't buffer:** avoids Vercel Function memory/response-size limits for videos up to ~200 MB.
- **Public Cobalt instance:** no infra to run. If rate limits bite in practice, self-hosting Cobalt is a follow-up, not a blocker.

## Error handling (surfaced in UI)

| Situation | User-facing message key | HTTP |
|---|---|---|
| Empty / non-YouTube URL | `input.invalidUrl` | — (client-side, no request) |
| Cobalt returns error/picker | `input.ytUnavailable` (append Cobalt reason if ≤60 chars) | 502 |
| Upstream timeout (> 25 s) | `input.ytTimeout` | 504 |
| Response > 200 MB | `input.fileTooLarge` (existing) | 413 |
| Network failure | `input.ytNetwork` | — |
| User clicked Cancel during fetch | silent (no message) | — |

New i18n keys added to both `he.json` and `en.json`: `input.invalidUrl`, `input.ytUnavailable`, `input.ytTimeout`, `input.ytNetwork`, `input.chooseFormat`, `input.formatMp3Label`, `input.formatMp4Label`, `input.fetch`, `input.cancel`.

## Files touched

- `packages/client/src/components/FileInput.tsx` — add YouTube input, format-choice panel, fetch flow (~140 → ~220 lines; remains one file because landing-page entry is one unit)
- `packages/client/src/i18n/en.json`, `he.json` — new keys
- `api/youtube.ts` — replace 501 stub with Cobalt-backed streaming implementation

No changes to `vercel.json`, `shared/types.ts`, or any editor component.

## Verification

1. `npm run build` passes (tsc typecheck + Vite bundle).
2. Local dev at http://localhost:5173:
   - Paste a short YouTube music URL → pick MP3 → editor loads → Play works → Export MP3 works.
   - Same URL → pick MP4 → editor loads with video preview + waveform → Play works → Export MP4 works.
   - Paste `https://example.com` → inline invalid-URL error, no request sent.
   - Paste a valid-shape nonexistent video → 502 unavailable message.
   - During fetch, click Cancel → request aborts, no error message.
3. Production smoke (after push to `main` auto-deploys): `curl -I https://music-system-alpha.vercel.app/` still 200 with COEP headers.

## Out of scope

- Migrating `vercel.json` → `vercel.ts` (session hook flagged it; treat as a separate cleanup task).
- Self-hosted Cobalt instance (consider only if public instance rate-limits become a real problem).
- Progress percent during download (no `Content-Length` guaranteed; streaming Blob API can't report progress reliably without extra plumbing).
- Multi-track / playlist / channel URLs (single video only).
