'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import { LeadFilter, filterToSearchParams, searchParamsToFilter } from '@/lib/filters';

/**
 * Two-way bind a LeadFilter to the page's URL search params.
 * Setting a key clears it when value is undefined/empty so URLs stay tidy.
 */
export function useLeadsFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const filter = useMemo<LeadFilter>(
    () => searchParamsToFilter(new URLSearchParams(sp.toString())),
    [sp],
  );

  const replace = useCallback(
    (next: LeadFilter) => {
      const qs = filterToSearchParams(next);
      router.replace(qs.toString() ? `${pathname}?${qs.toString()}` : pathname);
    },
    [pathname, router],
  );

  const set = useCallback(
    <K extends keyof LeadFilter>(key: K, value: LeadFilter[K]) => {
      const next: LeadFilter = { ...filter };
      if (value === undefined || value === '' || value === null) {
        delete next[key];
      } else {
        next[key] = value;
      }
      replace(next);
    },
    [filter, replace],
  );

  const clear = useCallback(() => replace({ orderBy: filter.orderBy }), [filter.orderBy, replace]);

  return { filter, set, replace, clear };
}
