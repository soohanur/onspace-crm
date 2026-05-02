import { Injectable, Logger } from '@nestjs/common';
import { LeadStage } from '@onspace/db';
import { PrismaService } from '../../prisma/prisma.service';

type Trigger = 'email_sent' | 'email_opened' | 'email_replied';

/**
 * Forward-only stage transitions driven by email events. Each rule defines
 * the set of source stages it acts on and the target stage. If the lead is
 * already past the rule's source set, the call is a no-op — the user's
 * manual progress is never regressed.
 *
 * All public methods swallow their own errors so a misfire here cannot
 * fail the parent send / open / reply operation.
 */
@Injectable()
export class StageAutomationService {
  private readonly log = new Logger(StageAutomationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onEmailSent(leadId: string): Promise<void> {
    await this.transition(leadId, 'email_sent', new Set<LeadStage>(['new']), 'approached');
  }

  async onEmailOpened(leadId: string): Promise<void> {
    await this.transition(
      leadId,
      'email_opened',
      new Set<LeadStage>(['new', 'approached']),
      'engaged',
    );
  }

  async onEmailReplied(leadId: string): Promise<void> {
    // Reply rule: promote to "interested" UNLESS the user has already
    // classified the lead at or beyond a downstream stage. Qualified is in
    // this set — once the user has personally judged a lead as qualified,
    // a stray reply shouldn't bump them back to "interested" (which sits
    // earlier in the user's mental funnel).
    const lockedDownstream = new Set<LeadStage>([
      'qualified',
      'interested',
      'booked',
      'proposal_sent',
      'converted',
      'not_converted',
      'lost',
    ]);
    try {
      const lead = await this.prisma.lead.findUnique({
        where: { id: leadId },
        select: { stage: true },
      });
      if (!lead) return;
      if (lockedDownstream.has(lead.stage)) return;
      await this.prisma.lead.update({
        where: { id: leadId },
        data: { stage: 'interested' },
      });
      this.log.log(`[stage] lead=${leadId} ${lead.stage} -> interested via=email_replied`);
    } catch (err) {
      this.log.warn(
        `stage automation email_replied failed for ${leadId}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  private async transition(
    leadId: string,
    trigger: Trigger,
    fromSet: Set<LeadStage>,
    to: LeadStage,
  ): Promise<void> {
    try {
      const lead = await this.prisma.lead.findUnique({
        where: { id: leadId },
        select: { stage: true },
      });
      if (!lead) return;
      if (!fromSet.has(lead.stage)) return;
      if (lead.stage === to) return;
      await this.prisma.lead.update({
        where: { id: leadId },
        data: { stage: to },
      });
      this.log.log(`[stage] lead=${leadId} ${lead.stage} -> ${to} via=${trigger}`);
    } catch (err) {
      this.log.warn(
        `stage automation ${trigger} failed for ${leadId}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}
