'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { useAuth } from '@/components/AuthContext';

export default function LoginPage() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get('next') ?? '/';

  const { ctx, loading, signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Already logged in → bounce.
  useEffect(() => {
    if (!loading && ctx) router.replace(next);
  }, [loading, ctx, next, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await signIn(email, password);
      router.replace(next);
    } catch (err: any) {
      setError(err?.message ?? 'Login failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-3rem)] flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="rounded-2xl border border-border bg-surface shadow-sm p-8">
          <div className="flex items-center gap-2 mb-6">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(110,231,183,.7)]" />
            <h1 className="text-lg font-semibold text-ink">Sign in to Onspace</h1>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block">
              <span className="text-xs font-medium text-ink-muted uppercase tracking-wide">Email</span>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-ink outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
                placeholder="you@example.com"
              />
            </label>

            <label className="block">
              <span className="text-xs font-medium text-ink-muted uppercase tracking-wide">Password</span>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-ink outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
                placeholder="••••••••"
              />
            </label>

            {error && (
              <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-emerald-500/90 hover:bg-emerald-500 text-emerald-950 font-medium text-sm py-2 transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="mt-6 text-[11px] text-ink-muted text-center">
            Workspace access provisioned by your administrator.
          </p>
        </div>

        <p className="mt-4 text-center text-[11px] text-ink-muted">
          Onspace · {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
