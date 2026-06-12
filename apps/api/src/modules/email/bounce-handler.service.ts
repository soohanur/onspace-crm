import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { GmailService } from './gmail.service';
import { decrypt } from './crypto';

/**
 * Bounce handler. Every N minutes (default 30) it walks each connected
 * Gmail's `from:mailer-daemon` recent messages, extracts the failed
 * recipient address from the bounce body, and marks any lead whose
 * `email` matches as `validity = invalid`. Also stamps any matching
 * `email_logs` row with `bouncedAt` so the activity report shows the
 * delivery outcome.
 *
 * Idempotent: we track the highest internalDate processed per account
 * (in-memory; bootstrap on boot fetches the last 24 h) and only look
 * at newer messages each sweep.
 */
@Injectable()
export class EmailBounceHandler implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(EmailBounceHandler.name);
  private timer?: NodeJS.Timeout;
  private busy = false;
  /** Per-account high-water mark for processed messages (ms). */
  private cursor = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly gmail: GmailService,
  ) {}

  private get intervalMs(): number {
    const m = Number(process.env.EMAIL_BOUNCE_POLL_MINUTES);
    if (Number.isFinite(m) && m >= 1) return m * 60_000;
    return 30 * 60_000;
  }

  async onModuleInit() {
    if (process.env.EMAIL_BOUNCE_POLL_DISABLED === '1') {
      this.log.warn('bounce handler disabled via env');
      return;
    }
    // Initial sweep after 30 s (let other modules settle first).
    setTimeout(() => this.tick(), 30_000);
    this.timer = setInterval(() => this.tick(), this.intervalMs);
    this.log.log(
      `bounce handler armed every ${this.intervalMs / 60_000} min`,
    );
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      const r = await this.sweepAll();
      if (r.bounced > 0) {
        this.log.log(
          `bounce sweep: ${r.bounced} new bounces across ${r.accounts} account(s)`,
        );
      }
    } catch (e) {
      this.log.warn(
        `bounce handler error: ${e instanceof Error ? e.message : e}`,
      );
    } finally {
      this.busy = false;
    }
  }

  /** Public so the controller / tests can drive it manually. */
  async sweepAll(): Promise<{ accounts: number; bounced: number }> {
    const accounts = await this.prisma.emailAccount.findMany({
      where: { active: true },
      select: {
        id: true,
        email: true,
        accessToken: true,
        refreshToken: true,
      },
    });
    let bounced = 0;
    for (const acc of accounts) {
      try {
        bounced += await this.sweepOne(
          acc.id,
          acc.email,
          decrypt(acc.accessToken),
          decrypt(acc.refreshToken),
        );
      } catch (err) {
        this.log.warn(
          `account ${acc.email} sweep failed: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
    return { accounts: accounts.length, bounced };
  }

  private async sweepOne(
    accountId: string,
    accountEmail: string,
    accessToken: string,
    refreshToken: string,
  ): Promise<number> {
    // Bootstrap cursor — last 24 h on first run, so a fresh restart
    // doesn't replay weeks of history.
    const since = this.cursor.get(accountId) ?? Date.now() - 24 * 3600_000;
    // Gmail `after:` takes unix seconds.
    const q = `from:mailer-daemon after:${Math.floor(since / 1000)}`;
    const messages = await this.gmail.listMessages({
      accessToken,
      refreshToken,
      q,
      maxResults: 100,
    });
    if (messages.length === 0) return 0;

    let processed = 0;
    let maxSeen = since;
    for (const ref of messages) {
      let msg;
      try {
        msg = await this.gmail.fetchMessage({
          accessToken,
          refreshToken,
          id: ref.id,
        });
      } catch (err) {
        this.log.warn(`fetch ${ref.id} failed: ${err}`);
        continue;
      }
      const at = msg.internalDate.getTime();
      if (at > maxSeen) maxSeen = at;
      // Only consider failure / hard-bounce notices. Soft-bounce
      // (Delayed) usually retry and shouldn't mark a lead invalid.
      const subj = (msg.subject ?? '').toLowerCase();
      const isBounce =
        subj.includes('delivery status notification (failure)') ||
        subj.includes('undeliverable') ||
        subj.includes("couldn't be delivered") ||
        subj.includes('mail delivery failed');
      if (!isBounce) continue;
      const failed = extractBouncedRecipient(
        msg.bodyText ?? '',
        msg.bodyHtml ?? '',
      );
      if (!failed || failed.toLowerCase() === accountEmail.toLowerCase()) {
        continue;
      }
      const hit = await this.markBounce(failed);
      processed += hit;
    }
    this.cursor.set(accountId, maxSeen);
    return processed;
  }

  /**
   * Mark a lead (and any matching email_log rows) as bounced. Returns
   * 1 if a lead row was touched, 0 if no match.
   */
  private async markBounce(rawAddress: string): Promise<number> {
    const addr = rawAddress.trim().toLowerCase();
    if (!addr || !addr.includes('@')) return 0;

    // Lead match: primary email OR appears in emails[] array.
    const leads = await this.prisma.lead.findMany({
      where: {
        OR: [
          { email: { equals: addr, mode: 'insensitive' } },
          { emails: { has: addr } },
        ],
      },
      select: { id: true, validity: true },
    });
    if (leads.length === 0) return 0;
    for (const l of leads) {
      if (l.validity !== 'invalid') {
        await this.prisma.lead.update({
          where: { id: l.id },
          data: { validity: 'invalid' },
        });
      }
    }
    await this.prisma.emailLog.updateMany({
      where: {
        toEmail: { equals: addr, mode: 'insensitive' },
        bouncedAt: null,
      },
      data: { bouncedAt: new Date(), status: 'failed' },
    });
    // Also exit any active sequence enrollments targeting this address
    // — no point keeping them queued.
    await this.prisma.sequenceEnrollment.updateMany({
      where: {
        toEmail: { equals: addr, mode: 'insensitive' },
        status: 'active',
      },
      data: {
        status: 'exited_manual',
        exitedAt: new Date(),
        exitReason: 'recipient bounced (hard fail)',
        nextStepOrder: -1,
      },
    });
    return leads.length;
  }
}

/**
 * Pull the failed recipient address from a bounce body. Google's DSN
 * format puts it on a line like `<bounced@addr.com>` near the top, with
 * "Address not found" or "couldn't be delivered" preceding it. We grab
 * the first email-looking token after a delivery-failure marker.
 *
 * Fallback: any `<email>` after `Final-Recipient:` or `Original-Recipient:`
 * in the machine-readable DSN block.
 */
function extractBouncedRecipient(
  text: string,
  html: string,
): string | null {
  const sources = [text, html].filter(Boolean);
  for (const raw of sources) {
    // 1. RFC 3464 DSN: `Final-Recipient: rfc822;<addr>`
    const dsnMatch = raw.match(
      /Final-Recipient:\s*rfc822;?\s*<?([^\s<>;]+@[^\s<>;]+)>?/i,
    );
    if (dsnMatch) return dsnMatch[1].trim();
    const origMatch = raw.match(
      /Original-Recipient:\s*rfc822;?\s*<?([^\s<>;]+@[^\s<>;]+)>?/i,
    );
    if (origMatch) return origMatch[1].trim();
    // 2. Body-text marker: "wasn't delivered to <addr>"
    const bodyMatch = raw.match(
      /wasn['']?t delivered to[\s\S]{0,80}?([a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,})/i,
    );
    if (bodyMatch) return bodyMatch[1].trim();
    // 3. Generic <addr> token early in the body (postmaster section).
    const lt = raw.match(
      /<([a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,})>/i,
    );
    if (lt) return lt[1].trim();
  }
  return null;
}
