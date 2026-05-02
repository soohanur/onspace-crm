import { Injectable, Logger } from '@nestjs/common';
import { FollowUpStatus } from '@onspace/db';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Recompute `Lead.followUpStatus` from the lead's follow-up tasks.
 *
 * Status precedence (highest priority wins):
 *   overdue   — open follow-up with dueAt < now
 *   scheduled — open follow-up with dueAt > now
 *   needed    — open follow-up with no dueAt set
 *   completed — at least one done follow-up AND no open follow-ups
 *   none      — no follow-up tasks at all
 *
 * General-kind tasks are intentionally ignored: they're free-form to-dos,
 * not a signal about the lead's outreach state.
 *
 * Public API is one method; failures are logged and swallowed because
 * this is called from task mutation paths that must not roll back when
 * the recompute hits a transient DB error.
 */
@Injectable()
export class FollowUpStatusService {
  private readonly log = new Logger(FollowUpStatusService.name);

  constructor(private readonly prisma: PrismaService) {}

  async recompute(leadId: string): Promise<void> {
    try {
      const tasks = await this.prisma.task.findMany({
        where: { leadId, kind: 'followup' },
        select: { status: true, dueAt: true },
      });

      const next = computeStatus(tasks);

      const lead = await this.prisma.lead.findUnique({
        where: { id: leadId },
        select: { followUpStatus: true },
      });
      if (!lead) return;
      if (lead.followUpStatus === next) return;

      await this.prisma.lead.update({
        where: { id: leadId },
        data: { followUpStatus: next },
      });
    } catch (err) {
      this.log.warn(
        `recompute failed for ${leadId}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}

function computeStatus(
  tasks: { status: string; dueAt: Date | null }[],
): FollowUpStatus {
  if (tasks.length === 0) return 'none';

  const now = Date.now();
  let hasOverdue = false;
  let hasScheduled = false;
  let hasNeeded = false;
  let hasOpen = false;
  let hasDone = false;

  for (const t of tasks) {
    const isOpen = t.status === 'open' || t.status === 'in_progress';
    if (isOpen) {
      hasOpen = true;
      if (t.dueAt) {
        if (t.dueAt.getTime() < now) hasOverdue = true;
        else hasScheduled = true;
      } else {
        hasNeeded = true;
      }
    } else if (t.status === 'done') {
      hasDone = true;
    }
  }

  if (hasOverdue) return 'overdue';
  if (hasScheduled) return 'scheduled';
  if (hasNeeded) return 'needed';
  if (hasDone && !hasOpen) return 'completed';
  return 'none';
}
