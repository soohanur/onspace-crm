import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@onspace/db';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailAccountsService } from './email-accounts.service';
import { GmailService, AttachmentInput } from './gmail.service';
import { saveAttachment, StoredAttachment } from './attachments';

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

    // 3. Inject open-tracking pixel into HTML body.
    const finalBodyHtml = wrapWithTrackingPixel(
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
  // Reads
  // ──────────────────────────────────────────────────────────────────────

  async listForLead(leadId: string, take = 50) {
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      select: { id: true },
    });
    if (!lead) throw new NotFoundException('Lead not found');
    return this.prisma.emailLog.findMany({
      where: { leadId },
      orderBy: { createdAt: 'desc' },
      take,
      include: {
        replies: { orderBy: { receivedAt: 'asc' } },
      },
    });
  }

  async findOne(id: string) {
    const log = await this.prisma.emailLog.findUnique({
      where: { id },
      include: {
        replies: { orderBy: { receivedAt: 'asc' } },
      },
    });
    if (!log) throw new NotFoundException('Email not found');
    return log;
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

    const { accessToken, refreshToken } = await this.accounts.getReadyForSend(log.accountId);
    const messages = await this.gmail.fetchThread({
      accessToken,
      refreshToken,
      threadId: log.threadId,
    });

    let added = 0;
    for (const m of messages) {
      // Skip messages WE sent (matching gmailMessageId of any sent log).
      if (m.gmailMessageId === log.messageId) continue;
      // Skip if already stored.
      const existing = await this.prisma.emailReply.findUnique({
        where: { gmailMessageId: m.gmailMessageId },
      });
      if (existing) continue;
      // Skip messages from ourselves (the connected account email).
      if (
        m.fromEmail &&
        log.fromEmail &&
        m.fromEmail.toLowerCase() === log.fromEmail.toLowerCase()
      ) {
        continue;
      }

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
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

/** Convert plain text → minimal HTML so we can inject the tracking pixel. */
function plainToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<div style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#050F1A;white-space:pre-wrap">${escaped}</div>`;
}

function wrapWithTrackingPixel(html: string, trackingId: string): string {
  const base =
    process.env.PUBLIC_API_URL ||
    `http://localhost:${process.env.API_PORT || 4000}`;
  const px = `<img src="${base}/api/email/track/${trackingId}.gif" alt="" width="1" height="1" style="display:block;border:0;outline:none;width:1px;height:1px" />`;
  return `${html}\n${px}`;
}
