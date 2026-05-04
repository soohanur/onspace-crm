'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  api,
  Lead,
  LeadStage,
  LeadValidity,
} from '@/lib/api';
import { StagePicker } from './StagePicker';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileText,
  ImageIcon,
  Mail,
  Phone,
  Plus,
  StickyNote,
  Video,
} from 'lucide-react';

const SAVE_DEBOUNCE_MS = 300;

/**
 * Phase 19.1 — restructured. Three rows:
 *   1. back link
 *   2. [logo] business name (flex-1, truncates only when overflowing) … [Valid/Invalid]
 *   3. [Stage picker][Score]                                       [6 quick-action buttons]
 *
 * The follow-up badge was removed; that signal lives in the Alerts card
 * on the right column and in the Activity timeline below.
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

  return (
    <div className="bg-surface border border-border rounded-lg shadow-e1 px-4 py-3">
      <Link
        href="/leads"
        className="text-caption text-ink-muted hover:text-primary inline-flex items-center gap-1 mb-2"
      >
        <ArrowLeft size={11} /> All leads
      </Link>

      {/* Row 1 — identity + validity */}
      <div className="flex items-center gap-3 min-w-0">
        {lead.logoUrl ? (
          <img
            src={lead.logoUrl}
            alt=""
            className="w-8 h-8 rounded object-cover bg-background border border-border shrink-0"
          />
        ) : (
          <div className="w-8 h-8 rounded bg-background border border-border flex items-center justify-center shrink-0">
            <ImageIcon size={14} className="text-neutral" />
          </div>
        )}
        <h1 className="text-h3 flex-1 min-w-0 truncate">
          {lead.businessName}
        </h1>
        {lead.claimed && (
          <span
            className="inline-flex items-center gap-0.5 h-6 px-1.5 rounded text-[10px] font-medium border bg-primary/10 text-primary border-primary/20 shrink-0"
            title="Claimed on YellowPages"
          >
            <CheckCircle2 size={10} />
            Claimed
          </span>
        )}
        <ValidityToggle
          value={lead.validity}
          onChange={(v) => validityMut.mutate(v)}
          pending={validityMut.isPending}
        />
      </div>

      {/* Sub-line — city/state under the name */}
      {(lead.city || lead.state) && (
        <div className="text-caption text-ink-muted ml-11 mt-0.5">
          {[lead.city, lead.state].filter(Boolean).join(', ')}
        </div>
      )}

      {/* Row 2 — stage/score on the left, quick-actions on the right */}
      <div className="flex items-center gap-3 flex-wrap mt-3 pt-3 border-t border-border">
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

        <div className="ml-auto inline-flex items-center gap-1">
          <ActionButton title="Send email" onClick={onSendEmail}>
            <Mail size={14} />
          </ActionButton>
          <ActionButton title="Log a call" onClick={onLogCall}>
            <Phone size={14} />
          </ActionButton>
          <ActionButton title="Schedule meeting" onClick={onScheduleMeeting}>
            <Video size={14} />
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
        'inline-flex border border-border rounded-md overflow-hidden text-caption shrink-0',
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
