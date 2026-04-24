import { describe, it, expect } from 'vitest';
import { parseYoutubeId } from './youtube-thumbnail';

describe('parseYoutubeId', () => {
  it('parses youtube.com/watch?v=...', () => {
    expect(parseYoutubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });
  it('parses youtube.com/watch without www', () => {
    expect(parseYoutubeId('https://youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });
  it('parses youtu.be/...', () => {
    expect(parseYoutubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });
  it('parses shorts', () => {
    expect(parseYoutubeId('https://www.youtube.com/shorts/abc12345XYZ')).toBe('abc12345XYZ');
  });
  it('parses embed', () => {
    expect(parseYoutubeId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });
  it('parses URL with additional query params', () => {
    expect(parseYoutubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s&feature=share')).toBe('dQw4w9WgXcQ');
  });
  it('parses m.youtube.com', () => {
    expect(parseYoutubeId('https://m.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('returns null for non-YouTube URLs', () => {
    expect(parseYoutubeId('https://vimeo.com/12345')).toBeNull();
  });
  it('returns null for garbage input', () => {
    expect(parseYoutubeId('not a url')).toBeNull();
  });
  it('returns null for empty input', () => {
    expect(parseYoutubeId('')).toBeNull();
  });
  it('returns null for YouTube URLs without a video id', () => {
    expect(parseYoutubeId('https://www.youtube.com/feed/trending')).toBeNull();
  });
  it('returns null when id has wrong length', () => {
    expect(parseYoutubeId('https://youtu.be/tooShort')).toBeNull();
    expect(parseYoutubeId('https://youtu.be/tooLongIdentifier')).toBeNull();
  });
});
