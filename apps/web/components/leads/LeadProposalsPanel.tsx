'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { api, Lead, Proposal, ProposalStatus } from '@/lib/api';
import { relativeTime } from '@/lib/time';
import { Card } from '../ui/Card';
import { SectionHeader } from './LeadOverviewCard';
import { ProposalUploadModal } from '../proposals/ProposalUploadModal';
import { ProposalDetailModal } from '../proposals/ProposalDetailModal';
import {
  CheckCircle2,
  FileText,
  Paperclip,
  Plus,
  XCircle,
  Clock,
} from 'lucide-react';

const STATUS_LABEL: Record<ProposalStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  failed: 'Failed',
};
const STATUS_CLASS: Record<ProposalStatus, string> = {
  draft: 'bg-zinc-100 text-zinc-700 border-zinc-200',
  sent: 'bg-green-100 text-green-700 border-green-200',
  failed: 'bg-red-100 text-red-700 border-red-200',
};

/**
 * Lead-detail proposals panel. Sibling of LeadMeetingsPanel — surfaces
 * proposal sends with subject, attachment count, sent-relative time, and
 * status. Click a row to open the read-only details modal; "+ Send
 * proposal" opens the upload modal directly (bypasses the slash palette).
 */
export function LeadProposalsPanel({ lead }: { lead: Lead }) {
  const { data: proposals = [] } = useQuery<Proposal[]>({
    queryKey: ['lead-proposals', lead.id],
    queryFn: () => api.listLeadProposals(lead.id),
    initialData: lead.proposals,
  });

  const [uploadOpen, setUploadOpen] = useState(false);
  const [detailProposal, setDetailProposal] = useState<Proposal | null>(null);

  const sentCount = proposals.filter((p) => p.status === 'sent').length;

  return (
    <Card>
      <SectionHeader
        icon={<FileText size={14} />}
        title={`Proposals (${sentCount} sent)`}
        right={
          <button
            onClick={() => setUploadOpen(true)}
            className="text-caption text-primary hover:underline inline-flex items-center gap-1"
          >
            <Plus size={12} /> Send proposal
          </button>
        }
      />

      {proposals.length === 0 ? (
        <div className="text-bodysm text-ink-muted py-3">
          No proposals sent yet.
        </div>
      ) : (
        <ul className="divide-y divide-border -mx-1">
          {proposals.map((p) => (
            <ProposalRow
              key={p.id}
              proposal={p}
              onOpen={() => setDetailProposal(p)}
            />
          ))}
        </ul>
      )}

      <ProposalUploadModal
        open={uploadOpen}
        leadId={lead.id}
        accountId={null}
        onClose={() => setUploadOpen(false)}
        onSent={() => setUploadOpen(false)}
      />

      <ProposalDetailModal
        proposal={detailProposal}
        onClose={() => setDetailProposal(null)}
      />
    </Card>
  );
}

function ProposalRow({
  proposal,
  onOpen,
}: {
  proposal: Proposal;
  onOpen: () => void;
}) {
  const attachmentCount = proposal.attachments?.length ?? 0;
  const sentRelative = proposal.sentAt
    ? relativeTime(new Date(proposal.sentAt))
    : 'not sent';

  return (
    <li className="px-1 py-2.5 group flex items-start gap-2">
      <div className="mt-1 shrink-0">
        {proposal.status === 'sent' ? (
          <CheckCircle2 size={14} className="text-success" />
        ) : proposal.status === 'failed' ? (
          <XCircle size={14} className="text-error" />
        ) : (
          <Clock size={14} className="text-neutral" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={onOpen}
            className="text-bodysm font-medium text-ink hover:text-primary text-left truncate"
          >
            {proposal.subject}
          </button>
          <span
            className={clsx(
              'inline-flex items-center h-5 px-1.5 rounded text-[11px] font-medium border whitespace-nowrap',
              STATUS_CLASS[proposal.status],
            )}
          >
            {STATUS_LABEL[proposal.status]}
          </span>
        </div>
        <div className="mt-0.5 text-caption flex items-center gap-2 flex-wrap">
          <span className="text-neutral">{sentRelative}</span>
          {attachmentCount > 0 && (
            <span className="inline-flex items-center gap-1 text-neutral">
              <Paperclip size={10} />
              {attachmentCount}{' '}
              {attachmentCount === 1 ? 'file' : 'files'}
            </span>
          )}
          <span className="text-neutral truncate">→ {proposal.toEmail}</span>
        </div>
      </div>
    </li>
  );
}

