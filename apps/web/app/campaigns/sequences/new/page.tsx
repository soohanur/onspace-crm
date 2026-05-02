'use client';

export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { Suspense, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  api,
  CreateSequenceInput,
  CreateSequenceStepInput,
} from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  Plus,
  Trash2,
} from 'lucide-react';

type WizardStep = 1 | 2 | 3;

interface DraftStep extends CreateSequenceStepInput {
  /** Local-only key so React doesn't keep stale references when reordering. */
  _key: string;
}

let stepKey = 0;
const newKey = () => `step-${++stepKey}-${Date.now()}`;

export default function NewSequenceWizard() {
  return (
    <Suspense
      fallback={
        <div className="max-w-[1100px] mx-auto px-6 py-8 text-ink-muted">
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
  const [step, setStep] = useState<WizardStep>(1);

  // Step 1
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [accountId, setAccountId] = useState('');
  const [groupId, setGroupId] = useState('');
  const [dailyLimit, setDailyLimit] = useState('250');
  const [intervalSec, setIntervalSec] = useState('12');

  // Step 2
  const [steps, setSteps] = useState<DraftStep[]>([]);

  const { data: accounts = [] } = useQuery({
    queryKey: ['email-accounts'],
    queryFn: api.listEmailAccounts,
  });
  const { data: groups = [] } = useQuery({
    queryKey: ['groups'],
    queryFn: api.listGroups,
  });
  const { data: templates = [] } = useQuery({
    queryKey: ['templates'],
    queryFn: api.listTemplates,
  });

  const groupCoverage = useQuery({
    queryKey: ['group-email-coverage', groupId],
    queryFn: () => api.getGroupEmailCoverage(groupId),
    enabled: !!groupId,
  });

  const totalDelayDays = useMemo(
    () =>
      steps.reduce((s, st, idx) => s + (idx === 0 ? 0 : Math.max(0, st.delayDays)), 0),
    [steps],
  );

  const create = useMutation({
    mutationFn: (input: CreateSequenceInput) => api.createSequence(input),
  });
  const start = useMutation({
    mutationFn: (id: string) => api.startSequence(id),
  });

  const addStep = () => {
    setSteps((prev) => [
      ...prev,
      {
        _key: newKey(),
        delayDays: prev.length === 0 ? 0 : 2,
        templateId: templates[0]?.id ?? '',
        stopOnReply: true,
        stopOnStageProgression: true,
      },
    ]);
  };
  const removeStep = (key: string) =>
    setSteps((prev) => prev.filter((s) => s._key !== key));
  const move = (key: string, dir: -1 | 1) =>
    setSteps((prev) => {
      const idx = prev.findIndex((s) => s._key === key);
      const target = idx + dir;
      if (idx < 0 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  const updateStep = <K extends keyof DraftStep>(
    key: string,
    field: K,
    value: DraftStep[K],
  ) =>
    setSteps((prev) =>
      prev.map((s) => (s._key === key ? { ...s, [field]: value } : s)),
    );

  // ─── Step gating ─────────────────────────────────────────────────────
  const canStep2 = name.trim().length > 0 && !!accountId;
  const canStep3 =
    canStep2 &&
    steps.length > 0 &&
    steps.every((s) => !!s.templateId);

  const buildPayload = (): CreateSequenceInput => ({
    name: name.trim(),
    description: description.trim() || undefined,
    groupId: groupId || undefined,
    accountId,
    dailySendLimit: Math.max(1, Number(dailyLimit) || 250),
    sendIntervalSec: Math.max(1, Number(intervalSec) || 12),
    steps: steps.map((s, idx) => ({
      delayDays: idx === 0 ? 0 : Math.max(0, s.delayDays),
      templateId: s.templateId,
      stopOnReply: s.stopOnReply,
      stopOnStageProgression: s.stopOnStageProgression,
    })),
  });

  const submit = async (andStart: boolean) => {
    try {
      const created = await create.mutateAsync(buildPayload());
      if (andStart) {
        await start.mutateAsync(created.id);
      }
      router.push(`/campaigns/sequences/${created.id}`);
    } catch {
      /* error renders below */
    }
  };

  return (
    <div className="max-w-[1100px] mx-auto px-6 py-8 space-y-5">
      <header>
        <Link
          href="/campaigns?tab=sequences"
          className="text-caption text-ink-muted hover:text-primary inline-flex items-center gap-1 mb-3"
        >
          <ArrowLeft size={12} /> All sequences
        </Link>
        <h1 className="text-h1 mb-1">New sequence</h1>
        <p className="text-ink-muted text-bodysm">
          Multi-step drip with stop-on-reply and stop-on-stage-progression
          guards. Steps fire on a 5-minute tick once started.
        </p>
      </header>

      {/* Progress dots */}
      <div className="flex items-center gap-2 text-caption">
        {[1, 2, 3].map((n) => (
          <div key={n} className="flex items-center gap-2">
            <span
              className={clsx(
                'inline-flex items-center justify-center h-7 w-7 rounded-full font-mono font-tabular text-bodysm',
                n === step
                  ? 'bg-primary text-white'
                  : n < step
                  ? 'bg-success text-white'
                  : 'bg-background text-ink-muted',
              )}
            >
              {n}
            </span>
            <span
              className={clsx(
                'mr-3',
                n === step ? 'text-ink font-medium' : 'text-ink-muted',
              )}
            >
              {n === 1 ? 'Basics' : n === 2 ? 'Steps' : 'Review'}
            </span>
            {n < 3 && (
              <span className="h-px w-8 bg-border mr-3" aria-hidden />
            )}
          </div>
        ))}
      </div>

      {step === 1 && (
        <Card className="!p-5 space-y-4">
          <Field label="Name *">
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Cold outreach — plumbers Q2"
            />
          </Field>
          <Field label="Description">
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional"
            />
          </Field>
          <Field label="Google account *">
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="h-10 px-2 w-full rounded-md border border-border bg-surface text-bodysm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
            >
              <option value="">Pick an account…</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.email}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Lead group (optional)">
            <select
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              className="h-10 px-2 w-full rounded-md border border-border bg-surface text-bodysm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
            >
              <option value="">Manual enrollment only</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} ({g.memberCount})
                </option>
              ))}
            </select>
            {groupId && groupCoverage.data && (
              <div className="text-caption text-ink-muted mt-1">
                Coverage:{' '}
                {groupCoverage.data.withPrimaryContactEmail +
                  groupCoverage.data.withFallbackEmail}{' '}
                of {groupCoverage.data.totalLeads} leads have an email.
              </div>
            )}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Daily send limit (per account)">
              <Input
                type="number"
                min={1}
                max={2000}
                value={dailyLimit}
                onChange={(e) => setDailyLimit(e.target.value)}
              />
            </Field>
            <Field label="Send interval (seconds)">
              <Input
                type="number"
                min={1}
                max={86400}
                value={intervalSec}
                onChange={(e) => setIntervalSec(e.target.value)}
              />
            </Field>
          </div>
          <div className="flex justify-end pt-2">
            <Button
              disabled={!canStep2}
              onClick={() => setStep(2)}
            >
              Next: Steps →
            </Button>
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card className="!p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-bodysm font-medium text-ink">
                Drip steps ({steps.length})
              </div>
              <div className="text-caption text-ink-muted">
                Step 0 fires immediately. Subsequent steps wait the
                configured days after the previous step.
              </div>
            </div>
            <Button
              variant="secondary"
              onClick={addStep}
              disabled={templates.length === 0}
              title={
                templates.length === 0
                  ? 'Create a template first'
                  : undefined
              }
            >
              <Plus size={13} /> Add step
            </Button>
          </div>

          {templates.length === 0 && (
            <div className="text-bodysm text-warning bg-[#FEF4E5] border border-warning/40 rounded-md p-3">
              You don't have any templates yet.{' '}
              <Link href="/campaigns?tab=templates" className="text-primary hover:underline">
                Create one →
              </Link>
            </div>
          )}

          {steps.length === 0 ? (
            <div className="text-bodysm text-ink-muted py-6 text-center">
              Add at least one step. Step 0 fires immediately on
              enrollment; subsequent steps wait the configured days.
            </div>
          ) : (
            <ul className="space-y-2">
              {steps.map((s, idx) => (
                <li
                  key={s._key}
                  className="rounded-md border border-border bg-surface p-3 space-y-2"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-caption font-mono font-tabular text-neutral">
                      Step {idx}
                    </span>
                    <button
                      type="button"
                      onClick={() => move(s._key, -1)}
                      disabled={idx === 0}
                      className="p-1 rounded hover:bg-background text-neutral disabled:opacity-30 disabled:hover:bg-transparent"
                      aria-label="Move up"
                    >
                      <ArrowUp size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(s._key, 1)}
                      disabled={idx === steps.length - 1}
                      className="p-1 rounded hover:bg-background text-neutral disabled:opacity-30 disabled:hover:bg-transparent"
                      aria-label="Move down"
                    >
                      <ArrowDown size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeStep(s._key)}
                      className="ml-auto p-1 rounded hover:bg-background text-neutral hover:text-error"
                      aria-label="Remove step"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Field label={idx === 0 ? 'Delay (locked to 0)' : 'Delay (days)'}>
                      <Input
                        type="number"
                        min={0}
                        max={365}
                        value={idx === 0 ? 0 : s.delayDays}
                        onChange={(e) =>
                          updateStep(s._key, 'delayDays', Number(e.target.value) || 0)
                        }
                        disabled={idx === 0}
                      />
                    </Field>
                    <Field label="Template *">
                      <select
                        value={s.templateId}
                        onChange={(e) =>
                          updateStep(s._key, 'templateId', e.target.value)
                        }
                        className="h-10 px-2 w-full rounded-md border border-border bg-surface text-bodysm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
                      >
                        <option value="">Pick a template…</option>
                        {templates.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  <div className="flex items-center gap-4 text-bodysm pt-1">
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={s.stopOnReply ?? true}
                        onChange={(e) =>
                          updateStep(s._key, 'stopOnReply', e.target.checked)
                        }
                        className="accent-primary"
                      />
                      Stop on reply
                    </label>
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={s.stopOnStageProgression ?? true}
                        onChange={(e) =>
                          updateStep(
                            s._key,
                            'stopOnStageProgression',
                            e.target.checked,
                          )
                        }
                        className="accent-primary"
                      />
                      Stop on stage progression
                    </label>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="flex justify-between pt-2">
            <Button variant="secondary" onClick={() => setStep(1)}>
              ← Back
            </Button>
            <Button disabled={!canStep3} onClick={() => setStep(3)}>
              Next: Review →
            </Button>
          </div>
        </Card>
      )}

      {step === 3 && (
        <Card className="!p-5 space-y-4">
          <div>
            <div className="text-caption uppercase tracking-wider text-neutral">
              Summary
            </div>
            <div className="text-h3 mt-1">{name}</div>
            {description && (
              <div className="text-bodysm text-ink-muted mt-0.5">
                {description}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SummaryStat
              label="Account"
              value={
                accounts.find((a) => a.id === accountId)?.email ?? '—'
              }
            />
            <SummaryStat
              label="Group"
              value={
                groupId
                  ? groups.find((g) => g.id === groupId)?.name ?? 'Unknown'
                  : 'Manual only'
              }
            />
            <SummaryStat label="Steps" value={String(steps.length)} />
            <SummaryStat
              label="Total span"
              value={
                steps.length <= 1 ? 'immediate' : `${totalDelayDays} day(s)`
              }
            />
          </div>
          {groupId && groupCoverage.data && (
            <div className="text-caption text-ink-muted">
              On start,{' '}
              {groupCoverage.data.withPrimaryContactEmail +
                groupCoverage.data.withFallbackEmail}{' '}
              of {groupCoverage.data.totalLeads} leads will be enrolled
              (the rest skipped — no resolvable email).
            </div>
          )}
          {!groupId && (
            <div className="text-caption text-warning">
              No group attached — leads must be enrolled manually after
              starting.
            </div>
          )}
          {(create.error || start.error) && (
            <div className="text-caption text-error">
              {((create.error ?? start.error) as Error).message}
            </div>
          )}
          <div className="flex justify-between pt-2 gap-2 flex-wrap">
            <Button variant="secondary" onClick={() => setStep(2)}>
              ← Back
            </Button>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                onClick={() => submit(false)}
                disabled={create.isPending || start.isPending}
              >
                Save as draft
              </Button>
              <Button
                onClick={() => submit(true)}
                disabled={create.isPending || start.isPending}
              >
                {create.isPending || start.isPending
                  ? 'Saving…'
                  : 'Save & start'}
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-caption uppercase tracking-wider text-neutral mb-1">
        {label}
      </div>
      {children}
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="!p-3">
      <div className="text-caption text-neutral">{label}</div>
      <div className="text-bodysm text-ink mt-1 truncate" title={value}>
        {value}
      </div>
    </Card>
  );
}
