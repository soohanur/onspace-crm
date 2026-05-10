'use client';

import { useCallback, useEffect, useState } from 'react';
import type { LeadStage } from '@/lib/api';

const STORAGE_KEY = 'onspace.stage-last-seen.v1';

type LastSeen = Partial<Record<LeadStage, string>>;

function read(): LastSeen {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as LastSeen) : {};
  } catch {
    return {};
  }
}

/**
 * Per-stage "last visited" timestamps stored in localStorage. Used by
 * the /lead-stage page to highlight stages that have new arrivals
 * (leads whose stageChangedAt > seenAt) and to clear the badge when
 * the user opens that tab. Synced across tabs via the storage event so
 * marking a stage read in one tab updates the other.
 */
export function useStageLastSeen() {
  const [seen, setSeen] = useState<LastSeen>(read);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      setSeen(read());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const markSeen = useCallback((stage: LeadStage, when?: Date) => {
    const ts = (when ?? new Date()).toISOString();
    const next: LastSeen = { ...read(), [stage]: ts };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore quota errors — the worst case is we re-highlight on next visit
    }
    setSeen(next);
  }, []);

  const reset = useCallback(() => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    setSeen({});
  }, []);

  return { seen, markSeen, reset };
}
