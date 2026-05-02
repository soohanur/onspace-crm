'use client';

import { Bell, HelpCircle, Menu, PanelLeftClose, PanelLeft } from 'lucide-react';
import { useSidebar } from './SidebarContext';

export function Topbar() {
  const { collapsed, toggle } = useSidebar();
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
          Phase 2 · CRM Core
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button className="h-9 w-9 rounded-md hover:bg-background flex items-center justify-center text-ink-muted">
          <HelpCircle size={18} />
        </button>
        <button className="h-9 w-9 rounded-md hover:bg-background flex items-center justify-center text-ink-muted">
          <Bell size={18} />
        </button>
        <div className="h-9 w-9 rounded-full bg-primary text-white text-bodysm font-bold flex items-center justify-center">
          OC
        </div>
      </div>
    </header>
  );
}
