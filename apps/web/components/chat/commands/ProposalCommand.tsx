'use client';

import { ProposalUploadModal } from '@/components/proposals/ProposalUploadModal';
import type { SlashCommandContext, SlashCommandResult } from '@/lib/slash-commands';

/**
 * Phase 11 — `/proposal` command. Wraps ProposalUploadModal. On send
 * success the chat drawer's existing query refetch picks up the new
 * outbound email naturally — we don't pre-fill the composer.
 */
export function ProposalCommand({
  ctx,
  onClose,
  onComplete,
}: {
  ctx: SlashCommandContext;
  onClose: () => void;
  onComplete: (result?: SlashCommandResult) => void;
}) {
  return (
    <ProposalUploadModal
      open
      leadId={ctx.leadId}
      accountId={ctx.accountId}
      onClose={() => {
        onComplete();
        onClose();
      }}
      onSent={() => {
        onComplete({
          toast: { tone: 'success', message: 'Proposal sent.' },
        });
      }}
    />
  );
}
