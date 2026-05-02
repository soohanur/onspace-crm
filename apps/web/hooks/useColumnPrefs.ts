'use client';

import { useCallback, useEffect, useState } from 'react';

// v3 → added Tasks column. Bumping the storage key resets users to the
// new defaults so the new column shows up.
const STORAGE_KEY = 'onspace.leads.columnPrefs.v3';

export const ALL_COLUMNS = [
  { key: 'business', label: 'Business' },
  { key: 'stage', label: 'Stage' },
  { key: 'score', label: 'Score' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'categories', label: 'Categories' },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
  { key: 'website', label: 'Website' },
  { key: 'address', label: 'Address' },
  { key: 'rating', label: 'Rating' },
  { key: 'years', label: 'Years' },
  { key: 'social', label: 'Social' },
  { key: 'owner', label: 'Owner' },
  { key: 'yp', label: 'YP Listing' },
  { key: 'search', label: 'Search' },
] as const;

export type ColumnKey = (typeof ALL_COLUMNS)[number]['key'];

const DEFAULT_VISIBLE: ColumnKey[] = [
  'business', 'stage', 'score', 'tasks', 'categories', 'phone', 'email',
  'website', 'address', 'rating', 'social', 'yp',
];

export function useColumnPrefs() {
  const [visible, setVisible] = useState<Set<ColumnKey>>(new Set(DEFAULT_VISIBLE));
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
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(next)));
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

  const reset = useCallback(() => persist(new Set(DEFAULT_VISIBLE)), [persist]);

  return { visible, toggle, reset, hydrated };
}
