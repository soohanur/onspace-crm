'use client';

export const dynamic = 'force-dynamic';

import clsx from 'clsx';
import { Suspense, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  api,
  EmailConversation,
  EmailThread,
  EmailThreadItem,
  Lead,
} from '@/lib/api';
import { useEmailLastSeen } from '@/hooks/useEmailLastSeen';
import { SendEmailDialog } from '@/components/leads/SendEmailDialog';
import {
  CheckCircle2,
  ImageIcon,
  Inbox,
  Mail,
  Reply,
  Search,
} from 'lucide-react';

export default function EmailsPage() {
  return (
    <Suspense
      fallback={<div className="p-6 text-ink-muted">Loading…</div>}
    >
      <Body />
    </Suspense>
  );
}

function Body() {
  const [q, setQ] = useState('');
  const [activeLeadId, setActiveLeadId] = useState<string | null>(null);
  const { isUnread, markSeen } = useEmailLastSeen();

  const conversations = useQuery({
    queryKey: ['email-conversations'],
    queryFn: api.listEmailConversations,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  });

  const items = useMemo(() => {
    const list = conversations.data ?? [];
    const filtered = q.trim()
      ? list.filter(
          (c) =>
            c.businessName.toLowerCase().includes(q.toLowerCase()) ||
            (c.email ?? '').toLowerCase().includes(q.toLowerCase()) ||
            c.lastSnippet.toLowerCase().includes(q.toLowerCase()),
        )
      : list;
    // Unread first (preserve recency within each group).
    const unread: EmailConversation[] = [];
    const rest: EmailConversation[] = [];
    for (const c of filtered) {
      if (isUnread(c.leadId, c.lastReplyAt)) unread.push(c);
      else rest.push(c);
    }
    return [...unread, ...rest];
  }, [conversations.data, q, isUnread]);

  return (
    <div className="h-full flex max-w-[1700px] mx-auto w-full min-h-0">
      {/* Left: conversation list */}
      <aside className="w-[360px] shrink-0 border-r border-border flex flex-col min-h-0 bg-surface">
        <div className="p-3 shrink-0 border-b border-border">
          <div className="relative">
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral pointer-events-none"
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search"
              className="w-full h-9 pl-8 pr-3 text-bodysm rounded-md border border-border bg-background placeholder:text-neutral focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition"
            />
          </div>
        </div>
        <ul className="flex-1 overflow-auto scroll-thin">
          {conversations.isLoading && (
            <li className="px-4 py-6 text-caption text-ink-muted">Loading…</li>
          )}
          {!conversations.isLoading && items.length === 0 && (
            <li className="px-4 py-10 text-center text-caption text-ink-muted">
              No conversations
            </li>
          )}
          {items.map((c) => {
            const unread = isUnread(c.leadId, c.lastReplyAt);
            const active = c.leadId === activeLeadId;
            return (
              <li key={c.leadId}>
                <button
                  type="button"
                  onClick={() => {
                    setActiveLeadId(c.leadId);
                    markSeen(c.leadId, c.lastAt);
                  }}
                  className={clsx(
                    'w-full text-left px-3 py-2.5 flex items-start gap-2.5 border-b border-border/60 transition-colors',
                    active
                      ? 'bg-primary/10'
                      : unread
                      ? 'bg-primary/[0.04] hover:bg-primary/[0.07]'
                      : 'hover:bg-background',
                  )}
                >
                  <Avatar
                    name={c.businessName}
                    logoUrl={c.logoUrl}
                    size={36}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div
                        className={clsx(
                          'text-bodysm truncate flex-1',
                          unread ? 'font-semibold text-ink' : 'text-ink',
                        )}
                      >
                        {c.businessName}
                      </div>
                      <div className="text-caption text-ink-muted shrink-0 font-mono font-tabular">
                        {formatWhen(c.lastAt)}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {c.lastDirection === 'reply' ? (
                        <Reply
                          size={11}
                          className="text-success shrink-0"
                          aria-label="Reply"
                        />
                      ) : (
                        <CheckCircle2
                          size={11}
                          className="text-ink-muted shrink-0"
                          aria-label="Sent"
                        />
                      )}
                      <div
                        className={clsx(
                          'text-caption truncate flex-1',
                          unread ? 'text-ink' : 'text-ink-muted',
                        )}
                      >
                        {c.lastSnippet || c.lastSubject || '(no preview)'}
                      </div>
                      {unread && (
                        <span
                          className="inline-block h-2 w-2 rounded-full bg-primary shrink-0"
                          aria-label="Unread"
                        />
                      )}
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* Right: thread */}
      <section className="flex-1 flex flex-col min-h-0 min-w-0 bg-background">
        {activeLeadId ? (
          <ThreadPane leadId={activeLeadId} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-ink-muted">
            <div className="text-center">
              <Inbox size={32} className="mx-auto mb-2 opacity-60" />
              <div className="text-bodysm">Pick a conversation</div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function ThreadPane({ leadId }: { leadId: string }) {
  const thread = useQuery<EmailThread>({
    queryKey: ['email-thread', leadId],
    queryFn: () => api.getEmailThread(leadId),
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  });
  // Fetched lazily on Reply click — SendEmailDialog needs the full Lead object.
  const [replyOpen, setReplyOpen] = useState(false);
  const leadQuery = useQuery<Lead>({
    queryKey: ['lead', leadId],
    queryFn: () => api.getLead(leadId),
    enabled: replyOpen,
  });

  if (thread.isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-ink-muted">
        Loading…
      </div>
    );
  }
  if (!thread.data) {
    return (
      <div className="flex-1 flex items-center justify-center text-ink-muted">
        Failed to load thread
      </div>
    );
  }

  const { lead, items } = thread.data;

  return (
    <>
      {/* Header */}
      <header className="shrink-0 px-5 py-3 border-b border-border bg-surface flex items-center gap-3">
        <Avatar name={lead.businessName} logoUrl={lead.logoUrl} size={36} />
        <div className="min-w-0 flex-1">
          <div className="text-bodysm font-medium truncate">
            {lead.businessName}
          </div>
          <div className="text-caption text-ink-muted truncate">
            {lead.email ?? 'No email on file'}
            {(lead.city || lead.state) && (
              <span>
                {' · '}
                {[lead.city, lead.state].filter(Boolean).join(', ')}
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setReplyOpen(true)}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-primary text-white text-bodysm font-medium hover:bg-primary-hover"
        >
          <Reply size={14} /> Reply
        </button>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-auto scroll-thin px-6 py-4 space-y-2">
        {items.length === 0 && (
          <div className="text-center text-ink-muted py-12">No messages</div>
        )}
        {items.map((it, idx) => (
          <MessageBubble
            key={it.id}
            item={it}
            showHeader={
              idx === 0 ||
              items[idx - 1].kind !== it.kind ||
              items[idx - 1].fromEmail !== it.fromEmail
            }
          />
        ))}
      </div>

      {replyOpen && leadQuery.data && (
        <SendEmailDialog
          lead={leadQuery.data}
          open={replyOpen}
          onClose={() => setReplyOpen(false)}
        />
      )}
    </>
  );
}

function MessageBubble({
  item,
  showHeader,
}: {
  item: EmailThreadItem;
  showHeader: boolean;
}) {
  const isSent = item.kind === 'sent';
  return (
    <div
      className={clsx(
        'flex',
        isSent ? 'justify-end' : 'justify-start',
      )}
    >
      <div className="max-w-[70%] min-w-0">
        {showHeader && (
          <div
            className={clsx(
              'flex items-center gap-1.5 mb-1 text-caption text-ink-muted',
              isSent ? 'justify-end' : 'justify-start',
            )}
          >
            <span>{item.fromName || item.fromEmail}</span>
            <span>·</span>
            <span className="font-mono font-tabular">{formatWhen(item.at)}</span>
          </div>
        )}
        <div
          className={clsx(
            'rounded-2xl px-3.5 py-2.5 text-bodysm shadow-e1 border',
            isSent
              ? 'bg-primary text-white border-primary rounded-br-md'
              : 'bg-surface text-ink border-border rounded-bl-md',
          )}
        >
          {item.subject && (
            <div
              className={clsx(
                'text-caption font-medium mb-1',
                isSent ? 'text-white/80' : 'text-ink-muted',
              )}
            >
              {item.subject}
            </div>
          )}
          <div className="whitespace-pre-wrap break-words">
            {(item.bodyText ?? item.snippet ?? '').trim() || (item.bodyHtml ? '(HTML body — open from lead detail)' : '')}
          </div>
        </div>
      </div>
    </div>
  );
}

function Avatar({
  name,
  logoUrl,
  size,
}: {
  name: string;
  logoUrl: string | null;
  size: number;
}) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt=""
        loading="lazy"
        decoding="async"
        className="rounded-full object-cover bg-background border border-border shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  const initial = (name?.trim()?.[0] ?? '?').toUpperCase();
  return (
    <div
      className="rounded-full bg-primary/10 text-primary border border-primary/20 flex items-center justify-center shrink-0 font-medium"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {initial !== '?' ? initial : <ImageIcon size={size * 0.4} />}
    </div>
  );
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  const diff = now.getTime() - d.getTime();
  if (diff < 86_400_000 * 7) {
    return d.toLocaleDateString([], { weekday: 'short' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// Keep import used; otherwise Mail tree-shakes away.
export const _icons = { Mail };
