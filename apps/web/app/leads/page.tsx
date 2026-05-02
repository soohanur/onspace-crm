'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { LeadsTable } from '@/components/LeadsTable';

export default function GlobalLeadsPage() {
  const [q, setQ] = useState('');
  const [hasWebsite, setHasWebsite] = useState<'all' | 'true' | 'false'>('all');
  const [hasEmail, setHasEmail] = useState<'all' | 'true' | 'false'>('all');

  const { data: stats } = useQuery({
    queryKey: ['leads-stats-global'],
    queryFn: () => api.leadStats({}),
    refetchInterval: 5_000,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['leads-global', q, hasWebsite, hasEmail],
    queryFn: () =>
      api.listLeads({
        q: q || undefined,
        hasWebsite: hasWebsite === 'all' ? undefined : hasWebsite,
        hasEmail: hasEmail === 'all' ? undefined : hasEmail,
        take: 200,
      }),
    refetchInterval: 5_000,
  });

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-8">
      <h1 className="text-h1 mb-2">Global Leads</h1>
      <p className="text-ink-muted text-bodysm mb-6">
        All leads ever scraped, across every search.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total" value={stats?.total ?? 0} />
        <StatCard label="With Website" value={stats?.withWebsite ?? 0} />
        <StatCard label="With Email" value={stats?.withEmail ?? 0} />
        <StatCard label="With Phone" value={stats?.withPhone ?? 0} />
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="p-4 border-b border-border flex flex-wrap gap-3 items-center">
          <Input
            placeholder="Search business, category, city…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="max-w-[320px]"
          />
          <Select value={hasWebsite} onChange={(e) => setHasWebsite(e.target.value as any)}>
            <option value="all">Website: All</option>
            <option value="true">Has website</option>
            <option value="false">No website</option>
          </Select>
          <Select value={hasEmail} onChange={(e) => setHasEmail(e.target.value as any)}>
            <option value="all">Email: All</option>
            <option value="true">Has email</option>
            <option value="false">No email</option>
          </Select>
          <div className="ml-auto text-bodysm text-ink-muted font-tabular">
            {isLoading ? 'Loading…' : `${data?.items.length ?? 0} shown`}
          </div>
        </div>
        <LeadsTable leads={data?.items ?? []} />
      </Card>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <div className="text-caption uppercase tracking-wider text-neutral mb-2">
        {label}
      </div>
      <div className="text-h1 font-mono font-tabular">{value.toLocaleString()}</div>
    </Card>
  );
}
