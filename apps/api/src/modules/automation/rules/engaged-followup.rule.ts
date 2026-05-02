import { Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { TasksService } from '../../tasks/tasks.service';
import { RuleSummary } from './types';

const log = new Logger('Rule:engaged-followup');

/**
 * For every email that was opened more than 24h ago and hasn't received a
 * reply, schedule an `engaged_followup` task on its lead — unless one is
 * already open (idempotency).
 */
export async function runEngagedFollowupRule(
  prisma: PrismaService,
  tasks: TasksService,
): Promise<RuleSummary> {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const opened = await prisma.emailLog.findMany({
    where: {
      openedAt: { lt: oneDayAgo, not: null },
      repliedAt: null,
    },
    select: { leadId: true },
    distinct: ['leadId'],
  });

  let created = 0;
  for (const e of opened) {
    try {
      const existing = await prisma.task.findFirst({
        where: {
          leadId: e.leadId,
          context: 'engaged_followup',
          status: { in: ['open', 'in_progress'] },
        },
        select: { id: true },
      });
      if (existing) continue;

      const due = new Date();
      due.setDate(due.getDate() + 1);
      await tasks.create({
        leadId: e.leadId,
        title: 'Engaged follow-up',
        description:
          'Lead opened the email but did not reply within 24h. Time to nudge.',
        kind: 'followup',
        context: 'engaged_followup',
        priority: 'high',
        dueAt: due.toISOString(),
      });
      created += 1;
    } catch (err) {
      log.warn(
        `lead=${e.leadId} skipped: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  return {
    name: 'engaged-followup',
    transitionedLeads: 0,
    createdTasks: created,
  };
}
