'use client';

import { useCallback, useEffect, useState } from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'onspace.theme.v1';
const HTML_DARK_CLASS = 'dark';

function readMode(): ThemeMode {
  if (typeof window === 'undefined') return 'system';
  const v = window.localStorage.getItem(STORAGE_KEY);
  if (v === 'light' || v === 'dark' || v === 'system') return v;
  return 'system';
}

function systemIsDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyDarkClass(dark: boolean) {
  if (typeof document === 'undefined') return;
  const html = document.documentElement;
  if (dark) html.classList.add(HTML_DARK_CLASS);
  else html.classList.remove(HTML_DARK_CLASS);
  html.style.colorScheme = dark ? 'dark' : 'light';
}

/**
 * Light / Dark / System theme controller.
 *
 *  - Mode persists in localStorage (`onspace.theme.v1`).
 *  - `system` follows OS preference live (matchMedia listener).
 *  - `dark` adds `.dark` to <html>; Tailwind v3 `darkMode: 'class'` reads it.
 *  - Cross-tab sync via the `storage` event.
 */
export function useTheme() {
  const [mode, setModeState] = useState<ThemeMode>(readMode);
  const [resolved, setResolved] = useState<'light' | 'dark'>(() =>
    readMode() === 'dark' || (readMode() === 'system' && systemIsDark())
      ? 'dark'
      : 'light',
  );

  // Apply class + listen to system changes when in 'system' mode.
  useEffect(() => {
    const compute = () => {
      const isDark = mode === 'dark' || (mode === 'system' && systemIsDark());
      applyDarkClass(isDark);
      setResolved(isDark ? 'dark' : 'light');
    };
    compute();

    if (mode === 'system' && typeof window !== 'undefined' && window.matchMedia) {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const onChange = () => compute();
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    }
  }, [mode]);

  // Cross-tab sync.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      setModeState(readMode());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setMode = useCallback((m: ThemeMode) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, m);
    } catch {
      // ignore quota
    }
    setModeState(m);
  }, []);

  return { mode, setMode, resolved } as const;
}
