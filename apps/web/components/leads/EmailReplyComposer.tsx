'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, EmailLog, Lead } from '@/lib/api';
import { Send, Paperclip, X, Loader2, AlertCircle, CheckCircle2, Info } from 'lucide-react';
import {
  filterSlashCommands,
  SlashCommand,
  SlashCommandResult,
} from '@/lib/slash-commands';
import { SlashCommandMenu } from '../chat/SlashCommandMenu';

const MAX_PER_FILE = 25 * 1024 * 1024;

/**
 * WhatsApp-style inline composer pinned to the bottom of the email drawer.
 * Sends as a reply continuing the parent thread. No modal.
 *
 * Phase 11 — slash command palette. Typing `/` as the first character
 * opens a Slack/Linear-style menu of registered commands (`/meeting`,
 * `/proposal`, …). Picking a command opens its action surface
 * alongside the composer; the composer can be replaced with a pre-filled
 * draft on completion (e.g. confirmation text after scheduling a
 * meeting).
 */
export function EmailReplyComposer({
  lead,
  parent,
}: {
  lead: Lead;
  parent: EmailLog;
}) {
  const qc = useQueryClient();
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Slash command palette state. `slashQuery` is the text AFTER the
  // leading `/` (e.g. body=`/me` → query=`me`). `slashIndex` tracks
  // keyboard selection within the filtered list. `activeCommand` opens
  // a command's React surface; while open, the menu hides.
  const [slashIndex, setSlashIndex] = useState(0);
  const [activeCommand, setActiveCommand] = useState<SlashCommand | null>(null);
  const [toast, setToast] = useState<
    | { tone: 'success' | 'info' | 'error'; message: string }
    | null
  >(null);

  const { data: accounts = [] } = useQuery({
    queryKey: ['email-accounts'],
    queryFn: api.listEmailAccounts,
  });
  // Use the same account that sent the parent if still active; otherwise default.
  const accountId =
    accounts.find((a) => a.id === parent.accountId)?.id ?? accounts[0]?.id;

  // Recipient = whoever wrote the most recent reply in the thread, fallback
  // to the original parent's toEmail (= the client).
  const lastReply = parent.messages?.filter((m) => m.direction === 'inbound').slice(-1)[0];
  const toEmail = lastReply?.fromEmail ?? parent.toEmail;
  const subject = parent.subject?.toLowerCase().startsWith('re:')
    ? parent.subject
    : `Re: ${parent.subject}`;

  const send = useMutation({
    mutationFn: () =>
      api.sendEmail({
        leadId: lead.id,
        accountId,
        toEmail,
        subject,
        body,
        files,
        replyToLogId: parent.id,
      }),
    onSuccess: () => {
      setBody('');
      setFiles([]);
      qc.invalidateQueries({ queryKey: ['email', parent.id] });
      qc.invalidateQueries({ queryKey: ['email-history', lead.id] });
    },
  });

  const onFiles = (list: FileList | null) => {
    if (!list) return;
    const arr = Array.from(list);
    const ok = arr.filter((f) => f.size <= MAX_PER_FILE);
    setFiles((prev) => [...prev, ...ok]);
    if (fileRef.current) fileRef.current.value = '';
  };
  const removeFile = (idx: number) => setFiles((prev) => prev.filter((_, i) => i !== idx));

  // Slash detection: open when body starts with `/`, no trailing space,
  // and there's no in-progress command surface.
  const slashState = useMemo<
    { open: false } | { open: true; query: string }
  >(() => {
    if (activeCommand) return { open: false };
    if (!body.startsWith('/')) return { open: false };
    if (body.includes(' ') || body.includes('\n')) return { open: false };
    return { open: true, query: body.slice(1) };
  }, [body, activeCommand]);

  // Reset highlight when the filtered list changes.
  useEffect(() => {
    if (slashState.open) {
      const matchCount = filterSlashCommands(slashState.query).length;
      if (matchCount === 0) {
        setSlashIndex(0);
      } else if (slashIndex >= matchCount) {
        setSlashIndex(matchCount - 1);
      }
    } else {
      setSlashIndex(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body, slashState.open]);

  // Auto-clear toasts after a few seconds.
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(id);
  }, [toast]);

  const pickCommand = (cmd: SlashCommand) => {
    // Clear the leading `/<query>` so the composer goes back to a
    // normal blank state once the command surface opens.
    setBody('');
    setActiveCommand(cmd);
  };

  const onCommandComplete = (result?: SlashCommandResult) => {
    setActiveCommand(null);
    if (result?.insertText) {
      setBody(result.insertText);
      // Restore focus + reflow the textarea to fit the new content.
      requestAnimationFrame(() => {
        const ta = textareaRef.current;
        if (!ta) return;
        ta.focus();
        ta.style.height = 'auto';
        ta.style.height = Math.min(ta.scrollHeight, 240) + 'px';
      });
    }
    if (result?.toast) setToast(result.toast);
  };

  const canSend = body.trim().length > 0 && !!accountId && !send.isPending;
  const noAccounts = accounts.length === 0;

  if (noAccounts) {
    return (
      <div className="px-5 py-3 border-t border-border text-bodysm text-ink-muted bg-background">
        Connect a Gmail account in <span className="font-medium text-ink">Settings</span> to reply.
      </div>
    );
  }

  return (
    <div className="border-t border-border bg-surface relative">
      {/* file chips */}
      {files.length > 0 && (
        <div className="px-4 pt-3 flex flex-wrap gap-1.5">
          {files.map((f, idx) => (
            <span
              key={idx}
              className="inline-flex items-center gap-1.5 text-caption px-2 py-1 rounded-md bg-background border border-border"
              title={f.name}
            >
              <Paperclip size={11} className="text-neutral" />
              <span className="truncate max-w-[200px]">{f.name}</span>
              <button
                onClick={() => removeFile(idx)}
                className="text-neutral hover:text-error"
                aria-label="Remove"
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
      {send.error && (
        <div className="px-4 pt-2 text-caption text-error truncate" title={(send.error as Error).message}>
          {(send.error as Error).message}
        </div>
      )}
      {toast && (
        <div className="mx-4 mt-2 rounded-md border px-3 py-2 text-bodysm flex items-center gap-2 bg-background"
          role="status"
        >
          {toast.tone === 'success' && (
            <CheckCircle2 size={14} className="text-success" />
          )}
          {toast.tone === 'info' && <Info size={14} className="text-primary" />}
          {toast.tone === 'error' && (
            <AlertCircle size={14} className="text-error" />
          )}
          <span className="text-ink truncate">{toast.message}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="ml-auto text-neutral hover:text-ink"
            aria-label="Dismiss"
          >
            <X size={11} />
          </button>
        </div>
      )}
      {slashState.open && (
        <SlashCommandMenu
          query={slashState.query}
          selectedIndex={slashIndex}
          onSelectedIndexChange={setSlashIndex}
          onPick={pickCommand}
        />
      )}
      <div className="px-3 py-2 flex items-end gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="h-10 w-10 rounded-md text-neutral hover:text-primary hover:bg-background flex items-center justify-center shrink-0"
          aria-label="Attach files"
          title="Attach files"
        >
          <Paperclip size={16} />
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          onChange={(e) => onFiles(e.target.files)}
          className="hidden"
        />
        <textarea
          ref={textareaRef}
          rows={1}
          placeholder={`Reply to ${toEmail}…`}
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            // auto-grow up to ~10 lines
            e.currentTarget.style.height = 'auto';
            e.currentTarget.style.height =
              Math.min(e.currentTarget.scrollHeight, 240) + 'px';
          }}
          onKeyDown={(e) => {
            if (slashState.open) {
              const matches = filterSlashCommands(slashState.query);
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (matches.length)
                  setSlashIndex((i) => (i + 1) % matches.length);
                return;
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (matches.length)
                  setSlashIndex((i) => (i - 1 + matches.length) % matches.length);
                return;
              }
              if (e.key === 'Enter' && !e.shiftKey) {
                if (matches[slashIndex]) {
                  e.preventDefault();
                  pickCommand(matches[slashIndex]);
                  return;
                }
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                setBody('');
                return;
              }
              // Spec: a literal space cancels the menu (Slack pattern) but
              // keeps the typed text — handled naturally by the
              // slashState memo (space disables `open`), so we don't
              // intercept here.
            }
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && canSend) {
              e.preventDefault();
              send.mutate();
            }
          }}
          className="flex-1 min-h-[40px] max-h-[240px] px-3 py-2 text-bodysm rounded-md border border-border bg-surface placeholder:text-neutral focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 resize-none transition"
        />
        <button
          type="button"
          onClick={() => canSend && send.mutate()}
          disabled={!canSend}
          className="h-10 w-10 rounded-md bg-primary text-white hover:bg-primary-hover disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center shrink-0"
          aria-label="Send reply"
          title="Send reply (⌘/Ctrl + Enter)"
        >
          {send.isPending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </button>
      </div>
      <div className="px-4 pb-2 text-caption text-neutral flex items-center justify-between gap-3 flex-wrap">
        <div className="truncate">
          Replying to <span className="font-mono">{toEmail}</span> ·{' '}
          <span className="text-ink">{subject}</span>
        </div>
        {body.length === 0 && !activeCommand && (
          <span className="text-ink-muted">
            Type <kbd className="font-mono px-1 py-0.5 rounded bg-background border border-border">/</kbd> for commands
          </span>
        )}
      </div>

      {/* Active command surface — typically a modal that opens above
          everything else. Closing or completing it returns focus to the
          composer with optional pre-filled draft + toast. */}
      {activeCommand && (
        <activeCommand.Component
          ctx={{ leadId: lead.id, accountId: accountId ?? null }}
          onClose={() => setActiveCommand(null)}
          onComplete={onCommandComplete}
        />
      )}
    </div>
  );
}
