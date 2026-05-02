import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@onspace/db';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { saveAttachment, StoredAttachment } from '../email/attachments';
import { StageAutomationService } from '../leads/stage-automation.service';

const toJson = (v: unknown): Prisma.InputJsonValue =>
  (v ?? []) as Prisma.InputJsonValue;

const PROPOSAL_INCLUDE = {
  lead:    { select: { id: true, businessName: true, stage: true } },
  contact: { select: { id: true, name: true, email: true, contactType: true } },
  account: { select: { id: true, email: true, displayName: true } },
  emailLog: {
    select: {
      id: true,
      subject: true,
      status: true,
      sentAt: true,
      openedAt: true,
      repliedAt: true,
      threadId: true,
    },
  },
} as const;

export interface ProposalSendInput {
  leadId: string;
  contactId?: string | null;
  accountId?: string | null;
  subject: string;
  message: string;
  files: { filename: string; mimeType: string; buffer: Buffer; size: number }[];
}

@Injectable()
export class ProposalsService {
  private readonly log = new Logger(ProposalsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly stageAutomation: StageAutomationService,
  ) {}

  // ─── Reads ─────────────────────────────────────────────────────────────

  async listForLead(leadId: string) {
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      select: { id: true },
    });
    if (!lead) throw new NotFoundException('Lead not found');
    return this.prisma.proposal.findMany({
      where: { leadId },
      orderBy: { createdAt: 'desc' },
      include: PROPOSAL_INCLUDE,
    });
  }

  async findOne(id: string) {
    const p = await this.prisma.proposal.findUnique({
      where: { id },
      include: PROPOSAL_INCLUDE,
    });
    if (!p) throw new NotFoundException('Proposal not found');
    return p;
  }

  async remove(id: string) {
    const existing = await this.prisma.proposal.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Proposal not found');
    // Hard delete the proposal row only — the linked EmailLog stays so the
    // chat drawer / audit history remains intact.
    await this.prisma.proposal.delete({ where: { id } });
    return { ok: true as const };
  }

  // ─── Send ──────────────────────────────────────────────────────────────

  async send(input: ProposalSendInput) {
    if (input.files.length === 0) {
      throw new BadRequestException('At least one attachment is required');
    }
    const lead = await this.prisma.lead.findUnique({
      where: { id: input.leadId },
      select: { id: true, email: true },
    });
    if (!lead) throw new NotFoundException('Lead not found');

    if (input.contactId) {
      const c = await this.prisma.contact.findUnique({
        where: { id: input.contactId },
        select: { leadId: true, email: true },
      });
      if (!c || c.leadId !== input.leadId) {
        throw new BadRequestException('Contact does not belong to lead');
      }
    }

    // Resolve account: explicit → most-recent EmailAccount used for this
    // lead → first active. We don't fail if none — EmailService.send will.
    const accountId = await this.resolveAccountId(input.leadId, input.accountId ?? null);

    // Resolve recipient: explicit contact email → primary contact email →
    // lead.email. 422 if nothing usable.
    const toEmail = await this.resolveRecipient(input.leadId, input.contactId ?? null, lead.email);
    if (!toEmail) {
      throw new UnprocessableEntityException('No resolvable email for this lead');
    }

    // Insert the Proposal row (draft) BEFORE saving files so the directory
    // path can use proposal.id.
    const proposal = await this.prisma.proposal.create({
      data: {
        leadId: input.leadId,
        contactId: input.contactId ?? null,
        accountId: accountId ?? null,
        subject: input.subject.trim(),
        message: input.message,
        toEmail,
        status: 'draft',
      },
    });

    // Save attachment files. We reuse `saveAttachment(emailLogId, ...)`
    // but pass the proposal.id instead — it's just a directory key. Once
    // the EmailLog is created we mirror the same files into the email_logs
    // dir via `saveAttachment(log.id)` for the standard download path.
    let stored: StoredAttachment[] = [];
    try {
      stored = await Promise.all(
        input.files.map((f) =>
          saveAttachment(proposal.id, {
            originalname: f.filename,
            mimetype: f.mimeType,
            buffer: f.buffer,
            size: f.size,
          }),
        ),
      );
      await this.prisma.proposal.update({
        where: { id: proposal.id },
        data: { attachments: toJson(stored) },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log.warn(`[proposal:${proposal.id}] attachment save failed: ${msg}`);
      await this.prisma.proposal.update({
        where: { id: proposal.id },
        data: { status: 'failed', error: msg },
      });
      throw err;
    }

    // Send via EmailService — this writes the EmailLog AND saves files in
    // the email_logs/<id>/ directory the chat-drawer download endpoint
    // already serves. EmailService also fires onEmailSent stage automation
    // (new -> approached); our onProposalSent fires AFTER and overrides
    // forward to proposal_sent.
    try {
      const log = await this.email.send({
        leadId: input.leadId,
        accountId: accountId ?? undefined,
        toEmail,
        subject: input.subject.trim(),
        body: input.message,
        attachments: input.files,
        proposalId: proposal.id,
      });

      const updated = await this.prisma.proposal.update({
        where: { id: proposal.id },
        data: {
          status: 'sent',
          emailLogId: log.id,
          sentAt: new Date(),
          error: null,
        },
        include: PROPOSAL_INCLUDE,
      });

      // Forward-only stage promotion + idempotent proposal_followup task.
      // Wrapped internally; never bubbles a failure to the caller.
      await this.stageAutomation.onProposalSent(input.leadId);

      return updated;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log.error(`[proposal:${proposal.id}] send failed: ${msg}`);
      await this.prisma.proposal.update({
        where: { id: proposal.id },
        data: { status: 'failed', error: msg },
      });
      throw err;
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────

  private async resolveAccountId(
    leadId: string,
    explicit: string | null,
  ): Promise<string | null> {
    if (explicit) {
      const a = await this.prisma.emailAccount.findUnique({
        where: { id: explicit },
        select: { id: true, active: true },
      });
      if (a?.active) return a.id;
    }
    const recentLog = await this.prisma.emailLog.findFirst({
      where: { leadId, accountId: { not: null } },
      orderBy: { sentAt: 'desc' },
      select: { accountId: true },
    });
    if (recentLog?.accountId) {
      const a = await this.prisma.emailAccount.findUnique({
        where: { id: recentLog.accountId },
        select: { id: true, active: true },
      });
      if (a?.active) return a.id;
    }
    const fallback = await this.prisma.emailAccount.findFirst({
      where: { active: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    return fallback?.id ?? null;
  }

  private async resolveRecipient(
    leadId: string,
    contactId: string | null,
    leadEmail: string | null,
  ): Promise<string | null> {
    if (contactId) {
      const c = await this.prisma.contact.findUnique({
        where: { id: contactId },
        select: { email: true },
      });
      if (c?.email) return c.email;
    }
    const primary = await this.prisma.contact.findFirst({
      where: { leadId, isPrimary: true, email: { not: null } },
      select: { email: true },
    });
    if (primary?.email) return primary.email;
    return leadEmail ?? null;
  }
}
