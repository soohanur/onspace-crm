import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EmailService } from './email.service';

/**
 * Cheap MVP-grade poller: every N minutes, ask Gmail for the threads of
 * recently-sent emails and look for new inbound messages. We use
 * setInterval because we already have one Node process — no need to wire
 * BullMQ scheduled jobs for a job that runs once every couple of minutes.
 */
@Injectable()
export class EmailReplyPoller implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(EmailReplyPoller.name);
  private timer?: NodeJS.Timeout;
  private busy = false;

  /** Default 60 s for snappy "WhatsApp-feel" updates. Override with EMAIL_REPLY_POLL_SECONDS env. */
  private get intervalMs(): number {
    const s = Number(process.env.EMAIL_REPLY_POLL_SECONDS);
    if (Number.isFinite(s) && s >= 15) return s * 1_000;
    const m = Number(process.env.EMAIL_REPLY_POLL_MINUTES);
    if (Number.isFinite(m) && m > 0) return m * 60_000;
    return 60_000;
  }

  constructor(private readonly emails: EmailService) {}

  async onModuleInit() {
    if (process.env.EMAIL_REPLY_POLL_DISABLED === '1') {
      this.log.warn('reply poller disabled via env');
      return;
    }
    // Initial run after 10s so app boot isn't blocked.
    setTimeout(() => this.tick(), 10_000);
    this.timer = setInterval(() => this.tick(), this.intervalMs);
    this.log.log(`reply poller armed every ${this.intervalMs / 1000}s`);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      const r = await this.emails.refreshAllRecent(7);
      if (r.newReplies > 0) {
        this.log.log(`fetched ${r.newReplies} new replies (${r.scanned} threads scanned)`);
      }
    } catch (e) {
      this.log.warn(`reply poller error: ${e instanceof Error ? e.message : e}`);
    } finally {
      this.busy = false;
    }
  }
}
