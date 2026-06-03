'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuth } from './AuthContext';

/**
 * Gates the chrome'd app: while loading, paints a spinner; if /auth/me
 * came back unauthenticated, redirects to /login with ?next=<current>
 * so the user lands back on the page they wanted after signing in.
 *
 * Chromeless paths (e.g. /login) bypass this wrapper at the Shell layer.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { ctx, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname() ?? '/';

  useEffect(() => {
    if (loading) return;
    if (!ctx) {
      const next = encodeURIComponent(pathname);
      router.replace(`/login?next=${next}`);
    }
  }, [loading, ctx, pathname, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen text-ink-muted">
        <Loader2 size={18} className="animate-spin mr-2" />
        Loading…
      </div>
    );
  }
  if (!ctx) {
    // Redirect in flight; render nothing to keep the protected tree from
    // mounting queries that will 401.
    return null;
  }
  return <>{children}</>;
}
