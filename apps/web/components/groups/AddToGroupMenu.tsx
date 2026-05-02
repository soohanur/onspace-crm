'use client';

import { useState, useRef, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { FolderPlus, Plus } from 'lucide-react';

export function AddToGroupMenu({
  selectedIds,
  onAdded,
}: {
  selectedIds: string[];
  onAdded?: () => void;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const { data: groups = [] } = useQuery({
    queryKey: ['groups'],
    queryFn: api.listGroups,
    enabled: open,
  });

  const addToExisting = useMutation({
    mutationFn: (groupId: string) => api.addLeadsToGroup(groupId, selectedIds),
    onSuccess: () => {
      setOpen(false);
      qc.invalidateQueries({ queryKey: ['groups'] });
      onAdded?.();
    },
  });

  const createAndAdd = useMutation({
    mutationFn: async () => {
      const g = await api.createGroup({ name: newName.trim(), type: 'manual' });
      await api.addLeadsToGroup(g.id, selectedIds);
      return g;
    },
    onSuccess: () => {
      setOpen(false);
      setCreating(false);
      setNewName('');
      qc.invalidateQueries({ queryKey: ['groups'] });
      onAdded?.();
    },
  });

  const manualGroups = groups.filter((g) => g.type === 'manual');
  const disabled = selectedIds.length === 0;

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => !disabled && setOpen((s) => !s)}
        disabled={disabled}
        className="h-11 px-4 rounded-md border border-border bg-surface text-bodysm font-medium inline-flex items-center gap-2 hover:border-primary hover:text-primary transition-colors disabled:opacity-50 disabled:pointer-events-none"
      >
        <FolderPlus size={14} />
        Add to group
        {selectedIds.length > 0 && (
          <span className="text-caption text-primary font-mono font-tabular">
            ({selectedIds.length})
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-1 z-30 bg-surface border border-border rounded-md shadow-e2 min-w-[260px] overflow-hidden">
          <div className="px-3 py-2 border-b border-border text-caption uppercase tracking-wider text-neutral">
            Add {selectedIds.length} lead{selectedIds.length === 1 ? '' : 's'} to…
          </div>
          {manualGroups.length === 0 && !creating && (
            <div className="px-3 py-3 text-bodysm text-ink-muted">
              No manual groups yet.
            </div>
          )}
          {manualGroups.map((g) => (
            <button
              key={g.id}
              onClick={() => addToExisting.mutate(g.id)}
              disabled={addToExisting.isPending}
              className="w-full text-left px-3 h-9 text-bodysm hover:bg-background flex items-center justify-between"
            >
              <span className="truncate">{g.name}</span>
              <span className="text-caption text-neutral font-mono font-tabular">
                {g.memberCount}
              </span>
            </button>
          ))}
          <div className="border-t border-border">
            {creating ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (newName.trim()) createAndAdd.mutate();
                }}
                className="flex items-center gap-2 p-2"
              >
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="New group name"
                  className="flex-1 h-9 px-3 text-bodysm rounded-md border border-border bg-surface focus:outline-none focus:border-primary"
                />
                <button
                  type="submit"
                  disabled={!newName.trim() || createAndAdd.isPending}
                  className="h-9 px-3 rounded-md bg-primary text-white text-caption hover:bg-primary-hover disabled:opacity-50"
                >
                  Create
                </button>
              </form>
            ) : (
              <button
                onClick={() => setCreating(true)}
                className="w-full text-left px-3 h-9 text-bodysm text-primary hover:bg-background inline-flex items-center gap-1.5"
              >
                <Plus size={12} />
                Create new group
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
