'use client';

import { useQuery } from '@tanstack/react-query';
import { use } from 'react';
import { api } from '@/lib/api';
import { LeadDetailHeader } from '@/components/leads/LeadDetailHeader';
import { LeadOverviewCard } from '@/components/leads/LeadOverviewCard';
import { LeadContactCard } from '@/components/leads/LeadContactCard';
import { LeadSocialCard } from '@/components/leads/LeadSocialCard';
import { LeadSourceCard } from '@/components/leads/LeadSourceCard';
import { LeadNotesPanel } from '@/components/leads/LeadNotesPanel';
import { LeadActivityPanel } from '@/components/leads/LeadActivityPanel';

export default function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, isLoading, error } = useQuery({
    queryKey: ['lead', id],
    queryFn: () => api.getLead(id),
  });

  if (isLoading) {
    return (
      <div className="max-w-[1200px] mx-auto px-6 py-8">
        <div className="animate-pulse text-ink-muted">Loading lead…</div>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="max-w-[1200px] mx-auto px-6 py-8">
        <div className="text-error">Failed to load: {(error as Error)?.message ?? 'not found'}</div>
      </div>
    );
  }

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-8 space-y-6">
      <LeadDetailHeader lead={data} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <LeadOverviewCard lead={data} />
          <LeadNotesPanel leadId={id} />
          <LeadActivityPanel />
        </div>
        <div className="space-y-6">
          <LeadContactCard lead={data} />
          <LeadSocialCard lead={data} />
          <LeadSourceCard lead={data} />
        </div>
      </div>
    </div>
  );
}
