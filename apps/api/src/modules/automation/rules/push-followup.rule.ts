import { Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { TasksService } from '../../tasks/tasks.service';
import { RuleSummary } from './types';

const log = new Logger('Rule:push-followup');

/**
 * For every lead currently in `no_response` whose stageChangedAt is more
 * than 3 days old, schedule a `push_followup` task — unless one is
 * already open. Uses `stage_changed_at` (added Phase 7) instead of
 * `updated_at` so unrelated column writes don't reset the clock.
 */
export async function runPushFollowupRule(
  prisma: PrismaService,
  tasks: TasksService,
): Promise<RuleSummary> {
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

  const cold = await prisma.lead.findMany({
    where: {
      stage: 'no_response',
      OR: [
        { stageChangedAt: { lt: threeDaysAgo } },
        // Defensive fallback: if backfill missed somehow, fall back to
        // createdAt so we don't silently skip pre-Phase-7 rows.
        { stageChangedAt: null, createdAt: { lt: threeDaysAgo } },
      ],
    },
    select: { id: true },
  });

  let created = 0;
  for (const l of cold) {
    try {
      const existing = await prisma.task.findFirst({
        where: {
          leadId: l.id,
          context: 'push_followup',
          status: { in: ['open', 'in_progress'] },
        },
        select: { id: true },
      });
      if (existing) continue;

      const due = new Date();
      due.setDate(due.getDate() + 2);
      await tasks.create({
        leadId: l.id,
        title: 'Push follow-up — cold lead',
        description:
          'Lead has been in no_response for 3+ days. Try a different channel or pause.',
        kind: 'followup',
        context: 'push_followup',
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
    name: 'push-followup',
    transitionedLeads: 0,
    createdTasks: created,
  };
}
