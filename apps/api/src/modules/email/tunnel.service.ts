import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { spawn, type ChildProcess } from 'node:child_process';
import * as ngrok from '@ngrok/ngrok';

export type TunnelProvider = 'env' | 'ngrok' | 'cloudflared' | 'none';
export type TunnelStatus = 'inactive' | 'starting' | 'active' | 'error';

/**
 * Maintains a publicly reachable URL for the API so outbound emails can
 * embed a tracking pixel that hits us. Order of preference:
 *
 *   1. Explicit PUBLIC_API_URL env (real domain, takes precedence).
 *   2. ngrok tunnel when NGROK_AUTHTOKEN is set.
 *   3. cloudflared quick tunnel — zero-config, no signup required, just
 *      needs the `cloudflared` binary on PATH (most modern Linux distros
 *      package it; brew on mac; download for Windows). Default fallback.
 *   4. None — pixel embeds localhost, won't reach recipients (reply-
 *      inferred opens still work).
 *
 * Set `TUNNEL_DISABLED=1` to opt out and force localhost (e.g. CI).
 *
 * The active URL is read at email-send time via publicUrl(), NOT cached
 * at boot, so a tunnel coming up later still applies to subsequent sends.
 */
@Injectable()
export class TunnelService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(TunnelService.name);
  private ngrokListener: ngrok.Listener | null = null;
  private cfdProc: ChildProcess | null = null;
  private _url: string | null = null;
  private _provider: TunnelProvider = 'none';
  private _status: TunnelStatus = 'inactive';
  private _error: string | null = null;
  private startedAt: Date | null = null;

  async onModuleInit() {
    if (process.env.TUNNEL_DISABLED === '1') {
      this.log.warn('TUNNEL_DISABLED=1 — open tracking via pixel is OFF.');
      return;
    }

    // 1. Explicit env wins (production).
    const env = (process.env.PUBLIC_API_URL || '').trim();
    if (env && !this.isLocalhost(env)) {
      this._url = env;
      this._provider = 'env';
      this._status = 'active';
      this.startedAt = new Date();
      this.log.log(`PUBLIC_API_URL set → using ${env}`);
      return;
    }

    // 2. Ngrok if authtoken set.
    const authtoken = (process.env.NGROK_AUTHTOKEN || '').trim();
    if (authtoken) {
      const ok = await this.startNgrok(authtoken);
      if (ok) return;
    }

    // 3. Default fallback: cloudflared quick tunnel (no auth needed).
    const ok = await this.startCloudflared();
    if (ok) return;

    this.log.warn(
      'no tunnel could be started. Open tracking will only work via reply ' +
        'inference. To enable real-time pixel tracking, install cloudflared ' +
        '(https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation), ' +
        'or set NGROK_AUTHTOKEN, or set PUBLIC_API_URL to a real domain.',
    );
  }

  async onModuleDestroy() {
    if (this.ngrokListener) {
      try { await this.ngrokListener.close(); } catch { /* ignore */ }
    }
    if (this.cfdProc && !this.cfdProc.killed) {
      try { this.cfdProc.kill('SIGTERM'); } catch { /* ignore */ }
    }
  }

  // ───────────── ngrok ─────────────

  private async startNgrok(authtoken: string): Promise<boolean> {
    this._provider = 'ngrok';
    this._status = 'starting';
    const port = Number(process.env.API_PORT || 4000);
    try {
      this.ngrokListener = await ngrok.connect({ addr: port, authtoken });
      const url = this.ngrokListener.url();
      if (!url) throw new Error('ngrok returned no URL');
      this._url = url;
      this._status = 'active';
      this._error = null;
      this.startedAt = new Date();
      this.log.log(`ngrok tunnel up → ${url}`);
      return true;
    } catch (e) {
      this._status = 'error';
      this._error = e instanceof Error ? e.message : String(e);
      this._url = null;
      this.log.error(`ngrok start failed: ${this._error}`);
      return false;
    }
  }

  // ───────────── cloudflared ─────────────

  /**
   * Spawn `cloudflared tunnel --url http://localhost:4000` and parse the
   * trycloudflare.com URL from its log output. The URL appears in the
   * banner Cloudflare prints during startup.
   */
  private async startCloudflared(): Promise<boolean> {
    this._provider = 'cloudflared';
    this._status = 'starting';
    const port = Number(process.env.API_PORT || 4000);

    return new Promise((resolve) => {
      let proc: ChildProcess;
      try {
        proc = spawn(
          'cloudflared',
          ['tunnel', '--url', `http://localhost:${port}`, '--no-autoupdate'],
          { stdio: ['ignore', 'pipe', 'pipe'] },
        );
      } catch (e) {
        this._status = 'error';
        this._error = e instanceof Error ? e.message : 'cloudflared not found';
        this.log.warn(`cloudflared not available: ${this._error}`);
        resolve(false);
        return;
      }

      this.cfdProc = proc;
      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          this._status = 'error';
          this._error = 'cloudflared timeout (no URL after 30s)';
          this.log.error(this._error);
          try { proc.kill('SIGTERM'); } catch { /* ignore */ }
          resolve(false);
        }
      }, 30_000);

      const onLine = (line: string) => {
        // Real tunnel URLs are 3+ dash-separated slugs, e.g.
        // "https://holidays-kodak-dallas-joining.trycloudflare.com".
        // Cloudflare's docs URL "https://api.trycloudflare.com" is also
        // logged at startup, so we exclude it by requiring ≥2 dashes.
        const m = line.match(
          /(https:\/\/[a-z0-9]+(?:-[a-z0-9]+){2,}\.trycloudflare\.com)/,
        );
        if (m && !resolved) {
          resolved = true;
          clearTimeout(timeout);
          this._url = m[1];
          this._status = 'active';
          this._error = null;
          this.startedAt = new Date();
          this.log.log(`cloudflared quick tunnel up → ${this._url}`);
          resolve(true);
        }
      };

      proc.stdout?.on('data', (b) => b.toString().split('\n').forEach(onLine));
      proc.stderr?.on('data', (b) => b.toString().split('\n').forEach(onLine));

      proc.on('exit', (code) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          this._status = 'error';
          this._error = `cloudflared exited (code ${code}). Is it installed and on PATH?`;
          this.log.error(this._error);
          resolve(false);
        } else {
          // Already had a URL — it died later. Mark inactive.
          this._status = 'inactive';
          this._error = `cloudflared exited (code ${code})`;
          this._url = null;
          this.log.warn(this._error);
        }
      });
    });
  }

  // ───────────── public API ─────────────

  publicUrl(): string {
    if (this._url) return this._url;
    return `http://localhost:${process.env.API_PORT || 4000}`;
  }

  isReachable(): boolean {
    return !!this._url && this._status === 'active' && !this.isLocalhost(this._url);
  }

  status() {
    return {
      provider: this._provider,
      status: this._status,
      url: this._url,
      isReachable: this.isReachable(),
      startedAt: this.startedAt?.toISOString() ?? null,
      error: this._error,
      hasAuthtoken: !!process.env.NGROK_AUTHTOKEN,
    };
  }

  private isLocalhost(url: string): boolean {
    return /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)/i.test(url);
  }
}
