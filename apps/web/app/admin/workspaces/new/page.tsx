'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';

import { adminApi } from '@/lib/admin';

export default function NewWorkspacePage() {
  const router = useRouter();
  const catalog = useQuery({ queryKey: ['admin', 'catalog'], queryFn: adminApi.catalog });

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [seatLimit, setSeatLimit] = useState(5);
  const [timezone, setTimezone] = useState('Asia/Dhaka');
  const [currency, setCurrency] = useState('BDT');
  const [productKeys, setProductKeys] = useState<Set<string>>(new Set(['crm']));

  const [tempPw, setTempPw] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      adminApi.createWorkspace({
        name: name.trim(),
        slug: slug.trim().toLowerCase(),
        ownerName: ownerName.trim(),
        ownerEmail: ownerEmail.trim().toLowerCase(),
        seatLimit,
        timezone,
        currency,
        productKeys: Array.from(productKeys),
      }),
    onSuccess: (data) => {
      setError(null);
      if (data.ownerTemporaryPassword) setTempPw(data.ownerTemporaryPassword);
      else router.push(`/admin/workspaces/${data.workspace.id}`);
    },
    onError: (e: any) => setError(e?.message ?? 'Create failed'),
  });

  function toggleProduct(key: string) {
    const next = new Set(productKeys);
    if (next.has(key)) next.delete(key); else next.add(key);
    setProductKeys(next);
  }

  if (tempPw) {
    return (
      <div className="max-w-[600px] mx-auto px-6 py-12">
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-6">
          <h2 className="text-lg font-semibold text-emerald-300">Workspace created</h2>
          <p className="mt-2 text-sm text-emerald-100">Hand these credentials to {ownerEmail}:</p>
          <div className="mt-4 rounded-lg border border-emerald-500/30 bg-black/30 p-4 font-mono text-sm">
            <div>email: {ownerEmail}</div>
            <div>password: <span className="select-all text-amber-200">{tempPw}</span></div>
          </div>
          <button
            onClick={() => router.push('/admin')}
            className="mt-4 rounded-md bg-emerald-500/90 hover:bg-emerald-500 text-emerald-950 text-sm font-medium px-4 py-2"
          >
            Back to workspaces
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[700px] mx-auto px-6 py-8">
      <h1 className="text-2xl font-semibold text-ink mb-1">New workspace</h1>
      <p className="text-sm text-ink-muted mb-6">
        After creation, we generate a temporary password and seed the default roles.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
        className="space-y-6"
      >
        <Section title="Workspace">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Name" required>
              <input value={name} onChange={(e) => setName(e.target.value)} required className={inputCls} />
            </Field>
            <Field label="Slug" required>
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value.replace(/[^a-z0-9-]/g, ''))}
                placeholder="acme-corp"
                required
                className={inputCls}
              />
            </Field>
            <Field label="Seat limit">
              <input
                type="number"
                min={1}
                max={1000}
                value={seatLimit}
                onChange={(e) => setSeatLimit(Number(e.target.value) || 1)}
                className={inputCls}
              />
            </Field>
            <Field label="Timezone">
              <input value={timezone} onChange={(e) => setTimezone(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Currency">
              <input value={currency} onChange={(e) => setCurrency(e.target.value)} className={inputCls} />
            </Field>
          </div>
        </Section>

        <Section title="Owner">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Owner name" required>
              <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} required className={inputCls} />
            </Field>
            <Field label="Owner email" required>
              <input
                type="email"
                value={ownerEmail}
                onChange={(e) => setOwnerEmail(e.target.value)}
                required
                className={inputCls}
              />
            </Field>
          </div>
          <p className="text-[11px] text-ink-muted mt-2">
            We generate a temporary password and show it once on the next screen.
          </p>
        </Section>

        <Section title="Products to enable">
          <div className="grid grid-cols-2 gap-2">
            {catalog.data?.map((p) => (
              <label key={p.id} className="flex items-start gap-2 rounded-md border border-border p-3 hover:bg-background">
                <input
                  type="checkbox"
                  checked={productKeys.has(p.key)}
                  onChange={() => toggleProduct(p.key)}
                  className="mt-1"
                />
                <div>
                  <div className="text-sm font-medium text-ink">{p.name} <code className="text-[10px] text-ink-muted ml-1">{p.key}</code></div>
                  <div className="text-xs text-ink-muted">{p.description ?? '—'}</div>
                  <div className="text-[10px] text-ink-muted mt-1">{p.features.length} feature(s)</div>
                </div>
              </label>
            ))}
          </div>
        </Section>

        {error && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => router.back()} className="rounded-md border border-border px-4 py-2 text-sm text-ink hover:bg-background">
            Cancel
          </button>
          <button
            type="submit"
            disabled={create.isPending}
            className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-60"
          >
            {create.isPending ? 'Creating…' : 'Create workspace'}
          </button>
        </div>
      </form>
    </div>
  );
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

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium text-ink-muted uppercase tracking-wide">
        {label} {required && <span className="text-red-400">*</span>}
      </span>
      {children}
    </label>
  );
}
