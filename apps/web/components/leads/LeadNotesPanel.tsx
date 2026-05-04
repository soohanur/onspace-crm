'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { SectionHeader } from './LeadOverviewCard';
import { StickyNote, Trash2 } from 'lucide-react';

export function LeadNotesPanel({ leadId }: { leadId: string }) {
  const qc = useQueryClient();
  const [body, setBody] = useState('');
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

  const create = useMutation({
    mutationFn: (text: string) => api.createNote(leadId, text),
    onSuccess: () => {
      setBody('');
      qc.invalidateQueries({ queryKey: ['notes', leadId] });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteNote(leadId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notes', leadId] }),
  });

  const canSubmit = body.trim().length > 0 && !create.isPending;

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
          onClick={() => create.mutate(body)}
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
                <button
                  onClick={() => remove.mutate(n.id)}
                  className="opacity-0 group-hover:opacity-100 transition text-neutral hover:text-error"
                  aria-label="Delete note"
                >
                  <Trash2 size={13} />
                </button>
              </div>
              <p className="text-bodysm mt-1 whitespace-pre-line">{n.body}</p>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
