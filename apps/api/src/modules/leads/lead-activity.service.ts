import { Injectable } from '@nestjs/common';
import {
  CallDirection,
  CallOutcome,
  LeadStage,
  MeetingType,
} from '@onspace/db';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Phase 19 — lead-scoped merged activity feed for the lead detail page.
 * 14 small parallel queries against tables that touch the lead, merged
 * + sorted by `at` desc. Same shape as the dashboard activity feed but
 * filtered to one lead and broader (more event kinds, longer history).
 */

export type LeadActivityEvent =
  | { kind: 'lead_created'; at: string; leadName: string }
  | {
      kind: 'stage_changed';
      at: string;
      entryId: string;
      fromStage: LeadStage;
      toStage: LeadStage;
      trigger: string;
      actorLabel: string | null;
    }
  | {
      kind: 'email_sent';
      at: string;
      emailLogId: string;
      subject: string;
      campaignId: string | null;
      campaignName: string | null;
      sequenceId: string | null;
      sequenceName: string | null;
    }
  | {
      kind: 'email_opened';
      at: string;
      emailLogId: string;
      subject: string;
    }
  | {
      kind: 'email_replied';
      at: string;
      emailLogId: string;
      snippet: string | null;
      fromEmail: string | null;
    }
  | {
      kind: 'call_logged';
      at: string;
      callId: string;
      direction: CallDirection;
      outcome: CallOutcome | null;
      durationSec: number | null;
      notesPreview: string | null;
    }
  | {
      kind: 'meeting_scheduled';
      at: string;
      meetingId: string;
      meetingTitle: string;
      scheduledAt: string;
      type: MeetingType;
    }
  | {
      kind: 'meeting_completed';
      at: string;
      meetingId: string;
      meetingTitle: string;
    }
  | {
      kind: 'meeting_cancelled';
      at: string;
      meetingId: string;
      meetingTitle: string;
    }
  | { kind: 'proposal_sent'; at: string; proposalId: string; subject: string }
  | {
      kind: 'task_created';
      at: string;
      taskId: string;
      taskTitle: string;
      context: string;
      dueAt: string | null;
    }
  | { kind: 'task_completed'; at: string; taskId: string; taskTitle: string }
  | { kind: 'note_added'; at: string; noteId: string; bodyPreview: string }
  | {
      kind: 'sequence_enrolled';
      at: string;
      sequenceId: string;
      sequenceName: string;
    }
  | {
      kind: 'sequence_exited';
      at: string;
      sequenceId: string;
      sequenceName: string;
      exitReason: string | null;
    }
  | { kind: 'campaign_added'; at: string; campaignId: string; campaignName: string };

@Injectable()
export class LeadActivityService {
  constructor(private readonly prisma: PrismaService) {}

  async listForLead(
    leadId: string,
    opts: { days?: number; limit?: number } = {},
  ): Promise<LeadActivityEvent[]> {
    const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);
    const days = Math.min(Math.max(opts.days ?? 90, 1), 365);
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const perSource = limit;

    const [
      lead,
      stageRows,
      sentRows,
      openedRows,
      repliedRows,
      callRows,
      meetingScheduledRows,
      meetingCompletedRows,
      meetingCancelledRows,
      proposalRows,
      taskCreatedRows,
      taskCompletedRows,
      noteRows,
      enrollRows,
      exitRows,
      campaignRows,
    ] = await Promise.all([
      this.prisma.lead.findUnique({
        where: { id: leadId },
        select: { id: true, businessName: true, createdAt: true },
      }),
      this.prisma.leadStageHistory.findMany({
        where: { leadId, occurredAt: { gte: cutoff } },
        orderBy: { occurredAt: 'desc' },
        take: perSource,
      }),
      this.prisma.emailLog.findMany({
        where: { leadId, sentAt: { gte: cutoff } },
        orderBy: { sentAt: 'desc' },
        take: perSource,
        select: {
          id: true,
          sentAt: true,
          subject: true,
          campaign: { select: { id: true, name: true } },
          sequenceEnrollmentSend: {
            select: {
              enrollment: {
                select: {
                  sequence: { select: { id: true, name: true } },
                },
              },
            },
          },
        },
      }),
      this.prisma.emailLog.findMany({
        where: { leadId, openedAt: { gte: cutoff } },
        orderBy: { openedAt: 'desc' },
        take: perSource,
        select: { id: true, openedAt: true, subject: true },
      }),
      this.prisma.emailLog.findMany({
        where: { leadId, repliedAt: { gte: cutoff } },
        orderBy: { repliedAt: 'desc' },
        take: perSource,
        select: {
          id: true,
          repliedAt: true,
          replies: {
            orderBy: { receivedAt: 'desc' },
            take: 1,
            select: { snippet: true, fromEmail: true },
          },
        },
      }),
      this.prisma.call.findMany({
        where: { leadId, occurredAt: { gte: cutoff }, status: 'completed' },
        orderBy: { occurredAt: 'desc' },
        take: perSource,
        select: {
          id: true,
          occurredAt: true,
          direction: true,
          outcome: true,
          durationSec: true,
          notes: true,
        },
      }),
      this.prisma.meeting.findMany({
        where: { leadId, createdAt: { gte: cutoff }, status: 'scheduled' },
        orderBy: { createdAt: 'desc' },
        take: perSource,
        select: {
          id: true,
          createdAt: true,
          title: true,
          scheduledAt: true,
          type: true,
        },
      }),
      this.prisma.meeting.findMany({
        where: { leadId, updatedAt: { gte: cutoff }, status: 'completed' },
        orderBy: { updatedAt: 'desc' },
        take: perSource,
        select: { id: true, updatedAt: true, title: true },
      }),
      this.prisma.meeting.findMany({
        where: { leadId, updatedAt: { gte: cutoff }, status: 'cancelled' },
        orderBy: { updatedAt: 'desc' },
        take: perSource,
        select: { id: true, updatedAt: true, title: true },
      }),
      this.prisma.proposal.findMany({
        where: { leadId, sentAt: { gte: cutoff } },
        orderBy: { sentAt: 'desc' },
        take: perSource,
        select: { id: true, sentAt: true, subject: true },
      }),
      this.prisma.task.findMany({
        where: { leadId, createdAt: { gte: cutoff } },
        orderBy: { createdAt: 'desc' },
        take: perSource,
        select: {
          id: true,
          createdAt: true,
          title: true,
          context: true,
          dueAt: true,
        },
      }),
      this.prisma.task.findMany({
        where: { leadId, completedAt: { gte: cutoff } },
        orderBy: { completedAt: 'desc' },
        take: perSource,
        select: { id: true, completedAt: true, title: true },
      }),
      this.prisma.note.findMany({
        where: { leadId, createdAt: { gte: cutoff } },
        orderBy: { createdAt: 'desc' },
        take: perSource,
        select: { id: true, createdAt: true, body: true },
      }),
      this.prisma.sequenceEnrollment.findMany({
        where: { leadId, enrolledAt: { gte: cutoff } },
        orderBy: { enrolledAt: 'desc' },
        take: perSource,
        select: {
          enrolledAt: true,
          sequence: { select: { id: true, name: true } },
        },
      }),
      this.prisma.sequenceEnrollment.findMany({
        where: {
          leadId,
          exitedAt: { gte: cutoff, not: null },
          status: { in: ['completed', 'exited_replied', 'exited_stage', 'exited_manual'] },
        },
        orderBy: { exitedAt: 'desc' },
        take: perSource,
        select: {
          exitedAt: true,
          exitReason: true,
          status: true,
          sequence: { select: { id: true, name: true } },
        },
      }),
      this.prisma.campaignRecipient.findMany({
        where: { leadId, createdAt: { gte: cutoff } },
        orderBy: { createdAt: 'desc' },
        take: perSource,
        select: {
          createdAt: true,
          campaign: { select: { id: true, name: true } },
        },
      }),
    ]);

    const events: LeadActivityEvent[] = [];

    if (lead && lead.createdAt >= cutoff) {
      events.push({
        kind: 'lead_created',
        at: lead.createdAt.toISOString(),
        leadName: lead.businessName,
      });
    }

    for (const r of stageRows) {
      events.push({
        kind: 'stage_changed',
        at: r.occurredAt.toISOString(),
        entryId: r.id,
        fromStage: r.fromStage,
        toStage: r.toStage,
        trigger: r.trigger,
        actorLabel: r.actorLabel,
      });
    }
    for (const r of sentRows) {
      if (!r.sentAt) continue;
      const seq = r.sequenceEnrollmentSend?.enrollment.sequence ?? null;
      events.push({
        kind: 'email_sent',
        at: r.sentAt.toISOString(),
        emailLogId: r.id,
        subject: r.subject,
        campaignId: r.campaign?.id ?? null,
        campaignName: r.campaign?.name ?? null,
        sequenceId: seq?.id ?? null,
        sequenceName: seq?.name ?? null,
      });
    }
    for (const r of openedRows) {
      if (!r.openedAt) continue;
      events.push({
        kind: 'email_opened',
        at: r.openedAt.toISOString(),
        emailLogId: r.id,
        subject: r.subject,
      });
    }
    for (const r of repliedRows) {
      if (!r.repliedAt) continue;
      events.push({
        kind: 'email_replied',
        at: r.repliedAt.toISOString(),
        emailLogId: r.id,
        snippet: r.replies[0]?.snippet ?? null,
        fromEmail: r.replies[0]?.fromEmail ?? null,
      });
    }
    for (const r of callRows) {
      events.push({
        kind: 'call_logged',
        at: r.occurredAt.toISOString(),
        callId: r.id,
        direction: r.direction,
        outcome: r.outcome ?? null,
        durationSec: r.durationSec ?? null,
        notesPreview: r.notes ? r.notes.slice(0, 160) : null,
      });
    }
    for (const r of meetingScheduledRows) {
      events.push({
        kind: 'meeting_scheduled',
        at: r.createdAt.toISOString(),
        meetingId: r.id,
        meetingTitle: r.title,
        scheduledAt: r.scheduledAt.toISOString(),
        type: r.type,
      });
    }
    for (const r of meetingCompletedRows) {
      events.push({
        kind: 'meeting_completed',
        at: r.updatedAt.toISOString(),
        meetingId: r.id,
        meetingTitle: r.title,
      });
    }
    for (const r of meetingCancelledRows) {
      events.push({
        kind: 'meeting_cancelled',
        at: r.updatedAt.toISOString(),
        meetingId: r.id,
        meetingTitle: r.title,
      });
    }
    for (const r of proposalRows) {
      if (!r.sentAt) continue;
      events.push({
        kind: 'proposal_sent',
        at: r.sentAt.toISOString(),
        proposalId: r.id,
        subject: r.subject,
      });
    }
    for (const r of taskCreatedRows) {
      events.push({
        kind: 'task_created',
        at: r.createdAt.toISOString(),
        taskId: r.id,
        taskTitle: r.title,
        context: r.context,
        dueAt: r.dueAt ? r.dueAt.toISOString() : null,
      });
    }
    for (const r of taskCompletedRows) {
      if (!r.completedAt) continue;
      events.push({
        kind: 'task_completed',
        at: r.completedAt.toISOString(),
        taskId: r.id,
        taskTitle: r.title,
      });
    }
    for (const r of noteRows) {
      events.push({
        kind: 'note_added',
        at: r.createdAt.toISOString(),
        noteId: r.id,
        bodyPreview: r.body.slice(0, 160),
      });
    }
    for (const r of enrollRows) {
      if (!r.sequence) continue;
      events.push({
        kind: 'sequence_enrolled',
        at: r.enrolledAt.toISOString(),
        sequenceId: r.sequence.id,
        sequenceName: r.sequence.name,
      });
    }
    for (const r of exitRows) {
      if (!r.exitedAt || !r.sequence) continue;
      events.push({
        kind: 'sequence_exited',
        at: r.exitedAt.toISOString(),
        sequenceId: r.sequence.id,
        sequenceName: r.sequence.name,
        exitReason: r.exitReason,
      });
    }
    for (const r of campaignRows) {
      if (!r.campaign) continue;
      events.push({
        kind: 'campaign_added',
        at: r.createdAt.toISOString(),
        campaignId: r.campaign.id,
        campaignName: r.campaign.name,
      });
    }

    events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
    return events.slice(0, limit);
  }
}
