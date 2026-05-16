'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';

import { adminApi } from '@/lib/admin';

export default function AdminWorkspacesPage() {
  const list = useQuery({ queryKey: ['admin', 'workspaces'], queryFn: adminApi.listWorkspaces });

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-8">
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Customer workspaces</h1>
          <p className="text-sm text-ink-muted mt-1">Create, configure, and monitor every customer workspace.</p>
        </div>
        <Link
          href="/admin/workspaces/new"
          className="rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:opacity-90"
        >
          + New workspace
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-background text-ink-muted text-[11px] uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Workspace</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
              <th className="text-left px-4 py-3 font-medium">Seats</th>
              <th className="text-left px-4 py-3 font-medium">Products</th>
              <th className="text-left px-4 py-3 font-medium">Subscription</th>
              <th className="text-left px-4 py-3 font-medium">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {list.isLoading && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-ink-muted">Loading…</td></tr>
            )}
            {list.data?.map((w) => (
              <tr key={w.id} className="hover:bg-background/60">
                <td className="px-4 py-3">
                  <Link href={`/admin/workspaces/${w.id}`} className="font-medium text-ink hover:underline">
                    {w.name}
                  </Link>
                  <div className="text-xs text-ink-muted">{w.slug}</div>
                </td>
                <td className="px-4 py-3"><StatusPill v={w.status} /></td>
                <td className="px-4 py-3 text-ink-muted">{w._count.members} / {w.seatLimit}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-1 flex-wrap">
                    {w.products.filter((p) => p.enabled).map((p) => (
                      <span key={p.id} className="text-[10px] uppercase tracking-wide rounded bg-primary/10 text-primary px-1.5 py-0.5">
                        {p.product.key}
                      </span>
                    ))}
                    {w.products.filter((p) => p.enabled).length === 0 && (
                      <span className="text-xs text-ink-muted">—</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  {w.subscription ? (
                    <div>
                      <div className="text-xs"><StatusPill v={w.subscription.status} /></div>
                      <div className="text-[11px] text-ink-muted mt-0.5">
                        until {new Date(w.subscription.expiresAt).toLocaleDateString()}
                      </div>
                    </div>
                  ) : (
                    <span className="text-xs text-ink-muted">none</span>
                  )}
                </td>
                <td className="px-4 py-3 text-ink-muted">{new Date(w.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
            {!list.isLoading && list.data?.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-ink-muted">No workspaces yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusPill({ v }: { v: string }) {
  const cls =
    v === 'active' ? 'bg-emerald-500/15 text-emerald-300' :
    v === 'expired' ? 'bg-amber-500/15 text-amber-300' :
    'bg-red-500/15 text-red-300';
  return <span className={`inline-flex rounded-full text-[11px] px-2 py-0.5 ${cls}`}>{v}</span>;
}
