import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { CampaignStatus } from '@onspace/db';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { GroupsService } from '../groups/groups.service';
import {
  CAMPAIGNS_QUEUE,
  CAMPAIGN_TICK_JOB,
  MAX_CAMPAIGN_RECIPIENTS,
} from './campaigns.constants';
import { CreateCampaignDto } from './dto';
import { extractRequiredTags, renderTags } from './merge-tags';

@Injectable()
export class CampaignsService {
  private readonly log = new Logger(CampaignsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly groups: GroupsService,
    @InjectQueue(CAMPAIGNS_QUEUE) private readonly queue: Queue,
  ) {}

  // ─── List / detail ──────────────────────────────────────────────────────

  async list(filter: { status?: CampaignStatus[] }) {
    const where = filter.status?.length ? { status: { in: filter.status } } : {};
    const rows = await this.prisma.campaign.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        group:    { select: { id: true, name: true } },
        template: { select: { id: true, name: true } },
        account:  { select: { id: true, email: true, displayName: true } },
        _count:   { select: { recipients: true, emailLogs: true } },
      },
    });
    return Promise.all(rows.map((r) => this.shapeWithStats(r)));
  }

  async findOne(id: string) {
    const c = await this.prisma.campaign.findUnique({
      where: { id },
      include: {
        group:    { select: { id: true, name: true } },
        template: { select: { id: true, name: true } },
        account:  { select: { id: true, email: true, displayName: true } },
        _count:   { select: { recipients: true, emailLogs: true } },
      },
    });
    if (!c) throw new NotFoundException('Campaign not found');
    return this.shapeWithStats(c);
  }

  async listRecipients(
    id: string,
    filter: { status?: string[]; take?: number; cursor?: string } = {},
  ) {
    const c = await this.prisma.campaign.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Campaign not found');
    const where: any = { campaignId: id };
    if (filter.status?.length) where.status = { in: filter.status };
    const take = Math.min(Math.max(filter.take ?? 50, 1), 200);
    const items = await this.prisma.campaignRecipient.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      take: take + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      include: {
        lead:    { select: { id: true, businessName: true, stage: true } },
        contact: { select: { id: true, name: true } },
      },
    });
    const hasMore = items.length > take;
    return {
      items: hasMore ? items.slice(0, take) : items,
      nextCursor: hasMore ? items[take - 1]?.id ?? null : null,
    };
  }

  // ─── Create + recipient resolution ──────────────────────────────────────

  async create(dto: CreateCampaignDto) {
    // Validate FKs early so we don't half-construct.
    const [group, template, account] = await Promise.all([
      this.prisma.leadGroup.findUnique({ where: { id: dto.groupId } }),
      this.prisma.emailTemplate.findUnique({ where: { id: dto.templateId } }),
      this.prisma.emailAccount.findUnique({ where: { id: dto.accountId } }),
    ]);
    if (!group) throw new NotFoundException('Group not found');
    if (!template) throw new NotFoundException('Template not found');
    if (!account) throw new NotFoundException('Email account not found');
    if (!account.active) {
      throw new BadRequestException('Email account is not active');
    }

    // Pull leads (resolved manual or smart by GroupsService).
    const { items: leads } = await this.groups.listLeads(dto.groupId, MAX_CAMPAIGN_RECIPIENTS + 1);
    if (leads.length > MAX_CAMPAIGN_RECIPIENTS) {
      throw new UnprocessableEntityException(
        `Campaign cap is ${MAX_CAMPAIGN_RECIPIENTS} recipients per campaign`,
      );
    }

    const leadIds = leads.map((l) => l.id);

    // Find primary contacts for these leads in one query.
    const primaries = leadIds.length
      ? await this.prisma.contact.findMany({
          where: { leadId: { in: leadIds }, isPrimary: true },
          select: { id: true, leadId: true, email: true },
        })
      : [];
    const primaryByLead = new Map<string, { id: string; email: string | null }>();
    for (const p of primaries) primaryByLead.set(p.leadId, { id: p.id, email: p.email });

    let resolved = 0;
    let skippedNoEmail = 0;
    let dedupedDuplicates = 0;
    const seenEmails = new Set<string>();
    const rows: {
      leadId: string;
      contactId: string | null;
      toEmail: string;
    }[] = [];

    for (const lead of leads) {
      const primary = primaryByLead.get(lead.id);
      const fromContact = primary?.email?.trim();
      const fromLead = lead.email?.trim();
      const toEmail = fromContact || fromLead || null;
      if (!toEmail) {
        skippedNoEmail += 1;
        continue;
      }
      const key = toEmail.toLowerCase();
      if (seenEmails.has(key)) {
        dedupedDuplicates += 1;
        continue;
      }
      seenEmails.add(key);
      rows.push({
        leadId: lead.id,
        contactId: fromContact ? primary!.id : null,
        toEmail,
      });
      resolved += 1;
    }

    const campaign = await this.prisma.$transaction(async (tx) => {
      const created = await tx.campaign.create({
        data: {
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
          groupId: dto.groupId,
          templateId: dto.templateId,
          accountId: dto.accountId,
          dailySendLimit: dto.dailySendLimit ?? 250,
          sendIntervalSec: dto.sendIntervalSec ?? 12,
          recipientCount: resolved,
        },
      });
      if (rows.length) {
        await tx.campaignRecipient.createMany({
          data: rows.map((r) => ({ campaignId: created.id, ...r })),
        });
      }
      return created;
    });

    return {
      campaign,
      resolution: { resolved, skippedNoEmail, dedupedDuplicates },
    };
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────

  async start(id: string, acceptSkipped: boolean) {
    const c = await this.prisma.campaign.findUnique({
      where: { id },
      include: { template: true, recipients: true },
    });
    if (!c) throw new NotFoundException('Campaign not found');
    if (c.status !== 'draft') {
      throw new BadRequestException(`Campaign cannot start from status ${c.status}`);
    }

    // Required-tag scan: union of (subject, bodyText, bodyHtml ?? '')
    const tagsRequired = new Set<string>([
      ...extractRequiredTags(c.template.subject),
      ...extractRequiredTags(c.template.bodyText),
      ...extractRequiredTags(c.template.bodyHtml ?? ''),
    ]);
    let wouldSkip = 0;
    if (tagsRequired.size > 0) {
      // Pull lead + primary contact data for each pending recipient and
      // dry-run the merge. Only count recipients still pending.
      const pending = c.recipients.filter((r) => r.status === 'pending');
      const leadIds = pending.map((r) => r.leadId);
      const leads = leadIds.length
        ? await this.prisma.lead.findMany({
            where: { id: { in: leadIds } },
            select: { id: true, ownerName: true, businessName: true, city: true, state: true },
          })
        : [];
      const leadById = new Map(leads.map((l) => [l.id, l]));
      const primaries = leadIds.length
        ? await this.prisma.contact.findMany({
            where: { leadId: { in: leadIds }, isPrimary: true },
            select: { id: true, leadId: true, name: true },
          })
        : [];
      const primaryByLead = new Map(primaries.map((p) => [p.leadId, p]));
      for (const r of pending) {
        const lead = leadById.get(r.leadId);
        if (!lead) continue;
        const ctx = {
          toEmail: r.toEmail,
          lead: {
            businessName: lead.businessName,
            ownerName: lead.ownerName,
            city: lead.city,
            state: lead.state,
          },
          contact: primaryByLead.get(r.leadId)
            ? { name: primaryByLead.get(r.leadId)!.name }
            : null,
        };
        const subj = renderTags(c.template.subject, ctx);
        const body = renderTags(c.template.bodyText, ctx);
        const all = new Set([...subj.missingRequired, ...body.missingRequired]);
        if (all.size > 0) wouldSkip += 1;
      }
      if (wouldSkip > 0 && !acceptSkipped) {
        throw new UnprocessableEntityException({
          message: `${wouldSkip} of ${c.recipients.length} recipients would be skipped due to missing required tags. Re-call with ?acceptSkipped=1 to proceed.`,
          wouldSkip,
          total: c.recipients.length,
        });
      }
    }

    // Freeze + flip to queued + enqueue.
    const updated = await this.prisma.campaign.update({
      where: { id },
      data: {
        status: 'queued',
        frozenSubject:  c.template.subject,
        frozenBodyText: c.template.bodyText,
        frozenBodyHtml: c.template.bodyHtml ?? null,
        startedAt: c.startedAt ?? new Date(),
      },
    });
    await this.queue.add(
      CAMPAIGN_TICK_JOB,
      { campaignId: id },
      { jobId: `tick-${id}-${Date.now()}`, removeOnComplete: 100, removeOnFail: 200 },
    );
    this.log.log(`campaign ${id} started (wouldSkip=${wouldSkip})`);
    return { campaign: updated, wouldSkip };
  }

  async pause(id: string) {
    const c = await this.prisma.campaign.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Campaign not found');
    if (!['queued', 'running'].includes(c.status)) {
      throw new BadRequestException(`Cannot pause from status ${c.status}`);
    }
    return this.prisma.campaign.update({
      where: { id },
      data: { status: 'paused' },
    });
  }

  async resume(id: string) {
    const c = await this.prisma.campaign.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Campaign not found');
    if (c.status !== 'paused') {
      throw new BadRequestException(`Cannot resume from status ${c.status}`);
    }
    const updated = await this.prisma.campaign.update({
      where: { id },
      data: { status: 'queued' },
    });
    await this.queue.add(
      CAMPAIGN_TICK_JOB,
      { campaignId: id },
      { jobId: `tick-${id}-${Date.now()}`, removeOnComplete: 100, removeOnFail: 200 },
    );
    return updated;
  }

  async cancel(id: string) {
    const c = await this.prisma.campaign.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Campaign not found');
    if (['completed', 'failed', 'cancelled'].includes(c.status)) {
      return c;
    }
    return this.prisma.campaign.update({
      where: { id },
      data: { status: 'cancelled', finishedAt: new Date() },
    });
  }

  async remove(id: string) {
    const c = await this.prisma.campaign.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Campaign not found');
    if (!['draft', 'cancelled', 'failed', 'completed'].includes(c.status)) {
      throw new ConflictException(
        `Cannot delete a ${c.status} campaign — pause + cancel first`,
      );
    }
    await this.prisma.campaign.delete({ where: { id } });
    return { ok: true as const };
  }

  // ─── Stats helper ───────────────────────────────────────────────────────

  private async shapeWithStats(c: any) {
    const [openedCount, repliedCount, bouncedCount] = await Promise.all([
      this.prisma.emailLog.count({
        where: { campaignId: c.id, openedAt: { not: null } },
      }),
      this.prisma.emailLog.count({
        where: { campaignId: c.id, repliedAt: { not: null } },
      }),
      this.prisma.emailLog.count({
        where: { campaignId: c.id, bouncedAt: { not: null } },
      }),
    ]);
    return {
      ...c,
      openedCount,
      repliedCount,
      bouncedCount,
    };
  }
}
