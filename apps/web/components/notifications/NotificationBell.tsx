'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import clsx from 'clsx';
import { api, Notification, NotificationKind } from '@/lib/api';
import { relativeTime } from '@/lib/time';
import {
  AlertCircle,
  Bell,
  CheckCheck,
  CheckCircle2,
  Megaphone,
  Reply,
  X,
  XCircle,
  type LucideIcon,
} from 'lucide-react';

type IconConf = {
  Icon: LucideIcon;
  tone: string;
};

const KIND_VISUAL: Record<NotificationKind, IconConf> = {
  email_replied: { Icon: Reply, tone: 'text-success' },
  campaign_completed: { Icon: Megaphone, tone: 'text-primary' },
  lead_converted: { Icon: CheckCircle2, tone: 'text-success' },
  lead_lost: { Icon: XCircle, tone: 'text-error' },
  lead_not_converted: { Icon: AlertCircle, tone: 'text-warning' },
};

/**
 * Phase 16 — topbar bell with unread badge + dropdown of recent
 * notifications. Polls the unread count every 30s; refetches the list
 * on dropdown open. Click-outside / Esc closes. Dropdown attaches via
 * portal so it can overflow the topbar.
 */
export function NotificationBell() {
  const qc = useQueryClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  const { data: unread } = useQuery({
    queryKey: ['notifications-unread-count'],
    queryFn: api.getNotificationUnreadCount,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const list = useQuery({
    queryKey: ['notifications-list'],
    queryFn: () => api.listNotifications({ take: 30 }),
    enabled: open,
    staleTime: 0,
  });

  useEffect(() => {
    if (!open) return;
    qc.invalidateQueries({ queryKey: ['notifications-list'] });
    const onClick = (e: MouseEvent) => {
      const inButton = buttonRef.current?.contains(e.target as Node);
      const inPanel = panelRef.current?.contains(e.target as Node);
      if (!inButton && !inPanel) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, qc]);

  const markRead = useMutation({
    mutationFn: (id: string) => api.markNotificationRead(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications-list'] });
      qc.invalidateQueries({ queryKey: ['notifications-unread-count'] });
    },
  });
  const markAllRead = useMutation({
    mutationFn: () => api.markAllNotificationsRead(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications-list'] });
      qc.invalidateQueries({ queryKey: ['notifications-unread-count'] });
    },
  });
  const dismiss = useMutation({
    mutationFn: (id: string) => api.dismissNotification(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications-list'] });
      qc.invalidateQueries({ queryKey: ['notifications-unread-count'] });
    },
  });

  const onPick = (n: Notification) => {
    if (n.status === 'unread') markRead.mutate(n.id);
    setOpen(false);
    if (n.entityType === 'lead' && n.entityId) {
      router.push(`/leads/${n.entityId}`);
    } else if (n.entityType === 'campaign' && n.entityId) {
      router.push(`/campaigns/${n.entityId}`);
    }
  };

  const count = unread?.count ?? 0;
  const items = list.data ?? [];
  const hasUnread = items.some((n) => n.status === 'unread');

  // Portal target for the panel — anchored under the button via
  // getBoundingClientRect so it follows whatever layout the topbar
  // gives us.
  const [panelStyle, setPanelStyle] = useState<{
    top: number;
    right: number;
  } | null>(null);
  useEffect(() => {
    if (!open || !buttonRef.current) return;
    const update = () => {
      const r = buttonRef.current!.getBoundingClientRect();
      setPanelStyle({
        top: r.bottom + 6,
        right: window.innerWidth - r.right,
      });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => setOpen((s) => !s)}
        className="relative h-9 w-9 rounded-md hover:bg-background flex items-center justify-center text-ink-muted"
        aria-label="Notifications"
        title="Notifications"
      >
        <Bell size={18} />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full bg-error text-white text-[10px] font-bold flex items-center justify-center font-mono font-tabular">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {mounted && open &&
        createPortal(
          <div
            ref={panelRef}
            style={
              panelStyle
                ? { top: panelStyle.top, right: panelStyle.right }
                : { top: 60, right: 16 }
            }
            className="fixed z-[100] w-[360px] max-h-[70vh] overflow-hidden bg-surface border border-border rounded-md shadow-e3 flex flex-col"
          >
            <header className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
              <span className="text-bodysm font-medium text-ink">
                Notifications
              </span>
              {hasUnread && (
                <button
                  onClick={() => markAllRead.mutate()}
                  className="text-caption text-primary hover:underline inline-flex items-center gap-1"
                >
                  <CheckCheck size={12} />
                  Mark all as read
                </button>
              )}
            </header>

            <div className="flex-1 overflow-y-auto scroll-thin">
              {list.isLoading ? (
                <div className="px-4 py-8 text-bodysm text-ink-muted text-center">
                  Loading…
                </div>
              ) : items.length === 0 ? (
                <div className="px-4 py-8 text-bodysm text-ink-muted text-center">
                  No notifications yet
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {items.map((n) => (
                    <NotificationRow
                      key={n.id}
                      n={n}
                      onPick={() => onPick(n)}
                      onDismiss={() => dismiss.mutate(n.id)}
                    />
                  ))}
                </ul>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

function NotificationRow({
  n,
  onPick,
  onDismiss,
}: {
  n: Notification;
  onPick: () => void;
  onDismiss: () => void;
}) {
  const visual = KIND_VISUAL[n.kind];
  const Icon = visual.Icon;
  const isUnread = n.status === 'unread';
  return (
    <li
      className={clsx(
        'group px-4 py-2.5 flex items-start gap-2.5 cursor-pointer hover:bg-background',
        isUnread && 'bg-primary/5',
      )}
      onClick={onPick}
    >
      <span className={clsx('mt-0.5 shrink-0', visual.tone)}>
        <Icon size={14} />
      </span>
      <div className="flex-1 min-w-0">
        <div
          className={clsx(
            'text-bodysm truncate',
            isUnread ? 'text-ink font-medium' : 'text-ink-muted',
          )}
          title={n.title}
        >
          {n.title}
        </div>
        {n.message && (
          <div
            className="text-caption text-ink-muted line-clamp-2 mt-0.5"
            title={n.message}
          >
            {n.message}
          </div>
        )}
        <div className="text-caption text-neutral mt-0.5 font-mono font-tabular">
          {relativeTime(n.createdAt)}
        </div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDismiss();
        }}
        className="opacity-0 group-hover:opacity-100 text-neutral hover:text-error mt-0.5 shrink-0 transition-opacity"
        aria-label="Dismiss"
        title="Dismiss"
      >
        <X size={12} />
      </button>
    </li>
  );
}
