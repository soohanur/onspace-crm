'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '../ui/Button';
import { StickyNote, Trash2, X } from 'lucide-react';

/**
 * Apple Notes-style modal: list of previous notes on the left/top,
 * a composer at the bottom. Auto-focuses the textarea when opened.
 * Cmd/Ctrl+Enter submits. Esc closes.
 */
export function NotesModal({
  leadId,
  open,
  onClose,
}: {
  leadId: string;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [body, setBody] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: notes = [], isLoading } = useQuery({
    queryKey: ['notes', leadId],
    queryFn: () => api.listNotes(leadId),
    enabled: open,
  });

  const create = useMutation({
    mutationFn: (text: string) => api.createNote(leadId, text),
    onSuccess: () => {
      setBody('');
      qc.invalidateQueries({ queryKey: ['notes', leadId] });
      qc.invalidateQueries({ queryKey: ['lead-activity', leadId] });
      textareaRef.current?.focus();
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteNote(leadId, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notes', leadId] });
      qc.invalidateQueries({ queryKey: ['lead-activity', leadId] });
    },
  });

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => textareaRef.current?.focus(), 50);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const canSubmit = body.trim().length > 0 && !create.isPending;
  const submit = () => {
    if (!canSubmit) return;
    create.mutate(body.trim());
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Notes"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div className="relative bg-surface border border-border rounded-xl shadow-e3 w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 h-12 border-b border-border shrink-0">
          <div className="inline-flex items-center gap-2 text-bodysm font-medium">
            <StickyNote size={14} className="text-primary" />
            Notes
            <span className="text-caption text-ink-muted font-normal">
              ({notes.length})
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="h-7 w-7 rounded-md text-ink-muted hover:text-ink hover:bg-background inline-flex items-center justify-center transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {isLoading ? (
            <div className="text-bodysm text-ink-muted py-4">Loading…</div>
          ) : notes.length === 0 ? (
            <div className="text-bodysm text-ink-muted py-4 text-center">
              No notes yet — add the first one below.
            </div>
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

        <div className="border-t border-border px-4 py-3 shrink-0 bg-surface">
          <textarea
            ref={textareaRef}
            rows={3}
            placeholder="Add a note — what was said, decisions, next steps…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                submit();
              }
            }}
            className="w-full text-bodysm rounded-md border border-border bg-surface p-3 placeholder:text-neutral focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition resize-none"
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-caption text-ink-muted">
              ⌘/Ctrl + Enter to save
            </span>
            <Button
              onClick={submit}
              disabled={!canSubmit}
              className="min-w-[100px]"
            >
              {create.isPending ? 'Saving…' : 'Add note'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
