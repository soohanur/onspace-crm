'use client';

export const dynamic = 'force-dynamic';

import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  api,
  CreateCampaignInput,
  CreateTemplateInput,
  EmailAccount,
  EmailTemplate,
  GroupEmailCoverage,
  LeadGroup,
} from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { TemplateFormModal } from '@/components/campaigns/TemplateFormModal';
import { TemplatePreview } from '@/components/campaigns/TemplatePreview';
import { ArrowLeft, ArrowRight, Plus } from 'lucide-react';

export default function CampaignWizardPage() {
  return (
    <Suspense fallback={<div className="p-8 text-ink-muted">Loading…</div>}>
      <Body />
    </Suspense>
  );
}

function Body() {
  const router = useRouter();
  const qc = useQueryClient();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [dailySendLimit, setDailySendLimit] = useState(250);
  const [sendIntervalSec, setSendIntervalSec] = useState(12);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { data: groups = [] } = useQuery({ queryKey: ['groups'], queryFn: api.listGroups });
  const { data: templates = [] } = useQuery({ queryKey: ['templates'], queryFn: api.listTemplates });
  const { data: accounts = [] } = useQuery({
    queryKey: ['email-accounts'],
    queryFn: api.listEmailAccounts,
  });

  const { data: coverage } = useQuery<GroupEmailCoverage>({
    queryKey: ['group-coverage', groupId],
    queryFn: () => api.getGroupEmailCoverage(groupId!),
    enabled: !!groupId,
  });

  const { data: today } = useQuery({
    queryKey: ['account-today', accountId],
    queryFn: () => api.getAccountTodayCount(accountId!),
    enabled: !!accountId,
  });

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === templateId) ?? null,
    [templateId, templates],
  );
  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === accountId) ?? null,
    [accountId, accounts],
  );

  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const createTemplate = useMutation({
    mutationFn: (input: CreateTemplateInput) => api.createTemplate(input),
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: ['templates'] });
      setTemplateId(t.id);
      setShowTemplateModal(false);
    },
  });

  const createCampaign = useMutation({
    mutationFn: async (action: 'draft' | 'start') => {
      if (!groupId || !templateId || !accountId) throw new Error('Missing fields');
      const payload: CreateCampaignInput = {
        name: name.trim(),
        description: description.trim() || undefined,
        groupId,
        templateId,
        accountId,
        dailySendLimit,
        sendIntervalSec,
      };
      const created = await api.createCampaign(payload);
      if (action === 'start') {
        try {
          await api.startCampaign(created.campaign.id);
        } catch (err) {
          // If 422 wouldSkip — ask user to confirm.
          const msg = (err as Error).message;
          if (msg.includes('would be skipped')) {
            const ok = confirm(`${msg}\n\nContinue anyway?`);
            if (ok) {
              await api.startCampaign(created.campaign.id, true);
            } else {
              router.push(`/campaigns/${created.campaign.id}`);
              return created.campaign.id;
            }
          } else {
            throw err;
          }
        }
      }
      return created.campaign.id;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ['campaigns'] });
      router.push(`/campaigns/${id}`);
    },
    onError: (e) => setErrorMsg((e as Error).message),
  });

  const canStep2 = !!groupId;
  const canStep3 = !!groupId && !!templateId;
  const canSubmit =
    !!groupId &&
    !!templateId &&
    !!accountId &&
    name.trim().length > 0 &&
    !createCampaign.isPending;

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-8">
      <div className="flex items-center gap-3 mb-4">
        <Link href="/campaigns" className="text-caption text-ink-muted hover:text-primary inline-flex items-center gap-1">
          <ArrowLeft size={12} /> Campaigns
        </Link>
      </div>
      <h1 className="text-h1 mb-1">New campaign</h1>
      <p className="text-ink-muted text-bodysm mb-6">
        Pick a group, a template, and an account. We'll resolve recipients
        and dedupe by email before sending anything.
      </p>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-6 text-bodysm">
        <StepDot n={1} active={step === 1} done={step > 1} label="Group" />
        <span className="text-neutral">→</span>
        <StepDot n={2} active={step === 2} done={step > 2} label="Template" />
        <span className="text-neutral">→</span>
        <StepDot n={3} active={step === 3} done={false} label="Review & start" />
      </div>

      {step === 1 && (
        <Card>
          <div className="text-caption uppercase tracking-wider text-neutral mb-3">
            Pick a lead group
          </div>
          <div className="space-y-2">
            {groups.length === 0 && (
              <div className="text-bodysm text-ink-muted">
                You don't have any groups yet. <Link href="/groups" className="text-primary hover:underline">Create one</Link>.
              </div>
            )}
            {groups.map((g: LeadGroup) => (
              <button
                key={g.id}
                onClick={() => setGroupId(g.id)}
                className={clsx(
                  'w-full text-left rounded-md border p-3 transition-colors',
                  groupId === g.id
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary',
                )}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-ink">{g.name}</div>
                    {g.description && (
                      <div className="text-caption text-ink-muted">{g.description}</div>
                    )}
                  </div>
                  <div className="text-caption text-neutral font-mono font-tabular">
                    {g.memberCount} member{g.memberCount === 1 ? '' : 's'} · {g.type}
                  </div>
                </div>
              </button>
            ))}
          </div>
          {coverage && (
            <div className="mt-5 rounded-md border border-border bg-background p-4 text-bodysm">
              <div className="text-caption uppercase tracking-wider text-neutral mb-2">
                Email coverage
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <Stat label="Total leads" value={coverage.totalLeads} />
                <Stat label="With contact email" value={coverage.withPrimaryContactEmail} tone="positive" />
                <Stat label="Fallback (lead.email)" value={coverage.withFallbackEmail} />
                <Stat label="No email" value={coverage.noEmail} tone="warning" />
                <Stat label="Duplicate emails" value={coverage.duplicateEmails} tone="warning" />
              </div>
            </div>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <Button disabled={!canStep2} onClick={() => setStep(2)}>
              Next: Template <ArrowRight size={14} />
            </Button>
          </div>
        </Card>
      )}

      {step === 2 && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-6">
          <Card>
            <div className="flex items-center justify-between mb-3">
              <div className="text-caption uppercase tracking-wider text-neutral">
                Pick a template
              </div>
              <button
                onClick={() => setShowTemplateModal(true)}
                className="text-caption text-primary hover:underline inline-flex items-center gap-1"
              >
                <Plus size={12} /> New
              </button>
            </div>
            <div className="space-y-2">
              {templates.length === 0 && (
                <div className="text-bodysm text-ink-muted">
                  No templates yet — create your first one.
                </div>
              )}
              {templates.map((t: EmailTemplate) => (
                <button
                  key={t.id}
                  onClick={() => setTemplateId(t.id)}
                  className={clsx(
                    'w-full text-left rounded-md border p-3 transition-colors',
                    templateId === t.id
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary',
                  )}
                >
                  <div className="font-medium text-ink truncate">{t.name}</div>
                  <div className="text-caption text-ink-muted truncate">{t.subject}</div>
                </button>
              ))}
            </div>
            <div className="mt-5 flex justify-between gap-2">
              <Button variant="secondary" onClick={() => setStep(1)}>
                <ArrowLeft size={14} /> Back
              </Button>
              <Button disabled={!canStep3} onClick={() => setStep(3)}>
                Next: Review <ArrowRight size={14} />
              </Button>
            </div>
          </Card>
          <Card className="!p-4 flex flex-col min-h-[480px]">
            <div className="text-caption uppercase tracking-wider text-neutral mb-2">
              Preview (sample lead)
            </div>
            {selectedTemplate ? (
              <TemplatePreview
                subject={selectedTemplate.subject}
                bodyText={selectedTemplate.bodyText}
                bodyHtml={selectedTemplate.bodyHtml ?? ''}
                className="flex-1"
              />
            ) : (
              <div className="text-bodysm text-ink-muted py-8 text-center">
                Select a template to see the rendered preview.
              </div>
            )}
          </Card>
        </div>
      )}

      {step === 3 && (
        <Card>
          <div className="text-caption uppercase tracking-wider text-neutral mb-3">
            Review and start
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Campaign name *">
              <Input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
            </Field>
            <Field label="Description">
              <Input value={description} onChange={(e) => setDescription(e.target.value)} />
            </Field>
            <Field label="Account *">
              <select
                value={accountId ?? ''}
                onChange={(e) => setAccountId(e.target.value || null)}
                className="h-10 px-2 w-full rounded-md border border-border bg-surface text-bodysm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
              >
                <option value="">Select an account…</option>
                {accounts
                  .filter((a: EmailAccount) => a.active)
                  .map((a: EmailAccount) => (
                    <option key={a.id} value={a.id}>
                      {a.email} {a.displayName ? `(${a.displayName})` : ''}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Today on this account">
              <div className="h-10 px-2 inline-flex items-center text-bodysm text-ink-muted">
                {accountId
                  ? `${today?.sentToday ?? 0} sent today · ${
                      Math.max(0, dailySendLimit - (today?.sentToday ?? 0))
                    } remaining today`
                  : 'Pick an account…'}
              </div>
            </Field>
            <Field label="Daily send limit">
              <Input
                type="number"
                min={1}
                max={2000}
                value={dailySendLimit}
                onChange={(e) => setDailySendLimit(Number(e.target.value || 0))}
              />
            </Field>
            <Field label="Inter-send delay (seconds)">
              <Input
                type="number"
                min={1}
                max={3600}
                value={sendIntervalSec}
                onChange={(e) => setSendIntervalSec(Number(e.target.value || 0))}
              />
            </Field>
          </div>

          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-3 text-bodysm">
            <Stat
              label="Recipients (resolved)"
              value={
                coverage
                  ? coverage.withPrimaryContactEmail + coverage.withFallbackEmail - coverage.duplicateEmails
                  : 0
              }
            />
            <Stat
              label="Expected duration"
              value={
                coverage
                  ? humanDuration(
                      Math.max(
                        1,
                        coverage.withPrimaryContactEmail + coverage.withFallbackEmail - coverage.duplicateEmails,
                      ) * sendIntervalSec,
                    )
                  : '—'
              }
            />
          </div>

          {errorMsg && (
            <div className="mt-4 text-caption text-error" title={errorMsg}>
              {errorMsg}
            </div>
          )}

          <div className="mt-5 flex justify-between gap-2">
            <Button variant="secondary" onClick={() => setStep(2)}>
              <ArrowLeft size={14} /> Back
            </Button>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                disabled={!canSubmit}
                onClick={() => createCampaign.mutate('draft')}
              >
                Save as draft
              </Button>
              <Button
                disabled={!canSubmit}
                onClick={() => createCampaign.mutate('start')}
              >
                Save & start
              </Button>
            </div>
          </div>
        </Card>
      )}

      <TemplateFormModal
        open={showTemplateModal}
        pending={createTemplate.isPending}
        error={createTemplate.error ? (createTemplate.error as Error).message : null}
        onClose={() => setShowTemplateModal(false)}
        onSubmit={(input) => createTemplate.mutate(input)}
      />
    </div>
  );
}

function StepDot({
  n,
  active,
  done,
  label,
}: {
  n: number;
  active: boolean;
  done: boolean;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={clsx(
          'inline-flex items-center justify-center h-6 w-6 rounded-full text-[12px] font-semibold border',
          active && 'bg-primary text-white border-primary',
          done && !active && 'bg-success text-white border-success',
          !active && !done && 'bg-surface text-ink-muted border-border',
        )}
      >
        {n}
      </span>
      <span className={clsx(active ? 'text-ink font-medium' : 'text-ink-muted')}>{label}</span>
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-caption uppercase tracking-wider text-neutral mb-1">
        {label}
      </div>
      {children}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: 'positive' | 'warning';
}) {
  return (
    <div className="rounded-md border border-border bg-surface p-3">
      <div className="text-caption uppercase tracking-wider text-neutral">
        {label}
      </div>
      <div
        className={clsx(
          'text-h2 font-mono font-tabular mt-1',
          tone === 'positive' && 'text-success',
          tone === 'warning' && 'text-warning',
        )}
      >
        {value}
      </div>
    </div>
  );
}

function humanDuration(sec: number): string {
  if (sec < 60) return `${Math.round(sec)}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return `${h}h ${m}m`;
}
