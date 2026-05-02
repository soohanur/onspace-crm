'use client';

export const dynamic = 'force-dynamic';

import { Suspense, useMemo, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useContactsFilter } from '@/hooks/useContactsFilter';
import { useContactColumnPrefs } from '@/hooks/useContactColumnPrefs';
import { Card } from '@/components/ui/Card';
import { ContactFilterPanel } from '@/components/contacts/ContactFilterPanel';
import { ContactsTable } from '@/components/contacts/ContactsTable';
import { ContactColumnToggle } from '@/components/contacts/ContactColumnToggle';
import { CheckCircle2, Mail, Phone, UserCircle2, Users, X } from 'lucide-react';

const PAGE_SIZE = 50;

export default function ContactsPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-[1400px] mx-auto px-6 py-8 text-ink-muted">
          Loading…
        </div>
      }
    >
      <Body />
    </Suspense>
  );
}

function Body() {
  const { filter } = useContactsFilter();
  const { visible } = useContactColumnPrefs();

  // Stable filter-equality key so the queries re-fetch when filters
  // actually change (the URLSearchParams string is order-insensitive
  // here because we always emit keys in the same order).
  const filterKey = useMemo(() => JSON.stringify(filter), [filter]);

  const list = useInfiniteQuery({
    queryKey: ['contacts-list', filterKey],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api.listGlobalContacts({
        ...filter,
        take: PAGE_SIZE,
        cursor: pageParam ?? undefined,
      }),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });

  const stats = useQuery({
    queryKey: ['contacts-stats', filterKey],
    queryFn: () => api.getContactsStats(filter),
  });

  const items = useMemo(
    () => list.data?.pages.flatMap((p) => p.items) ?? [],
    [list.data?.pages],
  );

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () =>
    setSelectedIds((prev) => {
      if (items.length > 0 && items.every((c) => prev.has(c.id))) return new Set();
      return new Set(items.map((c) => c.id));
    });
  const clearSelection = () => setSelectedIds(new Set());

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-h1 mb-1">Contacts</h1>
        <p className="text-ink-muted text-bodysm">
          All structured contacts across every business in your CRM. Click
          any row to open the parent lead.
        </p>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <StatCard
          icon={<Users size={14} />}
          label="Total"
          value={stats.data?.total}
        />
        <StatCard
          icon={<UserCircle2 size={14} />}
          label="Owners"
          value={stats.data?.owners}
        />
        <StatCard
          icon={<CheckCircle2 size={14} className="text-success" />}
          label="Verified"
          value={stats.data?.verified}
        />
        <StatCard
          icon={<Mail size={14} />}
          label="With email"
          value={stats.data?.withEmail}
        />
        <StatCard
          icon={<Phone size={14} />}
          label="With phone"
          value={stats.data?.withPhone}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
        <div>
          <ContactFilterPanel />
        </div>

        <div className="min-w-0 space-y-3">
          {/* Toolbar */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-caption text-ink-muted">
              {list.isLoading
                ? 'Loading…'
                : `${items.length} contact${items.length === 1 ? '' : 's'}`}
              {selectedIds.size > 0 && (
                <span className="ml-3 inline-flex items-center gap-1 text-primary">
                  · {selectedIds.size} selected
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="text-ink-muted hover:text-error inline-flex items-center gap-1"
                  >
                    <X size={11} />
                    clear
                  </button>
                </span>
              )}
            </div>
            <ContactColumnToggle />
          </div>

          <Card className="!p-0 overflow-hidden">
            <ContactsTable
              contacts={items}
              visibleColumns={visible}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              onToggleAll={toggleAll}
            />
          </Card>

          {list.hasNextPage && (
            <div className="flex justify-center pt-2">
              <button
                onClick={() => list.fetchNextPage()}
                disabled={list.isFetchingNextPage}
                className="h-9 px-4 rounded-md border border-border bg-surface text-bodysm text-ink hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
              >
                {list.isFetchingNextPage ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | undefined;
}) {
  return (
    <Card className="!p-3">
      <div className="text-caption text-neutral inline-flex items-center gap-1.5">
        {icon}
        {label}
      </div>
      <div className="text-h2 font-mono font-tabular mt-1">
        {value === undefined ? '—' : value.toLocaleString()}
      </div>
    </Card>
  );
}
