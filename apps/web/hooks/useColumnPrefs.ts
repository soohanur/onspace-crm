'use client';

import { useCallback, useEffect, useState } from 'react';

// v5 — Phase 19: dense single-line rows + Source column. Bumping the
// storage key forces every existing user onto the new default visible
// set so the table loads dense by default.
const STORAGE_KEY = 'onspace.leads.columnPrefs.v5';

export const ALL_COLUMNS = [
  { key: 'business', label: 'Business' },
  { key: 'stage', label: 'Stage' },
  { key: 'category', label: 'Category' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'score', label: 'Score' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'website', label: 'Website' },
  { key: 'social', label: 'Social' },
  { key: 'address', label: 'Address' },
  { key: 'source', label: 'Source' },
  { key: 'rating', label: 'Rating' },
  { key: 'years', label: 'Years' },
  { key: 'owner', label: 'Owner' },
  { key: 'yp', label: 'YP Listing' },
  { key: 'search', label: 'Search' },
  { key: 'actions', label: 'Actions' },
] as const;

export type ColumnKey = (typeof ALL_COLUMNS)[number]['key'];

const DEFAULT_VISIBLE: ColumnKey[] = [
  'business',
  'stage',
  'category',
  'email',
  'phone',
  'score',
  'tasks',
  'website',
  'social',
  'address',
  'source',
];

export function useColumnPrefs() {
  const [visible, setVisible] = useState<Set<ColumnKey>>(
    new Set(DEFAULT_VISIBLE),
  );
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const arr = JSON.parse(raw) as ColumnKey[];
        if (Array.isArray(arr)) setVisible(new Set(arr));
      }
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  const persist = useCallback((next: Set<ColumnKey>) => {
    setVisible(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(Array.from(next)),
      );
    }
  }, []);

  const toggle = useCallback(
    (key: ColumnKey) => {
      const next = new Set(visible);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      persist(next);
    },
    [visible, persist],
  );

  const reset = useCallback(
    () => persist(new Set(DEFAULT_VISIBLE)),
    [persist],
  );

  return { visible, toggle, reset, hydrated };
}
