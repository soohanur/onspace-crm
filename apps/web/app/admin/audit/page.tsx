'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { adminApi } from '@/lib/admin';

export default function AuditPage() {
  const [workspaceId, setWorkspaceId] = useState('');
  const audit = useQuery({
    queryKey: ['admin', 'audit', workspaceId],
    queryFn: () => adminApi.listAudit(workspaceId || undefined, 200),
  });

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-8">
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Audit log</h1>
          <p className="text-sm text-ink-muted mt-1">Every workspace and admin mutation, newest first.</p>
        </div>
        <input
          value={workspaceId}
          onChange={(e) => setWorkspaceId(e.target.value)}
          placeholder="Filter by workspace ID (optional)"
          className="rounded-md border border-border bg-background px-3 py-2 text-sm text-ink w-[320px]"
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-background text-ink-muted text-[11px] uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-3 font-medium">When</th>
              <th className="text-left px-4 py-3 font-medium">Action</th>
              <th className="text-left px-4 py-3 font-medium">Workspace</th>
              <th className="text-left px-4 py-3 font-medium">Actor</th>
              <th className="text-left px-4 py-3 font-medium">Meta</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {audit.isLoading && <tr><td colSpan={5} className="px-4 py-6 text-center text-ink-muted">Loading…</td></tr>}
            {audit.data?.map((row) => (
              <tr key={row.id} className="hover:bg-background/60">
                <td className="px-4 py-2 text-ink-muted text-xs whitespace-nowrap">
                  {new Date(row.createdAt).toLocaleString()}
                </td>
                <td className="px-4 py-2 font-mono text-xs">{row.action}</td>
                <td className="px-4 py-2 text-ink-muted text-xs">{row.workspaceId ?? '—'}</td>
                <td className="px-4 py-2 text-ink-muted text-xs">{row.actorUserId ?? '—'}</td>
                <td className="px-4 py-2 text-ink-muted text-xs">
                  <code className="text-[11px] break-all">{row.meta ? JSON.stringify(row.meta) : '—'}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
