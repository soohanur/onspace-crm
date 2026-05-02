'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Search,
  Users,
  GitBranch,
  FolderKanban,
  Contact,
  Mail,
  Phone,
  Calendar,
  CheckSquare,
  BarChart3,
  Settings,
} from 'lucide-react';
import clsx from 'clsx';
import { Logo } from './Logo';
import { useSidebar } from './SidebarContext';

const NAV = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/scraper', label: 'Lead Scraper', icon: Search },
  { href: '/leads', label: 'Global Leads', icon: Users },
  { href: '/lead-stage', label: 'Lead Stage', icon: GitBranch },
  { href: '/groups', label: 'Lead Groups', icon: FolderKanban },
  { href: '/contacts', label: 'Contacts / Owners', icon: Contact },
  { href: '/campaigns', label: 'Email Campaigns', icon: Mail },
  { href: '/calls', label: 'Call Center', icon: Phone },
  { href: '/meetings', label: 'Meetings', icon: Calendar },
  { href: '/tasks', label: 'Tasks / Follow-ups', icon: CheckSquare },
  { href: '/reports', label: 'Reports', icon: BarChart3 },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { collapsed } = useSidebar();
  return (
    <aside
      className={clsx(
        'shrink-0 border-r border-border bg-surface flex flex-col transition-[width] duration-200',
        collapsed ? 'w-[60px]' : 'w-[240px]',
      )}
    >
      <div className="h-[60px] px-3 flex items-center border-b border-border">
        <div className={clsx(collapsed ? 'justify-center w-full flex' : '')}>
          <Logo withText={!collapsed} />
        </div>
      </div>
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto scroll-thin">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active =
            href === '/'
              ? pathname === '/'
              : pathname === href || pathname.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className={clsx(
                'flex items-center h-10 rounded-md text-[14px] font-medium transition-colors',
                collapsed ? 'justify-center px-0' : 'gap-3 px-3',
                active
                  ? 'bg-primary/10 text-primary'
                  : 'text-ink-muted hover:bg-background hover:text-ink',
              )}
            >
              <Icon size={18} strokeWidth={active ? 2.2 : 1.8} />
              {!collapsed && <span className="truncate">{label}</span>}
            </Link>
          );
        })}
      </nav>
      {!collapsed && (
        <div className="px-4 py-3 border-t border-border text-caption text-neutral">
          v0.2 · Phase 2
        </div>
      )}
    </aside>
  );
}
