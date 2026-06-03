'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Chip } from '@/components/ui/Chip';
import { FolderPlus, Sparkles, FolderKanban, Trash2 } from 'lucide-react';

export default function GroupsPage() {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  const { data: groups = [], isLoading } = useQuery({
    queryKey: ['groups'],
    queryFn: api.listGroups,
  });

  const create = useMutation({
    mutationFn: () => api.createGroup({ name: name.trim(), type: 'manual' }),
    onSuccess: () => {
      setName('');
      setCreating(false);
      qc.invalidateQueries({ queryKey: ['groups'] });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteGroup(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['groups'] }),
  });

  const manual = groups.filter((g) => g.type === 'manual');
  const smart = groups.filter((g) => g.type === 'smart');

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-6">
      <div className="flex items-start justify-end mb-4">
        {!creating && (
          <Button onClick={() => setCreating(true)}>
            <FolderPlus size={14} /> New manual group
          </Button>
        )}
      </div>

      {creating && (
        <Card className="mb-6">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <div className="text-caption uppercase tracking-wider text-neutral mb-1">
                Group name
              </div>
              <Input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Hot Pipeline"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && name.trim()) create.mutate();
                  if (e.key === 'Escape') {
                    setCreating(false);
                    setName('');
                  }
                }}
              />
            </div>
            <Button onClick={() => name.trim() && create.mutate()} disabled={!name.trim() || create.isPending}>
              {create.isPending ? 'Creating…' : 'Create'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setCreating(false);
                setName('');
              }}
            >
              Cancel
            </Button>
          </div>
          <div className="mt-2 text-caption text-ink-muted">
            Smart groups are created from the Global Leads page — set up the filters you want, then click <span className="font-medium text-ink">Save as smart group</span>.
          </div>
        </Card>
      )}

      {isLoading ? (
        <div className="text-ink-muted">Loading…</div>
      ) : groups.length === 0 ? (
        <Card className="py-16 text-center text-ink-muted">
          <FolderKanban size={28} className="mx-auto mb-2 text-neutral" />
          <div className="text-h3 text-ink mb-1">No groups yet</div>
          <div className="text-bodysm">
            Create a manual group above, or save filters as a smart group from <Link href="/leads" className="text-primary hover:underline">Global Leads</Link>.
          </div>
        </Card>
      ) : (
        <div className="space-y-8">
          {manual.length > 0 && (
            <Section title="Manual">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {manual.map((g) => (
                  <GroupCard key={g.id} g={g} onDelete={() => remove.mutate(g.id)} />
                ))}
              </div>
            </Section>
          )}
          {smart.length > 0 && (
            <Section title="Smart">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {smart.map((g) => (
                  <GroupCard key={g.id} g={g} onDelete={() => remove.mutate(g.id)} />
                ))}
              </div>
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-caption uppercase tracking-wider text-neutral mb-3">{title}</div>
      {children}
    </div>
  );
}

function GroupCard({
  g,
  onDelete,
}: {
  g: import('@/lib/api').LeadGroup;
  onDelete: () => void;
}) {
  return (
    <Card className="!p-4 hover:border-primary transition-colors group relative">
      <Link href={`/groups/${g.id}`} className="block">
        <div className="flex items-center gap-2 mb-2">
          {g.color && (
            <span
              className="w-2.5 h-2.5 rounded-full inline-block"
              style={{ backgroundColor: g.color }}
            />
          )}
          <div className="font-medium text-ink truncate">{g.name}</div>
        </div>
        <div className="flex items-center gap-2 text-caption text-ink-muted">
          {g.type === 'smart' ? (
            <Chip tone="primary">
              <Sparkles size={10} className="mr-1" /> smart
            </Chip>
          ) : (
            <Chip tone="neutral">manual</Chip>
          )}
          <span className="font-mono font-tabular">{g.memberCount} leads</span>
        </div>
      </Link>
      <button
        onClick={(e) => {
          e.preventDefault();
          if (confirm(`Delete "${g.name}"?`)) onDelete();
        }}
        className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition text-neutral hover:text-error"
        aria-label="Delete group"
      >
        <Trash2 size={14} />
      </button>
    </Card>
  );
}
