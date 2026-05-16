'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/components/AuthContext';
import {
  membersApi,
  rolesApi,
  type InvitePayload,
  type WorkspaceMemberRow,
} from '@/lib/members';

export default function TeamPage() {
  const { ctx, can } = useAuth();
  const qc = useQueryClient();
  const canInvite = can('member.invite');
  const canManage = can('member.manage');

  const members = useQuery({ queryKey: ['members'], queryFn: membersApi.list });
  const roles = useQuery({ queryKey: ['roles'], queryFn: rolesApi.list });

  const [showInvite, setShowInvite] = useState(false);
  const [tempPw, setTempPw] = useState<{ email: string; pw: string } | null>(null);

  const inviteMutation = useMutation({
    mutationFn: (payload: InvitePayload) => membersApi.invite(payload),
    onSuccess: (data, vars) => {
      qc.invalidateQueries({ queryKey: ['members'] });
      setShowInvite(false);
      if (data.temporaryPassword) setTempPw({ email: vars.email, pw: data.temporaryPassword });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (args: { id: string; payload: Parameters<typeof membersApi.update>[1] }) =>
      membersApi.update(args.id, args.payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['members'] }),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => membersApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['members'] }),
  });

  if (!ctx) return <div className="p-6 text-ink-muted">Sign in required.</div>;
  if (!can('member.read')) return <div className="p-6 text-ink-muted">You don't have access to Team.</div>;

  return (
    <div className="max-w-[1100px] mx-auto px-6 py-8">
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Team</h1>
          <p className="text-sm text-ink-muted mt-1">
            People in workspace <b>{ctx.workspace.name}</b> · {members.data?.length ?? 0} member(s)
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/team/roles"
            className="rounded-lg border border-border px-3 py-2 text-sm text-ink hover:bg-background"
          >
            Manage roles
          </Link>
          {canInvite && (
            <button
              onClick={() => setShowInvite(true)}
              className="rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:opacity-90"
            >
              + Invite member
            </button>
          )}
        </div>
      </div>

      {tempPw && (
        <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
          <div className="font-medium text-amber-300">Temporary password for {tempPw.email}</div>
          <div className="mt-1 font-mono text-amber-200 select-all">{tempPw.pw}</div>
          <button
            onClick={() => setTempPw(null)}
            className="mt-2 text-[11px] uppercase tracking-wide text-amber-300/80 hover:text-amber-200"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-background text-ink-muted text-[11px] uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-3 font-medium">User</th>
              <th className="text-left px-4 py-3 font-medium">Role</th>
              <th className="text-left px-4 py-3 font-medium">Title</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
              <th className="text-left px-4 py-3 font-medium">Joined</th>
              <th className="text-right px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {members.isLoading && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-ink-muted">Loading…</td></tr>
            )}
            {members.data?.map((m) => (
              <MemberRow
                key={m.id}
                row={m}
                isSelf={m.id === ctx.member.id}
                canManage={canManage}
                roles={roles.data ?? []}
                onUpdate={(payload) => updateMutation.mutate({ id: m.id, payload })}
                onRemove={() => {
                  if (confirm(`Remove ${m.user.email} from workspace?`)) {
                    removeMutation.mutate(m.id);
                  }
                }}
              />
            ))}
            {!members.isLoading && members.data?.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-ink-muted">No members yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showInvite && (
        <InviteModal
          roles={roles.data ?? []}
          onClose={() => setShowInvite(false)}
          onSubmit={(payload) => inviteMutation.mutate(payload)}
          submitting={inviteMutation.isPending}
          error={inviteMutation.error?.message ?? null}
        />
      )}
    </div>
  );
}

function MemberRow({
  row,
  isSelf,
  canManage,
  roles,
  onUpdate,
  onRemove,
}: {
  row: WorkspaceMemberRow;
  isSelf: boolean;
  canManage: boolean;
  roles: { id: string; key: string; name: string }[];
  onUpdate: (payload: Parameters<typeof import('@/lib/members').membersApi.update>[1]) => void;
  onRemove: () => void;
}) {
  const isOwner = row.role.key === 'owner';
  return (
    <tr className="hover:bg-background/60">
      <td className="px-4 py-3">
        <div className="font-medium text-ink">{row.user.name}</div>
        <div className="text-xs text-ink-muted">{row.user.email}</div>
      </td>
      <td className="px-4 py-3">
        {canManage && !isOwner ? (
          <select
            value={row.role.key}
            onChange={(e) => onUpdate({ roleKey: e.target.value })}
            className="rounded-md border border-border bg-background text-ink text-sm px-2 py-1"
          >
            {roles.map((r) => (
              <option key={r.id} value={r.key}>{r.name}</option>
            ))}
          </select>
        ) : (
          <span className="inline-flex items-center rounded-full bg-primary/10 text-primary text-xs px-2 py-0.5">
            {row.role.name}
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-ink-muted">{row.jobTitle ?? '—'}</td>
      <td className="px-4 py-3">
        <StatusPill status={row.status} />
      </td>
      <td className="px-4 py-3 text-ink-muted">
        {row.joinedAt ? new Date(row.joinedAt).toLocaleDateString() : '—'}
      </td>
      <td className="px-4 py-3 text-right">
        {canManage && !isOwner && !isSelf && (
          <>
            <button
              onClick={() =>
                onUpdate({ status: row.status === 'active' ? 'suspended' : 'active' })
              }
              className="mr-2 text-xs text-ink-muted hover:text-ink"
            >
              {row.status === 'active' ? 'Suspend' : 'Reactivate'}
            </button>
            <button
              onClick={onRemove}
              className="text-xs text-red-400 hover:text-red-300"
            >
              Remove
            </button>
          </>
        )}
      </td>
    </tr>
  );
}

function StatusPill({ status }: { status: string }) {
  const color =
    status === 'active'
      ? 'bg-emerald-500/15 text-emerald-300'
      : status === 'suspended'
      ? 'bg-red-500/15 text-red-300'
      : 'bg-amber-500/15 text-amber-300';
  return (
    <span className={`inline-flex items-center rounded-full text-[11px] px-2 py-0.5 ${color}`}>
      {status}
    </span>
  );
}

function InviteModal({
  roles,
  onClose,
  onSubmit,
  submitting,
  error,
}: {
  roles: { id: string; key: string; name: string }[];
  onClose: () => void;
  onSubmit: (p: InvitePayload) => void;
  submitting: boolean;
  error: string | null;
}) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [roleKey, setRoleKey] = useState(
    roles.find((r) => r.key === 'sales')?.key ?? roles[0]?.key ?? '',
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-ink mb-4">Invite member</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit({ email, name, roleKey, jobTitle: jobTitle || undefined });
          }}
          className="space-y-3"
        >
          <Field label="Email">
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Name">
            <input type="text" required value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Job title (optional)">
            <input type="text" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Role">
            <select required value={roleKey} onChange={(e) => setRoleKey(e.target.value)} className={inputCls}>
              {roles.map((r) => <option key={r.id} value={r.key}>{r.name}</option>)}
            </select>
          </Field>

          {error && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-md border border-border px-3 py-2 text-sm text-ink hover:bg-background">
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-60"
            >
              {submitting ? 'Sending…' : 'Send invite'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const inputCls =
  'mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-ink outline-none focus:border-ring focus:ring-2 focus:ring-ring/30';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium text-ink-muted uppercase tracking-wide">{label}</span>
      {children}
    </label>
  );
}
