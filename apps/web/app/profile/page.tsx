'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';

import { useAuth } from '@/components/AuthContext';
import { profileApi } from '@/lib/profile';

export default function ProfilePage() {
  const router = useRouter();
  const { ctx, loading, refresh, signOut } = useAuth();

  useEffect(() => {
    if (!loading && !ctx) router.replace('/login?next=/profile');
  }, [loading, ctx, router]);

  if (loading || !ctx) {
    return <div className="p-6 text-ink-muted">Loading…</div>;
  }

  return (
    <div className="max-w-[720px] mx-auto px-6 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Profile & settings</h1>
        <p className="text-sm text-ink-muted mt-1">Your account info, workspace, and password.</p>
      </div>

      <IdentityCard ctx={ctx} />
      <NameCard ctx={ctx} onSaved={refresh} />
      <PasswordCard />
      <WorkspaceCard ctx={ctx} />
      <DangerCard onSignOut={async () => { await signOut(); router.replace('/login'); }} />
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <h2 className="text-sm font-semibold text-ink mb-4">{title}</h2>
      {children}
    </div>
  );
}

function IdentityCard({ ctx }: { ctx: ReturnType<typeof useAuth>['ctx'] }) {
  if (!ctx) return null;
  return (
    <Card title="Account">
      <div className="grid grid-cols-2 gap-4 text-sm">
        <Row k="Email" v={ctx.user.email} />
        <Row k="User ID" v={ctx.user.id} mono />
        <Row k="Platform admin" v={ctx.user.isPlatformAdmin ? 'yes' : 'no'} />
        <Row k="Role" v={ctx.role.name} />
      </div>
    </Card>
  );
}

function NameCard({ ctx, onSaved }: { ctx: ReturnType<typeof useAuth>['ctx']; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(ctx?.user.name ?? '');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const save = useMutation({
    mutationFn: () => profileApi.updateName(name.trim()),
    onSuccess: async () => {
      await onSaved();
      setMsg({ tone: 'ok', text: 'Saved.' });
    },
    onError: (e: any) => setMsg({ tone: 'err', text: e?.message ?? 'Save failed' }),
  });
  return (
    <Card title="Display name">
      <div className="flex gap-3 items-end">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm text-ink outline-none focus:border-ring"
        />
        <button
          onClick={() => save.mutate()}
          disabled={save.isPending || name.trim().length < 2 || name === ctx?.user.name}
          className="rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-60"
        >
          {save.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
      {msg && (
        <div className={`mt-2 text-xs ${msg.tone === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>
          {msg.text}
        </div>
      )}
    </Card>
  );
}

function PasswordCard() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const change = useMutation({
    mutationFn: () => profileApi.changePassword(current, next),
    onSuccess: () => {
      setCurrent(''); setNext(''); setConfirm('');
      setMsg({ tone: 'ok', text: 'Password changed.' });
    },
    onError: (e: any) => setMsg({ tone: 'err', text: e?.message ?? 'Change failed' }),
  });

  const canSubmit = current.length >= 8 && next.length >= 8 && next === confirm && !change.isPending;

  return (
    <Card title="Change password">
      <div className="grid grid-cols-2 gap-3">
        <label className="block col-span-2">
          <span className="text-[11px] font-medium text-ink-muted uppercase tracking-wide">Current password</span>
          <input
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-ink outline-none focus:border-ring"
          />
        </label>
        <label className="block">
          <span className="text-[11px] font-medium text-ink-muted uppercase tracking-wide">New password</span>
          <input
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-ink outline-none focus:border-ring"
          />
        </label>
        <label className="block">
          <span className="text-[11px] font-medium text-ink-muted uppercase tracking-wide">Confirm new password</span>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-ink outline-none focus:border-ring"
          />
        </label>
      </div>
      {next && confirm && next !== confirm && (
        <div className="mt-2 text-xs text-red-400">Passwords don't match.</div>
      )}
      {msg && (
        <div className={`mt-2 text-xs ${msg.tone === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>
          {msg.text}
        </div>
      )}
      <div className="mt-4">
        <button
          onClick={() => change.mutate()}
          disabled={!canSubmit}
          className="rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-60"
        >
          {change.isPending ? 'Updating…' : 'Update password'}
        </button>
      </div>
    </Card>
  );
}

function WorkspaceCard({ ctx }: { ctx: ReturnType<typeof useAuth>['ctx'] }) {
  if (!ctx) return null;
  return (
    <Card title="Workspace">
      <div className="grid grid-cols-2 gap-4 text-sm">
        <Row k="Name" v={ctx.workspace.name} />
        <Row k="Slug" v={ctx.workspace.slug} mono />
        <Row k="Status" v={ctx.workspace.status} />
        <Row k="Workspace ID" v={ctx.workspace.id} mono />
      </div>
      <div className="mt-4">
        <div className="text-[11px] uppercase tracking-wide text-ink-muted mb-1">Enabled products</div>
        <div className="flex gap-1 flex-wrap">
          {ctx.products.length === 0 && <span className="text-xs text-ink-muted">—</span>}
          {ctx.products.map((p) => (
            <span key={p.key} className="inline-flex rounded-full bg-primary/10 text-primary text-[11px] px-2 py-0.5">
              {p.name}
            </span>
          ))}
        </div>
      </div>
      {ctx.subscription && (
        <div className="mt-3 text-xs text-ink-muted">
          {ctx.subscription.planName} ·{' '}
          {ctx.subscription.daysRemaining > 0
            ? `${ctx.subscription.daysRemaining} days remaining`
            : 'expired'} ·{' '}
          expires {new Date(ctx.subscription.expiresAt).toLocaleDateString()}
        </div>
      )}
    </Card>
  );
}

function DangerCard({ onSignOut }: { onSignOut: () => void }) {
  return (
    <Card title="Session">
      <p className="text-sm text-ink-muted mb-3">Signing out clears your cookie on this device.</p>
      <button
        onClick={onSignOut}
        className="rounded-md border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-300 px-3 py-2 text-sm font-medium"
      >
        Sign out
      </button>
    </Card>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-ink-muted">{k}</div>
      <div className={`text-sm text-ink ${mono ? 'font-mono text-[12px]' : ''}`}>{v}</div>
    </div>
  );
}
