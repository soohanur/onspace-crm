import { Injectable, Logger } from '@nestjs/common';
import { LeadStage } from '@onspace/db';
import { PrismaService } from '../../prisma/prisma.service';
import { TasksService } from '../tasks/tasks.service';
import { ModuleRef } from '@nestjs/core';

type Trigger =
  | 'email_sent'
  | 'email_opened'
  | 'email_replied'
  | 'no_open_3d'
  | 'meeting_scheduled'
  | 'meeting_completed'
  | 'manual';

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

  constructor(
    private readonly prisma: PrismaService,
    private readonly moduleRef: ModuleRef,
  ) {}

  async onEmailSent(leadId: string): Promise<void> {
    await this.transition(
      leadId,
      'email_sent',
      new Set<LeadStage>(['new']),
      'approached',
    );
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
    // Reply rule (Phase 7): a reply now promotes to `engaged`, not
    // `interested`. The user's manual judgment is what moves a lead from
    // engaged -> interested. Lock anything at or beyond engaged so the
    // automation never regresses past manual progress.
    const lockedFromAutomation = new Set<LeadStage>([
      'engaged',
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
      if (lockedFromAutomation.has(lead.stage)) return;
      await this.applyStageChange(leadId, lead.stage, 'engaged', 'email_replied');
    } catch (err) {
      this.log.warn(
        `stage automation email_replied failed for ${leadId}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  /**
   * Called by `LeadsService.updateStage()` AFTER a manual stage change.
   * Currently only one rule: when a user moves a lead to `qualified`,
   * auto-create a `qualified_followup` task (idempotent — only one open
   * task per context per lead).
   */
  async onLeadStageChanged(
    leadId: string,
    fromStage: LeadStage,
    toStage: LeadStage,
  ): Promise<void> {
    if (fromStage === toStage) return;
    try {
      if (toStage === 'qualified') {
        await this.ensureQualifiedFollowup(leadId);
      }
      // Phase 8+ may add more side-effects here.
    } catch (err) {
      this.log.warn(
        `stage automation onLeadStageChanged failed for ${leadId}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  /**
   * Apply a verified-forward stage change. Updates the lead row and
   * stamps `stageChangedAt = now()` so automation rules that key off
   * "time in stage" have a clean signal.
   *
   * `fromStage` is captured by the caller so the caller's read-then-write
   * race window stays small. Skips the write if from === to.
   */
  async applyStageChange(
    leadId: string,
    fromStage: LeadStage,
    toStage: LeadStage,
    trigger: Trigger,
  ): Promise<void> {
    if (fromStage === toStage) return;
    await this.prisma.lead.update({
      where: { id: leadId },
      data: { stage: toStage, stageChangedAt: new Date() },
    });
    this.log.log(
      `[stage] lead=${leadId} ${fromStage} -> ${toStage} via=${trigger}`,
    );
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
      await this.applyStageChange(leadId, lead.stage, to, trigger);
    } catch (err) {
      this.log.warn(
        `stage automation ${trigger} failed for ${leadId}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  /**
   * Phase 10 — meeting scheduled. Promotes any "still in funnel" lead to
   * `booked`. Locked-from-automation set is everything `booked` and
   * beyond, so manual proposal_sent / converted / etc. are never
   * regressed by booking another follow-up call.
   */
  async onMeetingScheduled(leadId: string): Promise<void> {
    await this.transition(
      leadId,
      'meeting_scheduled',
      new Set<LeadStage>([
        'new',
        'approached',
        'no_response',
        'engaged',
        'push',
        'qualified',
        'interested',
      ]),
      'booked',
    );
  }

  /**
   * Phase 10 — meeting completed. Idempotent: creates ONE open
   * `meeting_followup` task per lead. If one already exists, no-op.
   * Title and description pull from the meeting; `nextAction` (set on
   * the meeting at completion time) becomes the task description when
   * present.
   */
  async onMeetingCompleted(meetingId: string): Promise<void> {
    try {
      const meeting = await this.prisma.meeting.findUnique({
        where: { id: meetingId },
        select: { id: true, leadId: true, title: true, nextAction: true },
      });
      if (!meeting) return;

      const existing = await this.prisma.task.findFirst({
        where: {
          leadId: meeting.leadId,
          context: 'meeting_followup',
          status: { in: ['open', 'in_progress'] },
        },
        select: { id: true },
      });
      if (existing) return;

      const tasks = this.moduleRef.get(TasksService, { strict: false });
      const due = new Date();
      due.setDate(due.getDate() + 2);
      const titleBase = meeting.title.trim();
      const title = `Meeting follow-up — ${titleBase}`.slice(0, 200);
      await tasks.create({
        leadId: meeting.leadId,
        title,
        description:
          meeting.nextAction?.trim() ||
          'Meeting completed — schedule the next step.',
        kind: 'followup',
        context: 'meeting_followup',
        priority: 'high',
        dueAt: due.toISOString(),
      });
      this.log.log(
        `[meeting] auto-created meeting_followup task for lead=${meeting.leadId} (meeting=${meetingId})`,
      );
    } catch (err) {
      this.log.warn(
        `stage automation onMeetingCompleted failed for ${meetingId}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  /**
   * Idempotent qualified-follow-up creator. We resolve TasksService at
   * call time via ModuleRef to avoid a hard circular dep at module-init
   * (LeadsModule ⇄ TasksModule) — Tasks already imports the FollowUp
   * status service from this module.
   */
  private async ensureQualifiedFollowup(leadId: string): Promise<void> {
    const existing = await this.prisma.task.findFirst({
      where: {
        leadId,
        context: 'qualified_followup',
        status: { in: ['open', 'in_progress'] },
      },
      select: { id: true },
    });
    if (existing) return;

    const tasks = this.moduleRef.get(TasksService, { strict: false });
    const due = new Date();
    due.setDate(due.getDate() + 2);
    await tasks.create({
      leadId,
      title: 'Qualified follow-up',
      description: 'Lead was qualified — schedule the next step within two days.',
      kind: 'followup',
      context: 'qualified_followup',
      priority: 'high',
      dueAt: due.toISOString(),
    });
  }
}
