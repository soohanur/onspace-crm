import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { StageAutomationService } from '../leads/stage-automation.service';
import { FollowUpStatusService } from '../leads/followup-status.service';
import { TasksService } from '../tasks/tasks.service';
import { AUTOMATION_QUEUE } from './automation.constants';
import { runNoResponseStageRule } from './rules/no-response-stage.rule';
import { runNoResponseFollowupRule } from './rules/no-response-followup.rule';
import { runEngagedFollowupRule } from './rules/engaged-followup.rule';
import { runPushFollowupRule } from './rules/push-followup.rule';
import { RuleSummary } from './rules/types';

export interface AutomationRunSummary {
  rules: RuleSummary[];
  totalTransitions: number;
  totalCreatedTasks: number;
  durationMs: number;
}

/**
 * Runs the full automation rule chain. Each rule is independent; a
 * failure in one is logged and the rest still run. The chain is the
 * order rules see each other's effects:
 *
 *   1. no-response-stage  → moves leads to no_response
 *   2. no-response-followup → schedules first follow-up for those leads
 *   3. engaged-followup   → nudges leads who opened but didn't reply
 *   4. push-followup      → nudges leads who've been cold for 3+ days
 *
 * After the chain, every lead that had a task created gets its
 * followUpStatus recomputed (TasksService.create already calls recompute,
 * but rules can fail mid-creation and we want to be defensive).
 */
@Processor(AUTOMATION_QUEUE, { concurrency: 1 })
export class AutomationProcessor extends WorkerHost {
  private readonly log = new Logger(AutomationProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stageAutomation: StageAutomationService,
    private readonly tasks: TasksService,
    private readonly followUpStatus: FollowUpStatusService,
  ) {
    super();
  }

  async process(_job: Job): Promise<AutomationRunSummary> {
    return this.runAllRules();
  }

  /** Public for the controller's manual-trigger endpoint and for tests. */
  async runAllRules(): Promise<AutomationRunSummary> {
    const started = Date.now();
    const rules: RuleSummary[] = [];

    rules.push(await this.safe('no-response-stage', () =>
      runNoResponseStageRule(this.prisma, this.stageAutomation),
    ));
    rules.push(await this.safe('no-response-followup', () =>
      runNoResponseFollowupRule(this.prisma, this.tasks),
    ));
    rules.push(await this.safe('engaged-followup', () =>
      runEngagedFollowupRule(this.prisma, this.tasks),
    ));
    rules.push(await this.safe('push-followup', () =>
      runPushFollowupRule(this.prisma, this.tasks),
    ));

    const totalCreatedTasks = rules.reduce((s, r) => s + r.createdTasks, 0);
    const totalTransitions = rules.reduce((s, r) => s + r.transitionedLeads, 0);

    // Defensive recompute: rules normally hit TasksService.create which
    // recomputes per-lead, but if any rule short-circuited mid-loop we
    // re-recompute every lead that has a follow-up to keep state honest.
    if (totalCreatedTasks > 0) {
      const ids = await this.prisma.task.findMany({
        where: { kind: 'followup' },
        select: { leadId: true },
        distinct: ['leadId'],
      });
      for (const { leadId } of ids) {
        await this.followUpStatus.recompute(leadId);
      }
    }

    const durationMs = Date.now() - started;
    this.log.log(
      `automation done: transitions=${totalTransitions} createdTasks=${totalCreatedTasks} (${durationMs}ms)`,
    );
    return { rules, totalTransitions, totalCreatedTasks, durationMs };
  }

  private async safe<T extends RuleSummary>(
    name: string,
    fn: () => Promise<T>,
  ): Promise<RuleSummary> {
    try {
      return await fn();
    } catch (err) {
      this.log.error(
        `rule ${name} failed: ${err instanceof Error ? err.message : err}`,
      );
      return { name, transitionedLeads: 0, createdTasks: 0 };
    }
  }
}
