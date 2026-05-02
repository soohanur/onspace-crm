'use client';

import { useQuery } from '@tanstack/react-query';
import { api, EmailLog } from '@/lib/api';
import { Card } from '../ui/Card';
import { Chip } from '../ui/Chip';
import { SectionHeader } from './LeadOverviewCard';
import { Mail, CheckCircle2, XCircle, Eye, Reply, Clock } from 'lucide-react';

export function LeadEmailHistory({ leadId }: { leadId: string }) {
  const { data: emails = [] } = useQuery({
    queryKey: ['email-history', leadId],
    queryFn: () => api.listEmailHistory(leadId),
    refetchInterval: 5_000,
  });

  return (
    <Card>
      <SectionHeader
        icon={<Mail size={14} />}
        title={`Email history (${emails.length})`}
      />

      {emails.length === 0 ? (
        <div className="py-8 text-center text-ink-muted text-bodysm border border-dashed border-border rounded-md">
          No emails sent yet.
        </div>
      ) : (
        <div className="space-y-2.5">
          {emails.map((e) => (
            <EmailRow key={e.id} email={e} />
          ))}
        </div>
      )}
    </Card>
  );
}

function EmailRow({ email }: { email: EmailLog }) {
  const ts = email.sentAt ?? email.createdAt;
  return (
    <div className="rounded-md border border-border bg-background px-4 py-3">
      <div className="flex items-start gap-3">
        <StatusIcon status={email.status} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="font-medium text-ink truncate">{email.subject}</div>
            <StatusChip status={email.status} />
          </div>
          <div className="text-caption text-ink-muted mt-0.5">
            <span className="text-neutral">to</span> {email.toEmail}
            {email.cc.length > 0 && (
              <>
                <span className="text-neutral"> · cc</span> {email.cc.join(', ')}
              </>
            )}
          </div>
          <div className="text-caption text-neutral font-mono font-tabular mt-0.5 flex items-center gap-3 flex-wrap">
            <span>
              <Clock size={10} className="inline mr-1" />
              {new Date(ts).toLocaleString()}
            </span>
            <span>from {email.fromEmail}</span>
            <FuturePlaceholder
              icon={<Eye size={10} />}
              label="opened"
              value={email.openedAt}
            />
            <FuturePlaceholder
              icon={<Reply size={10} />}
              label="replied"
              value={email.repliedAt}
            />
          </div>
          {email.status === 'failed' && email.error && (
            <div className="mt-1 text-caption text-error truncate" title={email.error}>
              {email.error}
            </div>
          )}
        </div>
      </div>
    </div>
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

/**
 * Phase 4 hook — pixel + IMAP listener will populate openedAt / repliedAt.
 * For now we render a dim placeholder so users know tracking is coming.
 */
function FuturePlaceholder({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
}) {
  if (value) {
    return (
      <span className="text-success">
        {icon} {label} {new Date(value).toLocaleString()}
      </span>
    );
  }
  return (
    <span className="text-neutral/60" title={`Tracking for "${label}" arrives in Phase 4`}>
      {icon} {label} —
    </span>
  );
}
