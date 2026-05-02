import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { LeadStage } from '@onspace/db';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { renderTags, MergeContext } from '../campaigns/merge-tags';
import {
  SEQUENCES_QUEUE,
  SEQUENCES_TICK_BATCH_SIZE,
  SEQUENCE_STOP_STAGES,
} from './sequences.constants';

const STOP_SET = new Set<LeadStage>(SEQUENCE_STOP_STAGES);

/**
 * Phase 18 — drip sequence processor. Single tick scans every active
 * enrollment due now (across ALL sequences) up to the per-tick batch
 * size, evaluates stop conditions, renders the next step's template,
 * sends via EmailService, and advances the cursor.
 *
 * Per-account daily caps: tracked in a Map across the tick so we skip
 * remaining enrollments on capped accounts without re-querying. Inter-
 * send sleeps respect each sequence's `sendIntervalSec`.
 *
 * Failure mode: a single send throwing leaves the enrollment `active`
 * with no advance — the next tick retries. The EmailService dedupe
 * guard on `sequenceEnrollmentSendId` prevents double-sends if the
 * tick replays after a partial success.
 */
@Processor(SEQUENCES_QUEUE, { concurrency: 1 })
export class SequencesProcessor extends WorkerHost {
  private readonly log = new Logger(SequencesProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emails: EmailService,
  ) {
    super();
  }

  async process(_job: Job) {
    return this.tick();
  }

  /** Public so a controller / test can drive a single tick if needed. */
  async tick() {
    if (process.env.SEQUENCES_DISABLED === '1') {
      return { stopped: true, reason: 'disabled-env' };
    }

    const now = new Date();
    const due = await this.prisma.sequenceEnrollment.findMany({
      where: { status: 'active', nextSendAt: { lte: now } },
      orderBy: { nextSendAt: 'asc' },
      take: SEQUENCES_TICK_BATCH_SIZE,
      include: {
        sequence: {
          include: { steps: { orderBy: { order: 'asc' } } },
        },
        lead: {
          select: {
            id: true,
            businessName: true,
            ownerName: true,
            city: true,
            state: true,
            stage: true,
            email: true,
          },
        },
      },
    });

    if (due.length === 0) return { stopped: true, reason: 'no-due' };

    // Daily-cap memo: per-account remaining quota. We compute baseline
    // sentToday for each account on first encounter and decrement as we
    // send; once an account hits 0 we skip remaining enrollments on it.
    const remainingByAccount = new Map<string, number>();
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);

    let sent = 0;
    let exited = 0;
    let skipped = 0;
    let lastSentAccount: string | null = null;

    for (const enrollment of due) {
      const seq = enrollment.sequence;
      // Sequence-level guards (status flipped between tick start and now).
      if (seq.status !== 'active') {
        skipped += 1;
        continue;
      }

      // Step lookup — terminal completion when the cursor walks past the
      // last step.
      const step = seq.steps.find((s) => s.order === enrollment.nextStepOrder);
      if (!step) {
        await this.markCompleted(enrollment.id, seq.id);
        exited += 1;
        continue;
      }

      // Stop on stage progression.
      if (
        step.stopOnStageProgression &&
        STOP_SET.has(enrollment.lead.stage)
      ) {
        await this.markExited(
          enrollment.id,
          seq.id,
          'exited_stage',
          `lead progressed to ${enrollment.lead.stage}`,
        );
        exited += 1;
        continue;
      }

      // Stop on reply — check if any prior send on THIS enrollment has a
      // linked email_log with repliedAt set. We scope to this enrollment
      // (not the entire lead's reply history) so re-using a sequence
      // after an unrelated reply doesn't block.
      if (step.stopOnReply) {
        const replied = await this.prisma.sequenceEnrollmentSend.findFirst({
          where: {
            enrollmentId: enrollment.id,
            emailLog: { repliedAt: { not: null } },
          },
          select: { id: true, stepOrder: true },
        });
        if (replied) {
          await this.markExited(
            enrollment.id,
            seq.id,
            'exited_replied',
            `replied to step ${replied.stepOrder}`,
          );
          exited += 1;
          continue;
        }
      }

      // Daily cap check.
      let remaining = remainingByAccount.get(seq.accountId);
      if (remaining === undefined) {
        const sentToday = await this.prisma.emailLog.count({
          where: {
            accountId: seq.accountId,
            sentAt: { gte: startOfDay },
          },
        });
        remaining = Math.max(0, seq.dailySendLimit - sentToday);
        remainingByAccount.set(seq.accountId, remaining);
      }
      if (remaining <= 0) {
        // Skip this enrollment for now; its nextSendAt stays put so the
        // next tick (or tomorrow's) will retry.
        skipped += 1;
        continue;
      }

      // Render template + merge tags.
      const template = await this.prisma.emailTemplate.findUnique({
        where: { id: step.templateId },
      });
      if (!template) {
        await this.markExited(
          enrollment.id,
          seq.id,
          'exited_manual',
          'step template missing',
        );
        exited += 1;
        continue;
      }
      const primary = await this.prisma.contact.findFirst({
        where: { leadId: enrollment.leadId, isPrimary: true },
        select: { name: true },
      });
      const ctx: MergeContext = {
        toEmail: enrollment.toEmail,
        lead: {
          businessName: enrollment.lead.businessName,
          ownerName: enrollment.lead.ownerName,
          city: enrollment.lead.city,
          state: enrollment.lead.state,
        },
        contact: primary ? { name: primary.name } : null,
      };
      const subj = renderTags(template.subject, ctx);
      const text = renderTags(template.bodyText, ctx);
      const html = template.bodyHtml
        ? renderTags(template.bodyHtml, ctx)
        : { output: undefined as string | undefined, missingRequired: [] as string[] };
      const missing = Array.from(
        new Set([
          ...subj.missingRequired,
          ...text.missingRequired,
          ...html.missingRequired,
        ]),
      );
      if (missing.length > 0) {
        await this.markExited(
          enrollment.id,
          seq.id,
          'exited_manual',
          `missing required merge tag: ${missing.join(', ')}`,
        );
        exited += 1;
        continue;
      }

      // Reserve the send row first so its id can dedupe a tick replay.
      // Idempotent: if a send for (enrollment, step) already exists,
      // reuse it (defensive against partial-send replays).
      let sendRow = await this.prisma.sequenceEnrollmentSend.findUnique({
        where: {
          enrollmentId_stepOrder: {
            enrollmentId: enrollment.id,
            stepOrder: step.order,
          },
        },
      });
      if (!sendRow) {
        sendRow = await this.prisma.sequenceEnrollmentSend.create({
          data: {
            enrollmentId: enrollment.id,
            stepOrder: step.order,
            renderedSubject: subj.output,
            renderedBodyText: text.output,
            renderedBodyHtml: html.output ?? null,
          },
        });
      }

      // Inter-send rate pacing — only when consecutive sends share an
      // account.
      if (lastSentAccount === seq.accountId) {
        await new Promise((r) =>
          setTimeout(r, Math.max(1, seq.sendIntervalSec) * 1000),
        );
      }

      try {
        const log = await this.emails.send({
          leadId: enrollment.leadId,
          accountId: seq.accountId,
          toEmail: enrollment.toEmail,
          subject: subj.output,
          body: text.output,
          bodyHtml: html.output,
          sequenceEnrollmentSendId: sendRow.id,
        });
        await this.prisma.sequenceEnrollmentSend.update({
          where: { id: sendRow.id },
          data: { emailLogId: log.id },
        });
        // Advance the cursor.
        const nextStep = seq.steps.find(
          (s) => s.order === enrollment.nextStepOrder + 1,
        );
        if (nextStep) {
          const nextSendAt = new Date(
            Date.now() + Math.max(0, nextStep.delayDays) * 24 * 60 * 60 * 1000,
          );
          await this.prisma.sequenceEnrollment.update({
            where: { id: enrollment.id },
            data: {
              nextStepOrder: enrollment.nextStepOrder + 1,
              nextSendAt,
            },
          });
        } else {
          // Last step — mark completed inline.
          await this.markCompleted(enrollment.id, seq.id);
        }
        sent += 1;
        remaining -= 1;
        remainingByAccount.set(seq.accountId, remaining);
        lastSentAccount = seq.accountId;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.log.error(
          `sequence ${seq.id} enrollment ${enrollment.id} step ${step.order} send failed: ${msg}`,
        );
        // Leave enrollment active; nextSendAt unchanged → next tick retries.
        skipped += 1;
      }
    }

    this.log.log(
      `sequence tick: scanned=${due.length} sent=${sent} exited=${exited} skipped=${skipped}`,
    );
    return { sent, exited, skipped, scanned: due.length };
  }

  private async markCompleted(enrollmentId: string, sequenceId: string) {
    await this.prisma.sequenceEnrollment.update({
      where: { id: enrollmentId },
      data: {
        status: 'completed',
        nextStepOrder: -1,
        exitedAt: new Date(),
      },
    });
    await this.prisma.sequence.update({
      where: { id: sequenceId },
      data: { completedCount: { increment: 1 } },
    });
  }

  private async markExited(
    enrollmentId: string,
    sequenceId: string,
    status: 'exited_replied' | 'exited_stage' | 'exited_manual',
    reason: string,
  ) {
    await this.prisma.sequenceEnrollment.update({
      where: { id: enrollmentId },
      data: {
        status,
        nextStepOrder: -1,
        exitedAt: new Date(),
        exitReason: reason,
      },
    });
    await this.prisma.sequence.update({
      where: { id: sequenceId },
      data: { exitedCount: { increment: 1 } },
    });
  }
}
