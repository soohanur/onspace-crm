import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import * as ngrok from '@ngrok/ngrok';

export type TunnelProvider = 'env' | 'ngrok' | 'none';
export type TunnelStatus = 'inactive' | 'starting' | 'active' | 'error';

/**
 * Maintains a publicly reachable URL for the API so outbound emails can
 * embed a tracking pixel that hits us. Order of preference:
 *
 *   1. Explicit PUBLIC_API_URL env (anything not pointing at localhost).
 *      Use this when the API is deployed to a real domain.
 *   2. Auto-started ngrok tunnel when NGROK_AUTHTOKEN is set. The user
 *      signs up once at https://dashboard.ngrok.com/auth → free → grab
 *      the authtoken.
 *   3. None — falls back to localhost, tracking pixel won't fire.
 *
 * The active URL is read at email-send time (NOT cached at boot), so a
 * tunnel coming up later still applies to subsequent sends.
 */
@Injectable()
export class TunnelService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(TunnelService.name);
  private listener: ngrok.Listener | null = null;
  private _url: string | null = null;
  private _provider: TunnelProvider = 'none';
  private _status: TunnelStatus = 'inactive';
  private _error: string | null = null;
  private startedAt: Date | null = null;

  async onModuleInit() {
    // 1. Honour explicit env (real deployment).
    const env = (process.env.PUBLIC_API_URL || '').trim();
    if (env && !this.isLocalhost(env)) {
      this._url = env;
      this._provider = 'env';
      this._status = 'active';
      this.startedAt = new Date();
      this.log.log(`PUBLIC_API_URL set → using ${env}`);
      return;
    }

    // 2. Auto-start ngrok if authtoken is set.
    const authtoken = (process.env.NGROK_AUTHTOKEN || '').trim();
    if (authtoken) {
      await this.startNgrok(authtoken);
      return;
    }

    this.log.warn(
      'no PUBLIC_API_URL or NGROK_AUTHTOKEN — open tracking will only work via reply inference. ' +
        'Add NGROK_AUTHTOKEN to .env to enable real-time pixel tracking (free signup at ngrok.com).',
    );
  }

  async onModuleDestroy() {
    if (this.listener) {
      try {
        await this.listener.close();
      } catch {
        /* ignore */
      }
    }
  }

  private async startNgrok(authtoken: string) {
    this._provider = 'ngrok';
    this._status = 'starting';
    const port = Number(process.env.API_PORT || 4000);

    try {
      this.listener = await ngrok.connect({
        addr: port,
        authtoken,
      });
      const url = this.listener.url();
      if (!url) throw new Error('ngrok returned no URL');
      this._url = url;
      this._status = 'active';
      this._error = null;
      this.startedAt = new Date();
      this.log.log(`ngrok tunnel up → ${url}`);
    } catch (e) {
      this._status = 'error';
      this._error = e instanceof Error ? e.message : String(e);
      this._url = null;
      this.log.error(`ngrok start failed: ${this._error}`);
      // Don't throw — let the API boot. User sees the error in Settings.
    }
  }

  /** Public URL for the API. Used by the tracking pixel embed. */
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
