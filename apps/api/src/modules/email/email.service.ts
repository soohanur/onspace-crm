import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@onspace/db';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailAccountsService } from './email-accounts.service';
import { GmailService, AttachmentInput } from './gmail.service';
import { saveAttachment, StoredAttachment } from './attachments';
import { accountHasReadScope } from './scopes';
import { TunnelService } from './tunnel.service';

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
}

@Injectable()
export class EmailService {
  private readonly log = new Logger(EmailService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: EmailAccountsService,
    private readonly gmail: GmailService,
    private readonly tunnel: TunnelService,
  ) {}

  async send(input: SendInput) {
    const lead = await this.prisma.lead.findUnique({
      where: { id: input.leadId },
      select: { id: true, businessName: true },
    });
    if (!lead) throw new NotFoundException('Lead not found');

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
      include: { replies: { orderBy: { receivedAt: 'asc' } } },
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
      include: { replies: { orderBy: { receivedAt: 'asc' } } },
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
   * Set openedAt on first pixel hit. Idempotent — later opens don't update.
   * Returns the email log id even if not found, so the controller can serve
   * the GIF regardless.
   */
  async recordOpen(trackingId: string): Promise<void> {
    const log = await this.prisma.emailLog.findUnique({
      where: { trackingId },
      select: { id: true, openedAt: true },
    });
    if (!log || log.openedAt) return;
    await this.prisma.emailLog.update({
      where: { id: log.id },
      data: { openedAt: new Date() },
    });
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

