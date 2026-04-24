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
