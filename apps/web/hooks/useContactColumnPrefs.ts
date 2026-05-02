'use client';

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'onspace.contacts.columnPrefs.v1';

export const ALL_CONTACT_COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: 'type', label: 'Type' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'status', label: 'Status' },
  { key: 'confidence', label: 'Confidence' },
  { key: 'business', label: 'Business' },
  { key: 'location', label: 'Location' },
  { key: 'category', label: 'Category' },
  { key: 'source', label: 'Source' },
  { key: 'updated', label: 'Updated' },
] as const;

export type ContactColumnKey = (typeof ALL_CONTACT_COLUMNS)[number]['key'];

const DEFAULT_VISIBLE: ContactColumnKey[] = [
  'name',
  'type',
  'email',
  'phone',
  'status',
  'business',
  'location',
  'updated',
];

export function useContactColumnPrefs() {
  const [visible, setVisible] = useState<Set<ContactColumnKey>>(
    new Set(DEFAULT_VISIBLE),
  );
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const arr = JSON.parse(raw) as ContactColumnKey[];
        if (Array.isArray(arr)) setVisible(new Set(arr));
      }
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  const persist = useCallback((next: Set<ContactColumnKey>) => {
    setVisible(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(Array.from(next)),
      );
    }
  }, []);

  const toggle = useCallback(
    (key: ContactColumnKey) => {
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
