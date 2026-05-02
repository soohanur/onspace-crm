'use client';

// useQuery + dynamic [id] segment — opt out of static-paths pre-generation
// so the dev static-paths worker doesn't try to require vendor chunks
// that the dev runtime hasn't built yet.
export const dynamic = 'force-dynamic';

import { useQuery } from '@tanstack/react-query';
import { use, useState } from 'react';
import { api } from '@/lib/api';
import { LeadDetailHeader } from '@/components/leads/LeadDetailHeader';
import { LeadOverviewCard } from '@/components/leads/LeadOverviewCard';
import { LeadContactCard } from '@/components/leads/LeadContactCard';
import { LeadSocialCard } from '@/components/leads/LeadSocialCard';
import { LeadSourceCard } from '@/components/leads/LeadSourceCard';
import { LeadNotesPanel } from '@/components/leads/LeadNotesPanel';
import { LeadTasksPanel } from '@/components/leads/LeadTasksPanel';
import { LeadMeetingsPanel } from '@/components/leads/LeadMeetingsPanel';
import { LeadProposalsPanel } from '@/components/leads/LeadProposalsPanel';
import { LeadCallsPanel } from '@/components/leads/LeadCallsPanel';
import { LeadActivityPanel } from '@/components/leads/LeadActivityPanel';
import { LeadEmailHistory } from '@/components/leads/LeadEmailHistory';
import { SendEmailDialog } from '@/components/leads/SendEmailDialog';
import { EmailDetailDrawer } from '@/components/leads/EmailDetailDrawer';
import { Button } from '@/components/ui/Button';
import { Mail } from 'lucide-react';

export default function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [emailOpen, setEmailOpen] = useState(false);
  const [openedEmailId, setOpenedEmailId] = useState<string | null>(null);

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

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setEmailOpen(true)}>
          <Mail size={14} /> Send email
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <LeadOverviewCard lead={data} />
          <LeadEmailHistory leadId={id} onOpen={setOpenedEmailId} />
          <LeadTasksPanel lead={data} />
          <LeadMeetingsPanel lead={data} />
          <LeadCallsPanel lead={data} />
          <LeadProposalsPanel lead={data} />
          <LeadNotesPanel leadId={id} />
          <LeadActivityPanel />
        </div>
        <div className="space-y-6">
          <LeadContactCard lead={data} />
          <LeadSocialCard lead={data} />
          <LeadSourceCard lead={data} />
        </div>
      </div>

      <SendEmailDialog
        lead={data}
        open={emailOpen}
        onClose={() => setEmailOpen(false)}
      />

      <EmailDetailDrawer
        lead={data}
        emailId={openedEmailId}
        onClose={() => setOpenedEmailId(null)}
      />
    </div>
  );
}
