'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { useAuth } from '@/components/AuthContext';

const TABS = [
  { href: '/admin', label: 'Workspaces' },
  { href: '/admin/audit', label: 'Audit log' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { ctx, loading } = useAuth();
  const pathname = usePathname() ?? '';
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!ctx) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    } else if (!ctx.user.isPlatformAdmin) {
      router.replace('/');
    }
  }, [ctx, loading, pathname, router]);

  if (loading || !ctx?.user.isPlatformAdmin) {
    return <div className="p-6 text-ink-muted">Loading admin panel…</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-surface">
        <div className="max-w-[1200px] mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(110,231,183,.7)]" />
            <span className="font-semibold text-ink">Onspace · Admin</span>
            <span className="text-xs text-ink-muted ml-2">{ctx.user.email}</span>
          </div>
          <nav className="flex gap-2">
            {TABS.map((t) => {
              const active = t.href === '/admin' ? pathname === '/admin' : pathname.startsWith(t.href);
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  className={`text-sm rounded-md px-3 py-1.5 ${
                    active ? 'bg-primary/10 text-primary' : 'text-ink-muted hover:bg-background hover:text-ink'
                  }`}
                >
                  {t.label}
                </Link>
              );
            })}
            <Link href="/" className="text-sm rounded-md px-3 py-1.5 text-ink-muted hover:text-ink">
              ← Back to app
            </Link>
          </nav>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
