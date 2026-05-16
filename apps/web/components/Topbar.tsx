'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  HelpCircle,
  LogOut,
  Menu,
  PanelLeftClose,
  ShieldCheck,
  UserCircle2,
} from 'lucide-react';

import { useSidebar } from './SidebarContext';
import { NotificationBell } from './notifications/NotificationBell';
import { useAuth } from './AuthContext';

export function Topbar() {
  const { collapsed, toggle } = useSidebar();
  const { ctx, signOut } = useAuth();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const popRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  async function handleSignOut() {
    await signOut();
    router.replace('/login');
  }

  const initials = (ctx?.user.name ?? 'OC')
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <header className="h-[60px] shrink-0 bg-surface border-b border-border flex items-center justify-between px-4">
      <div className="flex items-center gap-3">
        <button
          onClick={toggle}
          className="h-9 w-9 rounded-md hover:bg-background flex items-center justify-center text-ink-muted"
          aria-label="Toggle sidebar"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <Menu size={18} /> : <PanelLeftClose size={18} />}
        </button>
        <div className="text-bodysm text-ink-muted">
          {ctx?.workspace?.name ?? 'Phase 2 · CRM Core'}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button className="h-9 w-9 rounded-md hover:bg-background flex items-center justify-center text-ink-muted">
          <HelpCircle size={18} />
        </button>
        <NotificationBell />

        <div className="relative" ref={popRef}>
          <button
            onClick={() => setOpen((v) => !v)}
            className="h-9 w-9 rounded-full bg-primary text-white text-bodysm font-bold flex items-center justify-center hover:opacity-90"
            aria-label="Account menu"
            title={ctx?.user.email}
          >
            {initials}
          </button>

          {open && ctx && (
            <div className="absolute right-0 top-[44px] w-[260px] rounded-xl border border-border bg-surface shadow-xl z-50 overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <div className="text-sm font-medium text-ink truncate">{ctx.user.name}</div>
                <div className="text-xs text-ink-muted truncate">{ctx.user.email}</div>
                <div className="mt-1 inline-flex items-center rounded-full bg-primary/10 text-primary text-[10px] uppercase tracking-wide px-1.5 py-0.5">
                  {ctx.role.name}
                </div>
              </div>

              <nav className="py-1.5">
                <MenuLink href="/profile" icon={<UserCircle2 size={16} />} onClick={() => setOpen(false)}>
                  Profile & settings
                </MenuLink>

                {ctx.user.isPlatformAdmin && (
                  <MenuLink
                    href="/admin"
                    icon={<ShieldCheck size={16} />}
                    onClick={() => setOpen(false)}
                    accent
                  >
                    Admin panel
                  </MenuLink>
                )}

                <button
                  onClick={handleSignOut}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-400 hover:bg-background"
                >
                  <LogOut size={16} />
                  Sign out
                </button>
              </nav>

              {ctx.subscription && (
                <div className="px-4 py-2 border-t border-border text-[11px] text-ink-muted">
                  {ctx.subscription.planName} ·{' '}
                  {ctx.subscription.daysRemaining > 0
                    ? `${ctx.subscription.daysRemaining}d left`
                    : 'expired'}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function MenuLink({
  href,
  icon,
  accent,
  onClick,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  accent?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 text-sm hover:bg-background ${
        accent ? 'text-primary' : 'text-ink'
      }`}
    >
      {icon}
      {children}
    </Link>
  );
}
