'use client';

import { usePathname } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

const CHROMELESS_PATHS = ['/login'];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '';
  const isChromeless = CHROMELESS_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  if (isChromeless) {
    return <main className="min-h-screen w-screen overflow-auto">{children}</main>;
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
        <main className="flex-1 overflow-auto scroll-thin">{children}</main>
      </div>
    </div>
  );
}
