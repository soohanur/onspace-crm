import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import {
  CAMPAIGNS_QUEUE,
  CAMPAIGN_TICK_JOB,
  ORPHAN_RECOVERY_MINUTES,
} from './campaigns.constants';
import { renderTags, MergeContext } from './merge-tags';

interface TickPayload {
  campaignId: string;
}

/**
 * One-recipient-per-tick processor. Pacing is achieved by scheduling the
 * next tick `sendIntervalSec` seconds after the current send, so we
 * don't run a long-lived per-campaign loop. Concurrency is set to 1 at
 * the queue level — Gmail rate-limit etiquette.
 *
 * Recovery: every tick first picks up any recipient stuck in `sending`
 * for >ORPHAN_RECOVERY_MINUTES and resets it to `pending` so a crashed
 * worker doesn't strand a campaign.
 */
@Processor(CAMPAIGNS_QUEUE, { concurrency: 1 })
export class CampaignsProcessor extends WorkerHost {
  private readonly log = new Logger(CampaignsProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emails: EmailService,
    @InjectQueue(CAMPAIGNS_QUEUE) private readonly queue: Queue,
  ) {
    super();
  }

  async process(job: Job<TickPayload>) {
    const { campaignId } = job.data;
    return this.tick(campaignId);
  }

  /** Public so a controller / test can drive a single tick if needed. */
  async tick(campaignId: string) {
    // 1. Recovery — claim orphaned `sending` rows older than threshold.
    const cutoff = new Date(Date.now() - ORPHAN_RECOVERY_MINUTES * 60 * 1000);
    const orphans = await this.prisma.campaignRecipient.findMany({
      where: { campaignId, status: 'sending', attemptedAt: { lt: cutoff } },
      select: { id: true },
    });
    if (orphans.length) {
      await this.prisma.campaignRecipient.updateMany({
        where: { id: { in: orphans.map((o) => o.id) } },
        data: { status: 'pending', error: 'recovered from orphaned sending state' },
      });
      this.log.warn(`campaign ${campaignId}: recovered ${orphans.length} orphaned sending rows`);
    }

    // 2. Load campaign.
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign) return { stopped: true, reason: 'campaign-not-found' };
    if (!['queued', 'running'].includes(campaign.status)) {
      this.log.log(`campaign ${campaignId} status=${campaign.status} — exiting tick`);
      return { stopped: true, reason: campaign.status };
    }

    // Mark running on the first tick.
    if (campaign.status === 'queued') {
      await this.prisma.campaign.update({
        where: { id: campaignId },
        data: { status: 'running', startedAt: campaign.startedAt ?? new Date() },
      });
    }

    // 3. Daily cap check (UTC start-of-day).
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const sentToday = await this.prisma.emailLog.count({
      where: { accountId: campaign.accountId, sentAt: { gte: startOfDay } },
    });
    if (sentToday >= campaign.dailySendLimit) {
      // Pause until tomorrow midnight UTC.
      const nextMidnight = new Date(startOfDay);
      nextMidnight.setUTCDate(nextMidnight.getUTCDate() + 1);
      const delay = Math.max(60_000, nextMidnight.getTime() - Date.now());
      await this.queue.add(
        CAMPAIGN_TICK_JOB,
        { campaignId },
        {
          jobId: `tick-${campaignId}-${Date.now()}`,
          delay,
          removeOnComplete: 100,
          removeOnFail: 200,
        },
      );
      this.log.warn(
        `campaign ${campaignId}: account daily limit reached (${sentToday}/${campaign.dailySendLimit}); next tick in ${(delay / 1000 / 60).toFixed(0)}m`,
      );
      return { stopped: false, reason: 'daily-limit', sentToday };
    }

    // 4. Pick next pending recipient.
    const next = await this.prisma.campaignRecipient.findFirst({
      where: { campaignId, status: 'pending' },
      orderBy: { createdAt: 'asc' },
    });
    if (!next) {
      // Done — flip campaign to completed if no still-pending and no
      // still-sending remain.
      const remaining = await this.prisma.campaignRecipient.count({
        where: { campaignId, status: { in: ['pending', 'sending'] } },
      });
      if (remaining === 0) {
        await this.prisma.campaign.update({
          where: { id: campaignId },
          data: { status: 'completed', finishedAt: new Date() },
        });
        this.log.log(`campaign ${campaignId} completed`);
      }
      return { stopped: true, reason: 'no-pending' };
    }

    // 5. Reserve the recipient.
    await this.prisma.campaignRecipient.update({
      where: { id: next.id },
      data: { status: 'sending', attemptedAt: new Date() },
    });

    // 6. Build merge context.
    const lead = await this.prisma.lead.findUnique({
      where: { id: next.leadId },
      select: { id: true, businessName: true, ownerName: true, city: true, state: true },
    });
    const primary = await this.prisma.contact.findFirst({
      where: { leadId: next.leadId, isPrimary: true },
      select: { name: true },
    });
    if (!lead) {
      await this.prisma.campaignRecipient.update({
        where: { id: next.id },
        data: { status: 'failed', error: 'lead not found' },
      });
      await this.prisma.campaign.update({
        where: { id: campaignId },
        data: { failedCount: { increment: 1 } },
      });
      this.scheduleNext(campaignId, campaign.sendIntervalSec);
      return { stopped: false, reason: 'lead-missing' };
    }

    const ctx: MergeContext = {
      toEmail: next.toEmail,
      lead: {
        businessName: lead.businessName,
        ownerName: lead.ownerName,
        city: lead.city,
        state: lead.state,
      },
      contact: primary ? { name: primary.name } : null,
    };

    // 7. Render frozen subject + bodies.
    const subj = renderTags(campaign.frozenSubject ?? '', ctx);
    const text = renderTags(campaign.frozenBodyText ?? '', ctx);
    const html = campaign.frozenBodyHtml
      ? renderTags(campaign.frozenBodyHtml, ctx)
      : { output: undefined as string | undefined, missingRequired: [] as string[] };
    const missing = Array.from(
      new Set([
        ...subj.missingRequired,
        ...text.missingRequired,
        ...html.missingRequired,
      ]),
    );

    await this.prisma.campaignRecipient.update({
      where: { id: next.id },
      data: {
        renderedSubject: subj.output,
        renderedBodyText: text.output,
        renderedBodyHtml: html.output ?? null,
      },
    });

    // 8. Required-tag short-circuit.
    if (missing.length > 0) {
      await this.prisma.campaignRecipient.update({
        where: { id: next.id },
        data: {
          status: 'skipped',
          error: `missing required tag(s): ${missing.join(', ')}`,
        },
      });
      await this.prisma.campaign.update({
        where: { id: campaignId },
        data: { skippedCount: { increment: 1 } },
      });
      this.scheduleNext(campaignId, campaign.sendIntervalSec);
      return { stopped: false, reason: 'tag-skip', missing };
    }

    // 9. Send via the unified EmailService path. Stage automation, pixel
    // injection, attachments, MIME building all happen there. We pass
    // campaignId so the dedupe guard kicks in if this tick replays.
    try {
      const sentLog = await this.emails.send({
        leadId: next.leadId,
        accountId: campaign.accountId,
        toEmail: next.toEmail,
        subject: subj.output,
        body: text.output,
        bodyHtml: html.output,
        campaignId: campaign.id,
      });
      await this.prisma.campaignRecipient.update({
        where: { id: next.id },
        data: { status: 'sent', emailLogId: sentLog.id, error: null },
      });
      await this.prisma.campaign.update({
        where: { id: campaignId },
        data: { sentCount: { increment: 1 } },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.prisma.campaignRecipient.update({
        where: { id: next.id },
        data: { status: 'failed', error: msg },
      });
      await this.prisma.campaign.update({
        where: { id: campaignId },
        data: { failedCount: { increment: 1 } },
      });
      this.log.error(`campaign ${campaignId} recipient ${next.id} send failed: ${msg}`);
    }

    // 10. Schedule next tick.
    this.scheduleNext(campaignId, campaign.sendIntervalSec);
    return { stopped: false };
  }

  private async scheduleNext(campaignId: string, intervalSec: number) {
    await this.queue.add(
      CAMPAIGN_TICK_JOB,
      { campaignId },
      {
        jobId: `tick-${campaignId}-${Date.now()}`,
        delay: Math.max(1, intervalSec) * 1000,
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    );
  }
}
