'use client';

// useSearchParams() forces this page out of static prerender. Next.js 15
// requires either a Suspense boundary OR the dynamic export. Both belt
// and braces here so prerender + suspense fallback both work cleanly.
export const dynamic = 'force-dynamic';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
  Mail,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  ExternalLink,
  Monitor,
  Moon,
  Sun,
} from 'lucide-react';
import clsx from 'clsx';
import { useTheme, type ThemeMode } from '@/hooks/useTheme';

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="max-w-[900px] mx-auto px-6 py-8 text-ink-muted">Loading…</div>}>
      <SettingsPageBody />
    </Suspense>
  );
}

function SettingsPageBody() {
  const qc = useQueryClient();
  const sp = useSearchParams();
  const router = useRouter();
  const oauthFlag = sp.get('email_oauth');
  const oauthEmail = sp.get('email');
  const oauthReason = sp.get('reason');

  useEffect(() => {
    if (!oauthFlag) return;
    qc.invalidateQueries({ queryKey: ['email-accounts'] });
    const t = setTimeout(() => router.replace('/settings'), 6000);
    return () => clearTimeout(t);
  }, [oauthFlag, qc, router]);

  const { data: config } = useQuery({
    queryKey: ['email-config'],
    queryFn: api.emailConfig,
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ['email-accounts'],
    queryFn: api.listEmailAccounts,
  });

  const disconnect = useMutation({
    mutationFn: (id: string) => api.disconnectEmailAccount(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['email-accounts'] }),
  });

  const beginConnect = () => {
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

      {/* Appearance / theme */}
      <AppearanceCard />

      {/* OAuth callback banners */}
      {oauthFlag === 'ok' && (
        <Card className="!py-3 flex items-center gap-3 border-success/40 bg-successBg">
          <CheckCircle2 size={16} className="text-success" />
          <div className="text-bodysm">
            Connected <span className="font-medium">{oauthEmail}</span>.
          </div>
        </Card>
      )}
      {oauthFlag === 'error' && (
        <OAuthErrorCard reason={oauthReason} redirectUri={config?.redirectUri ?? ''} />
      )}

      {/* Config status — what we send to Google */}
      <Card>
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <h2 className="text-h3 mb-0.5">Gmail OAuth configuration</h2>
            <p className="text-ink-muted text-bodysm">
              These values are read from <span className="font-mono">.env</span> at the API. Edit them there, then restart the API.
            </p>
          </div>
          <ConfigBadge ok={config?.configured ?? false} />
        </div>

        <div className="space-y-2">
          <ConfigRow
            label="GOOGLE_CLIENT_ID"
            value={config?.clientIdMasked ?? '(not set)'}
            ok={!!config?.clientIdMasked}
          />
          <ConfigRow
            label="GOOGLE_CLIENT_SECRET"
            value={config?.hasSecret ? '••••••••' : '(not set)'}
            ok={!!config?.hasSecret}
          />
          <ConfigRow
            label="EMAIL_TOKEN_ENC_KEY"
            value={config?.hasEncKey ? '••••••••' : '(not set)'}
            ok={!!config?.hasEncKey}
          />
          <ConfigRow
            label="GOOGLE_OAUTH_REDIRECT_URI"
            value={config?.redirectUri ?? ''}
            ok={!!config?.redirectUri}
            copy
          />
        </div>

        <div className="mt-4 rounded-md bg-background border border-border p-3 text-bodysm">
          <div className="font-medium mb-1">Add this redirect URI in Google Cloud Console</div>
          <p className="text-ink-muted mb-2">
            Open <a
              href="https://console.cloud.google.com/apis/credentials"
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline inline-flex items-center gap-1"
            >
              Cloud Console → Credentials <ExternalLink size={11} />
            </a>, click your OAuth 2.0 Client ID → <span className="font-medium">Authorized redirect URIs</span> → <span className="font-medium">+ ADD URI</span> → paste the value above → Save.
          </p>
          <p className="text-ink-muted">
            Also add yourself as a Test user under{' '}
            <a
              href="https://console.cloud.google.com/apis/credentials/consent"
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline inline-flex items-center gap-1"
            >
              OAuth consent screen <ExternalLink size={11} />
            </a>
            , and enable the Gmail API in <span className="font-medium">Enabled APIs & services</span>.
          </p>
        </div>
      </Card>

      {/* Open-tracking tunnel */}
      {config && <TunnelStatusCard config={config} />}

      {/* Accounts */}
      <Card>
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Mail size={16} className="text-primary" />
              <h2 className="text-h3">Email accounts</h2>
            </div>
            <p className="text-ink-muted text-bodysm">
              Connect Gmail accounts so you can send messages directly from a lead.
              We only request <span className="font-mono">gmail.send</span> scope plus your email + name.
            </p>
          </div>
          <Button onClick={beginConnect} disabled={!config?.configured}>
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
              <div key={a.id} className="px-4 py-3 flex flex-col gap-2">
                <div className="flex items-center gap-3">
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
                      if (
                        confirm(
                          `Disconnect ${a.email}? Sending from this account will stop working.`,
                        )
                      ) {
                        disconnect.mutate(a.id);
                      }
                    }}
                    className="text-neutral hover:text-error inline-flex items-center gap-1 text-caption"
                  >
                    <Trash2 size={12} /> Disconnect
                  </button>
                </div>

                {a.hasReadScope === false && (
                  <ScopeBanner
                    title="Reply detection scope is missing"
                    body="This account is missing the gmail.readonly scope. Disconnect and reconnect to enable inbound reply polling on the chat drawer."
                  />
                )}
                {a.hasCalendarScope === false && (
                  <ScopeBanner
                    title="Calendar Events scope is missing"
                    body="This account is missing the Calendar Events scope. Disconnect and reconnect to enable meeting sync to Google Calendar (invites are sent automatically when this is enabled)."
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function ScopeBanner({ title, body }: { title: string; body: string }) {
  return (
    <div className="ml-12 rounded-md border border-warning/40 bg-[#FEF4E5] p-2.5 text-caption flex items-start gap-2">
      <AlertCircle size={12} className="text-warning shrink-0 mt-0.5" />
      <div className="min-w-0">
        <div className="font-medium text-ink">{title}</div>
        <div className="text-ink-muted mt-0.5">{body}</div>
      </div>
    </div>
  );
}

function TunnelStatusCard({
  config,
}: {
  config: NonNullable<ReturnType<typeof useQuery<Awaited<ReturnType<typeof api.emailConfig>>>>['data']>;
}) {
  const t = config.tunnel;
  if (t.status === 'active' && t.isReachable) {
    const providerLabel = {
      env: 'PUBLIC_API_URL',
      ngrok: 'auto ngrok tunnel',
      cloudflared: 'auto cloudflared quick tunnel',
      none: 'none',
    }[t.provider];
    return (
      <Card className="border-success/40 bg-successBg">
        <div className="flex items-start gap-3">
          <CheckCircle2 size={16} className="text-success shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <div className="font-medium text-ink mb-0.5">
              Open tracking is live
            </div>
            <div className="text-bodysm text-ink-muted">
              Outbound emails embed a tracking pixel pointing at{' '}
              <span className="font-mono text-ink">{t.url}</span>{' '}
              ({providerLabel}). Recipients hitting the pixel from any inbox
              flip your bubble's ticks to green within ~2 s.
            </div>
            {t.startedAt && (
              <div className="text-caption text-neutral mt-1 font-mono font-tabular">
                Up since {new Date(t.startedAt).toLocaleString()}
              </div>
            )}
          </div>
        </div>
      </Card>
    );
  }

  if (t.status === 'starting') {
    return (
      <Card className="border-warning/40 bg-[#FEF4E5]">
        <div className="flex items-start gap-3">
          <AlertCircle size={16} className="text-warning shrink-0 mt-0.5" />
          <div>
            <div className="font-medium text-ink mb-0.5">
              Tunnel is starting…
            </div>
            <div className="text-bodysm text-ink-muted">Refresh the page in a moment.</div>
          </div>
        </div>
      </Card>
    );
  }

  if (t.status === 'error') {
    return (
      <Card className="border-error/40 bg-errorBg">
        <div className="flex items-start gap-3">
          <AlertCircle size={16} className="text-error shrink-0 mt-0.5" />
          <div className="min-w-0">
            <div className="font-medium text-ink mb-0.5">
              Tunnel failed to start
            </div>
            <div className="text-bodysm text-ink-muted mb-2">{t.error}</div>
            <div className="text-caption text-neutral">
              Open tracking falls back to reply-inference until the tunnel is
              fixed. Check your <span className="font-mono">NGROK_AUTHTOKEN</span> in{' '}
              <span className="font-mono">.env</span> and restart the API.
            </div>
          </div>
        </div>
      </Card>
    );
  }

  // status === 'inactive'
  return (
    <Card className="border-warning/40 bg-[#FEF4E5]">
      <div className="flex items-start gap-3">
        <AlertCircle size={16} className="text-warning shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="font-medium text-ink mb-1">
            Real-time open tracking is OFF
          </div>
          <p className="text-bodysm text-ink-muted mb-3">
            The tracking pixel currently points at{' '}
            <span className="font-mono text-ink">{config.publicApiUrl}</span>{' '}
            which recipients can't reach. Opens are only inferred from replies
            until you set up a public URL. Easiest path is{' '}
            <span className="font-medium text-ink">cloudflared</span> — no signup
            required:
          </p>
          <pre className="text-caption font-mono bg-surface border border-border rounded-md p-2 mb-3 overflow-x-auto">
{`# Linux / macOS:  install cloudflared via your package manager
sudo apt install cloudflared      # Debian/Ubuntu
brew install cloudflared          # macOS

# Then restart the API. It auto-starts a tunnel
# at https://*.trycloudflare.com — no signup needed.`}
          </pre>
          <p className="text-bodysm text-ink-muted mb-2">
            Or use ngrok (1-time signup) by setting{' '}
            <span className="font-mono">NGROK_AUTHTOKEN</span> in{' '}
            <span className="font-mono">.env</span>.
          </p>
          <div className="text-caption text-neutral">
            Already on a real domain in production? Set{' '}
            <span className="font-mono">PUBLIC_API_URL</span> — it takes
            precedence and skips both auto-tunnels.
          </div>
        </div>
      </div>
    </Card>
  );
}

function ConfigBadge({ ok }: { ok: boolean }) {
  if (ok)
    return (
      <span className="inline-flex items-center gap-1.5 text-caption font-medium text-success bg-successBg px-2.5 py-1 rounded-md shrink-0">
        <CheckCircle2 size={12} /> READY
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 text-caption font-medium text-error bg-errorBg px-2.5 py-1 rounded-md shrink-0">
      <AlertCircle size={12} /> NOT CONFIGURED
    </span>
  );
}

function ConfigRow({
  label,
  value,
  ok,
  copy,
}: {
  label: string;
  value: string;
  ok: boolean;
  copy?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };
  return (
    <div className="grid grid-cols-[auto_1fr_auto] gap-3 items-center text-bodysm">
      <span className="text-caption uppercase tracking-wider text-neutral whitespace-nowrap">
        {label}
      </span>
      <span
        className={
          'font-mono truncate ' + (ok ? 'text-ink' : 'text-error')
        }
      >
        {value || '(empty)'}
      </span>
      {copy ? (
        <button
          onClick={onCopy}
          className="text-caption text-ink-muted hover:text-primary inline-flex items-center gap-1 shrink-0"
        >
          {copied ? <Check size={12} className="text-success" /> : <Copy size={12} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      ) : (
        <span />
      )}
    </div>
  );
}

function OAuthErrorCard({
  reason,
  redirectUri,
}: {
  reason: string | null;
  redirectUri: string;
}) {
  const isMismatch = reason?.includes('redirect_uri_mismatch');
  return (
    <Card className="border-error/40 bg-errorBg">
      <div className="flex items-start gap-3">
        <AlertCircle size={16} className="text-error shrink-0 mt-0.5" />
        <div className="min-w-0">
          <div className="font-medium text-ink">Connect failed</div>
          {reason && (
            <div className="text-bodysm text-ink-muted font-mono mt-0.5 break-all">
              {reason}
            </div>
          )}
          {isMismatch && (
            <div className="mt-3 text-bodysm">
              Google rejected the redirect URI. Add this exact value to your
              OAuth client's <span className="font-medium">Authorized redirect URIs</span>:
              <div className="mt-2 font-mono bg-surface border border-border rounded-md px-3 py-2">
                {redirectUri}
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function AppearanceCard() {
  const { mode, setMode, resolved } = useTheme();
  const options: { value: ThemeMode; label: string; Icon: typeof Sun; desc: string }[] = [
    { value: 'light', label: 'Light', Icon: Sun, desc: 'Always light' },
    { value: 'dark', label: 'Dark', Icon: Moon, desc: 'Always dark' },
    { value: 'system', label: 'System', Icon: Monitor, desc: 'Follow OS' },
  ];
  return (
    <Card>
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <h2 className="text-h3 mb-0.5">Appearance</h2>
          <p className="text-ink-muted text-bodysm">
            Pick a theme. System follows your OS preference live —
            currently resolved to <span className="font-medium text-ink">{resolved}</span>.
          </p>
        </div>
      </div>
      <div
        role="radiogroup"
        aria-label="Theme"
        className="grid grid-cols-1 sm:grid-cols-3 gap-2"
      >
        {options.map(({ value, label, Icon, desc }) => {
          const active = mode === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setMode(value)}
              className={clsx(
                'flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
                active
                  ? 'border-primary bg-primary/10 ring-2 ring-primary/30'
                  : 'border-border bg-surface hover:border-primary/40',
              )}
            >
              <Icon size={16} className={active ? 'text-primary' : 'text-ink-muted'} />
              <div className="min-w-0">
                <div className="text-bodysm font-medium text-ink">{label}</div>
                <div className="text-caption text-ink-muted">{desc}</div>
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
