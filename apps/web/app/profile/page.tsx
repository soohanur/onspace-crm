'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Camera, Trash2 } from 'lucide-react';

import { useAuth } from '@/components/AuthContext';
import { profileApi } from '@/lib/profile';

/** Max file size after client-side resize. Backend caps at 350 KB. */
const MAX_AVATAR_BYTES = 280_000;
const AVATAR_DIM = 256; // square px

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
    <div className="max-w-[820px] mx-auto px-6 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Profile & settings</h1>
        <p className="text-sm text-ink-muted mt-1">Your account, photo, and password.</p>
      </div>

      <IdentityCard ctx={ctx} onSaved={refresh} />
      <PasswordCard />
      <WorkspaceCard ctx={ctx} />
      <DangerCard onSignOut={async () => { await signOut(); router.replace('/login'); }} />
    </div>
  );
}

// ── Identity card with avatar + name + job title editor ─────────────────

function IdentityCard({ ctx, onSaved }: { ctx: NonNullable<ReturnType<typeof useAuth>['ctx']>; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(ctx.user.name);
  const [jobTitle, setJobTitle] = useState(ctx.member.jobTitle ?? '');
  const [avatar, setAvatar] = useState<string | null>(ctx.user.avatarUrl);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const save = useMutation({
    mutationFn: () => profileApi.update({ name: name.trim(), jobTitle: jobTitle.trim() || null }),
    onSuccess: async () => { setMsg({ tone: 'ok', text: 'Profile saved.' }); await onSaved(); },
    onError: (e: any) => setMsg({ tone: 'err', text: e?.message ?? 'Save failed' }),
  });

  const saveAvatar = useMutation({
    mutationFn: (url: string | null) => profileApi.update({ avatarUrl: url }),
    onSuccess: async () => { setMsg({ tone: 'ok', text: 'Photo updated.' }); await onSaved(); },
    onError: (e: any) => setMsg({ tone: 'err', text: e?.message ?? 'Upload failed' }),
  });

  async function handleFile(file: File) {
    setBusy(true);
    setMsg(null);
    try {
      const dataUrl = await fileToDataUri(file, AVATAR_DIM, MAX_AVATAR_BYTES);
      setAvatar(dataUrl);
      await saveAvatar.mutateAsync(dataUrl);
    } catch (e: any) {
      setMsg({ tone: 'err', text: e?.message ?? 'Could not process image' });
    } finally {
      setBusy(false);
    }
  }

  async function clearAvatar() {
    setBusy(true);
    setAvatar(null);
    try {
      await saveAvatar.mutateAsync(null);
    } finally {
      setBusy(false);
    }
  }

  const initials = name.split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'U';

  return (
    <Card title="Profile">
      <div className="flex gap-6">
        <div className="shrink-0 text-center">
          <div className="relative w-[112px] h-[112px] rounded-full bg-primary text-white text-3xl font-bold flex items-center justify-center overflow-hidden border border-border">
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatar} alt="avatar" className="w-full h-full object-cover" />
            ) : (
              <span>{initials}</span>
            )}
            <button
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 hover:opacity-100 transition text-white text-xs gap-1"
              title="Change photo"
            >
              <Camera size={14} /> Change
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              if (fileRef.current) fileRef.current.value = '';
            }}
          />
          {avatar && (
            <button
              onClick={clearAvatar}
              disabled={busy}
              className="mt-2 inline-flex items-center gap-1 text-[11px] text-red-400 hover:text-red-300"
            >
              <Trash2 size={12} /> Remove
            </button>
          )}
          <div className="mt-1 text-[11px] text-ink-muted">PNG/JPG/WEBP, ≤ 350 KB</div>
        </div>

        <div className="flex-1 space-y-3">
          <Field label="Display name">
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Email">
            <input value={ctx.user.email} disabled className={`${inputCls} opacity-60 cursor-not-allowed`} />
            <span className="text-[11px] text-ink-muted">Contact admin to change.</span>
          </Field>
          <Field label="Job title (visible in this workspace)">
            <input
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              placeholder="Sales Rep · Manager · …"
              className={inputCls}
            />
          </Field>

          {msg && (
            <div className={`text-xs ${msg.tone === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>
              {msg.text}
            </div>
          )}

          <div className="pt-2">
            <button
              onClick={() => save.mutate()}
              disabled={save.isPending || name.trim().length < 2}
              className="rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-60"
            >
              {save.isPending ? 'Saving…' : 'Save profile'}
            </button>
          </div>
        </div>
      </div>
    </Card>
  );
}

// ── Password card ───────────────────────────────────────────────────────

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
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className="text-[11px] font-medium text-ink-muted uppercase tracking-wide">New password</span>
          <input
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className="text-[11px] font-medium text-ink-muted uppercase tracking-wide">Confirm new password</span>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            className={inputCls}
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

// ── Workspace card ─────────────────────────────────────────────────────

function WorkspaceCard({ ctx }: { ctx: NonNullable<ReturnType<typeof useAuth>['ctx']> }) {
  return (
    <Card title="Workspace">
      <div className="grid grid-cols-2 gap-4 text-sm">
        <Row k="Name" v={ctx.workspace.name} />
        <Row k="Slug" v={ctx.workspace.slug} mono />
        <Row k="Status" v={ctx.workspace.status} />
        <Row k="Role" v={ctx.role.name} />
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

// ── Atoms ──────────────────────────────────────────────────────────────

const inputCls =
  'mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-ink outline-none focus:border-ring focus:ring-2 focus:ring-ring/30';

function Card({ title, children }: { title: string; children: React.ReactNode }) {
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

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-ink-muted">{k}</div>
      <div className={`text-sm text-ink ${mono ? 'font-mono text-[12px]' : ''}`}>{v}</div>
    </div>
  );
}

// ── Avatar processing (client-side resize + jpeg compress) ─────────────

async function fileToDataUri(file: File, maxDim: number, maxBytes: number): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Pick an image file');
  const bitmap = await createImageBitmap(file).catch(async () => {
    // Older Safari fallback via FileReader → Image
    const dataUri = await readAsDataUri(file);
    const img = new Image();
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error('Could not decode image'));
      img.src = dataUri;
    });
    return img as unknown as ImageBitmap;
  });

  const w = (bitmap as any).width as number;
  const h = (bitmap as any).height as number;
  const scale = Math.min(1, maxDim / Math.max(w, h));
  const out = document.createElement('canvas');
  out.width = Math.round(w * scale);
  out.height = Math.round(h * scale);
  const ctx = out.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');
  ctx.drawImage(bitmap as unknown as CanvasImageSource, 0, 0, out.width, out.height);

  // Step quality down until we're under budget.
  for (const q of [0.85, 0.7, 0.55, 0.4, 0.3]) {
    const dataUrl = out.toDataURL('image/jpeg', q);
    if (dataUrl.length <= maxBytes) return dataUrl;
  }
  throw new Error('Image too large even after compression. Pick a smaller one.');
}

function readAsDataUri(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(r.error ?? new Error('Read failed'));
    r.readAsDataURL(file);
  });
}
