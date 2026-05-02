'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { api, Proposal, ProposalStatus } from '@/lib/api';
import { Button } from '../ui/Button';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  FileText,
  Mail,
  Paperclip,
  Trash2,
  User,
  X,
  XCircle,
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
 * Phase 11 — read-only details popup for a proposal. Modeled on
 * MeetingDetailsModal. The Delete action removes only the proposal row;
 * the linked EmailLog stays so the chat drawer thread is preserved.
 */
export function ProposalDetailModal({
  proposal,
  onClose,
  onOpenInDrawer,
}: {
  proposal: Proposal | null;
  onClose: () => void;
  /** Optional — when given, the "Open in chat drawer" button calls back
   *  with the linked emailLogId so the parent can open EmailDetailDrawer. */
  onOpenInDrawer?: (emailLogId: string) => void;
}) {
  const qc = useQueryClient();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteProposal(id),
    onSuccess: () => {
      if (proposal) {
        qc.invalidateQueries({ queryKey: ['lead-proposals', proposal.leadId] });
        qc.invalidateQueries({ queryKey: ['lead', proposal.leadId] });
      }
      onClose();
    },
  });

  if (!proposal) return null;

  const sentDate = proposal.sentAt ? new Date(proposal.sentAt) : null;

  return (
    <div className="fixed inset-0 z-[125] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-surface border border-border rounded-lg shadow-e3 w-full max-w-lg max-h-[92vh] overflow-auto">
        <header className="px-5 py-3.5 border-b border-border flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <FileText size={14} className="text-primary shrink-0" />
              <span className="text-caption text-neutral uppercase tracking-wider">
                Proposal
              </span>
              <span
                className={clsx(
                  'inline-flex items-center h-5 px-1.5 rounded text-[11px] font-medium border',
                  STATUS_CLASS[proposal.status],
                )}
              >
                {proposal.status === 'sent' && (
                  <CheckCircle2 size={10} className="mr-1" />
                )}
                {proposal.status === 'failed' && (
                  <XCircle size={10} className="mr-1" />
                )}
                {proposal.status === 'draft' && (
                  <Clock size={10} className="mr-1" />
                )}
                {STATUS_LABEL[proposal.status]}
              </span>
            </div>
            <h2 className="text-h3 truncate">{proposal.subject}</h2>
          </div>
          <button
            onClick={onClose}
            className="text-neutral hover:text-error mt-1 shrink-0"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </header>

        <div className="p-5 space-y-4">
          {sentDate && (
            <Row icon={<Calendar size={14} />} label="Sent">
              <div className="text-bodysm text-ink">
                {sentDate.toLocaleString(undefined, {
                  weekday: 'long',
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </div>
            </Row>
          )}

          <Row icon={<User size={14} />} label="Recipient">
            <div className="text-bodysm text-ink break-all">
              {proposal.toEmail}
            </div>
            {proposal.contact?.name && (
              <div className="text-caption text-ink-muted mt-0.5">
                {proposal.contact.name}
              </div>
            )}
          </Row>

          {proposal.account && (
            <Row icon={<Mail size={14} />} label="Sent from">
              <div className="text-bodysm text-ink">
                {proposal.account.email}
              </div>
            </Row>
          )}

          <Row icon={<FileText size={14} />} label="Message">
            <div className="text-bodysm text-ink whitespace-pre-wrap">
              {proposal.message}
            </div>
          </Row>

          {proposal.attachments?.length > 0 && (
            <Row icon={<Paperclip size={14} />} label="Attachments">
              <div className="space-y-1">
                {proposal.attachments.map((a) => (
                  <a
                    key={a.filename}
                    href={
                      proposal.emailLogId
                        ? api.attachmentDownloadUrl(
                            proposal.emailLogId,
                            a.filename,
                          )
                        : undefined
                    }
                    target="_blank"
                    rel="noreferrer"
                    className={clsx(
                      'flex items-center gap-2 px-2 py-1.5 rounded-md border border-border text-caption',
                      proposal.emailLogId
                        ? 'hover:border-primary hover:text-primary'
                        : 'opacity-60 cursor-not-allowed',
                    )}
                  >
                    <Paperclip size={11} className="text-neutral" />
                    <span className="flex-1 truncate">{a.filename}</span>
                    <span className="text-neutral font-mono">
                      {formatBytes(a.size)}
                    </span>
                    <Download size={11} className="text-neutral" />
                  </a>
                ))}
              </div>
            </Row>
          )}

          {proposal.emailLog && (
            <Row icon={<Mail size={14} />} label="Linked email">
              <button
                type="button"
                onClick={() => {
                  if (onOpenInDrawer && proposal.emailLogId) {
                    onOpenInDrawer(proposal.emailLogId);
                    onClose();
                  }
                }}
                className="text-caption text-primary hover:underline inline-flex items-center gap-1"
              >
                Open in chat drawer
                <ExternalLink size={10} />
              </button>
              {proposal.emailLog.openedAt && (
                <div className="mt-1 text-caption text-success">
                  Opened {new Date(proposal.emailLog.openedAt).toLocaleString()}
                </div>
              )}
              {proposal.emailLog.repliedAt && (
                <div className="mt-0.5 text-caption text-success">
                  Replied {new Date(proposal.emailLog.repliedAt).toLocaleString()}
                </div>
              )}
            </Row>
          )}

          {proposal.error && (
            <Row icon={<AlertCircle size={14} />} label="Error">
              <div className="text-caption text-error">{proposal.error}</div>
            </Row>
          )}

          <div className="text-caption text-ink-muted pt-2 border-t border-border">
            Created {new Date(proposal.createdAt).toLocaleString()} ·
            updated {new Date(proposal.updatedAt).toLocaleString()}
          </div>

          {!onOpenInDrawer && proposal.lead && (
            <Link
              href={`/leads/${proposal.lead.id}`}
              className="text-caption text-primary hover:underline inline-flex items-center gap-1"
            >
              Open lead
              <ExternalLink size={10} />
            </Link>
          )}
        </div>

        <footer className="px-5 py-3.5 border-t border-border flex items-center justify-between gap-2">
          {confirmingDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-caption text-error">Delete this proposal?</span>
              <Button
                variant="secondary"
                onClick={() => setConfirmingDelete(false)}
                disabled={remove.isPending}
              >
                Cancel
              </Button>
              <button
                type="button"
                onClick={() => remove.mutate(proposal.id)}
                disabled={remove.isPending}
                className="inline-flex items-center gap-1 h-9 px-3 rounded-md bg-error text-white text-bodysm font-medium hover:bg-error/90 disabled:opacity-40"
              >
                <Trash2 size={13} />
                Delete
              </button>
            </div>
          ) : (
            <Button
              variant="secondary"
              onClick={() => setConfirmingDelete(true)}
            >
              <Trash2 size={13} /> Delete
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </footer>
      </div>
    </div>
  );
}

function Row({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="text-neutral mt-1 shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-caption uppercase tracking-wider text-neutral mb-0.5">
          {label}
        </div>
        {children}
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
