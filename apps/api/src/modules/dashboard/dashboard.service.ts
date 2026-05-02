import { Injectable } from '@nestjs/common';
import {
  CallDirection,
  CallOutcome,
  CampaignStatus,
  LeadStage,
  MeetingType,
  TaskContext,
} from '@onspace/db';
import { PrismaService } from '../../prisma/prisma.service';

const LEAD_STAGES: LeadStage[] = [
  'new',
  'approached',
  'no_response',
  'engaged',
  'push',
  'qualified',
  'interested',
  'booked',
  'proposal_sent',
  'converted',
  'not_converted',
  'lost',
];

export interface DashboardSummary {
  today: {
    tasksDueToday: number;
    overdueTasks: number;
    leadsAddedToday: number;
    repliesToday: number;
    opensToday: number;
    meetingsToday: number;
    callsToday: number;
    proposalsSentToday: number;
  };
  stageFunnel: { stage: LeadStage; count: number }[];
  followUpContextCounts: { context: TaskContext; count: number }[];
  activeCampaigns: {
    id: string;
    name: string;
    status: CampaignStatus;
    sentCount: number;
    recipientCount: number;
    openedCount: number;
    repliedCount: number;
  }[];
  unreadReplies: number;
  upcomingMeetings: {
    id: string;
    title: string;
    scheduledAt: string;
    leadId: string;
    leadBusinessName: string;
    type: MeetingType;
    meetingLink: string | null;
  }[];
}

export type DashboardEvent =
  | { kind: 'lead_created';      at: string; leadId: string; leadName: string }
  | {
      kind: 'email_sent';
      at: string;
      leadId: string;
      leadName: string;
      emailLogId: string;
      subject: string;
      campaignId: string | null;
      campaignName: string | null;
    }
  | {
      kind: 'email_opened';
      at: string;
      leadId: string;
      leadName: string;
      emailLogId: string;
      subject: string;
      campaignId: string | null;
      campaignName: string | null;
    }
  | {
      kind: 'email_replied';
      at: string;
      leadId: string;
      leadName: string;
      emailLogId: string;
      snippet: string | null;
    }
  | {
      kind: 'task_completed';
      at: string;
      leadId: string;
      leadName: string;
      taskId: string;
      taskTitle: string;
    }
  | { kind: 'campaign_started'; at: string; campaignId: string; campaignName: string }
  | {
      kind: 'meeting_scheduled';
      at: string;
      leadId: string;
      leadName: string;
      meetingId: string;
      meetingTitle: string;
      scheduledAt: string;
    }
  | {
      kind: 'meeting_completed';
      at: string;
      leadId: string;
      leadName: string;
      meetingId: string;
      meetingTitle: string;
    }
  | {
      kind: 'call_logged';
      at: string;
      leadId: string;
      leadName: string;
      callId: string;
      direction: CallDirection;
      outcome: CallOutcome | null;
    }
  | {
      kind: 'proposal_sent';
      at: string;
      leadId: string;
      leadName: string;
      proposalId: string;
      subject: string;
    };

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── /summary ──────────────────────────────────────────────────────────

  async summary(): Promise<DashboardSummary> {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59,
      999,
    );
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      tasksDueToday,
      overdueTasks,
      leadsAddedToday,
      repliesToday,
      opensToday,
      meetingsToday,
      callsToday,
      proposalsSentToday,
      stageRows,
      followupRows,
      campaigns,
      unreadReplies,
      upcoming,
    ] = await Promise.all([
      this.prisma.task.count({
        where: {
          status: { in: ['open', 'in_progress'] },
          dueAt: { gte: startOfDay, lte: endOfDay },
        },
      }),
      this.prisma.task.count({
        where: {
          status: { in: ['open', 'in_progress'] },
          dueAt: { lt: now },
        },
      }),
      this.prisma.lead.count({
        where: { createdAt: { gte: startOfDay, lte: endOfDay } },
      }),
      this.prisma.emailLog.count({
        where: { repliedAt: { gte: startOfDay, lte: endOfDay } },
      }),
      this.prisma.emailLog.count({
        where: { openedAt: { gte: startOfDay, lte: endOfDay } },
      }),
      this.prisma.meeting.count({
        where: {
          status: 'scheduled',
          scheduledAt: { gte: startOfDay, lte: endOfDay },
        },
      }),
      this.prisma.call.count({
        where: {
          status: 'completed',
          occurredAt: { gte: startOfDay, lte: endOfDay },
        },
      }),
      this.prisma.proposal.count({
        where: { sentAt: { gte: startOfDay, lte: endOfDay } },
      }),
      this.prisma.lead.groupBy({
        by: ['stage'],
        _count: { _all: true },
      }),
      this.prisma.task.groupBy({
        by: ['context'],
        where: {
          kind: 'followup',
          status: { in: ['open', 'in_progress'] },
          context: { not: 'none' },
        },
        _count: { _all: true },
      }),
      this.prisma.campaign.findMany({
        where: { status: { in: ['queued', 'running', 'paused'] } },
        orderBy: [{ startedAt: 'desc' }, { createdAt: 'desc' }],
        take: 10,
      }),
      this.prisma.emailReply.count({ where: { receivedAt: { gte: sevenDaysAgo } } }),
      this.prisma.meeting.findMany({
        where: { status: 'scheduled', scheduledAt: { gt: now } },
        orderBy: { scheduledAt: 'asc' },
        take: 5,
        include: { lead: { select: { id: true, businessName: true } } },
      }),
    ]);

    // Zero-fill stage funnel against canonical order.
    const stageMap = new Map<LeadStage, number>();
    for (const r of stageRows) stageMap.set(r.stage, r._count._all);
    const stageFunnel: { stage: LeadStage; count: number }[] = LEAD_STAGES.map(
      (s) => ({ stage: s, count: stageMap.get(s) ?? 0 }),
    );

    const followUpContextCounts = followupRows
      .map((r) => ({ context: r.context, count: r._count._all }))
      .sort((a, b) => b.count - a.count);

    // Campaign stats — aggregate opened/replied per campaign in parallel.
    const campaignStats = await Promise.all(
      campaigns.map(async (c) => {
        const [openedCount, repliedCount] = await Promise.all([
          this.prisma.emailLog.count({
            where: { campaignId: c.id, openedAt: { not: null } },
          }),
          this.prisma.emailLog.count({
            where: { campaignId: c.id, repliedAt: { not: null } },
          }),
        ]);
        return {
          id: c.id,
          name: c.name,
          status: c.status,
          sentCount: c.sentCount,
          recipientCount: c.recipientCount,
          openedCount,
          repliedCount,
        };
      }),
    );

    return {
      today: {
        tasksDueToday,
        overdueTasks,
        leadsAddedToday,
        repliesToday,
        opensToday,
        meetingsToday,
        callsToday,
        proposalsSentToday,
      },
      stageFunnel,
      followUpContextCounts,
      activeCampaigns: campaignStats,
      unreadReplies,
      upcomingMeetings: upcoming.map((m) => ({
        id: m.id,
        title: m.title,
        scheduledAt: m.scheduledAt.toISOString(),
        leadId: m.leadId,
        leadBusinessName: m.lead?.businessName ?? '(unknown)',
        type: m.type,
        meetingLink: m.meetingLink ?? null,
      })),
    };
  }

  // ─── /activity ─────────────────────────────────────────────────────────

  async activity(opts: { limit?: number; days?: number } = {}): Promise<
    DashboardEvent[]
  > {
    const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100);
    const days = Math.min(Math.max(opts.days ?? 7, 1), 30);
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    // Each source query pulls limit*2 so the merge has room to interleave.
    const perSource = limit * 2;

    const leadSel = { id: true, businessName: true } as const;
    const [
      leadRows,
      sentRows,
      openedRows,
      repliedRows,
      taskRows,
      campaignRows,
      meetingScheduledRows,
      meetingCompletedRows,
      callRows,
      proposalRows,
    ] = await Promise.all([
      this.prisma.lead.findMany({
        where: { createdAt: { gte: cutoff } },
        orderBy: { createdAt: 'desc' },
        take: perSource,
        select: { id: true, businessName: true, createdAt: true },
      }),
      this.prisma.emailLog.findMany({
        where: { sentAt: { gte: cutoff } },
        orderBy: { sentAt: 'desc' },
        take: perSource,
        select: {
          id: true,
          sentAt: true,
          subject: true,
          campaignId: true,
          lead: { select: leadSel },
          campaign: { select: { id: true, name: true } },
        },
      }),
      this.prisma.emailLog.findMany({
        where: { openedAt: { gte: cutoff } },
        orderBy: { openedAt: 'desc' },
        take: perSource,
        select: {
          id: true,
          openedAt: true,
          subject: true,
          campaignId: true,
          lead: { select: leadSel },
          campaign: { select: { id: true, name: true } },
        },
      }),
      this.prisma.emailLog.findMany({
        where: { repliedAt: { gte: cutoff } },
        orderBy: { repliedAt: 'desc' },
        take: perSource,
        select: {
          id: true,
          repliedAt: true,
          lead: { select: leadSel },
          replies: {
            orderBy: { receivedAt: 'desc' },
            take: 1,
            select: { snippet: true },
          },
        },
      }),
      this.prisma.task.findMany({
        where: { completedAt: { gte: cutoff } },
        orderBy: { completedAt: 'desc' },
        take: perSource,
        select: {
          id: true,
          completedAt: true,
          title: true,
          lead: { select: leadSel },
        },
      }),
      this.prisma.campaign.findMany({
        where: { startedAt: { gte: cutoff } },
        orderBy: { startedAt: 'desc' },
        take: perSource,
        select: { id: true, name: true, startedAt: true },
      }),
      this.prisma.meeting.findMany({
        where: { createdAt: { gte: cutoff }, status: 'scheduled' },
        orderBy: { createdAt: 'desc' },
        take: perSource,
        select: {
          id: true,
          createdAt: true,
          title: true,
          scheduledAt: true,
          lead: { select: leadSel },
        },
      }),
      this.prisma.meeting.findMany({
        where: { updatedAt: { gte: cutoff }, status: 'completed' },
        orderBy: { updatedAt: 'desc' },
        take: perSource,
        select: {
          id: true,
          updatedAt: true,
          title: true,
          lead: { select: leadSel },
        },
      }),
      this.prisma.call.findMany({
        where: { occurredAt: { gte: cutoff }, status: 'completed' },
        orderBy: { occurredAt: 'desc' },
        take: perSource,
        select: {
          id: true,
          occurredAt: true,
          direction: true,
          outcome: true,
          lead: { select: leadSel },
        },
      }),
      this.prisma.proposal.findMany({
        where: { sentAt: { gte: cutoff } },
        orderBy: { sentAt: 'desc' },
        take: perSource,
        select: {
          id: true,
          sentAt: true,
          subject: true,
          lead: { select: leadSel },
        },
      }),
    ]);

    const events: DashboardEvent[] = [];

    for (const r of leadRows) {
      events.push({
        kind: 'lead_created',
        at: r.createdAt.toISOString(),
        leadId: r.id,
        leadName: r.businessName,
      });
    }
    for (const r of sentRows) {
      if (!r.sentAt || !r.lead) continue;
      events.push({
        kind: 'email_sent',
        at: r.sentAt.toISOString(),
        leadId: r.lead.id,
        leadName: r.lead.businessName,
        emailLogId: r.id,
        subject: r.subject,
        campaignId: r.campaign?.id ?? null,
        campaignName: r.campaign?.name ?? null,
      });
    }
    for (const r of openedRows) {
      if (!r.openedAt || !r.lead) continue;
      events.push({
        kind: 'email_opened',
        at: r.openedAt.toISOString(),
        leadId: r.lead.id,
        leadName: r.lead.businessName,
        emailLogId: r.id,
        subject: r.subject,
        campaignId: r.campaign?.id ?? null,
        campaignName: r.campaign?.name ?? null,
      });
    }
    for (const r of repliedRows) {
      if (!r.repliedAt || !r.lead) continue;
      events.push({
        kind: 'email_replied',
        at: r.repliedAt.toISOString(),
        leadId: r.lead.id,
        leadName: r.lead.businessName,
        emailLogId: r.id,
        snippet: r.replies[0]?.snippet ?? null,
      });
    }
    for (const r of taskRows) {
      if (!r.completedAt || !r.lead) continue;
      events.push({
        kind: 'task_completed',
        at: r.completedAt.toISOString(),
        leadId: r.lead.id,
        leadName: r.lead.businessName,
        taskId: r.id,
        taskTitle: r.title,
      });
    }
    for (const r of campaignRows) {
      if (!r.startedAt) continue;
      events.push({
        kind: 'campaign_started',
        at: r.startedAt.toISOString(),
        campaignId: r.id,
        campaignName: r.name,
      });
    }
    for (const r of meetingScheduledRows) {
      if (!r.lead) continue;
      events.push({
        kind: 'meeting_scheduled',
        at: r.createdAt.toISOString(),
        leadId: r.lead.id,
        leadName: r.lead.businessName,
        meetingId: r.id,
        meetingTitle: r.title,
        scheduledAt: r.scheduledAt.toISOString(),
      });
    }
    for (const r of meetingCompletedRows) {
      if (!r.lead) continue;
      events.push({
        kind: 'meeting_completed',
        at: r.updatedAt.toISOString(),
        leadId: r.lead.id,
        leadName: r.lead.businessName,
        meetingId: r.id,
        meetingTitle: r.title,
      });
    }
    for (const r of callRows) {
      if (!r.lead) continue;
      events.push({
        kind: 'call_logged',
        at: r.occurredAt.toISOString(),
        leadId: r.lead.id,
        leadName: r.lead.businessName,
        callId: r.id,
        direction: r.direction,
        outcome: r.outcome ?? null,
      });
    }
    for (const r of proposalRows) {
      if (!r.sentAt || !r.lead) continue;
      events.push({
        kind: 'proposal_sent',
        at: r.sentAt.toISOString(),
        leadId: r.lead.id,
        leadName: r.lead.businessName,
        proposalId: r.id,
        subject: r.subject,
      });
    }

    events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
    return events.slice(0, limit);
  }
}
