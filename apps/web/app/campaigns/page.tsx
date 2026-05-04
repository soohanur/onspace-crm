'use client';

export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import clsx from 'clsx';
import {
  api,
  CampaignStatus,
  CampaignSummary,
  CreateTemplateInput,
  EmailTemplate,
  SequenceStatus,
  SequenceSummary,
} from '@/lib/api';
import {
  campaignStatusClass,
  campaignStatusLabel,
} from '@/lib/campaigns';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { TemplateFormModal } from '@/components/campaigns/TemplateFormModal';
import {
  Plus,
  Square,
  Trash2,
  Pencil,
  Copy,
  ChevronRight,
} from 'lucide-react';

const STATUS_FILTERS: ('' | CampaignStatus)[] = [
  '',
  'draft',
  'queued',
  'running',
  'paused',
  'completed',
  'cancelled',
];

export default function CampaignsPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-[1400px] mx-auto px-6 py-8 text-ink-muted">
          Loading…
        </div>
      }
    >
      <Body />
    </Suspense>
  );
}

function Body() {
  const router = useRouter();
  const sp = useSearchParams();
  const rawTab = sp.get('tab');
  const tab: 'campaigns' | 'templates' | 'sequences' =
    rawTab === 'templates'
      ? 'templates'
      : rawTab === 'sequences'
      ? 'sequences'
      : 'campaigns';

  const setTab = (next: 'campaigns' | 'templates' | 'sequences') => {
    const p = new URLSearchParams(sp.toString());
    if (next === 'campaigns') p.delete('tab');
    else p.set('tab', next);
    router.replace(p.toString() ? `/campaigns?${p.toString()}` : '/campaigns');
  };

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-6">
      <div className="mb-4 flex items-center justify-end flex-wrap gap-3">
        {tab === 'campaigns' ? (
          <Link href="/campaigns/new">
            <Button>
              <Plus size={14} /> New campaign
            </Button>
          </Link>
        ) : tab === 'sequences' ? (
          <Link href="/campaigns/sequences/new">
            <Button>
              <Plus size={14} /> New sequence
            </Button>
          </Link>
        ) : null}
      </div>

      <div className="border-b border-border mb-4 inline-flex gap-2">
        <TabButton active={tab === 'campaigns'} onClick={() => setTab('campaigns')}>
          Campaigns
        </TabButton>
        <TabButton active={tab === 'sequences'} onClick={() => setTab('sequences')}>
          Sequences
        </TabButton>
        <TabButton active={tab === 'templates'} onClick={() => setTab('templates')}>
          Templates
        </TabButton>
      </div>

      {tab === 'campaigns' ? (
        <CampaignsTab />
      ) : tab === 'sequences' ? (
        <SequencesTab />
      ) : (
        <TemplatesTab />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'px-4 h-10 text-bodysm font-medium border-b-2 -mb-px',
        active ? 'border-primary text-primary' : 'border-transparent text-ink-muted hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}

// ─── Campaigns tab ────────────────────────────────────────────────────────

function CampaignsTab() {
  const sp = useSearchParams();
  const router = useRouter();
  const status = sp.get('status') ?? '';

  const setStatus = (s: string) => {
    const p = new URLSearchParams(sp.toString());
    if (!s) p.delete('status');
    else p.set('status', s);
    router.replace(p.toString() ? `/campaigns?${p.toString()}` : '/campaigns');
  };

  const qc = useQueryClient();
  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ['campaigns', status],
    queryFn: () => api.listCampaigns({ status: status || undefined }),
    refetchInterval: 5_000,
  });

  const cancel = useMutation({
    mutationFn: (id: string) => api.cancelCampaign(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns'] }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteCampaign(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns'] }),
  });

  const filtered =
    status === ''
      ? campaigns
      : campaigns.filter((c) => c.status === status);

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5 mb-4">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s || 'all'}
            onClick={() => setStatus(s)}
            className={clsx(
              'px-2.5 h-7 rounded-md border text-caption font-medium',
              (status || '') === s
                ? 'bg-primary text-white border-primary'
                : 'bg-surface text-ink-muted border-border hover:border-primary hover:text-primary',
            )}
          >
            {s === '' ? 'All' : campaignStatusLabel(s)}
          </button>
        ))}
      </div>

      <Card className="!p-0 overflow-hidden">
        {isLoading ? (
          <div className="px-5 py-8 text-bodysm text-ink-muted">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-12 text-center text-ink-muted text-bodysm">
            No campaigns yet.{' '}
            <Link href="/campaigns/new" className="text-primary hover:underline">
              Create one →
            </Link>
          </div>
        ) : (
          <table className="w-full text-bodysm">
            <thead className="bg-background">
              <tr className="text-caption uppercase tracking-[0.06em] text-neutral text-left">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Group</th>
                <th className="px-4 py-3">Template</th>
                <th className="px-4 py-3 text-right">Sent</th>
                <th className="px-4 py-3 text-right">Opened</th>
                <th className="px-4 py-3 text-right">Replied</th>
                <th className="px-4 py-3">Started</th>
                <th className="px-4 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <CampaignRow
                  key={c.id}
                  c={c}
                  onCancel={() => cancel.mutate(c.id)}
                  onDelete={() => {
                    if (confirm(`Delete campaign "${c.name}"?`)) remove.mutate(c.id);
                  }}
                />
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}

function CampaignRow({
  c,
  onCancel,
  onDelete,
}: {
  c: CampaignSummary;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const canCancel = ['queued', 'running', 'paused'].includes(c.status);
  const canDelete = ['draft', 'cancelled', 'failed', 'completed'].includes(c.status);

  return (
    <tr className="border-t border-border hover:bg-background group">
      <td className="px-4 py-3">
        <Link
          href={`/campaigns/${c.id}`}
          className="font-medium text-ink hover:text-primary"
        >
          {c.name}
        </Link>
      </td>
      <td className="px-4 py-3">
        <span
          className={clsx(
            'inline-flex items-center h-6 px-2 rounded-md text-[12px] font-medium border',
            campaignStatusClass(c.status),
          )}
        >
          {campaignStatusLabel(c.status)}
        </span>
      </td>
      <td className="px-4 py-3 text-ink-muted">{c.group?.name ?? '—'}</td>
      <td className="px-4 py-3 text-ink-muted">{c.template?.name ?? '—'}</td>
      <td className="px-4 py-3 text-right font-mono font-tabular">
        {c.sentCount} / {c.recipientCount}
      </td>
      <td className="px-4 py-3 text-right font-mono font-tabular">{c.openedCount}</td>
      <td className="px-4 py-3 text-right font-mono font-tabular">{c.repliedCount}</td>
      <td className="px-4 py-3 text-caption text-ink-muted">
        {c.startedAt ? new Date(c.startedAt).toLocaleString() : '—'}
      </td>
      <td className="px-4 py-3 text-right">
        <div className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-1">
          {canCancel && (
            <button
              onClick={onCancel}
              title="Cancel"
              className="p-1 rounded-md text-neutral hover:text-warning hover:bg-background"
            >
              <Square size={13} />
            </button>
          )}
          {canDelete && (
            <button
              onClick={onDelete}
              title="Delete"
              className="p-1 rounded-md text-neutral hover:text-error hover:bg-background"
            >
              <Trash2 size={13} />
            </button>
          )}
          <Link
            href={`/campaigns/${c.id}`}
            className="p-1 rounded-md text-neutral hover:text-primary hover:bg-background"
            title="Open"
          >
            <ChevronRight size={14} />
          </Link>
        </div>
      </td>
    </tr>
  );
}

// ─── Templates tab ────────────────────────────────────────────────────────

function TemplatesTab() {
  const qc = useQueryClient();
  const { data: templates = [] } = useQuery({
    queryKey: ['templates'],
    queryFn: api.listTemplates,
  });

  const [modal, setModal] = useState<
    null | { mode: 'create' } | { mode: 'edit'; template: EmailTemplate }
  >(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: (input: CreateTemplateInput) => api.createTemplate(input),
    onSuccess: () => {
      setModal(null);
      setErrorMsg(null);
      qc.invalidateQueries({ queryKey: ['templates'] });
    },
    onError: (e) => setErrorMsg((e as Error).message),
  });
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: CreateTemplateInput }) =>
      api.updateTemplate(id, patch),
    onSuccess: () => {
      setModal(null);
      setErrorMsg(null);
      qc.invalidateQueries({ queryKey: ['templates'] });
    },
    onError: (e) => setErrorMsg((e as Error).message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteTemplate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }),
    onError: (e) => alert((e as Error).message),
  });
  const duplicate = useMutation({
    mutationFn: (t: EmailTemplate) =>
      api.createTemplate({
        name: `${t.name} (copy)`,
        description: t.description ?? undefined,
        subject: t.subject,
        bodyText: t.bodyText,
        bodyHtml: t.bodyHtml ?? undefined,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }),
  });

  return (
    <>
      <div className="flex justify-end mb-3">
        <Button onClick={() => setModal({ mode: 'create' })}>
          <Plus size={14} /> New template
        </Button>
      </div>

      <Card className="!p-0 overflow-hidden">
        {templates.length === 0 ? (
          <div className="px-5 py-12 text-center text-ink-muted text-bodysm">
            No templates yet — create your first one.
          </div>
        ) : (
          <table className="w-full text-bodysm">
            <thead className="bg-background">
              <tr className="text-caption uppercase tracking-[0.06em] text-neutral text-left">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Subject</th>
                <th className="px-4 py-3">Updated</th>
                <th className="px-4 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id} className="border-t border-border hover:bg-background group">
                  <td className="px-4 py-3 font-medium text-ink">{t.name}</td>
                  <td className="px-4 py-3 text-ink-muted truncate max-w-[400px]">
                    {t.subject}
                  </td>
                  <td className="px-4 py-3 text-caption text-ink-muted">
                    {new Date(t.updatedAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-1">
                      <button
                        onClick={() => setModal({ mode: 'edit', template: t })}
                        className="p-1 rounded-md text-neutral hover:text-primary hover:bg-background"
                        title="Edit"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => duplicate.mutate(t)}
                        className="p-1 rounded-md text-neutral hover:text-primary hover:bg-background"
                        title="Duplicate"
                      >
                        <Copy size={13} />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Delete template "${t.name}"?`)) remove.mutate(t.id);
                        }}
                        className="p-1 rounded-md text-neutral hover:text-error hover:bg-background"
                        title="Delete"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <TemplateFormModal
        open={modal !== null}
        initial={modal?.mode === 'edit' ? modal.template : undefined}
        pending={create.isPending || update.isPending}
        error={errorMsg}
        onClose={() => {
          setModal(null);
          setErrorMsg(null);
        }}
        onSubmit={(input) => {
          if (modal?.mode === 'edit') {
            update.mutate({ id: modal.template.id, patch: input });
          } else {
            create.mutate(input);
          }
        }}
      />
    </>
  );
}

// ─── Sequences tab ────────────────────────────────────────────────────────

const SEQUENCE_STATUS_FILTERS: ('' | SequenceStatus)[] = [
  '',
  'draft',
  'active',
  'paused',
  'archived',
];

const SEQUENCE_STATUS_LABEL: Record<SequenceStatus, string> = {
  draft: 'Draft',
  active: 'Active',
  paused: 'Paused',
  archived: 'Archived',
};
const SEQUENCE_STATUS_CLASS: Record<SequenceStatus, string> = {
  draft: 'bg-zinc-100 text-zinc-700 border-zinc-200',
  active: 'bg-green-100 text-green-700 border-green-200',
  paused: 'bg-amber-100 text-amber-700 border-amber-200',
  archived: 'bg-zinc-200 text-zinc-700 border-zinc-300',
};

function SequencesTab() {
  const sp = useSearchParams();
  const router = useRouter();
  const status = sp.get('status') ?? '';

  const setStatus = (s: string) => {
    const p = new URLSearchParams(sp.toString());
    if (!s) p.delete('status');
    else p.set('status', s);
    router.replace(p.toString() ? `/campaigns?${p.toString()}` : '/campaigns');
  };

  const { data: sequences = [], isLoading } = useQuery({
    queryKey: ['sequences', status],
    queryFn: () =>
      api.listSequences({
        status: status ? [status as SequenceStatus] : undefined,
      }),
    refetchInterval: 10_000,
  });

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5 mb-4">
        {SEQUENCE_STATUS_FILTERS.map((s) => (
          <button
            key={s || 'all'}
            onClick={() => setStatus(s)}
            className={clsx(
              'px-2.5 h-7 rounded-md border text-caption font-medium',
              (status || '') === s
                ? 'bg-primary text-white border-primary'
                : 'bg-surface text-ink-muted border-border hover:border-primary hover:text-primary',
            )}
          >
            {s === '' ? 'All' : SEQUENCE_STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      <Card className="!p-0 overflow-hidden">
        {isLoading ? (
          <div className="px-5 py-8 text-bodysm text-ink-muted">Loading…</div>
        ) : sequences.length === 0 ? (
          <div className="px-5 py-12 text-center text-ink-muted text-bodysm">
            No sequences yet. Create one to send a multi-step drip to a
            lead group.{' '}
            <Link
              href="/campaigns/sequences/new"
              className="text-primary hover:underline"
            >
              Create one →
            </Link>
          </div>
        ) : (
          <table className="w-full text-bodysm">
            <thead className="bg-background">
              <tr className="text-caption uppercase tracking-[0.06em] text-neutral text-left">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Steps</th>
                <th className="px-4 py-3">Group</th>
                <th className="px-4 py-3">Enrolled</th>
                <th className="px-4 py-3">Completed</th>
                <th className="px-4 py-3">Exited</th>
                <th className="px-4 py-3">Started</th>
              </tr>
            </thead>
            <tbody>
              {sequences.map((s) => (
                <SequenceRow key={s.id} seq={s} />
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}

function SequenceRow({ seq }: { seq: SequenceSummary }) {
  return (
    <tr
      className="border-t border-border hover:bg-background/50 cursor-pointer"
      onClick={() => {
        window.location.href = `/campaigns/sequences/${seq.id}`;
      }}
    >
      <td className="px-4 py-2.5">
        <Link
          href={`/campaigns/sequences/${seq.id}`}
          className="text-primary hover:underline font-medium"
          onClick={(e) => e.stopPropagation()}
        >
          {seq.name}
        </Link>
        {seq.description && (
          <div className="text-caption text-ink-muted truncate max-w-[300px]">
            {seq.description}
          </div>
        )}
      </td>
      <td className="px-4 py-2.5">
        <span
          className={clsx(
            'inline-flex items-center h-5 px-1.5 rounded text-[11px] font-medium border',
            SEQUENCE_STATUS_CLASS[seq.status],
          )}
        >
          {SEQUENCE_STATUS_LABEL[seq.status]}
        </span>
      </td>
      <td className="px-4 py-2.5 font-mono font-tabular">
        {seq._count?.steps ?? seq.steps?.length ?? 0}
      </td>
      <td className="px-4 py-2.5 text-ink-muted">
        {seq.group?.name ?? '—'}
      </td>
      <td className="px-4 py-2.5 font-mono font-tabular">
        {seq.enrolledCount.toLocaleString()}
      </td>
      <td className="px-4 py-2.5 font-mono font-tabular text-success">
        {seq.completedCount.toLocaleString()}
      </td>
      <td className="px-4 py-2.5 font-mono font-tabular text-ink-muted">
        {seq.exitedCount.toLocaleString()}
      </td>
      <td className="px-4 py-2.5 text-caption text-ink-muted whitespace-nowrap">
        {seq.startedAt
          ? new Date(seq.startedAt).toLocaleDateString()
          : '—'}
      </td>
    </tr>
  );
}
