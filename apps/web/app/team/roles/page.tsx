'use client';

export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/components/AuthContext';
import { rolesApi, type RoleRow } from '@/lib/members';

/**
 * Permission catalog — the full menu of toggles the UI offers.
 * Backend matcher supports wildcards, so we expose both fine-grained leaves
 * and the wildcard convenience entries.
 */
const PERMISSION_GROUPS: { label: string; items: { key: string; label: string }[] }[] = [
  {
    label: 'Workspace',
    items: [
      { key: 'workspace.settings', label: 'Edit workspace settings' },
      { key: 'audit.read', label: 'View audit log' },
    ],
  },
  {
    label: 'Members',
    items: [
      { key: 'member.read', label: 'View members' },
      { key: 'member.invite', label: 'Invite members' },
      { key: 'member.manage', label: 'Edit / suspend / remove members' },
    ],
  },
  {
    label: 'Roles',
    items: [
      { key: 'role.read', label: 'View roles' },
      { key: 'role.manage', label: 'Create / edit / delete roles' },
    ],
  },
  {
    label: 'CRM — Leads',
    items: [
      { key: 'crm.lead.read', label: 'View leads' },
      { key: 'crm.lead.write', label: 'Create / edit leads' },
      { key: 'crm.lead.delete', label: 'Delete leads' },
    ],
  },
  {
    label: 'CRM — Contacts',
    items: [
      { key: 'crm.contact.read', label: 'View contacts' },
      { key: 'crm.contact.write', label: 'Create / edit contacts' },
    ],
  },
  {
    label: 'CRM — Groups',
    items: [
      { key: 'crm.group.read', label: 'View groups' },
      { key: 'crm.group.write', label: 'Create / edit groups' },
    ],
  },
  {
    label: 'CRM — Tasks',
    items: [
      { key: 'crm.task.read', label: 'View all tasks' },
      { key: 'crm.task.read.assigned', label: 'View only assigned tasks' },
      { key: 'crm.task.write', label: 'Create / edit tasks' },
      { key: 'crm.task.assign', label: 'Assign tasks to others' },
      { key: 'crm.task.complete.own', label: 'Mark own tasks complete' },
      { key: 'crm.task.complete.any', label: 'Mark any task complete' },
    ],
  },
  {
    label: 'CRM — Notes',
    items: [
      { key: 'crm.note.read', label: 'View notes' },
      { key: 'crm.note.write', label: 'Create / edit notes' },
    ],
  },
  {
    label: 'CRM — Email',
    items: [
      { key: 'crm.email.read', label: 'View email history' },
      { key: 'crm.email.send', label: 'Send emails' },
    ],
  },
  {
    label: 'CRM — Meetings & Calls',
    items: [
      { key: 'crm.meeting.read', label: 'View meetings' },
      { key: 'crm.meeting.write', label: 'Create / edit any meeting' },
      { key: 'crm.meeting.write.own', label: 'Create / edit own meetings' },
      { key: 'crm.call.read', label: 'View calls' },
      { key: 'crm.call.write', label: 'Create / edit any call' },
      { key: 'crm.call.write.own', label: 'Create / edit own calls' },
    ],
  },
  {
    label: 'CRM — Reports',
    items: [{ key: 'crm.report.read', label: 'View reports' }],
  },
];

export default function RolesPage() {
  const { ctx, can } = useAuth();
  const qc = useQueryClient();
  const canManage = can('role.manage');

  const rolesQuery = useQuery({ queryKey: ['roles'], queryFn: rolesApi.list });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const selected = useMemo(
    () => rolesQuery.data?.find((r) => r.id === selectedId) ?? rolesQuery.data?.[0] ?? null,
    [rolesQuery.data, selectedId],
  );

  if (!ctx) return <div className="p-6 text-ink-muted">Sign in required.</div>;
  if (!can('role.read')) return <div className="p-6 text-ink-muted">You don't have access to Roles.</div>;

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-8">
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Roles & Permissions</h1>
          <p className="text-sm text-ink-muted mt-1">
            Define what each role can do. Apply roles to members from{' '}
            <Link className="underline" href="/team">Team</Link>.
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => setShowCreate(true)}
            className="rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:opacity-90"
          >
            + New role
          </button>
        )}
      </div>

      <div className="grid grid-cols-[260px_1fr] gap-6">
        {/* Role list */}
        <aside className="rounded-xl border border-border bg-surface overflow-hidden">
          <ul className="divide-y divide-border">
            {rolesQuery.isLoading && <li className="px-4 py-3 text-ink-muted text-sm">Loading…</li>}
            {rolesQuery.data?.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => setSelectedId(r.id)}
                  className={`w-full text-left px-4 py-3 hover:bg-background ${
                    selected?.id === r.id ? 'bg-background' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-ink">{r.name}</span>
                    {r.isSystem && (
                      <span className="text-[10px] uppercase tracking-wide text-ink-muted">system</span>
                    )}
                  </div>
                  <div className="text-xs text-ink-muted mt-0.5">{r.permissions.length} permission(s)</div>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {/* Detail */}
        <div className="rounded-xl border border-border bg-surface p-6">
          {selected ? (
            <RoleEditor key={selected.id} role={selected} canManage={canManage} onSaved={() => qc.invalidateQueries({ queryKey: ['roles'] })} />
          ) : (
            <div className="text-ink-muted">No role selected.</div>
          )}
        </div>
      </div>

      {showCreate && (
        <CreateRoleModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            qc.invalidateQueries({ queryKey: ['roles'] });
            setShowCreate(false);
          }}
        />
      )}
    </div>
  );
}

function RoleEditor({
  role,
  canManage,
  onSaved,
}: {
  role: RoleRow;
  canManage: boolean;
  onSaved: () => void;
}) {
  const isOwner = role.key === 'owner';
  const [name, setName] = useState(role.name);
  const [description, setDescription] = useState(role.description ?? '');
  const [permissions, setPermissions] = useState<Set<string>>(new Set(role.permissions));
  const [error, setError] = useState<string | null>(null);

  const updateMutation = useMutation({
    mutationFn: () =>
      rolesApi.update(role.id, {
        name,
        description: description || undefined,
        permissions: isOwner ? undefined : Array.from(permissions),
      }),
    onSuccess: onSaved,
    onError: (e: any) => setError(e?.message ?? 'Save failed'),
  });

  const removeMutation = useMutation({
    mutationFn: () => rolesApi.remove(role.id),
    onSuccess: onSaved,
    onError: (e: any) => setError(e?.message ?? 'Delete failed'),
  });

  function toggle(key: string) {
    const next = new Set(permissions);
    if (next.has(key)) next.delete(key); else next.add(key);
    setPermissions(next);
  }

  const has = (key: string) => permissions.has(key) || permissions.has('*');

  return (
    <div>
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 space-y-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!canManage || isOwner}
            className="block w-full text-xl font-semibold text-ink bg-transparent border-b border-transparent focus:border-border outline-none disabled:opacity-70"
          />
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={!canManage || isOwner}
            placeholder="Short description…"
            className="block w-full text-sm text-ink-muted bg-transparent border-b border-transparent focus:border-border outline-none disabled:opacity-70"
          />
          <div className="text-xs font-mono text-ink-muted">key: {role.key}</div>
        </div>
        {canManage && !role.isSystem && (
          <button
            onClick={() => {
              if (confirm(`Delete role "${role.name}"?`)) removeMutation.mutate();
            }}
            className="text-xs text-red-400 hover:text-red-300"
          >
            Delete role
          </button>
        )}
      </div>

      {isOwner && (
        <div className="mb-4 rounded-md border border-border bg-background px-3 py-2 text-xs text-ink-muted">
          Owner has full access (<code>*</code>) and cannot be edited.
        </div>
      )}

      <div className="space-y-6">
        {PERMISSION_GROUPS.map((g) => (
          <div key={g.label}>
            <div className="text-[11px] uppercase tracking-wide text-ink-muted mb-2">{g.label}</div>
            <div className="grid grid-cols-2 gap-y-2">
              {g.items.map((p) => (
                <label key={p.key} className="flex items-start gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={has(p.key)}
                    disabled={!canManage || isOwner}
                    onChange={() => toggle(p.key)}
                    className="mt-0.5"
                  />
                  <span>
                    {p.label}{' '}
                    <code className="text-[10px] text-ink-muted">{p.key}</code>
                  </span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      {error && (
        <div className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}

      {canManage && !isOwner && (
        <div className="mt-6 flex justify-end">
          <button
            onClick={() => updateMutation.mutate()}
            disabled={updateMutation.isPending}
            className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-60"
          >
            {updateMutation.isPending ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      )}
    </div>
  );
}

function CreateRoleModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      rolesApi.create({
        key: key.trim().toLowerCase(),
        name: name.trim(),
        description: description || undefined,
        permissions: [],
      }),
    onSuccess: onCreated,
    onError: (e: any) => setError(e?.message ?? 'Create failed'),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-ink mb-4">New role</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            create.mutate();
          }}
          className="space-y-3"
        >
          <label className="block">
            <span className="text-[11px] font-medium text-ink-muted uppercase tracking-wide">Key</span>
            <input
              value={key}
              onChange={(e) => setKey(e.target.value)}
              required
              placeholder="e.g. north_sales"
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-ink outline-none focus:border-ring"
            />
            <span className="text-[11px] text-ink-muted">Lowercase letters / digits / underscore. Cannot be changed later.</span>
          </label>
          <label className="block">
            <span className="text-[11px] font-medium text-ink-muted uppercase tracking-wide">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-ink outline-none focus:border-ring"
            />
          </label>
          <label className="block">
            <span className="text-[11px] font-medium text-ink-muted uppercase tracking-wide">Description</span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-ink outline-none focus:border-ring"
            />
          </label>

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
              disabled={create.isPending}
              className="rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-60"
            >
              {create.isPending ? 'Creating…' : 'Create role'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
