'use client';

import { useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Mail, Trash2, CheckCircle2, AlertCircle } from 'lucide-react';

export default function SettingsPage() {
  const qc = useQueryClient();
  const sp = useSearchParams();
  const router = useRouter();
  const oauthFlag = sp.get('email_oauth');
  const oauthEmail = sp.get('email');
  const oauthReason = sp.get('reason');

  // After the OAuth callback redirect, drop the query string so a refresh
  // doesn't re-show the banner.
  useEffect(() => {
    if (!oauthFlag) return;
    qc.invalidateQueries({ queryKey: ['email-accounts'] });
    const t = setTimeout(() => router.replace('/settings'), 4000);
    return () => clearTimeout(t);
  }, [oauthFlag, qc, router]);

  const { data: accounts = [] } = useQuery({
    queryKey: ['email-accounts'],
    queryFn: api.listEmailAccounts,
  });

  const disconnect = useMutation({
    mutationFn: (id: string) => api.disconnectEmailAccount(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['email-accounts'] }),
  });

  const beginConnect = () => {
    // Top-level redirect — we leave the SPA so Google's consent screen has
    // full control of the page.
    window.location.href = api.emailConnectUrl();
  };

  return (
    <div className="max-w-[1000px] mx-auto px-6 py-8 space-y-6">
      <div>
        <h1 className="text-h1 mb-1">Settings</h1>
        <p className="text-ink-muted text-bodysm">
          Workspace preferences and connected services.
        </p>
      </div>

      {oauthFlag === 'ok' && (
        <Card className="!py-3 flex items-center gap-3 border-success/40 bg-successBg">
          <CheckCircle2 size={16} className="text-success" />
          <div className="text-bodysm">
            Connected <span className="font-medium">{oauthEmail}</span>.
          </div>
        </Card>
      )}
      {oauthFlag === 'error' && (
        <Card className="!py-3 flex items-center gap-3 border-error/40 bg-errorBg">
          <AlertCircle size={16} className="text-error" />
          <div className="text-bodysm">
            Connect failed{oauthReason ? `: ${oauthReason}` : '.'}
          </div>
        </Card>
      )}

      <Card>
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Mail size={16} className="text-primary" />
              <h2 className="text-h3">Email accounts</h2>
            </div>
            <p className="text-ink-muted text-bodysm">
              Connect Gmail accounts so you can send messages directly from a lead.
              We only request <span className="font-mono">gmail.send</span> scope plus your
              email + name.
            </p>
          </div>
          <Button onClick={beginConnect}>
            <Mail size={14} /> Connect Gmail
          </Button>
        </div>

        {accounts.length === 0 ? (
          <div className="py-8 text-center text-ink-muted text-bodysm border border-dashed border-border rounded-md">
            No accounts connected yet.
          </div>
        ) : (
          <div className="divide-y divide-border border border-border rounded-md">
            {accounts.map((a) => (
              <div key={a.id} className="px-4 py-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Mail size={14} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{a.email}</div>
                  <div className="text-caption text-ink-muted">
                    {a.displayName ?? '—'} · provider:{' '}
                    <span className="font-mono">{a.provider}</span>
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (confirm(`Disconnect ${a.email}? Sending from this account will stop working.`)) {
                      disconnect.mutate(a.id);
                    }
                  }}
                  className="text-neutral hover:text-error inline-flex items-center gap-1 text-caption"
                  aria-label="Disconnect"
                >
                  <Trash2 size={12} /> Disconnect
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
