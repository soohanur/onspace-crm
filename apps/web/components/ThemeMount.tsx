'use client';

import { useTheme } from '@/hooks/useTheme';

/**
 * Mounts the theme hook at the app root so the .dark class lives on
 * <html> for the whole tree. Pre-paint script in layout.tsx prevents
 * flash; this client component takes over after hydration.
 */
export function ThemeMount() {
  useTheme();
  return null;
}
