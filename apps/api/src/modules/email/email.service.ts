import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailAccountsService } from './email-accounts.service';
import { GmailService } from './gmail.service';
import { SendEmailDto } from './dto';

@Injectable()
export class EmailService {
  private readonly log = new Logger(EmailService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: EmailAccountsService,
    private readonly gmail: GmailService,
  ) {}

  async send(dto: SendEmailDto) {
    const lead = await this.prisma.lead.findUnique({
      where: { id: dto.leadId },
      select: { id: true, businessName: true },
    });
    if (!lead) throw new NotFoundException('Lead not found');

    const { account, accessToken, refreshToken } = await this.accounts.getReadyForSend(
      dto.accountId ?? null,
    );

    // 1. Insert log row in `sending` state so the UI sees the attempt even if
    //    the API process dies mid-send.
    const log = await this.prisma.emailLog.create({
      data: {
        leadId: dto.leadId,
        accountId: account.id,
        fromEmail: account.email,
        fromName: account.displayName ?? null,
        toEmail: dto.toEmail,
        cc: dto.cc ?? [],
        bcc: dto.bcc ?? [],
        subject: dto.subject,
        bodyText: dto.body,
        bodyHtml: dto.bodyHtml ?? null,
        status: 'sending',
        provider: 'gmail',
      },
    });

    // 2. Send via Gmail API.
    try {
      const result = await this.gmail.sendMail({
        accessToken,
        refreshToken,
        fromEmail: account.email,
        fromName: account.displayName,
        to: dto.toEmail,
        cc: dto.cc,
        bcc: dto.bcc,
        subject: dto.subject,
        bodyText: dto.body,
        bodyHtml: dto.bodyHtml,
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
      const updated = await this.prisma.emailLog.update({
        where: { id: log.id },
        data: { status: 'failed', error: message },
      });
      // Re-throw so the controller returns 500 to the client. The log row
      // remains so the UI can show what failed.
      throw new Error(`Gmail send failed: ${message}`);
    }
  }

  /** Per-lead history, most recent first. */
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
      select: {
        id: true,
        leadId: true,
        accountId: true,
        fromEmail: true,
        fromName: true,
        toEmail: true,
        cc: true,
        bcc: true,
        subject: true,
        status: true,
        provider: true,
        messageId: true,
        threadId: true,
        error: true,
        openedAt: true,
        repliedAt: true,
        sentAt: true,
        createdAt: true,
      },
    });
  }
}
