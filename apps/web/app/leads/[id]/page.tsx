'use client';

// useQuery + dynamic [id] segment — opt out of static-paths pre-generation
// so the dev static-paths worker doesn't try to require vendor chunks
// that the dev runtime hasn't built yet.
export const dynamic = 'force-dynamic';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { use, useState } from 'react';
import {
  api,
  CreateCallInput,
  CreateMeetingInput,
  CreateTaskInput,
  Proposal,
} from '@/lib/api';
import { LeadDetailActionBar } from '@/components/leads/LeadDetailActionBar';
import { LeadOverviewCard } from '@/components/leads/LeadOverviewCard';
import { LeadContactCard } from '@/components/leads/LeadContactCard';
import { LeadSocialCard } from '@/components/leads/LeadSocialCard';
import { LeadSourceCard } from '@/components/leads/LeadSourceCard';
import { LeadAlertCard } from '@/components/leads/LeadAlertCard';
import { LeadNotesPanel } from '@/components/leads/LeadNotesPanel';
import { LeadTasksPanel } from '@/components/leads/LeadTasksPanel';
import { LeadMeetingsPanel } from '@/components/leads/LeadMeetingsPanel';
import { LeadProposalsPanel } from '@/components/leads/LeadProposalsPanel';
import { LeadCallsPanel } from '@/components/leads/LeadCallsPanel';
import { LeadSequencesPanel } from '@/components/leads/LeadSequencesPanel';
import { LeadActivityPanel } from '@/components/leads/LeadActivityPanel';
import { LeadEmailHistory } from '@/components/leads/LeadEmailHistory';
import { SendEmailDialog } from '@/components/leads/SendEmailDialog';
import { EmailDetailDrawer } from '@/components/leads/EmailDetailDrawer';
import { CallFormModal } from '@/components/calls/CallFormModal';
import { MeetingFormModal } from '@/components/meetings/MeetingFormModal';
import { TaskFormModal } from '@/components/tasks/TaskFormModal';
import { ProposalUploadModal } from '@/components/proposals/ProposalUploadModal';
import { defaultContextForStage } from '@/lib/tasks';

export default function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const qc = useQueryClient();

  const [emailOpen, setEmailOpen] = useState(false);
  const [openedEmailId, setOpenedEmailId] = useState<string | null>(null);
  const [callOpen, setCallOpen] = useState(false);
  const [meetingOpen, setMeetingOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [proposalOpen, setProposalOpen] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['lead', id],
    queryFn: () => api.getLead(id),
  });

  const invalidateLead = () => {
    qc.invalidateQueries({ queryKey: ['lead', id] });
  };

  const createCall = useMutation({
    mutationFn: (input: CreateCallInput) => api.createCall(input),
    onSuccess: () => {
      setCallOpen(false);
      qc.invalidateQueries({ queryKey: ['lead-calls', id] });
      invalidateLead();
    },
  });
  const createMeeting = useMutation({
    mutationFn: (input: CreateMeetingInput) => api.createMeeting(input),
    onSuccess: () => {
      setMeetingOpen(false);
      qc.invalidateQueries({ queryKey: ['lead-meetings', id] });
      invalidateLead();
    },
  });
  const createTask = useMutation({
    mutationFn: (input: CreateTaskInput) => api.createTask(input),
    onSuccess: () => {
      setTaskOpen(false);
      qc.invalidateQueries({ queryKey: ['lead-tasks', id] });
      qc.invalidateQueries({ queryKey: ['tasks-list'] });
      invalidateLead();
    },
  });

  if (isLoading) {
    return (
      <div className="max-w-[1280px] mx-auto px-6 py-6">
        <div className="animate-pulse text-ink-muted">Loading lead…</div>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="max-w-[1280px] mx-auto px-6 py-6">
        <div className="text-error">
          Failed to load: {(error as Error)?.message ?? 'not found'}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1280px] mx-auto px-6 py-6 space-y-5">
      <LeadDetailActionBar
        lead={data}
        onSendEmail={() => setEmailOpen(true)}
        onLogCall={() => setCallOpen(true)}
        onScheduleMeeting={() => setMeetingOpen(true)}
        onCreateFollowup={() => setTaskOpen(true)}
        onSendProposal={() => setProposalOpen(true)}
        onAddNote={() => window.dispatchEvent(new Event('lead:add-note'))}
      />

      {/* Bento grid: facts on the left, alerts + people on the right.
          Right column sticky on desktop so it follows the user as they
          scroll the long left column. */}
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-5">
        <div className="space-y-5 min-w-0">
          <LeadOverviewCard lead={data} />
          <LeadSocialCard lead={data} />
          <LeadSourceCard lead={data} />
        </div>
        <div className="space-y-5 min-w-0 lg:sticky lg:top-4 self-start">
          <LeadAlertCard lead={data} />
          <LeadContactCard lead={data} />
        </div>
      </div>

      {/* CRUD surfaces — mutate the underlying data */}
      <div id="email-history">
        <LeadEmailHistory leadId={id} onOpen={setOpenedEmailId} />
      </div>
      <div id="tasks">
        <LeadTasksPanel lead={data} />
      </div>
      <div id="meetings">
        <LeadMeetingsPanel lead={data} />
      </div>
      <div id="calls">
        <LeadCallsPanel lead={data} />
      </div>
      <div id="proposals">
        <LeadProposalsPanel lead={data} />
      </div>
      <div id="sequences">
        <LeadSequencesPanel lead={data} />
      </div>
      <LeadNotesPanel leadId={id} />

      {/* Read-only chronological log — last so it doesn't compete with
          the actionable CRUD panels above. */}
      <LeadActivityPanel leadId={id} onOpenEmail={setOpenedEmailId} />

      {/* Modals */}
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
      <CallFormModal
        open={callOpen}
        lockedLeadId={data.id}
        defaultStatus="completed"
        pending={createCall.isPending}
        error={createCall.error ? (createCall.error as Error).message : null}
        onClose={() => setCallOpen(false)}
        onSubmit={(input) => createCall.mutate(input)}
      />
      <MeetingFormModal
        open={meetingOpen}
        lockedLeadId={data.id}
        pending={createMeeting.isPending}
        error={
          createMeeting.error
            ? (createMeeting.error as Error).message
            : null
        }
        onClose={() => setMeetingOpen(false)}
        onSubmit={(input) => createMeeting.mutate(input)}
      />
      <TaskFormModal
        open={taskOpen}
        lockedLeadId={data.id}
        initial={{
          leadId: data.id,
          kind: 'followup',
          context: defaultContextForStage(data.stage),
          priority: 'medium',
        }}
        pending={createTask.isPending}
        error={createTask.error ? (createTask.error as Error).message : null}
        onClose={() => setTaskOpen(false)}
        onSubmit={(input) => createTask.mutate(input)}
      />
      <ProposalUploadModal
        open={proposalOpen}
        leadId={data.id}
        accountId={null}
        onClose={() => setProposalOpen(false)}
        onSent={(_p: Proposal) => setProposalOpen(false)}
      />
    </div>
  );
}
