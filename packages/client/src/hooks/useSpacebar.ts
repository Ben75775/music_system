import { useEffect } from 'react';

/**
 * Global spacebar shortcut for play/pause.
 * Captures spacebar regardless of which element is focused (sliders, buttons, etc).
 */
export function useSpacebar(togglePlayPause: () => void) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't capture if user is typing in a text input
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' && (e.target as HTMLInputElement).type === 'text') return;
      if (tag === 'TEXTAREA') return;

      if (e.code === 'Space') {
        e.preventDefault(); // Prevent slider movement / page scroll
        togglePlayPause();
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [togglePlayPause]);
}
