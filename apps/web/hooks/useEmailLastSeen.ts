'use client';

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'onspace.email-last-seen.v1';

type LastSeen = Record<string, string>;

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
 * Per-lead "I have seen the latest message" cursor for the /emails inbox.
 * Frontend-only — when the user opens a thread we record the current
 * lastAt ISO timestamp; a conversation row is unread if its lastReplyAt
 * is greater than the stored cursor. Mirrors the useStageLastSeen
 * pattern: cross-tab sync via the storage event.
 */
export function useEmailLastSeen() {
  const [seen, setSeen] = useState<LastSeen>(read);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      setSeen(read());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const markSeen = useCallback((leadId: string, when: string) => {
    const next: LastSeen = { ...read(), [leadId]: when };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore quota errors
    }
    setSeen(next);
  }, []);

  const isUnread = useCallback(
    (leadId: string, lastReplyAt: string | null) => {
      if (!lastReplyAt) return false;
      const cursor = seen[leadId];
      if (!cursor) return true;
      return new Date(lastReplyAt).getTime() > new Date(cursor).getTime();
    },
    [seen],
  );

  return { seen, markSeen, isUnread } as const;
}
