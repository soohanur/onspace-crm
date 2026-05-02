'use client';

import Link from 'next/link';
import clsx from 'clsx';
import { Call } from '@/lib/api';
import {
  callDialHref,
  directionIcon,
  directionLabel,
  formatDuration,
  outcomeClass,
  outcomeLabel,
  PHONE_INTEGRATION_TOOLTIP,
  statusClass,
  statusLabel,
  whenLabel,
} from '@/lib/calls';
import { Button } from '../ui/Button';
import {
  Calendar,
  CheckCircle2,
  ListChecks,
  Pencil,
  Phone,
  Trash2,
  User,
  Users,
  Voicemail,
  X,
} from 'lucide-react';

const TONE: Record<ReturnType<typeof whenLabel>['tone'], string> = {
  past: 'text-error',
  today: 'text-warning',
  future: 'text-ink',
  done: 'text-success',
  muted: 'text-neutral',
};

/**
 * Read-only details popup for a call. Triggered by clicking the call's
 * row title in lists. Edit / cancel / mark-completed / delete live in
 * the action footer.
 */
export function CallDetailsModal({
  call,
  onClose,
  onEdit,
  onComplete,
  onCancel,
  onDelete,
}: {
  call: Call | null;
  onClose: () => void;
  onEdit: (c: Call) => void;
  onComplete: (c: Call) => void;
  onCancel: (c: Call) => void;
  onDelete: (c: Call) => void;
}) {
  if (!call) return null;
  const Icon = directionIcon(call.direction);
  const when = whenLabel(call.occurredAt, call.status);
  const dial = callDialHref(call);
  const occurred = new Date(call.occurredAt);
  const phone =
    call.direction === 'outbound' ? call.toPhone : call.fromPhone;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-surface border border-border rounded-lg shadow-e3 w-full max-w-lg max-h-[92vh] overflow-auto">
        <header className="px-5 py-3.5 border-b border-border flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <Icon size={14} className="text-ink-muted shrink-0" />
              <span className="text-caption text-neutral uppercase tracking-wider">
                {directionLabel(call.direction)}
              </span>
              {call.outcome && (
                <span
                  className={clsx(
                    'inline-flex items-center h-5 px-1.5 rounded text-[11px] font-medium border',
                    outcomeClass(call.outcome),
                  )}
                >
                  {outcomeLabel(call.outcome)}
                </span>
              )}
              <span
                className={clsx(
                  'inline-flex items-center h-5 px-1.5 rounded text-[11px] font-medium border',
                  statusClass(call.status),
                )}
              >
                {statusLabel(call.status)}
              </span>
            </div>
            <h2 className="text-h3 truncate">
              {directionLabel(call.direction)} call
              {call.outcome ? ` — ${outcomeLabel(call.outcome).toLowerCase()}` : ''}
            </h2>
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
          <Row icon={<Calendar size={14} />} label="When">
            <div className="text-bodysm text-ink">
              {occurred.toLocaleString(undefined, {
                weekday: 'long',
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}
              <span className="text-ink-muted">
                {' '}· {formatDuration(call.durationSec)}
              </span>
            </div>
            <div className={clsx('text-caption mt-0.5', TONE[when.tone])}>
              {when.label}
            </div>
          </Row>

          {call.lead && (
            <Row icon={<Users size={14} />} label="Lead">
              <Link
                href={`/leads/${call.lead.id}`}
                className="text-bodysm text-primary hover:underline"
              >
                {call.lead.businessName}
              </Link>
              {call.contact && (
                <div className="text-caption text-ink-muted mt-0.5">
                  with {call.contact.name}
                </div>
              )}
            </Row>
          )}

          {phone && (
            <Row icon={<Phone size={14} />} label="Phone">
              <span className="text-bodysm text-ink break-all font-mono">
                {phone}
              </span>
            </Row>
          )}

          {call.voicemailLeft && (
            <Row icon={<Voicemail size={14} />} label="Voicemail">
              <span className="text-bodysm text-ink">Left a voicemail</span>
            </Row>
          )}

          {call.notes && (
            <Row icon={<ListChecks size={14} />} label="Notes">
              <div className="text-bodysm text-ink whitespace-pre-wrap">
                {call.notes}
              </div>
            </Row>
          )}

          {call.nextAction && (
            <Row icon={<ListChecks size={14} />} label="Next action">
              <div className="text-bodysm text-ink">{call.nextAction}</div>
            </Row>
          )}

          {call.assignedTo && (
            <Row icon={<User size={14} />} label="Assigned to">
              <div className="text-bodysm text-ink">{call.assignedTo}</div>
            </Row>
          )}

          <div className="text-caption text-ink-muted pt-2 border-t border-border">
            Created {new Date(call.createdAt).toLocaleString()} · updated{' '}
            {new Date(call.updatedAt).toLocaleString()}
          </div>
        </div>

        <footer className="px-5 py-3.5 border-t border-border flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="secondary" onClick={() => onEdit(call)}>
              <Pencil size={13} /> Edit
            </Button>
            {call.status === 'scheduled' && (
              <Button variant="secondary" onClick={() => onComplete(call)}>
                <CheckCircle2 size={13} /> Mark completed
              </Button>
            )}
            {call.status === 'scheduled' && (
              <Button variant="secondary" onClick={() => onCancel(call)}>
                <X size={13} /> Cancel
              </Button>
            )}
            <button
              type="button"
              onClick={() => onDelete(call)}
              className="inline-flex items-center gap-1 h-9 px-3 rounded-md border border-border text-bodysm text-error hover:bg-error/5 hover:border-error/40"
            >
              <Trash2 size={13} /> Delete
            </button>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
            {dial && (
              <a
                href={dial}
                title={PHONE_INTEGRATION_TOOLTIP}
                className="inline-flex items-center gap-1 h-9 px-4 rounded-md bg-primary text-white text-bodysm font-medium hover:bg-primary/90"
              >
                <Phone size={13} /> Call
              </a>
            )}
          </div>
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
