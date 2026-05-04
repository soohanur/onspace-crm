'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  api,
  FollowUpStatus,
  Lead,
  LeadStage,
  LeadValidity,
} from '@/lib/api';
import { StagePicker } from './StagePicker';
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  ImageIcon,
  Mail,
  Phone,
  Plus,
  StickyNote,
} from 'lucide-react';

const SAVE_DEBOUNCE_MS = 300;

const FOLLOWUP_BADGE: Record<
  FollowUpStatus,
  { label: string; className: string }
> = {
  none: {
    label: 'No follow-up',
    className: 'bg-background text-neutral border-border',
  },
  needed: {
    label: 'Follow-up needed',
    className: 'bg-blue-100 text-blue-700 border-blue-200',
  },
  scheduled: {
    label: 'Follow-up scheduled',
    className: 'bg-primary/10 text-primary border-primary/20',
  },
  completed: {
    label: 'Follow-up completed',
    className: 'bg-success/10 text-success border-success/20',
  },
  overdue: {
    label: 'Follow-up overdue',
    className: 'bg-error/10 text-error border-error/20',
  },
};

/**
 * Phase 19 — consolidated lead detail header. Replaces the old
 * `LeadDetailHeader` + `LeadPipelineControls` two-component stack with
 * one row: identity (logo + name + city/state) on the left, all
 * pipeline controls + 6 quick-action buttons on the right.
 *
 * Quick-action click handlers are passed in by the page so this stays
 * a pure presentational + state component — the actual modals
 * (CallFormModal, MeetingFormModal, etc.) live on the parent.
 */
export function LeadDetailActionBar({
  lead,
  onSendEmail,
  onLogCall,
  onScheduleMeeting,
  onCreateFollowup,
  onSendProposal,
  onAddNote,
}: {
  lead: Lead;
  onSendEmail: () => void;
  onLogCall: () => void;
  onScheduleMeeting: () => void;
  onCreateFollowup: () => void;
  onSendProposal: () => void;
  onAddNote: () => void;
}) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['lead', lead.id] });
    qc.invalidateQueries({ queryKey: ['leads-global'] });
  };

  const stageMut = useMutation({
    mutationFn: (stage: LeadStage) => api.updateLeadStage(lead.id, stage),
    onSuccess: invalidate,
  });
  const scoreMut = useMutation({
    mutationFn: (score: number) => api.updateLeadScore(lead.id, score),
    onSuccess: invalidate,
  });
  const validityMut = useMutation({
    mutationFn: (v: LeadValidity) => api.updateLeadValidity(lead.id, v),
    onSuccess: invalidate,
  });

  // Score input — debounced.
  const [scoreDraft, setScoreDraft] = useState(String(lead.score));
  useEffect(() => setScoreDraft(String(lead.score)), [lead.score]);
  useEffect(() => {
    const n = Number(scoreDraft);
    if (
      !Number.isFinite(n) ||
      n < 0 ||
      n > 100 ||
      n === lead.score
    )
      return;
    const t = setTimeout(() => scoreMut.mutate(Math.round(n)), SAVE_DEBOUNCE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoreDraft]);

  const followup = FOLLOWUP_BADGE[lead.followUpStatus];

  return (
    <div className="bg-surface border border-border rounded-lg shadow-e1 px-4 py-3">
      <Link
        href="/leads"
        className="text-caption text-ink-muted hover:text-primary inline-flex items-center gap-1 mb-2"
      >
        <ArrowLeft size={11} /> All leads
      </Link>
      <div className="flex items-center gap-3 flex-wrap">
        {/* Left: identity */}
        <div className="flex items-center gap-2 min-w-0">
          {lead.logoUrl ? (
            <img
              src={lead.logoUrl}
              alt=""
              className="w-6 h-6 rounded object-cover bg-background border border-border shrink-0"
            />
          ) : (
            <div className="w-6 h-6 rounded bg-background border border-border flex items-center justify-center shrink-0">
              <ImageIcon size={12} className="text-neutral" />
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h1 className="text-h3 truncate max-w-[300px]">
                {lead.businessName}
              </h1>
              {lead.claimed && (
                <span
                  className="inline-flex items-center gap-0.5 h-5 px-1.5 rounded text-[10px] font-medium border bg-primary/10 text-primary border-primary/20"
                  title="Claimed on YellowPages"
                >
                  <CheckCircle2 size={10} />
                  Claimed
                </span>
              )}
              {(lead.city || lead.state) && (
                <span className="text-caption text-ink-muted">
                  {[lead.city, lead.state].filter(Boolean).join(', ')}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right: controls. Wraps to a second row on narrow viewports. */}
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <div className="inline-flex items-center gap-1.5">
            <span className="text-caption uppercase tracking-wider text-neutral">
              Stage
            </span>
            <StagePicker
              value={lead.stage}
              onChange={(s) => stageMut.mutate(s)}
              pending={stageMut.isPending}
            />
          </div>

          <div className="inline-flex items-center gap-1.5">
            <span className="text-caption uppercase tracking-wider text-neutral">
              Score
            </span>
            <input
              type="number"
              min={0}
              max={100}
              value={scoreDraft}
              onChange={(e) => setScoreDraft(e.target.value)}
              onBlur={() => {
                const n = Number(scoreDraft);
                if (!Number.isFinite(n)) setScoreDraft(String(lead.score));
                else if (n < 0) setScoreDraft('0');
                else if (n > 100) setScoreDraft('100');
              }}
              className="h-8 w-14 px-2 text-bodysm font-mono font-tabular rounded-md border border-border bg-surface focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition"
            />
          </div>

          <ValidityToggle
            value={lead.validity}
            onChange={(v) => validityMut.mutate(v)}
            pending={validityMut.isPending}
          />

          <span
            title="Auto-managed from the Tasks panel below."
            className={clsx(
              'inline-flex items-center gap-1 h-8 px-2 rounded-md border text-[11px] font-medium whitespace-nowrap',
              followup.className,
            )}
          >
            <Clock size={11} />
            {followup.label}
          </span>

          {/* Vertical divider between stage controls and quick actions */}
          <span className="hidden md:inline-block h-6 w-px bg-border mx-1" aria-hidden />

          {/* Quick actions */}
          <div className="inline-flex items-center gap-1">
            <ActionButton title="Send email" onClick={onSendEmail}>
              <Mail size={14} />
            </ActionButton>
            <ActionButton title="Log a call" onClick={onLogCall}>
              <Phone size={14} />
            </ActionButton>
            <ActionButton title="Schedule meeting" onClick={onScheduleMeeting}>
              <Calendar size={14} />
            </ActionButton>
            <ActionButton title="Create follow-up" onClick={onCreateFollowup}>
              <Plus size={14} />
            </ActionButton>
            <ActionButton title="Send proposal" onClick={onSendProposal}>
              <FileText size={14} />
            </ActionButton>
            <ActionButton title="Add note" onClick={onAddNote}>
              <StickyNote size={14} />
            </ActionButton>
          </div>
        </div>
      </div>
    </div>
  );
}

function ValidityToggle({
  value,
  onChange,
  pending,
}: {
  value: LeadValidity;
  onChange: (v: LeadValidity) => void;
  pending?: boolean;
}) {
  return (
    <div
      className={clsx(
        'inline-flex border border-border rounded-md overflow-hidden text-caption',
        pending && 'opacity-60',
      )}
    >
      <button
        type="button"
        onClick={() => value !== 'valid' && onChange('valid')}
        className={clsx(
          'inline-flex items-center gap-1 px-2 h-8 transition-colors',
          value === 'valid'
            ? 'bg-success text-white'
            : 'bg-surface text-ink-muted hover:bg-background',
        )}
      >
        <CheckCircle2 size={11} /> Valid
      </button>
      <button
        type="button"
        onClick={() => value !== 'invalid' && onChange('invalid')}
        className={clsx(
          'inline-flex items-center gap-1 px-2 h-8 transition-colors border-l border-border',
          value === 'invalid'
            ? 'bg-error text-white'
            : 'bg-surface text-ink-muted hover:bg-background',
        )}
      >
        <AlertTriangle size={11} /> Invalid
      </button>
    </div>
  );
}

function ActionButton({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className="h-8 w-8 rounded-md border border-border bg-surface text-ink-muted hover:border-primary hover:text-primary inline-flex items-center justify-center transition-colors"
    >
      {children}
    </button>
  );
}
