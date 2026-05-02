'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import { GlobalContactsFilter } from '@/lib/api';
import {
  contactFilterToSearchParams,
  searchParamsToContactFilter,
} from '@/lib/contact-filters';

/**
 * Two-way bind a GlobalContactsFilter to the page's URL search params.
 * Setting a key clears it when value is undefined / empty so URLs stay
 * tidy (mirrors useLeadsFilter).
 */
export function useContactsFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const filter = useMemo<GlobalContactsFilter>(
    () => searchParamsToContactFilter(new URLSearchParams(sp.toString())),
    [sp],
  );

  const replace = useCallback(
    (next: GlobalContactsFilter) => {
      const qs = contactFilterToSearchParams(next);
      router.replace(qs.toString() ? `${pathname}?${qs.toString()}` : pathname);
    },
    [pathname, router],
  );

  const set = useCallback(
    <K extends keyof GlobalContactsFilter>(
      key: K,
      value: GlobalContactsFilter[K],
    ) => {
      const next: GlobalContactsFilter = { ...filter };
      if (value === undefined || value === '' || value === null) {
        delete next[key];
      } else {
        (next[key] as GlobalContactsFilter[K]) = value;
      }
      replace(next);
    },
    [filter, replace],
  );

  const clear = useCallback(() => replace({}), [replace]);

  return { filter, set, replace, clear };
}
