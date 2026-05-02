import { Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { StageAutomationService } from '../../leads/stage-automation.service';
import { RuleSummary } from './types';

const log = new Logger('Rule:no-response-stage');

/**
 * Promote leads from `approached` to `no_response` when their first sent
 * email had no open within 3 days AND no later email on the same lead has
 * been opened either.
 */
export async function runNoResponseStageRule(
  prisma: PrismaService,
  stageAutomation: StageAutomationService,
): Promise<RuleSummary> {
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

  // Candidates: leads who have at least one sent-but-unopened email older
  // than 3 days. Re-checked per lead below to confirm the lead is still in
  // `approached` AND has zero opens across ALL their email logs.
  const candidates = await prisma.emailLog.groupBy({
    by: ['leadId'],
    where: {
      status: 'sent',
      openedAt: null,
      sentAt: { lt: threeDaysAgo },
    },
  });

  let transitioned = 0;
  for (const c of candidates) {
    try {
      const lead = await prisma.lead.findUnique({
        where: { id: c.leadId },
        select: { id: true, stage: true },
      });
      if (!lead || lead.stage !== 'approached') continue;

      const opensAcrossLead = await prisma.emailLog.count({
        where: { leadId: lead.id, openedAt: { not: null } },
      });
      if (opensAcrossLead > 0) continue;

      await stageAutomation.applyStageChange(
        lead.id,
        'approached',
        'no_response',
        'no_open_3d',
      );
      transitioned += 1;
    } catch (err) {
      log.warn(
        `lead=${c.leadId} skipped: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  return {
    name: 'no-response-stage',
    transitionedLeads: transitioned,
    createdTasks: 0,
  };
}
