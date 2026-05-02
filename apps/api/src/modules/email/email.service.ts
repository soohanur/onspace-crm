import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@onspace/db';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailAccountsService } from './email-accounts.service';
import { GmailService, AttachmentInput } from './gmail.service';
import { saveAttachment, StoredAttachment } from './attachments';
import { accountHasReadScope } from './scopes';
import { TunnelService } from './tunnel.service';
import { StageAutomationService } from '../leads/stage-automation.service';

const toJson = (v: unknown): Prisma.InputJsonValue =>
  (v ?? []) as Prisma.InputJsonValue;

export interface SendInput {
  leadId: string;
  accountId?: string;
  toEmail: string;
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  bodyHtml?: string;
  /** When set, the new send is a reply continuing this email's thread. */
  replyToLogId?: string;
  attachments?: { filename: string; mimeType: string; buffer: Buffer; size: number }[];
  /** Phase 9: when set, this send is a campaign tick. Stamped on the
   *  EmailLog row, used by the chat drawer pill, and de-duplicated below. */
  campaignId?: string;
}

@Injectable()
export class EmailService {
  private readonly log = new Logger(EmailService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: EmailAccountsService,
    private readonly gmail: GmailService,
    private readonly tunnel: TunnelService,
    private readonly stageAutomation: StageAutomationService,
  ) {}

  async send(input: SendInput) {
    const lead = await this.prisma.lead.findUnique({
      where: { id: input.leadId },
      select: { id: true, businessName: true },
    });
    if (!lead) throw new NotFoundException('Lead not found');

    // Phase 9 — dedupe guard. If a campaign tick races (e.g. processor
    // crashed and replayed), don't double-send. Return the existing
    // sent/sending log so the caller can wire the recipient row to it.
    if (input.campaignId) {
      const existing = await this.prisma.emailLog.findFirst({
        where: {
          campaignId: input.campaignId,
          leadId: input.leadId,
          status: { in: ['sending', 'sent'] },
        },
        orderBy: { createdAt: 'asc' },
      });
      if (existing) {
        this.log.warn(
          `campaign send dedupe: campaign=${input.campaignId} lead=${input.leadId} → returning existing log ${existing.id}`,
        );
        return existing;
      }
    }

    // Replying to an existing log? load it for thread + in-reply-to headers.
    let parent: { threadId: string | null; messageId: string | null; subject: string } | null = null;
    if (input.replyToLogId) {
      const p = await this.prisma.emailLog.findUnique({
        where: { id: input.replyToLogId },
        select: { threadId: true, messageId: true, subject: true, leadId: true },
      });
      if (!p || p.leadId !== input.leadId) {
        throw new NotFoundException('Parent email not found for this lead');
      }
      parent = { threadId: p.threadId, messageId: p.messageId, subject: p.subject };
    }

    const { account, accessToken, refreshToken } = await this.accounts.getReadyForSend(
      input.accountId ?? null,
    );

    // 1. Insert log row in `sending` so failures stay visible.
    const log = await this.prisma.emailLog.create({
      data: {
        leadId: input.leadId,
        accountId: account.id,
        fromEmail: account.email,
        fromName: account.displayName ?? null,
        toEmail: input.toEmail,
        cc: input.cc ?? [],
        bcc: input.bcc ?? [],
        subject: input.subject,
        bodyText: input.body,
        bodyHtml: input.bodyHtml ?? null,
        status: 'sending',
        provider: 'gmail',
        campaignId: input.campaignId ?? null,
      },
    });

    // 2. Persist files to disk. Once an attachment is associated with this
    //    log row, even a failure leaves the file inspectable.
    const stored: StoredAttachment[] = [];
    for (const f of input.attachments ?? []) {
      stored.push(
        await saveAttachment(log.id, {
          originalname: f.filename,
          mimetype: f.mimeType,
          buffer: f.buffer,
          size: f.size,
        }),
      );
    }
    if (stored.length) {
      await this.prisma.emailLog.update({
        where: { id: log.id },
        data: { attachments: toJson(stored) },
      });
    }

    // 3. Inject open-tracking pixel into HTML body. Uses the dynamic
    //    tunnel URL when available, falls back to localhost otherwise.
    const finalBodyHtml = this.wrapWithTrackingPixel(
      input.bodyHtml ?? plainToHtml(input.body),
      log.trackingId,
    );

    const attInputs: AttachmentInput[] = (input.attachments ?? []).map((f) => ({
      filename: f.filename,
      mimeType: f.mimeType,
      data: f.buffer,
    }));

    // 4. Send via Gmail.
    try {
      const result = await this.gmail.sendMail({
        accessToken,
        refreshToken,
        fromEmail: account.email,
        fromName: account.displayName,
        to: input.toEmail,
        cc: input.cc,
        bcc: input.bcc,
        subject: input.subject,
        bodyText: input.body,
        bodyHtml: finalBodyHtml,
        attachments: attInputs,
        threadId: parent?.threadId ?? undefined,
        inReplyTo: parent?.messageId ?? undefined,
      });

      const updated = await this.prisma.emailLog.update({
        where: { id: log.id },
        data: {
          status: 'sent',
          messageId: result.messageId || null,
          threadId: result.threadId || null,
          sentAt: new Date(),
        },
      });
      // Stage automation: new -> approached on first send. Wrapped in
      // try/catch internally; never bubbles a failure to the caller.
      await this.stageAutomation.onEmailSent(input.leadId);
      return updated;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.log.error(`gmail send failed for log ${log.id}: ${message}`);
      await this.prisma.emailLog.update({
        where: { id: log.id },
        data: { status: 'failed', error: message },
      });
      throw new Error(`Gmail send failed: ${message}`);
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // Reads — thread-grouped
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Per-lead history. Returns ONE row per thread (the root log) with thread
   * metadata. Outbound replies don't show up as separate rows. The drawer
   * fetches the full thread via findOne(rootLogId).
   */
  async listForLead(leadId: string, take = 50) {
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      select: { id: true },
    });
    if (!lead) throw new NotFoundException('Lead not found');

    const allLogs = await this.prisma.emailLog.findMany({
      where: { leadId },
      orderBy: { createdAt: 'asc' },
      include: { replies: { orderBy: { receivedAt: 'asc' } } },
    });

    type LogRow = (typeof allLogs)[number];
    const groups = new Map<string, LogRow[]>();
    const orphans: LogRow[] = [];

    for (const log of allLogs) {
      if (!log.threadId) {
        orphans.push(log);
        continue;
      }
      const arr = groups.get(log.threadId) ?? [];
      arr.push(log);
      groups.set(log.threadId, arr);
    }

    const headers: any[] = [];

    for (const logs of groups.values()) {
      const root = logs[0];
      const allReplies = logs.flatMap((l) => l.replies ?? []);
      const ourReplyCount = logs.length - 1;
      const inboundReplyCount = allReplies.length;
      const total = logs.length + inboundReplyCount;

      let latest = new Date(root.sentAt ?? root.createdAt).getTime();
      for (const l of logs) {
        const t = new Date(l.sentAt ?? l.createdAt).getTime();
        if (t > latest) latest = t;
      }
      for (const r of allReplies) {
        const t = new Date(r.receivedAt).getTime();
        if (t > latest) latest = t;
      }

      headers.push({
        ...root,
        replies: allReplies,
        threadMessageCount: total,
        threadOurReplyCount: ourReplyCount,
        threadInboundReplyCount: inboundReplyCount,
        threadLatestActivity: new Date(latest).toISOString(),
      });
    }

    for (const o of orphans) {
      headers.push({
        ...o,
        replies: o.replies ?? [],
        threadMessageCount: 1,
        threadOurReplyCount: 0,
        threadInboundReplyCount: 0,
        threadLatestActivity: (o.sentAt ?? o.createdAt).toISOString(),
      });
    }

    headers.sort(
      (a, b) =>
        new Date(b.threadLatestActivity).getTime() -
        new Date(a.threadLatestActivity).getTime(),
    );

    return headers.slice(0, take);
  }

  /**
   * Full thread for the drawer. Merges all outbound logs + inbound replies
   * for the thread, sorted chronologically, each tagged with direction.
   */
  async findOne(id: string) {
    const log = await this.prisma.emailLog.findUnique({
      where: { id },
      include: {
        replies: { orderBy: { receivedAt: 'asc' } },
        campaign: { select: { id: true, name: true } },
      },
    });
    if (!log) throw new NotFoundException('Email not found');

    if (!log.threadId) {
      // Standalone (no Gmail threadId — usually a failed send)
      return {
        ...log,
        messages: [logToOutbound(log)],
      };
    }

    const threadLogs = await this.prisma.emailLog.findMany({
      where: { leadId: log.leadId, threadId: log.threadId },
      include: {
        replies: { orderBy: { receivedAt: 'asc' } },
        campaign: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const messages: ThreadMessage[] = [];
    for (const l of threadLogs) {
      messages.push(logToOutbound(l));
      for (const r of l.replies) {
        messages.push({
          id: r.id,
          type: 'reply',
          direction: 'inbound',
          timestamp: r.receivedAt.toISOString(),
          fromEmail: r.fromEmail,
          fromName: r.fromName,
          toEmail: r.toEmail,
          cc: [],
          subject: r.subject,
          bodyText: r.bodyText,
          bodyHtml: r.bodyHtml,
          snippet: r.snippet,
          attachments: [],
        });
      }
    }
    messages.sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );

    const root = threadLogs[0] ?? log;

    return {
      ...root,
      replies: threadLogs.flatMap((l) => l.replies),
      messages,
    };
  }

  /**
   * Record a tracking-pixel hit. Logs every hit individually so we can see
   * exactly who is opening (Gmail's proxy / recipient's browser / etc.)
   * and defend against pre-fetch false positives.
   *
   * Defense rule: a hit within `prefetchWindowSeconds` of sentAt is flagged
   * `suspectedPrefetch=true` and we DON'T set `openedAt` on it. We do still
   * log the hit so the user can see it. The next non-prefetch hit promotes
   * the email to "opened".
   */
  async recordOpen(trackingId: string, meta: { userAgent?: string; ipAddress?: string }): Promise<void> {
    const log = await this.prisma.emailLog.findUnique({
      where: { trackingId },
      select: { id: true, openedAt: true, sentAt: true, createdAt: true },
    });
    if (!log) return;

    const now = new Date();
    const sent = log.sentAt ?? log.createdAt;
    const ageSeconds = (now.getTime() - sent.getTime()) / 1000;

    // Defense layer 1 — time window. Hits within this many seconds of
    // send are presumed to be the SENDER's own Gmail tab rendering the
    // new outbound message (which fetches the pixel via GoogleImageProxy).
    // 5 s is the empirical sweet spot for thread replies (the proxy
    // sometimes only fetches once, immediately).
    const prefetchWindowSeconds = Number(process.env.EMAIL_PREFETCH_WINDOW_SECONDS ?? 5);
    const isWithinPrefetchWindow = ageSeconds < prefetchWindowSeconds;

    // Defense layer 2 — UA fingerprint. Gmail's link/image SCANNER (the
    // service that pre-fetches every URL in inbound mail to scope it for
    // malware) hits us with a doctored browser UA from Google IP ranges
    // BEFORE the recipient ever sees the message. It uses a stable
    // signature: `Edge/12.246` (an Edge build from 2015 that the real
    // browser stopped shipping a decade ago) plus a duplicate trailing
    // `Mozilla/5.0`. This is NOT the same path as the legitimate
    // GoogleImageProxy / ggpht.com fetch a real recipient triggers when
    // they open the email — that one we DO want to count.
    const ua = (meta.userAgent ?? '').toLowerCase();
    const isGmailScanner =
      ua.includes('edge/12.246') ||
      // The trailing-Mozilla duplicate is another reliable scanner tell.
      /mozilla\/5\.0\s*$/i.test(meta.userAgent ?? '') &&
        /chrome\/42\.0\.2311/i.test(meta.userAgent ?? '');

    const suspect = isWithinPrefetchWindow || isGmailScanner;

    // Always log the hit, even if suspect.
    await this.prisma.emailPixelHit.create({
      data: {
        emailLogId: log.id,
        trackingId,
        userAgent: meta.userAgent ?? null,
        ipAddress: meta.ipAddress ?? null,
        suspectedPrefetch: suspect,
      },
    });

    // Already opened? nothing to do.
    if (log.openedAt) {
      this.log.log(
        `email ${log.id} pixel hit (already opened, age ${ageSeconds.toFixed(1)}s)`,
      );
      return;
    }

    // If this hit was suspect (prefetch window OR scanner UA), log and stop.
    if (suspect) {
      const reason = isGmailScanner ? 'GMAIL_SCANNER' : 'PREFETCH';
      this.log.log(
        `email ${log.id} pixel hit suspected ${reason} (age ${ageSeconds.toFixed(1)}s, ua="${meta.userAgent?.slice(0, 80) ?? '?'}")`,
      );
      return;
    }

    // Defense layer 3 — clustered-hit gate. A single non-suspect hit does
    // NOT promote to opened. Gmail's image proxy can fetch images for many
    // background reasons (mobile push preview, inbox refresh in another
    // tab, IMAP client sync, classifier scans) — those each look like
    // ordinary GoogleImageProxy hits but are not user-driven. We require
    // a SECOND non-suspect hit within `clusterWindow` of the first; the
    // pattern a real reading session creates as the user scrolls and the
    // proxy re-fetches.
    //
    // Trade-off: a real open whose proxy cached after one fetch will not
    // be marked. The reply-path (`refreshReplies` further down) still
    // back-stamps openedAt the moment a reply lands, so engaged leads
    // are not lost.
    const clusterWindowSeconds = Number(
      process.env.EMAIL_OPEN_CLUSTER_WINDOW_SECONDS ?? 30,
    );
    const clusterWindowStart = new Date(
      now.getTime() - clusterWindowSeconds * 1000,
    );
    const earlierRealHit = await this.prisma.emailPixelHit.findFirst({
      where: {
        emailLogId: log.id,
        suspectedPrefetch: false,
        hitAt: { gte: clusterWindowStart, lt: now },
      },
      orderBy: { hitAt: 'asc' },
      select: { hitAt: true },
    });

    if (!earlierRealHit) {
      this.log.log(
        `email ${log.id} pixel hit NEEDS_CLUSTER (age ${ageSeconds.toFixed(1)}s, single non-suspect hit so far — waiting for a 2nd within ${clusterWindowSeconds}s)`,
      );
      return;
    }

    // Two non-suspect hits within the cluster window — promote to opened,
    // using the FIRST hit's timestamp (more accurate "started reading at"
    // signal than "second image rendered at").
    const promoted = await this.prisma.emailLog.update({
      where: { id: log.id },
      data: { openedAt: earlierRealHit.hitAt },
      select: { leadId: true },
    });
    this.log.log(
      `email ${log.id} marked opened (cluster: 2 hits within ${clusterWindowSeconds}s, openedAt=${earlierRealHit.hitAt.toISOString()})`,
    );
    // Stage automation: only fires on the FIRST real open (null -> set).
    await this.stageAutomation.onEmailOpened(promoted.leadId);
  }

  // ──────────────────────────────────────────────────────────────────────
  // Reply polling
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Pull the Gmail thread for a single log row, store any new replies,
   * mark email_logs.repliedAt the first time a reply lands.
   */
  async refreshReplies(logId: string) {
    const log = await this.prisma.emailLog.findUnique({
      where: { id: logId },
      include: { account: true },
    });
    if (!log) throw new NotFoundException('Email not found');
    if (!log.threadId || !log.accountId) {
      return { fetched: 0, newReplies: 0 };
    }

    // Fail loud if the connected account doesn't have read scope. Caught by
    // the controller and surfaced in the UI.
    if (log.account && !accountHasReadScope(log.account.scopes)) {
      throw new Error(
        'Connected Gmail account is missing the gmail.readonly scope. Disconnect and Connect Gmail again from Settings.',
      );
    }

    const { accessToken, refreshToken } = await this.accounts.getReadyForSend(log.accountId);
    const messages = await this.gmail.fetchThread({
      accessToken,
      refreshToken,
      threadId: log.threadId,
    });

    // Build the set of Gmail message IDs WE sent in this thread (across all
    // logs that share the threadId — covers Reply continuations too).
    const ours = await this.prisma.emailLog.findMany({
      where: { threadId: log.threadId, messageId: { not: null } },
      select: { messageId: true },
    });
    const ourMessageIds = new Set(ours.map((o) => o.messageId).filter(Boolean) as string[]);

    let added = 0;
    for (const m of messages) {
      if (ourMessageIds.has(m.gmailMessageId)) continue;
      const existing = await this.prisma.emailReply.findUnique({
        where: { gmailMessageId: m.gmailMessageId },
      });
      if (existing) continue;

      await this.prisma.emailReply.create({
        data: {
          emailLogId: log.id,
          leadId: log.leadId,
          gmailMessageId: m.gmailMessageId,
          threadId: m.threadId,
          fromEmail: m.fromEmail ?? '',
          fromName: m.fromName ?? null,
          toEmail: m.toEmail ?? null,
          subject: m.subject ?? null,
          snippet: m.snippet ?? null,
          bodyText: m.bodyText ?? null,
          bodyHtml: m.bodyHtml ?? null,
          receivedAt: m.internalDate,
        },
      });
      added += 1;
    }

    // Stage automation: any net-new reply on this thread promotes the lead
    // toward "interested" (forward-only — locked downstream stages stay).
    if (added > 0) {
      await this.stageAutomation.onEmailReplied(log.leadId);
    }

    if (added > 0 && !log.repliedAt) {
      await this.prisma.emailLog.update({
        where: { id: log.id },
        data: { repliedAt: new Date() },
      });
    }

    // Infer "opened" from replies: if the client replied, they obviously
    // read what we sent. Stamp openedAt on every outbound log in this
    // thread that doesn't already have one. The exact open time is fuzzy
    // (we only know the reply time), but matches user expectation: ticks
    // turn green the moment a reply arrives.
    //
    // This also backfills historical sends that never got a pixel hit
    // because the API was on localhost — every poll that sees replies
    // updates them.
    const latestReply = await this.prisma.emailReply.findFirst({
      where: { threadId: log.threadId },
      orderBy: { receivedAt: 'desc' },
      select: { receivedAt: true },
    });
    if (latestReply) {
      await this.prisma.emailLog.updateMany({
        where: { threadId: log.threadId, openedAt: null },
        data: { openedAt: latestReply.receivedAt },
      });
    }

    return { fetched: messages.length, newReplies: added };
  }

  /**
   * Background cron: refresh replies for all logs sent in the last 7 days.
   * Called by the scrape-queue scheduler (we'll wire it on the EmailModule
   * boot — for now it's a manual endpoint).
   */
  /** All recorded pixel hits for one email log, newest first. */
  async listHits(emailLogId: string) {
    return this.prisma.emailPixelHit.findMany({
      where: { emailLogId },
      orderBy: { hitAt: 'desc' },
    });
  }

  async refreshAllRecent(daysBack = 7) {
    const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
    const recent = await this.prisma.emailLog.findMany({
      where: {
        status: 'sent',
        threadId: { not: null },
        sentAt: { gte: since },
      },
      select: { id: true },
      orderBy: { sentAt: 'desc' },
      take: 200,
    });
    let totalNew = 0;
    for (const r of recent) {
      try {
        const { newReplies } = await this.refreshReplies(r.id);
        totalNew += newReplies;
      } catch (e) {
        // ignore individual failures, keep polling the rest
      }
    }
    return { scanned: recent.length, newReplies: totalNew };
  }

  /** Embed the 1×1 tracking pixel into HTML body using the live tunnel URL. */
  private wrapWithTrackingPixel(html: string, trackingId: string): string {
    const base = this.tunnel.publicUrl();
    const px = `<img src="${base}/api/email/track/${trackingId}.gif" alt="" width="1" height="1" style="display:block;border:0;outline:none;width:1px;height:1px" />`;
    return `${html}\n${px}`;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

/** A single message in a thread — outbound (us) or inbound (them). */
export interface ThreadMessage {
  id: string;
  type: 'log' | 'reply';
  direction: 'outbound' | 'inbound';
  timestamp: string;
  fromEmail: string;
  fromName: string | null;
  toEmail: string | null;
  cc: string[];
  subject: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  snippet?: string | null;
  attachments: any[];
  // outbound-only
  status?: string;
  openedAt?: string | null;
  error?: string | null;
}

function logToOutbound(log: any): ThreadMessage {
  return {
    id: log.id,
    type: 'log',
    direction: 'outbound',
    timestamp: (log.sentAt ?? log.createdAt).toISOString(),
    fromEmail: log.fromEmail,
    fromName: log.fromName,
    toEmail: log.toEmail,
    cc: log.cc ?? [],
    subject: log.subject,
    bodyText: log.bodyText,
    bodyHtml: log.bodyHtml,
    attachments: (log.attachments as any[]) ?? [],
    status: log.status,
    openedAt: log.openedAt ? log.openedAt.toISOString() : null,
    error: log.error,
  };
}

/** Convert plain text → minimal HTML so we can inject the tracking pixel. */
function plainToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<div style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#050F1A;white-space:pre-wrap">${escaped}</div>`;
}

