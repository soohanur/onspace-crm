'use client';

import { Bell, HelpCircle } from 'lucide-react';

export function Topbar() {
  return (
    <header className="h-[60px] shrink-0 bg-surface border-b border-border flex items-center justify-between px-6">
      <div className="text-bodysm text-ink-muted">
        Phase 1 · Lead Scraping MVP
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
