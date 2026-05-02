'use client';

import Link from 'next/link';
import clsx from 'clsx';
import { Meeting } from '@/lib/api';
import {
  meetingJoinHref,
  meetingStatusClass,
  meetingStatusLabel,
  meetingTypeIcon,
  meetingTypeLabel,
  syncBadge,
  whenLabel,
} from '@/lib/meetings';
import { Button } from '../ui/Button';
import {
  Calendar,
  ExternalLink,
  Pencil,
  Phone,
  Users,
  Video,
  X,
} from 'lucide-react';

/**
 * Read-only details popup for a meeting. Triggered by clicking the
 * meeting title in lists. Edit lives behind an explicit button so the
 * default click is non-destructive.
 */
export function MeetingDetailsModal({
  meeting,
  onClose,
  onEdit,
}: {
  meeting: Meeting | null;
  onClose: () => void;
  onEdit: (m: Meeting) => void;
}) {
  if (!meeting) return null;
  const TypeIcon = meetingTypeIcon(meeting.type);
  const when = whenLabel(meeting.scheduledAt, meeting.status);
  const sync = syncBadge(meeting);
  const join = meetingJoinHref(meeting);
  const startDate = new Date(meeting.scheduledAt);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-surface border border-border rounded-lg shadow-e3 w-full max-w-lg max-h-[92vh] overflow-auto">
        <header className="px-5 py-3.5 border-b border-border flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <TypeIcon size={14} className="text-ink-muted shrink-0" />
              <span className="text-caption text-neutral uppercase tracking-wider">
                {meetingTypeLabel(meeting.type)}
              </span>
              <span
                className={clsx(
                  'inline-flex items-center h-5 px-1.5 rounded text-[11px] font-medium border',
                  meetingStatusClass(meeting.status),
                )}
              >
                {meetingStatusLabel(meeting.status)}
              </span>
            </div>
            <h2 className="text-h3 truncate">{meeting.title}</h2>
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
              {startDate.toLocaleString(undefined, {
                weekday: 'long',
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}{' '}
              <span className="text-ink-muted">
                · {meeting.durationMin} min
              </span>
            </div>
            <div className="text-caption text-ink-muted mt-0.5">{when.label}</div>
          </Row>

          {meeting.lead && (
            <Row
              icon={<Users size={14} />}
              label="Lead"
            >
              <Link
                href={`/leads/${meeting.lead.id}`}
                className="text-bodysm text-primary hover:underline"
              >
                {meeting.lead.businessName}
              </Link>
              {meeting.contact && (
                <div className="text-caption text-ink-muted mt-0.5">
                  with {meeting.contact.name}
                </div>
              )}
            </Row>
          )}

          {meeting.meetingLink && (
            <Row
              icon={
                meeting.type === 'phone' ? (
                  <Phone size={14} />
                ) : meeting.type === 'in_person' ? (
                  <ExternalLink size={14} />
                ) : (
                  <Video size={14} />
                )
              }
              label={
                meeting.type === 'phone'
                  ? 'Phone'
                  : meeting.type === 'in_person'
                  ? 'Location'
                  : 'Link'
              }
            >
              <span className="text-bodysm text-ink break-all">
                {meeting.meetingLink}
              </span>
            </Row>
          )}

          {(meeting.attendeeEmails ?? []).length > 0 && (
            <Row icon={<Users size={14} />} label="Attendees">
              <ul className="space-y-0.5">
                {meeting.attendeeEmails!.map((e) => (
                  <li key={e} className="text-bodysm text-ink break-all">
                    {e}
                  </li>
                ))}
              </ul>
            </Row>
          )}

          {meeting.notes && (
            <Row icon={<Calendar size={14} />} label="Notes">
              <div className="text-bodysm text-ink whitespace-pre-wrap">
                {meeting.notes}
              </div>
            </Row>
          )}

          {meeting.assignedTo && (
            <Row icon={<Users size={14} />} label="Assigned to">
              <div className="text-bodysm text-ink">{meeting.assignedTo}</div>
            </Row>
          )}

          {meeting.account && (
            <Row icon={<Calendar size={14} />} label="Host account">
              <div className="text-bodysm text-ink">
                {meeting.account.email}
              </div>
            </Row>
          )}

          {(sync.state === 'synced' || sync.state === 'failed') && (
            <Row icon={<Calendar size={14} />} label="Calendar sync">
              <div
                className={clsx(
                  'inline-flex items-center gap-1 text-caption',
                  sync.state === 'synced' ? 'text-success' : 'text-error',
                )}
              >
                {sync.label}
              </div>
              {meeting.externalLink && (
                <div className="mt-1">
                  <a
                    href={meeting.externalLink}
                    target="_blank"
                    rel="noreferrer"
                    className="text-caption text-primary hover:underline inline-flex items-center gap-1"
                  >
                    Open in Google Calendar
                    <ExternalLink size={10} />
                  </a>
                </div>
              )}
            </Row>
          )}
        </div>

        <footer className="px-5 py-3.5 border-t border-border flex items-center justify-between gap-2">
          <Button variant="secondary" onClick={() => onEdit(meeting)}>
            <Pencil size={13} /> Edit
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
            {join && meeting.status === 'scheduled' && (
              <a
                href={join}
                target={join.startsWith('tel:') ? undefined : '_blank'}
                rel="noreferrer"
                className="inline-flex items-center gap-1 h-9 px-4 rounded-md bg-primary text-white text-bodysm font-medium hover:bg-primary/90"
              >
                {meeting.type === 'phone' ? (
                  <Phone size={13} />
                ) : (
                  <Video size={13} />
                )}
                Join {meetingTypeLabel(meeting.type)}
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
