'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api, EmailLog } from '@/lib/api';
import { Card } from '../ui/Card';
import { Chip } from '../ui/Chip';
import { SectionHeader } from './LeadOverviewCard';
import { OpenedIndicator } from './OpenedIndicator';
import {
  Mail,
  CheckCircle2,
  XCircle,
  Reply,
  Clock,
  Paperclip,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';

export function LeadEmailHistory({
  leadId,
  onOpen,
}: {
  leadId: string;
  onOpen?: (id: string) => void;
}) {
  const { data: emails = [] } = useQuery({
    queryKey: ['email-history', leadId],
    queryFn: () => api.listEmailHistory(leadId),
    refetchInterval: 5_000,
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ['email-accounts'],
    queryFn: api.listEmailAccounts,
  });
  const missingReadScope = accounts.length > 0 && accounts.every((a) => !a.hasReadScope);

  return (
    <Card>
      <SectionHeader
        icon={<Mail size={14} />}
        title={`Email history (${emails.length})`}
      />

      {missingReadScope && (
        <div className="mb-3 rounded-md border border-warning/40 bg-[#FEF4E5] p-3 text-bodysm flex items-start gap-2">
          <AlertCircle size={14} className="text-warning shrink-0 mt-0.5" />
          <div className="min-w-0">
            <div className="font-medium text-ink">Reply detection isn't enabled</div>
            <div className="text-caption text-ink-muted mt-0.5">
              Your connected Gmail account is missing the read scope. {' '}
              <Link href="/settings" className="text-primary hover:underline">
                Disconnect &amp; reconnect from Settings
              </Link>{' '}
              to allow OnspaceCRM to fetch replies.
            </div>
          </div>
        </div>
      )}

      {emails.length === 0 ? (
        <div className="py-8 text-center text-ink-muted text-bodysm border border-dashed border-border rounded-md">
          No emails sent yet.
        </div>
      ) : (
        <div className="space-y-2.5">
          {emails.map((e) => (
            <EmailRow key={e.id} email={e} onClick={() => onOpen?.(e.id)} />
          ))}
        </div>
      )}
    </Card>
  );
}

function EmailRow({ email, onClick }: { email: EmailLog; onClick?: () => void }) {
  const sentTs = email.sentAt ?? email.createdAt;
  const latestTs = email.threadLatestActivity ?? sentTs;
  const totalMessages = email.threadMessageCount ?? 1;
  const inboundReplies = email.threadInboundReplyCount ?? (email.replies?.length ?? 0);
  const ourReplies = email.threadOurReplyCount ?? 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded-md border border-border bg-background hover:border-primary hover:bg-surface px-4 py-3 transition-colors group"
    >
      <div className="flex items-start gap-3">
        <StatusIcon status={email.status} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="font-medium text-ink truncate">{email.subject}</div>
            <StatusChip status={email.status} />
            {totalMessages > 1 && (
              <Chip tone="primary" className="!h-5 !text-[11px]">
                {totalMessages} messages
              </Chip>
            )}
            {inboundReplies > 0 && (
              <Chip tone="positive" className="!h-5 !text-[11px]">
                <Reply size={10} className="mr-1" /> {inboundReplies} reply{inboundReplies > 1 ? 'ies' : ''}
              </Chip>
            )}
            {email.attachments.length > 0 && (
              <Chip tone="neutral" className="!h-5 !text-[11px]">
                <Paperclip size={10} className="mr-1" /> {email.attachments.length}
              </Chip>
            )}
          </div>
          <div className="text-caption text-ink-muted mt-0.5">
            <span className="text-neutral">to</span> {email.toEmail}
            {email.cc.length > 0 && (
              <>
                <span className="text-neutral"> · cc</span> {email.cc.join(', ')}
              </>
            )}
          </div>
          {/* Always-visible open status — exact time when opened, or "Not opened yet" otherwise. */}
          <div className="mt-1 text-caption">
            <OpenedIndicator openedAt={email.openedAt} />
          </div>
          <div className="text-caption text-neutral font-mono font-tabular mt-0.5 inline-flex items-center gap-1 flex-wrap">
            <Clock size={10} />
            sent {new Date(sentTs).toLocaleString()}
            {totalMessages > 1 && (
              <span>· latest {new Date(latestTs).toLocaleString()}</span>
            )}
            <span>· from {email.fromEmail}</span>
            {ourReplies > 0 && (
              <span className="text-primary">· you replied {ourReplies}×</span>
            )}
          </div>
          {email.status === 'failed' && email.error && (
            <div className="mt-1 text-caption text-error truncate" title={email.error}>
              {email.error}
            </div>
          )}
        </div>
        <ChevronRight
          size={16}
          className="text-neutral group-hover:text-primary mt-1 shrink-0"
        />
      </div>
    </button>
  );
}

function StatusIcon({ status }: { status: EmailLog['status'] }) {
  if (status === 'sent') return <CheckCircle2 size={14} className="text-success mt-1" />;
  if (status === 'failed') return <XCircle size={14} className="text-error mt-1" />;
  return <Clock size={14} className="text-warning mt-1" />;
}

function StatusChip({ status }: { status: EmailLog['status'] }) {
  if (status === 'sent') return <Chip tone="positive">sent</Chip>;
  if (status === 'failed') return <Chip tone="negative">failed</Chip>;
  if (status === 'sending') return <Chip tone="primary">sending</Chip>;
  return <Chip tone="neutral">queued</Chip>;
}
