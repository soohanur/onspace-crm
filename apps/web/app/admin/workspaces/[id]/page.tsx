'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { adminApi, type WorkspaceDetail } from '@/lib/admin';

export default function WorkspaceDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const qc = useQueryClient();

  const ws = useQuery({ queryKey: ['admin', 'workspaces', id], queryFn: () => adminApi.getWorkspace(id), enabled: !!id });
  const catalog = useQuery({ queryKey: ['admin', 'catalog'], queryFn: adminApi.catalog });

  const toggleProduct = useMutation({
    mutationFn: (args: { key: string; enabled: boolean }) => adminApi.toggleProduct(id, args.key, args.enabled),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'workspaces', id] }),
  });
  const toggleFeature = useMutation({
    mutationFn: (args: { key: string; enabled: boolean }) => adminApi.toggleFeature(id, args.key, args.enabled),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'workspaces', id] }),
  });

  if (ws.isLoading) return <div className="p-6 text-ink-muted">Loading…</div>;
  if (ws.error || !ws.data) return <div className="p-6 text-red-400">{(ws.error as Error)?.message ?? 'Not found'}</div>;

  const w: WorkspaceDetail = ws.data;
  const enabledProductKeys = new Set(w.products.filter((p) => p.enabled).map((p) => p.product.key));
  const enabledFeatureKeys = new Set(w.features.filter((f) => f.enabled).map((f) => f.feature.key));

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-8 space-y-6">
      <div>
        <Link href="/admin" className="text-xs text-ink-muted hover:text-ink">← All workspaces</Link>
        <h1 className="text-2xl font-semibold text-ink mt-2">{w.name}</h1>
        <p className="text-sm text-ink-muted">
          slug: <code>{w.slug}</code> · status: <b>{w.status}</b> · {w._count.members} / {w.seatLimit} seats · {w.timezone} · {w.currency}
        </p>
      </div>

      <SettingsForm workspace={w} onSaved={() => qc.invalidateQueries({ queryKey: ['admin', 'workspaces', id] })} />

      <Section title="Products">
        <div className="grid grid-cols-2 gap-3">
          {catalog.data?.map((p) => (
            <div key={p.id} className="rounded-lg border border-border bg-surface p-4">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={enabledProductKeys.has(p.key)}
                  onChange={() => toggleProduct.mutate({ key: p.key, enabled: !enabledProductKeys.has(p.key) })}
                  className="mt-1"
                />
                <div className="flex-1">
                  <div className="font-medium text-ink">{p.name} <code className="text-[10px] text-ink-muted">{p.key}</code></div>
                  <div className="text-xs text-ink-muted">{p.description}</div>
                </div>
              </label>

              {enabledProductKeys.has(p.key) && p.features.length > 0 && (
                <div className="mt-3 pl-6 border-l border-border space-y-1.5">
                  {p.features.map((f) => (
                    <label key={f.id} className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={enabledFeatureKeys.has(f.key)}
                        onChange={() =>
                          toggleFeature.mutate({ key: f.key, enabled: !enabledFeatureKeys.has(f.key) })
                        }
                      />
                      <span className="text-ink">{f.name}</span>
                      <code className="text-[10px] text-ink-muted">{f.key}</code>
                    </label>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </Section>

      <SubscriptionEditor workspace={w} onSaved={() => qc.invalidateQueries({ queryKey: ['admin', 'workspaces', id] })} />

      <Section title={`Members (${w.members.length})`}>
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-background text-ink-muted text-[11px] uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-2 font-medium">User</th>
                <th className="text-left px-4 py-2 font-medium">Role</th>
                <th className="text-left px-4 py-2 font-medium">Status</th>
                <th className="text-left px-4 py-2 font-medium">Last login</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-surface">
              {w.members.map((m) => (
                <tr key={m.id}>
                  <td className="px-4 py-2">
                    <div className="text-ink">{m.user.name}</div>
                    <div className="text-[11px] text-ink-muted">{m.user.email}</div>
                  </td>
                  <td className="px-4 py-2 text-ink-muted">{m.role.name}</td>
                  <td className="px-4 py-2 text-ink-muted">{m.status}</td>
                  <td className="px-4 py-2 text-ink-muted">
                    {m.user.lastLoginAt ? new Date(m.user.lastLoginAt).toLocaleString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

function SettingsForm({ workspace, onSaved }: { workspace: WorkspaceDetail; onSaved: () => void }) {
  const [name, setName] = useState(workspace.name);
  const [seatLimit, setSeatLimit] = useState(workspace.seatLimit);
  const [status, setStatus] = useState<WorkspaceDetail['status']>(workspace.status);
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => adminApi.updateWorkspace(workspace.id, { name, seatLimit, status }),
    onSuccess: () => { setError(null); onSaved(); },
    onError: (e: any) => setError(e?.message ?? 'Save failed'),
  });

  return (
    <Section title="Settings">
      <div className="grid grid-cols-3 gap-4">
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Seat limit">
          <input type="number" min={1} value={seatLimit} onChange={(e) => setSeatLimit(Number(e.target.value) || 1)} className={inputCls} />
        </Field>
        <Field label="Status">
          <select value={status} onChange={(e) => setStatus(e.target.value as any)} className={inputCls}>
            <option value="active">active</option>
            <option value="suspended">suspended</option>
            <option value="expired">expired</option>
          </select>
        </Field>
      </div>
      {error && <div className="mt-3 text-xs text-red-400">{error}</div>}
      <div className="mt-4">
        <button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-60"
        >
          {save.isPending ? 'Saving…' : 'Save settings'}
        </button>
      </div>
    </Section>
  );
}

function SubscriptionEditor({ workspace, onSaved }: { workspace: WorkspaceDetail; onSaved: () => void }) {
  const s = workspace.subscription;
  const today = new Date();
  const oneYearOut = new Date(today);
  oneYearOut.setFullYear(oneYearOut.getFullYear() + 1);

  const [planName, setPlanName] = useState(s?.planName ?? 'Standard');
  const [startsAt, setStartsAt] = useState(toLocalDate(s?.startsAt ?? today.toISOString()));
  const [expiresAt, setExpiresAt] = useState(toLocalDate(s?.expiresAt ?? oneYearOut.toISOString()));
  const [status, setStatus] = useState(s?.status ?? 'active');
  const [amount, setAmount] = useState(s?.amountPaid ?? '');
  const [currency, setCurrency] = useState(s?.currency ?? workspace.currency);
  const [notes, setNotes] = useState(s?.notes ?? '');
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      adminApi.upsertSubscription(workspace.id, {
        planName,
        startsAt: new Date(startsAt).toISOString(),
        expiresAt: new Date(expiresAt).toISOString(),
        status,
        amountPaid: amount ? Number(amount) : undefined,
        currency,
        notes: notes || undefined,
      }),
    onSuccess: () => { setError(null); onSaved(); },
    onError: (e: any) => setError(e?.message ?? 'Save failed'),
  });

  return (
    <Section title="Subscription (offline)">
      <div className="grid grid-cols-3 gap-4">
        <Field label="Plan">
          <input value={planName} onChange={(e) => setPlanName(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Starts">
          <input type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Expires">
          <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Status">
          <select value={status} onChange={(e) => setStatus(e.target.value as any)} className={inputCls}>
            <option value="active">active</option>
            <option value="expired">expired</option>
            <option value="suspended">suspended</option>
          </select>
        </Field>
        <Field label="Amount paid">
          <input type="number" min={0} value={String(amount)} onChange={(e) => setAmount(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Currency">
          <input value={currency} onChange={(e) => setCurrency(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Notes">
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Deal terms, contact name…" className={inputCls} />
        </Field>
      </div>
      {error && <div className="mt-3 text-xs text-red-400">{error}</div>}
      <div className="mt-4">
        <button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-60"
        >
          {save.isPending ? 'Saving…' : 'Save subscription'}
        </button>
      </div>
    </Section>
  );
}

function toLocalDate(iso: string) {
  return new Date(iso).toISOString().slice(0, 10);
}

const inputCls =
  'mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-ink outline-none focus:border-ring focus:ring-2 focus:ring-ring/30';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <h2 className="text-sm font-semibold text-ink mb-4">{title}</h2>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium text-ink-muted uppercase tracking-wide">{label}</span>
      {children}
    </label>
  );
}
