/**
 * Custom Hooks
 * Reusable React hooks for common patterns
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

/**
 * Custom hook for debounced values
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Custom hook for localStorage
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, (value: T | ((val: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === 'undefined') return initialValue;

    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(`Error loading localStorage key "${key}":`, error);
      return initialValue;
    }
  });

  const setValue = useCallback(
    (value: T | ((val: T) => T)) => {
      try {
        const valueToStore = value instanceof Function ? value(storedValue) : value;
        setStoredValue(valueToStore);

        if (typeof window !== 'undefined') {
          window.localStorage.setItem(key, JSON.stringify(valueToStore));
        }
      } catch (error) {
        console.error(`Error setting localStorage key "${key}":`, error);
      }
    },
    [key, storedValue]
  );

  return [storedValue, setValue];
}

/**
 * Custom hook for sessionStorage
 */
export function useSessionStorage<T>(
  key: string,
  initialValue: T
): [T, (value: T | ((val: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === 'undefined') return initialValue;

    try {
      const item = window.sessionStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      return initialValue;
    }
  });

  const setValue = useCallback(
    (value: T | ((val: T) => T)) => {
      try {
        const valueToStore = value instanceof Function ? value(storedValue) : value;
        setStoredValue(valueToStore);

        if (typeof window !== 'undefined') {
          window.sessionStorage.setItem(key, JSON.stringify(valueToStore));
        }
      } catch (error) {
        console.error(`Error setting sessionStorage key "${key}":`, error);
      }
    },
    [key, storedValue]
  );

  return [storedValue, setValue];
}

/**
 * Custom hook for window size
 */
export function useWindowSize() {
  const [windowSize, setWindowSize] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 0,
    height: typeof window !== 'undefined' ? window.innerHeight : 0,
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    function handleResize() {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    }

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return windowSize;
}

/**
 * Custom hook for media query
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const media = window.matchMedia(query);
    setMatches(media.matches);

    const listener = () => setMatches(media.matches);
    media.addEventListener('change', listener);

    return () => media.removeEventListener('change', listener);
  }, [query]);

  return matches;
}

/**
 * Custom hook for previous value
 */
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);

  useEffect(() => {
    ref.current = value;
  }, [value]);

  return ref.current;
}

/**
 * Custom hook for async operations
 */
export function useAsync<T, E = string>(
  asyncFunction: () => Promise<T>,
  immediate = true
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<E | null>(null);
  const [status, setStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');

  const execute = useCallback(async () => {
    setStatus('pending');
    setData(null);
    setError(null);

    try {
      const response = await asyncFunction();
      setData(response);
      setStatus('success');
    } catch (error) {
      setError(error as E);
      setStatus('error');
    }
  }, [asyncFunction]);

  useEffect(() => {
    if (immediate) {
      execute();
    }
  }, [execute, immediate]);

  return { data, error, status, execute };
}

/**
 * Custom hook for toggle state
 */
export function useToggle(initialValue = false): [boolean, () => void] {
  const [value, setValue] = useState(initialValue);
  const toggle = useCallback(() => setValue(v => !v), []);
  return [value, toggle];
}

/**
 * Custom hook for array state
 */
export function useArray<T>(initialValue: T[] = []) {
  const [array, setArray] = useState<T[]>(initialValue);

  const push = useCallback((...elements: T[]) => {
    setArray(prev => [...prev, ...elements]);
  }, []);

  const unshift = useCallback((...elements: T[]) => {
    setArray(prev => [...elements, ...prev]);
  }, []);

  const pop = useCallback(() => {
    setArray(prev => prev.slice(0, -1));
  }, []);

  const shift = useCallback(() => {
    setArray(prev => prev.slice(1));
  }, []);

  const splice = useCallback((start: number, deleteCount?: number, ...items: T[]) => {
    setArray(prev => {
      const newArr = [...prev];
      if (deleteCount === undefined) {
        newArr.splice(start);
      } else {
        newArr.splice(start, deleteCount, ...items);
      }
      return newArr;
    });
  }, []);

  const set = useCallback((index: number, value: T) => {
    setArray(prev => {
      const newArr = [...prev];
      newArr[index] = value;
      return newArr;
    });
  }, []);

  const remove = useCallback((index: number) => {
    setArray(prev => prev.filter((_, i) => i !== index));
  }, []);

  const clear = useCallback(() => setArray([]), []);

  return {
    array,
    setArray,
    push,
    unshift,
    pop,
    shift,
    splice,
    set,
    remove,
    clear,
  };
}

/**
 * Custom hook for click outside detection
 */
export function useClickOutside<T extends HTMLElement>(
  callback: () => void
): React.RefObject<T | null> {
  const ref = useRef<T>(null);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        callback();
      }
    };

    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [callback]);

  return ref;
}

/**
 * Custom hook for keyboard shortcuts
 */
export function useKeyboard(
  key: string,
  callback: (event: KeyboardEvent) => void,
  options: { ctrl?: boolean; shift?: boolean; alt?: boolean } = {}
) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const keyMatch = event.key === key;
      const ctrlMatch = !options.ctrl || event.ctrlKey;
      const shiftMatch = !options.shift || event.shiftKey;
      const altMatch = !options.alt || event.altKey;

      if (keyMatch && ctrlMatch && shiftMatch && altMatch) {
        callback(event);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [key, callback, options]);
}

/**
 * Custom hook for interval
 */
export function useInterval(callback: () => void, delay: number | null) {
  const savedCallback = useRef(callback);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (delay === null) return;

    const tick = () => savedCallback.current();
    const id = setInterval(tick, delay);

    return () => clearInterval(id);
  }, [delay]);
}

/**
 * Custom hook for mounting state
 */
export function useMounted(): boolean {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    return () => setIsMounted(false);
  }, []);

  return isMounted;
}

/**
 * Custom hook for force update
 */
export function useForceUpdate() {
  const [, setTick] = useState(0);
  return useCallback(() => setTick(tick => tick + 1), []);
}

/**
 * Custom hook for first render detection
 */
export function useFirstRender(): boolean {
  const isFirstRender = useRef(true);

  useEffect(() => {
    isFirstRender.current = false;
  }, []);

  return isFirstRender.current;
}

/**
 * Custom hook for scroll position
 */
export function useScrollPosition() {
  const [scrollPosition, setScrollPosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const updatePosition = () => {
      setScrollPosition({
        x: window.pageXOffset,
        y: window.pageYOffset,
      });
    };

    window.addEventListener('scroll', updatePosition);
    updatePosition();

    return () => window.removeEventListener('scroll', updatePosition);
  }, []);

  return scrollPosition;
}

/**
 * Custom hook for mouse position
 */
export function useMousePosition() {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const updateMousePosition = (e: MouseEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
    };

    window.addEventListener('mousemove', updateMousePosition);
    return () => window.removeEventListener('mousemove', updateMousePosition);
  }, []);

  return mousePosition;
}

/**
 * Custom hook for element size
 */
export function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!ref.current) return;

    const observer = new ResizeObserver(([entry]) => {
      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });

    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return { ref, ...size };
}

/**
 * Custom hook for copied state
 */
export function useCopiedText(initialCopied = false, duration = 2000) {
  const [isCopied, setIsCopied] = useState(initialCopied);

  const copy = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
    setIsCopied(true);
  }, []);

  useEffect(() => {
    if (isCopied) {
      const timeout = setTimeout(() => setIsCopied(false), duration);
      return () => clearTimeout(timeout);
    }
  }, [isCopied, duration]);

  return { isCopied, copy };
}
