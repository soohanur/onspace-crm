import { Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { TasksService } from '../../tasks/tasks.service';
import { RuleSummary } from './types';

const log = new Logger('Rule:no-response-followup');

/**
 * For every lead currently in `no_response` (after the stage rule has
 * run), create a `no_response_followup` task IF no open one exists. The
 * idempotency key is (leadId, context, status='open'|'in_progress').
 */
export async function runNoResponseFollowupRule(
  prisma: PrismaService,
  tasks: TasksService,
): Promise<RuleSummary> {
  const leads = await prisma.lead.findMany({
    where: { stage: 'no_response' },
    select: { id: true },
  });

  let created = 0;
  for (const l of leads) {
    try {
      const existing = await prisma.task.findFirst({
        where: {
          leadId: l.id,
          context: 'no_response_followup',
          status: { in: ['open', 'in_progress'] },
        },
        select: { id: true },
      });
      if (existing) continue;

      const due = new Date();
      due.setDate(due.getDate() + 1);
      await tasks.create({
        leadId: l.id,
        title: 'No response follow-up',
        description:
          'No open detected on first email after 3 days. Try a different angle.',
        kind: 'followup',
        context: 'no_response_followup',
        priority: 'medium',
        dueAt: due.toISOString(),
      });
      created += 1;
    } catch (err) {
      log.warn(
        `lead=${l.id} skipped: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  return {
    name: 'no-response-followup',
    transitionedLeads: 0,
    createdTasks: created,
  };
}
