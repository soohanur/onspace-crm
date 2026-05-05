'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { SectionHeader } from './LeadOverviewCard';
import { Pencil, StickyNote, Trash2 } from 'lucide-react';

export function LeadNotesPanel({ leadId }: { leadId: string }) {
  const qc = useQueryClient();
  const [body, setBody] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Phase 19 — focus the input when the action bar's "Add note" button
  // dispatches `lead:add-note`. Stays decoupled from the parent so the
  // panel can move around without refactoring callers.
  useEffect(() => {
    const onFocus = () => {
      textareaRef.current?.focus();
      textareaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
    window.addEventListener('lead:add-note', onFocus);
    return () => window.removeEventListener('lead:add-note', onFocus);
  }, []);

  const { data: notes = [] } = useQuery({
    queryKey: ['notes', leadId],
    queryFn: () => api.listNotes(leadId),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['notes', leadId] });
    qc.invalidateQueries({ queryKey: ['lead-activity', leadId] });
  };

  const create = useMutation({
    mutationFn: (text: string) => api.createNote(leadId, text),
    onSuccess: () => {
      setBody('');
      invalidate();
    },
  });

  const update = useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) =>
      api.updateNote(leadId, id, text),
    onSuccess: () => {
      setEditingId(null);
      setEditingBody('');
      invalidate();
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteNote(leadId, id),
    onSuccess: invalidate,
  });

  const canSubmit = body.trim().length > 0 && !create.isPending;

  const startEdit = (id: string, current: string) => {
    setEditingId(id);
    setEditingBody(current);
  };
  const saveEdit = () => {
    if (!editingId || editingBody.trim().length === 0) return;
    update.mutate({ id: editingId, text: editingBody.trim() });
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEditingBody('');
  };

  return (
    <Card id="notes">
      <SectionHeader icon={<StickyNote size={14} />} title={`Notes (${notes.length})`} />

      <textarea
        ref={textareaRef}
        rows={3}
        placeholder="Add a note — what was said, decisions, next steps…"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        className="w-full text-bodysm rounded-md border border-border bg-surface p-3 placeholder:text-neutral focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition resize-none"
      />
      <div className="mt-3 flex justify-end">
        <Button
          onClick={() => create.mutate(body.trim())}
          disabled={!canSubmit}
          className="min-w-[120px]"
        >
          {create.isPending ? 'Saving…' : 'Add note'}
        </Button>
      </div>

      <div className="mt-5 space-y-3">
        {notes.length === 0 ? (
          <div className="text-bodysm text-ink-muted">No notes yet.</div>
        ) : (
          notes.map((n) => (
            <div
              key={n.id}
              className="rounded-md border border-border bg-background px-3 py-2.5 group"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="text-caption font-mono font-tabular text-neutral">
                  {new Date(n.createdAt).toLocaleString()}
                </div>
                {editingId !== n.id && (
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                    <button
                      onClick={() => startEdit(n.id, n.body)}
                      className="text-neutral hover:text-primary"
                      aria-label="Edit note"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => remove.mutate(n.id)}
                      className="text-neutral hover:text-error"
                      aria-label="Delete note"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}
              </div>
              {editingId === n.id ? (
                <div className="mt-1 space-y-2">
                  <textarea
                    autoFocus
                    rows={3}
                    value={editingBody}
                    onChange={(e) => setEditingBody(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                        e.preventDefault();
                        saveEdit();
                      }
                    }}
                    className="w-full text-bodysm rounded-md border border-border bg-surface p-2 focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition resize-none"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={cancelEdit}
                      className="h-7 px-2 text-caption text-ink-muted hover:text-ink"
                    >
                      Cancel
                    </button>
                    <Button
                      onClick={saveEdit}
                      disabled={
                        editingBody.trim().length === 0 || update.isPending
                      }
                      className="h-7 min-w-[70px] text-caption"
                    >
                      {update.isPending ? 'Saving…' : 'Save'}
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-bodysm mt-1 whitespace-pre-line">{n.body}</p>
              )}
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
