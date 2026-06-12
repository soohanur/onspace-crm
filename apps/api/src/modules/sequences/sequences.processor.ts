import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { LeadStage } from '@onspace/db';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { renderTags, MergeContext } from '../campaigns/merge-tags';
import { SequencesService } from './sequences.service';
import {
  OUTREACH_GAP_MAX_SEC,
  OUTREACH_GAP_MIN_SEC,
  OUTREACH_HOUR_END,
  OUTREACH_HOUR_START,
  OUTREACH_TZ,
  SEQUENCES_QUEUE,
  SEQUENCES_TICK_BATCH_SIZE,
  SEQUENCE_AUTO_ENROLL_JOB,
  SEQUENCE_STOP_STAGES,
} from './sequences.constants';

const STOP_SET = new Set<LeadStage>(SEQUENCE_STOP_STAGES);

/**
 * Returns the hour-of-day (0–23) for `now` in `tz` using the runtime's
 * built-in Intl tables — no date library needed. Wraps an IANA TZ
 * string (e.g. `America/New_York`).
 */
function hourInTz(now: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    hour12: false,
  }).formatToParts(now);
  const h = parts.find((p) => p.type === 'hour')?.value ?? '0';
  return parseInt(h, 10) || 0;
}

function isOfficeHours(now: Date): boolean {
  const h = hourInTz(now, OUTREACH_TZ);
  return h >= OUTREACH_HOUR_START && h < OUTREACH_HOUR_END;
}

/**
 * Milliseconds until the next office-hour open from `now`. Probes hour
 * by hour up to 48 hours — covers weekends and DST edges without
 * pulling a date lib. Used to push not-yet-sendable enrollments
 * forward so they don't thrash the tick.
 */
function msUntilOfficeOpen(now: Date): number {
  let probe = now;
  for (let i = 0; i < 48; i++) {
    if (isOfficeHours(probe)) return Math.max(0, probe.getTime() - now.getTime());
    probe = new Date(probe.getTime() + 60 * 60 * 1000);
  }
  return 60 * 60 * 1000;
}

function randomGapMs(): number {
  const min = Math.max(1, OUTREACH_GAP_MIN_SEC);
  const max = Math.max(min, OUTREACH_GAP_MAX_SEC);
  const sec = min + Math.floor(Math.random() * (max - min + 1));
  return sec * 1000;
}

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
    private readonly sequences: SequencesService,
  ) {
    super();
  }

  async process(job: Job) {
    if (job.name === SEQUENCE_AUTO_ENROLL_JOB) {
      return this.sequences.autoEnrollSweep();
    }
    return this.tick();
  }

  /** Public so a controller / test can drive a single tick if needed. */
  async tick() {
    if (process.env.SEQUENCES_DISABLED === '1') {
      return { stopped: true, reason: 'disabled-env' };
    }

    const now = new Date();

    // Office-hours guard. Outside the window the whole tick is a no-op;
    // we don't even fetch enrollments — they'll be picked up by the
    // next tick that lands inside the window. We log once per tick so
    // a quiet stack at 2 AM doesn't look broken.
    if (!isOfficeHours(now)) {
      this.log.log(
        `sequence tick: outside office hours (${OUTREACH_TZ} ${OUTREACH_HOUR_START}-${OUTREACH_HOUR_END}h) — sleeping`,
      );
      return { stopped: true, reason: 'outside-office-hours' };
    }

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
    // Per-account "next allowed send-time" memo. After each send we set
    // it to now + random(OUTREACH_GAP_MIN_SEC..MAX). Subsequent
    // enrollments on the same account that hit before that time get
    // their `nextSendAt` bumped instead of firing — preserves the gap
    // both within this tick AND across the next tick (5 min later).
    const nextAllowedByAccount = new Map<string, number>();
    // Bootstrap from the most recent send per account so a worker
    // restart can't fire faster than the configured gap.
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);

    let sent = 0;
    let exited = 0;
    let skipped = 0;

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

      // Daily cap check. We honor the lower of (this sequence's ramped
      // cap, the account's own absolute daily limit). Tracked per
      // account across the tick so multiple sequences on one account
      // share the budget.
      const rampedCap = this.sequences.rampedDailyCap({
        rampStartCap: seq.rampStartCap,
        rampStepPerDay: seq.rampStepPerDay,
        rampMaxCap: seq.rampMaxCap,
        startedAt: seq.startedAt,
        dailySendLimit: seq.dailySendLimit,
      });
      let remaining = remainingByAccount.get(seq.accountId);
      if (remaining === undefined) {
        const sentToday = await this.prisma.emailLog.count({
          where: {
            accountId: seq.accountId,
            sentAt: { gte: startOfDay },
          },
        });
        remaining = Math.max(0, rampedCap - sentToday);
        remainingByAccount.set(seq.accountId, remaining);
      }
      if (remaining <= 0) {
        // Skip this enrollment for now; its nextSendAt stays put so the
        // next tick (or tomorrow's) will retry.
        skipped += 1;
        continue;
      }

      // Per-account 8–10 min gap. Bootstrap from the most recent
      // EmailLog so a worker restart can't fire faster than the
      // configured gap. After that, the in-memory map is authoritative
      // for the rest of the tick.
      let nextAllowed = nextAllowedByAccount.get(seq.accountId);
      if (nextAllowed === undefined) {
        const lastSend = await this.prisma.emailLog.findFirst({
          where: { accountId: seq.accountId },
          orderBy: { sentAt: 'desc' },
          select: { sentAt: true },
        });
        nextAllowed =
          lastSend?.sentAt != null
            ? lastSend.sentAt.getTime() + OUTREACH_GAP_MIN_SEC * 1000
            : 0;
        nextAllowedByAccount.set(seq.accountId, nextAllowed);
      }
      const nowMs = Date.now();
      if (nowMs < nextAllowed) {
        // Push this enrollment's nextSendAt to the per-account gap
        // boundary + a small randomization so we don't dog-pile when
        // the gap expires. Cheaper than a per-tick spin and works
        // across worker restarts.
        const pushTo = new Date(nextAllowed + Math.floor(Math.random() * 30_000));
        await this.prisma.sequenceEnrollment.update({
          where: { id: enrollment.id },
          data: { nextSendAt: pushTo },
        });
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

      // (Inter-send pacing is now handled by `nextAllowedByAccount`
      // above — no sleep inside the tick. After each send we push the
      // next allowed time forward by random(OUTREACH_GAP_MIN_SEC,
      // OUTREACH_GAP_MAX_SEC).)

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
        // Push the per-account gate forward so the next enrollment on
        // this account in the same tick (or any tick before the gate
        // expires) gets skipped + bumped.
        nextAllowedByAccount.set(seq.accountId, Date.now() + randomGapMs());
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
