import { Injectable } from '@nestjs/common';
import {
  CampaignStatus,
  LeadStage,
  Prisma,
  TaskContext,
  TaskPriority,
  TaskStatus,
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
];
const TERMINAL_BAD: LeadStage[] = ['not_converted', 'lost'];

export interface PipelineReport {
  total: number;
  byStage: { stage: LeadStage; count: number; percentOfTotal: number }[];
  conversionRates: {
    fromStage: LeadStage;
    toStage: LeadStage;
    rate: number;
    fromCount: number;
    toCount: number;
  }[];
  outcomes: {
    converted: number;
    notConverted: number;
    lost: number;
  };
}

export interface CampaignReport {
  totals: {
    campaignsStarted: number;
    totalRecipients: number;
    totalSent: number;
    totalOpens: number;
    totalReplies: number;
    totalBounces: number;
    averageOpenRate: number;
    averageReplyRate: number;
  };
  campaigns: {
    id: string;
    name: string;
    status: CampaignStatus;
    startedAt: string | null;
    recipientCount: number;
    sentCount: number;
    openedCount: number;
    repliedCount: number;
    bouncedCount: number;
    openRate: number;
    replyRate: number;
  }[];
  perDay: {
    date: string;
    campaignsStarted: number;
    emailsSent: number;
  }[];
}

export interface LeadSourcesReport {
  bySource: {
    source: string;
    leadCount: number;
    qualifiedCount: number;
    convertedCount: number;
    qualifiedRate: number;
    convertedRate: number;
  }[];
  byCategory: {
    category: string;
    leadCount: number;
    qualifiedCount: number;
    convertedCount: number;
    qualifiedRate: number;
    convertedRate: number;
  }[];
}

export interface ActivityVolumeReport {
  perDay: {
    date: string;
    emailsSent: number;
    emailsOpened: number;
    emailsReplied: number;
    callsLogged: number;
    meetingsHeld: number;
    proposalsSent: number;
    leadsAdded: number;
  }[];
  totals: {
    emailsSent: number;
    emailsOpened: number;
    emailsReplied: number;
    callsLogged: number;
    meetingsHeld: number;
    proposalsSent: number;
    leadsAdded: number;
  };
}

export interface FollowupHealthReport {
  byStatus: { status: TaskStatus; count: number }[];
  byBucket: {
    bucket: 'today' | 'overdue' | 'upcoming' | 'completed';
    count: number;
  }[];
  byContext: { context: TaskContext; count: number }[];
  byPriority: { priority: TaskPriority; count: number }[];
  averageCompletionDays: number | null;
  staleOpenCount: number;
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Pipeline ──────────────────────────────────────────────────────────

  async pipeline(): Promise<PipelineReport> {
    const groups = await this.prisma.lead.groupBy({
      by: ['stage'],
      _count: { _all: true },
    });
    const counts = new Map<LeadStage, number>();
    for (const g of groups) counts.set(g.stage, g._count._all);
    const total = Array.from(counts.values()).reduce((s, n) => s + n, 0);

    const ALL_STAGES: LeadStage[] = [...LEAD_STAGES, ...TERMINAL_BAD];
    const byStage = ALL_STAGES.map((stage) => {
      const count = counts.get(stage) ?? 0;
      return {
        stage,
        count,
        percentOfTotal: total ? count / total : 0,
      };
    });

    // "Or beyond" cumulative count along the canonical funnel sequence.
    // We treat terminal-bad (not_converted/lost) as outside the funnel — a
    // lead that's already lost shouldn't bump the "or beyond" totals for
    // stages it never reached.
    const orBeyond = (idx: number): number => {
      let sum = 0;
      for (let i = idx; i < LEAD_STAGES.length; i += 1) {
        sum += counts.get(LEAD_STAGES[i]) ?? 0;
      }
      return sum;
    };

    const conversionRates: PipelineReport['conversionRates'] = [];
    for (let i = 0; i < LEAD_STAGES.length - 1; i += 1) {
      const fromCount = orBeyond(i);
      const toCount = orBeyond(i + 1);
      conversionRates.push({
        fromStage: LEAD_STAGES[i],
        toStage: LEAD_STAGES[i + 1],
        fromCount,
        toCount,
        rate: fromCount > 0 ? toCount / fromCount : 0,
      });
    }

    return {
      total,
      byStage,
      conversionRates,
      outcomes: {
        converted: counts.get('converted') ?? 0,
        notConverted: counts.get('not_converted') ?? 0,
        lost: counts.get('lost') ?? 0,
      },
    };
  }

  // ─── Campaigns ─────────────────────────────────────────────────────────

  async campaigns(days: number): Promise<CampaignReport> {
    const cutoff = startOfDayDaysAgo(days);
    const startedRows = await this.prisma.campaign.findMany({
      where: { startedAt: { gte: cutoff } },
      orderBy: { startedAt: 'desc' },
    });

    const campaigns = await Promise.all(
      startedRows.map(async (c) => {
        const [openedCount, repliedCount, bouncedCount] = await Promise.all([
          this.prisma.emailLog.count({
            where: { campaignId: c.id, openedAt: { not: null } },
          }),
          this.prisma.emailLog.count({
            where: { campaignId: c.id, repliedAt: { not: null } },
          }),
          this.prisma.emailLog.count({
            where: { campaignId: c.id, bouncedAt: { not: null } },
          }),
        ]);
        const openRate =
          c.sentCount > 0 ? openedCount / c.sentCount : 0;
        const replyRate =
          c.sentCount > 0 ? repliedCount / c.sentCount : 0;
        return {
          id: c.id,
          name: c.name,
          status: c.status,
          startedAt: c.startedAt ? c.startedAt.toISOString() : null,
          recipientCount: c.recipientCount,
          sentCount: c.sentCount,
          openedCount,
          repliedCount,
          bouncedCount,
          openRate,
          replyRate,
        };
      }),
    );

    // Daily aggregation. Generate the full date array first, then
    // left-join sent + started counts via two grouped scans so empty
    // days zero-fill cleanly.
    const dateKeys = generateDateKeys(days);

    const sentRows = await this.prisma.$queryRaw<
      { d: Date; n: bigint }[]
    >`
      SELECT date_trunc('day', sent_at) AS d, COUNT(*)::bigint AS n
      FROM email_logs
      WHERE sent_at >= ${cutoff}
      GROUP BY 1
    `;
    const startedDayRows = await this.prisma.$queryRaw<
      { d: Date; n: bigint }[]
    >`
      SELECT date_trunc('day', started_at) AS d, COUNT(*)::bigint AS n
      FROM campaigns
      WHERE started_at >= ${cutoff}
      GROUP BY 1
    `;
    const sentByDay = mapByDateKey(sentRows);
    const startedByDay = mapByDateKey(startedDayRows);

    const perDay = dateKeys.map((date) => ({
      date,
      campaignsStarted: startedByDay.get(date) ?? 0,
      emailsSent: sentByDay.get(date) ?? 0,
    }));

    const totalSent = campaigns.reduce((s, c) => s + c.sentCount, 0);
    const totalOpens = campaigns.reduce((s, c) => s + c.openedCount, 0);
    const totalReplies = campaigns.reduce((s, c) => s + c.repliedCount, 0);
    const totalBounces = campaigns.reduce((s, c) => s + c.bouncedCount, 0);
    const totalRecipients = campaigns.reduce(
      (s, c) => s + c.recipientCount,
      0,
    );

    return {
      totals: {
        campaignsStarted: startedRows.length,
        totalRecipients,
        totalSent,
        totalOpens,
        totalReplies,
        totalBounces,
        averageOpenRate: totalSent > 0 ? totalOpens / totalSent : 0,
        averageReplyRate: totalSent > 0 ? totalReplies / totalSent : 0,
      },
      campaigns,
      perDay,
    };
  }

  // ─── Lead sources ──────────────────────────────────────────────────────

  async leadSources(days: number): Promise<LeadSourcesReport> {
    const cutoff = startOfDayDaysAgo(days);
    const rows = await this.prisma.lead.findMany({
      where: { createdAt: { gte: cutoff } },
      select: { source: true, category: true, stage: true },
    });

    type Bucket = {
      leadCount: number;
      qualifiedCount: number;
      convertedCount: number;
    };
    const QUALIFIED_AT_OR_BEYOND = new Set<LeadStage>([
      'qualified',
      'interested',
      'booked',
      'proposal_sent',
      'converted',
    ]);
    const sources = new Map<string, Bucket>();
    const categories = new Map<string, Bucket>();
    const inc = (
      m: Map<string, Bucket>,
      key: string | null,
      stage: LeadStage,
    ) => {
      if (!key) return;
      const cur = m.get(key) ?? {
        leadCount: 0,
        qualifiedCount: 0,
        convertedCount: 0,
      };
      cur.leadCount += 1;
      if (QUALIFIED_AT_OR_BEYOND.has(stage)) cur.qualifiedCount += 1;
      if (stage === 'converted') cur.convertedCount += 1;
      m.set(key, cur);
    };

    for (const r of rows) {
      inc(sources, r.source, r.stage);
      inc(categories, r.category ?? null, r.stage);
    }

    const shape = (k: string, v: Bucket) => ({
      leadCount: v.leadCount,
      qualifiedCount: v.qualifiedCount,
      convertedCount: v.convertedCount,
      qualifiedRate: v.leadCount > 0 ? v.qualifiedCount / v.leadCount : 0,
      convertedRate: v.leadCount > 0 ? v.convertedCount / v.leadCount : 0,
    });

    const bySource = Array.from(sources.entries())
      .map(([source, v]) => ({ source, ...shape(source, v) }))
      .sort((a, b) => b.leadCount - a.leadCount);

    const byCategory = Array.from(categories.entries())
      .map(([category, v]) => ({ category, ...shape(category, v) }))
      .sort((a, b) => b.leadCount - a.leadCount)
      .slice(0, 20);

    return { bySource, byCategory };
  }

  // ─── Activity volume ───────────────────────────────────────────────────

  async activityVolume(days: number): Promise<ActivityVolumeReport> {
    const cutoff = startOfDayDaysAgo(days);
    const dateKeys = generateDateKeys(days);

    // 7 grouped raw queries — one per metric. All zero-filled against
    // the date-key spine. Using $queryRaw because Prisma doesn't expose
    // date_trunc out of the box for groupBy across these many tables.
    const [
      sentRows,
      openedRows,
      repliedRows,
      callsRows,
      meetingsRows,
      proposalsRows,
      leadsRows,
    ] = await Promise.all([
      this.prisma.$queryRaw<{ d: Date; n: bigint }[]>`
        SELECT date_trunc('day', sent_at) AS d, COUNT(*)::bigint AS n
        FROM email_logs
        WHERE sent_at >= ${cutoff}
        GROUP BY 1
      `,
      this.prisma.$queryRaw<{ d: Date; n: bigint }[]>`
        SELECT date_trunc('day', opened_at) AS d, COUNT(*)::bigint AS n
        FROM email_logs
        WHERE opened_at >= ${cutoff}
        GROUP BY 1
      `,
      this.prisma.$queryRaw<{ d: Date; n: bigint }[]>`
        SELECT date_trunc('day', replied_at) AS d, COUNT(*)::bigint AS n
        FROM email_logs
        WHERE replied_at >= ${cutoff}
        GROUP BY 1
      `,
      this.prisma.$queryRaw<{ d: Date; n: bigint }[]>`
        SELECT date_trunc('day', occurred_at) AS d, COUNT(*)::bigint AS n
        FROM calls
        WHERE status = 'completed' AND occurred_at >= ${cutoff}
        GROUP BY 1
      `,
      this.prisma.$queryRaw<{ d: Date; n: bigint }[]>`
        SELECT date_trunc('day', updated_at) AS d, COUNT(*)::bigint AS n
        FROM meetings
        WHERE status = 'completed' AND updated_at >= ${cutoff}
        GROUP BY 1
      `,
      this.prisma.$queryRaw<{ d: Date; n: bigint }[]>`
        SELECT date_trunc('day', sent_at) AS d, COUNT(*)::bigint AS n
        FROM proposals
        WHERE sent_at >= ${cutoff}
        GROUP BY 1
      `,
      this.prisma.$queryRaw<{ d: Date; n: bigint }[]>`
        SELECT date_trunc('day', created_at) AS d, COUNT(*)::bigint AS n
        FROM leads
        WHERE created_at >= ${cutoff}
        GROUP BY 1
      `,
    ]);

    const sent = mapByDateKey(sentRows);
    const opened = mapByDateKey(openedRows);
    const replied = mapByDateKey(repliedRows);
    const calls = mapByDateKey(callsRows);
    const meetings = mapByDateKey(meetingsRows);
    const proposals = mapByDateKey(proposalsRows);
    const leads = mapByDateKey(leadsRows);

    const perDay = dateKeys.map((date) => ({
      date,
      emailsSent: sent.get(date) ?? 0,
      emailsOpened: opened.get(date) ?? 0,
      emailsReplied: replied.get(date) ?? 0,
      callsLogged: calls.get(date) ?? 0,
      meetingsHeld: meetings.get(date) ?? 0,
      proposalsSent: proposals.get(date) ?? 0,
      leadsAdded: leads.get(date) ?? 0,
    }));

    const totals = perDay.reduce(
      (acc, d) => {
        acc.emailsSent += d.emailsSent;
        acc.emailsOpened += d.emailsOpened;
        acc.emailsReplied += d.emailsReplied;
        acc.callsLogged += d.callsLogged;
        acc.meetingsHeld += d.meetingsHeld;
        acc.proposalsSent += d.proposalsSent;
        acc.leadsAdded += d.leadsAdded;
        return acc;
      },
      {
        emailsSent: 0,
        emailsOpened: 0,
        emailsReplied: 0,
        callsLogged: 0,
        meetingsHeld: 0,
        proposalsSent: 0,
        leadsAdded: 0,
      },
    );

    return { perDay, totals };
  }

  // ─── Follow-up health ──────────────────────────────────────────────────

  async followupHealth(): Promise<FollowupHealthReport> {
    const FOLLOWUP: Prisma.TaskWhereInput = { kind: 'followup' };
    const OPEN: TaskStatus[] = ['open', 'in_progress'];
    const now = new Date();
    const startOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const endOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59,
      999,
    );
    const fourteenDaysAgo = new Date(
      now.getTime() - 14 * 24 * 60 * 60 * 1000,
    );

    const [
      statusGroups,
      contextGroups,
      priorityGroups,
      todayCount,
      overdueCount,
      upcomingCount,
      completedCount,
      doneTasks,
      staleOpenCount,
    ] = await Promise.all([
      this.prisma.task.groupBy({
        by: ['status'],
        where: FOLLOWUP,
        _count: { _all: true },
      }),
      this.prisma.task.groupBy({
        by: ['context'],
        where: { ...FOLLOWUP, status: { in: OPEN }, context: { not: 'none' } },
        _count: { _all: true },
      }),
      this.prisma.task.groupBy({
        by: ['priority'],
        where: { ...FOLLOWUP, status: { in: OPEN } },
        _count: { _all: true },
      }),
      this.prisma.task.count({
        where: {
          ...FOLLOWUP,
          status: { in: OPEN },
          dueAt: { gte: startOfDay, lte: endOfDay },
        },
      }),
      this.prisma.task.count({
        where: { ...FOLLOWUP, status: { in: OPEN }, dueAt: { lt: now } },
      }),
      this.prisma.task.count({
        where: { ...FOLLOWUP, status: { in: OPEN }, dueAt: { gt: endOfDay } },
      }),
      this.prisma.task.count({ where: { ...FOLLOWUP, status: 'done' } }),
      this.prisma.task.findMany({
        where: { ...FOLLOWUP, status: 'done', completedAt: { not: null } },
        select: { createdAt: true, completedAt: true },
        take: 1000,
      }),
      this.prisma.task.count({
        where: {
          ...FOLLOWUP,
          status: { in: OPEN },
          createdAt: { lt: fourteenDaysAgo },
        },
      }),
    ]);

    const byStatus: FollowupHealthReport['byStatus'] = (
      ['open', 'in_progress', 'done', 'cancelled'] as TaskStatus[]
    ).map((status) => ({
      status,
      count:
        statusGroups.find((g) => g.status === status)?._count._all ?? 0,
    }));

    const byContext = contextGroups
      .map((g) => ({ context: g.context, count: g._count._all }))
      .sort((a, b) => b.count - a.count);

    const byPriority: FollowupHealthReport['byPriority'] = (
      ['low', 'medium', 'high', 'urgent'] as TaskPriority[]
    ).map((priority) => ({
      priority,
      count:
        priorityGroups.find((g) => g.priority === priority)?._count._all ?? 0,
    }));

    const byBucket: FollowupHealthReport['byBucket'] = [
      { bucket: 'today', count: todayCount },
      { bucket: 'overdue', count: overdueCount },
      { bucket: 'upcoming', count: upcomingCount },
      { bucket: 'completed', count: completedCount },
    ];

    let averageCompletionDays: number | null = null;
    if (doneTasks.length > 0) {
      const totalMs = doneTasks.reduce((s, t) => {
        if (!t.completedAt) return s;
        return s + (t.completedAt.getTime() - t.createdAt.getTime());
      }, 0);
      averageCompletionDays =
        totalMs / doneTasks.length / (1000 * 60 * 60 * 24);
    }

    return {
      byStatus,
      byBucket,
      byContext,
      byPriority,
      averageCompletionDays,
      staleOpenCount,
    };
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────

function startOfDayDaysAgo(days: number): Date {
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  return new Date(startOfToday.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
}

function generateDateKeys(days: number): string[] {
  const out: string[] = [];
  const cutoff = startOfDayDaysAgo(days);
  for (let i = 0; i < days; i += 1) {
    const d = new Date(cutoff.getTime() + i * 24 * 60 * 60 * 1000);
    out.push(formatDateKey(d));
  }
  return out;
}

function formatDateKey(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function mapByDateKey(rows: { d: Date; n: bigint }[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) {
    const key = formatDateKey(r.d);
    out.set(key, Number(r.n));
  }
  return out;
}
