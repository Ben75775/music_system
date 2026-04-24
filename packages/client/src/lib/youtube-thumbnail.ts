/**
 * Extract a YouTube video ID from common URL formats.
 * Returns null if the URL doesn't match any recognizable pattern.
 */
export function parseYoutubeId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, '');

  // youtu.be/<ID>
  if (host === 'youtu.be') {
    const id = url.pathname.split('/').filter(Boolean)[0];
    return isValidId(id) ? id : null;
  }

  // youtube.com / m.youtube.com
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
    // /watch?v=<ID>
    const v = url.searchParams.get('v');
    if (v && isValidId(v)) return v;

    // /shorts/<ID> or /embed/<ID> or /live/<ID>
    const segments = url.pathname.split('/').filter(Boolean);
    if (segments.length >= 2 && ['shorts', 'embed', 'live', 'v'].includes(segments[0])) {
      return isValidId(segments[1]) ? segments[1] : null;
    }
  }

  return null;
}

function isValidId(id: string | undefined): id is string {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{11}$/.test(id);
}

/**
 * Fetch the highest-quality thumbnail available for a YouTube video ID.
 * Tries maxresdefault first; falls back to hqdefault if maxres is absent
 * (detected by HTTP 404 OR by the tell-tale 120×90 "no thumbnail" placeholder).
 */
export async function fetchThumbnail(videoId: string): Promise<Blob> {
  const tryFetch = async (quality: string): Promise<Blob | null> => {
    const url = `https://img.youtube.com/vi/${videoId}/${quality}.jpg`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    // YouTube returns a generic 120×90 placeholder for missing maxresdefault.
    // A real thumbnail is always much larger. Use blob.size as a proxy.
    if (blob.size < 5000) return null; // heuristic; real thumbnails ≥ ~30KB
    return blob;
  };

  const best = await tryFetch('maxresdefault');
  if (best) return best;

  const fallback = await tryFetch('hqdefault');
  if (fallback) return fallback;

  throw new Error('thumbnail_unavailable');
}

/** Trigger a client-side save-as for the blob. */
export function downloadThumbnail(blob: Blob, videoId: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `youtube-${videoId}-thumbnail.jpg`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
