import { useState, useCallback, useEffect, useRef } from 'react';

export interface HistoryState<T> {
  current: T;
  /** Update value AND push previous state to undo history. Use for discrete actions. */
  set: (value: T) => void;
  /** Update value WITHOUT creating a history entry. Use during drags/continuous changes. */
  replace: (value: T) => void;
  /** Set value and clear all history. Use when loading a new file. */
  reset: (value: T) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

const MAX_HISTORY = 100;

export function useHistory<T>(initial: T): HistoryState<T> {
  const [current, setCurrent] = useState<T>(initial);
  const pastRef = useRef<T[]>([]);
  const futureRef = useRef<T[]>([]);

  // set: push the old value to history, then update
  const set = useCallback((value: T) => {
    setCurrent((prev) => {
      pastRef.current = [...pastRef.current.slice(-(MAX_HISTORY - 1)), prev];
      futureRef.current = [];
      return value;
    });
  }, []);

  // replace: update current without touching history (for mid-drag updates)
  const replace = useCallback((value: T) => {
    setCurrent(value);
    futureRef.current = [];
  }, []);

  // reset: set new value and clear all history (for loading a new file)
  const reset = useCallback((value: T) => {
    setCurrent(value);
    pastRef.current = [];
    futureRef.current = [];
  }, []);

  const undo = useCallback(() => {
    setCurrent((prev) => {
      if (pastRef.current.length === 0) return prev;
      const previous = pastRef.current[pastRef.current.length - 1];
      pastRef.current = pastRef.current.slice(0, -1);
      futureRef.current = [...futureRef.current, prev];
      return previous;
    });
  }, []);

  const redo = useCallback(() => {
    setCurrent((prev) => {
      if (futureRef.current.length === 0) return prev;
      const next = futureRef.current[futureRef.current.length - 1];
      futureRef.current = futureRef.current.slice(0, -1);
      pastRef.current = [...pastRef.current, prev];
      return next;
    });
  }, []);

  // Force re-render when past/future lengths change for canUndo/canRedo
  const [, forceRender] = useState(0);
  const prevPastLen = useRef(0);
  const prevFutureLen = useRef(0);

  useEffect(() => {
    const check = () => {
      if (
        pastRef.current.length !== prevPastLen.current ||
        futureRef.current.length !== prevFutureLen.current
      ) {
        prevPastLen.current = pastRef.current.length;
        prevFutureLen.current = futureRef.current.length;
        forceRender((n) => n + 1);
      }
    };
    const id = setInterval(check, 100);
    return () => clearInterval(id);
  }, []);

  return {
    current,
    set,
    replace,
    reset,
    undo,
    redo,
    canUndo: pastRef.current.length > 0,
    canRedo: futureRef.current.length > 0,
  };
}
