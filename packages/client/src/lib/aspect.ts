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
  if (a === 'original') {
    throw new Error("aspectRatio('original') requires explicit source dims");
  }
  const [num, den] = a.split(':').map(Number);
  return num / den;
}

export function outputDimensions(
  a: Aspect,
  sourceDims?: { w: number; h: number }
): { w: number; h: number } {
  if (a === 'original') {
    if (!sourceDims) {
      throw new Error("outputDimensions('original') requires sourceDims");
    }
    return sourceDims;
  }
  // Fixed baseline: 1080 on the short edge.
  switch (a) {
    case '16:9': return { w: 1920, h: 1080 };
    case '9:16': return { w: 1080, h: 1920 };
    case '1:1': return { w: 1080, h: 1080 };
    case '4:3': return { w: 1440, h: 1080 };
    case '3:4': return { w: 1080, h: 1440 };
  }
}
