'use client';

// Same dynamic opt-out pattern as /leads/[id] — dev static-paths worker
// otherwise crashes on the @tanstack/query-core require.
export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { use, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { LeadsTable } from '@/components/LeadsTable';
import { LeadColumnToggle } from '@/components/leads/LeadColumnToggle';
import { useColumnPrefs } from '@/hooks/useColumnPrefs';
import { ArrowLeft, Sparkles, Trash2, Pencil } from 'lucide-react';

export default function GroupDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const qc = useQueryClient();
  const { visible } = useColumnPrefs();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState('');

  const { data: group } = useQuery({
    queryKey: ['group', id],
    queryFn: () => api.getGroup(id),
  });

  const { data: leadsPage, isLoading } = useQuery({
    queryKey: ['group-leads', id],
    queryFn: () => api.listGroupLeads(id, { take: 200 }),
    refetchInterval: 5_000,
  });

  const items = leadsPage?.items ?? [];

  const rename = useMutation({
    mutationFn: () => api.updateGroup(id, { name: name.trim() }),
    onSuccess: () => {
      setEditingName(false);
      qc.invalidateQueries({ queryKey: ['group', id] });
      qc.invalidateQueries({ queryKey: ['groups'] });
    },
  });

  const removeFromGroup = useMutation({
    mutationFn: (leadIds: string[]) => api.removeLeadsFromGroup(id, leadIds),
    onSuccess: () => {
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ['group-leads', id] });
      qc.invalidateQueries({ queryKey: ['group', id] });
    },
  });

  const toggleSelect = (lid: string) => {
    const next = new Set(selected);
    if (next.has(lid)) next.delete(lid);
    else next.add(lid);
    setSelected(next);
  };
  const toggleAll = () => {
    if (selected.size === items.length) setSelected(new Set());
    else setSelected(new Set(items.map((l) => l.id)));
  };

  if (!group) {
    return (
      <div className="max-w-[1400px] mx-auto px-6 py-8">
        <div className="animate-pulse text-ink-muted">Loading group…</div>
      </div>
    );
  }

  const isSmart = group.type === 'smart';

  return (
    <div className="max-w-[1600px] mx-auto px-6 py-8 space-y-6">
      <div>
        <Link
          href="/groups"
          className="text-caption text-ink-muted hover:text-primary inline-flex items-center gap-1 mb-2"
        >
          <ArrowLeft size={12} /> All groups
        </Link>
        <div className="flex items-center gap-3 flex-wrap">
          {group.color && (
            <span
              className="w-3 h-3 rounded-full inline-block"
              style={{ backgroundColor: group.color }}
            />
          )}
          {editingName ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (name.trim()) rename.mutate();
              }}
              className="flex items-center gap-2"
            >
              <input
                autoFocus
                value={name || group.name}
                onChange={(e) => setName(e.target.value)}
                className="text-h1 font-bold bg-transparent border-b-2 border-primary focus:outline-none"
              />
              <Button
                onClick={() => name.trim() && rename.mutate()}
                disabled={rename.isPending}
              >
                Save
              </Button>
            </form>
          ) : (
            <>
              <h1 className="text-h1">{group.name}</h1>
              <button
                onClick={() => {
                  setName(group.name);
                  setEditingName(true);
                }}
                className="text-neutral hover:text-primary"
                aria-label="Rename"
              >
                <Pencil size={14} />
              </button>
            </>
          )}
          {isSmart ? (
            <Chip tone="primary">
              <Sparkles size={11} className="mr-1" /> smart
            </Chip>
          ) : (
            <Chip tone="neutral">manual</Chip>
          )}
          <span className="text-bodysm text-ink-muted font-mono font-tabular">
            {group.memberCount} leads
          </span>
        </div>
        {isSmart && group.filterDsl && (
          <div className="mt-3 text-caption text-ink-muted">
            <span className="text-neutral">Filter:</span>{' '}
            <code className="font-mono text-ink">
              {Object.entries(group.filterDsl)
                .map(([k, v]) => `${k}=${v}`)
                .join(' · ')}
            </code>
          </div>
        )}
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="p-4 border-b border-border flex flex-wrap gap-3 items-center">
          <div className="text-bodysm text-ink-muted font-tabular">
            {isLoading ? 'Loading…' : `${items.length} shown`}
            {selected.size > 0 && (
              <>
                {' · '}
                <span className="text-primary">{selected.size} selected</span>
              </>
            )}
          </div>
          <div className="ml-auto flex gap-2 flex-wrap">
            {!isSmart && selected.size > 0 && (
              <Button
                variant="secondary"
                onClick={() => removeFromGroup.mutate(Array.from(selected))}
                disabled={removeFromGroup.isPending}
                className="!text-error !border-error hover:!bg-errorBg"
              >
                <Trash2 size={14} /> Remove from group
              </Button>
            )}
            <LeadColumnToggle />
          </div>
        </div>
        <LeadsTable
          leads={items}
          visibleColumns={visible}
          selectable={!isSmart}
          selectedIds={selected}
          onToggleSelect={toggleSelect}
          onToggleAll={toggleAll}
        />
      </Card>
    </div>
  );
}
