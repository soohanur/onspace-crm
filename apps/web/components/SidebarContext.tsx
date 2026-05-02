'use client';

import { createContext, useContext, useEffect, useState } from 'react';

interface SidebarCtx {
  collapsed: boolean;
  toggle: () => void;
}

const Ctx = createContext<SidebarCtx | null>(null);

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem('onspace.sidebar.collapsed');
    if (saved === '1') setCollapsed(true);
  }, []);

  const toggle = () => {
    setCollapsed((c) => {
      const next = !c;
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('onspace.sidebar.collapsed', next ? '1' : '0');
      }
      return next;
    });
  };

  return <Ctx.Provider value={{ collapsed, toggle }}>{children}</Ctx.Provider>;
}

export function useSidebar(): SidebarCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSidebar must be inside <SidebarProvider>');
  return v;
}
