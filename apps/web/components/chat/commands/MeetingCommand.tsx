'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  api,
  CreateMeetingInput,
  Meeting,
  MeetingType,
} from '@/lib/api';
import { MeetingFormModal } from '@/components/meetings/MeetingFormModal';
import type { SlashCommandContext, SlashCommandResult } from '@/lib/slash-commands';

/**
 * Phase 11 — `/meeting` command. Reuses the Phase 10 MeetingFormModal,
 * with the lead and host account locked to whatever the chat-drawer
 * conversation is on. On save, hands the composer a pre-filled
 * confirmation draft so the user can hit Send and have a one-line "see
 * you Tuesday" go out alongside the GCal invite.
 */
export function MeetingCommand({
  ctx,
  onClose,
  onComplete,
}: {
  ctx: SlashCommandContext;
  onClose: () => void;
  onComplete: (result?: SlashCommandResult) => void;
}) {
  const qc = useQueryClient();

  const { data: lead } = useQuery({
    queryKey: ['lead', ctx.leadId],
    queryFn: () => api.getLead(ctx.leadId),
    enabled: !!ctx.leadId,
  });
  const { data: contacts = [] } = useQuery({
    queryKey: ['contacts', ctx.leadId],
    queryFn: () => api.listContacts(ctx.leadId),
    enabled: !!ctx.leadId,
  });

  const create = useMutation({
    mutationFn: (input: CreateMeetingInput) => api.createMeeting(input),
    onSuccess: (meeting) => {
      qc.invalidateQueries({ queryKey: ['lead-meetings', ctx.leadId] });
      qc.invalidateQueries({ queryKey: ['lead', ctx.leadId] });
      qc.invalidateQueries({ queryKey: ['meetings-list'] });
      qc.invalidateQueries({ queryKey: ['meetings-counts'] });
      const insertText = buildConfirmationDraft({
        meeting,
        contactName:
          contacts.find((c) => c.isPrimary)?.name ??
          contacts[0]?.name ??
          lead?.ownerName ??
          null,
      });
      onComplete({
        insertText,
        toast: {
          tone: 'success',
          message: 'Meeting scheduled — invite sent to attendees.',
        },
      });
    },
  });

  return (
    <MeetingFormModal
      open
      lockedLeadId={ctx.leadId}
      lockedAccountId={ctx.accountId ?? undefined}
      pending={create.isPending}
      error={create.error ? (create.error as Error).message : null}
      onClose={() => {
        // Cancelled — leave composer untouched, no toast.
        onComplete();
        onClose();
      }}
      onSubmit={(input) => create.mutate(input)}
    />
  );
}

/**
 * "Hi Maria, just confirming our meeting on Tue, May 14 at 10:30 AM. Talk
 * soon," — replaces whatever was in the composer (the user typed
 * `/meeting` to summon this; that's their stated intent).
 */
function buildConfirmationDraft(input: {
  meeting: Meeting;
  contactName: string | null;
}): string {
  const m = input.meeting;
  const firstName = pickFirstName(input.contactName);
  const start = new Date(m.scheduledAt);
  const date = start.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const time = start.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
  const conditional = conditionalLink(m.type, m.meetingLink);
  return [
    `Hi ${firstName},`,
    '',
    `Just confirming our meeting on ${date} at ${time}.${conditional}`,
    '',
    'Talk soon,',
  ].join('\n');
}

function pickFirstName(contactName: string | null): string {
  if (!contactName) return 'there';
  const first = contactName.trim().split(/\s+/)[0];
  return first || 'there';
}

function conditionalLink(type: MeetingType, link: string | null): string {
  if (!link) return '';
  if (type === 'in_person' || type === 'phone') return '';
  return `\n\nJoin: ${link}`;
}
