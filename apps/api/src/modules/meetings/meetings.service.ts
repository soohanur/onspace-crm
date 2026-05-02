import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  MeetingStatus,
  MeetingType,
  Prisma,
} from '@onspace/db';
import { PrismaService } from '../../prisma/prisma.service';
import { StageAutomationService } from '../leads/stage-automation.service';
import { CreateMeetingDto, UpdateMeetingDto } from './dto';

export type MeetingBucket = 'upcoming' | 'today' | 'past' | 'cancelled';

export interface ListMeetingsFilter {
  status?: MeetingStatus[];
  type?: MeetingType[];
  leadId?: string;
  assignedTo?: string;
  bucket?: MeetingBucket;
  take?: number;
  cursor?: string;
}

@Injectable()
export class MeetingsService {
  private readonly log = new Logger(MeetingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stageAutomation: StageAutomationService,
  ) {}

  // ─── List / detail ─────────────────────────────────────────────────────

  async list(filter: ListMeetingsFilter) {
    const where = this.buildWhere(filter);
    const take = Math.min(Math.max(filter.take ?? 50, 1), 200);
    const items = await this.prisma.meeting.findMany({
      where,
      orderBy: [
        { scheduledAt: 'asc' },
        { createdAt: 'desc' },
      ],
      take: take + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      include: {
        lead:    { select: { id: true, businessName: true, stage: true, city: true, state: true } },
        contact: { select: { id: true, name: true, contactType: true } },
      },
    });
    const hasMore = items.length > take;
    return {
      items: hasMore ? items.slice(0, take) : items,
      nextCursor: hasMore ? items[take - 1]?.id ?? null : null,
    };
  }

  async listForLead(leadId: string) {
    const lead = await this.prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) throw new NotFoundException('Lead not found');
    return this.prisma.meeting.findMany({
      where: { leadId },
      orderBy: { scheduledAt: 'desc' },
      include: {
        contact: { select: { id: true, name: true, contactType: true } },
      },
      take: 200,
    });
  }

  async findOne(id: string) {
    const m = await this.prisma.meeting.findUnique({
      where: { id },
      include: {
        lead:    { select: { id: true, businessName: true, stage: true } },
        contact: { select: { id: true, name: true, contactType: true } },
      },
    });
    if (!m) throw new NotFoundException('Meeting not found');
    return m;
  }

  /**
   * Bucket counts in a single round-trip — used by the /meetings page
   * tab badges. Cheaper than four separate list queries.
   */
  async bucketCounts() {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const [upcoming, today, past, cancelled] = await Promise.all([
      this.prisma.meeting.count({
        where: { status: 'scheduled', scheduledAt: { gt: now } },
      }),
      this.prisma.meeting.count({
        where: {
          status: 'scheduled',
          scheduledAt: { gte: startOfDay, lte: endOfDay },
        },
      }),
      this.prisma.meeting.count({
        where: {
          scheduledAt: { lt: now },
          status: { in: ['completed', 'no_show', 'scheduled'] },
        },
      }),
      this.prisma.meeting.count({ where: { status: 'cancelled' } }),
    ]);
    return { upcoming, today, past, cancelled };
  }

  // ─── Mutations ─────────────────────────────────────────────────────────

  async create(dto: CreateMeetingDto) {
    const lead = await this.prisma.lead.findUnique({
      where: { id: dto.leadId },
      select: { id: true },
    });
    if (!lead) throw new NotFoundException('Lead not found');

    if (dto.contactId) {
      const c = await this.prisma.contact.findUnique({
        where: { id: dto.contactId },
        select: { leadId: true },
      });
      if (!c || c.leadId !== dto.leadId) {
        throw new BadRequestException('Contact does not belong to lead');
      }
    }

    const created = await this.prisma.meeting.create({
      data: {
        leadId: dto.leadId,
        contactId: dto.contactId ?? null,
        title: dto.title.trim(),
        type: dto.type ?? 'phone',
        meetingLink: nullify(dto.meetingLink),
        scheduledAt: new Date(dto.scheduledAt),
        durationMin: dto.durationMin ?? 30,
        status: dto.status ?? 'scheduled',
        notes: nullify(dto.notes),
        nextAction: nullify(dto.nextAction),
        assignedTo: nullify(dto.assignedTo),
      },
      include: {
        lead:    { select: { id: true, businessName: true, stage: true } },
        contact: { select: { id: true, name: true, contactType: true } },
      },
    });

    // Forward-only stage promotion. Wrapped internally; never bubbles.
    await this.stageAutomation.onMeetingScheduled(created.leadId);

    return created;
  }

  async update(id: string, dto: UpdateMeetingDto) {
    const existing = await this.prisma.meeting.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Meeting not found');

    if (dto.contactId) {
      const c = await this.prisma.contact.findUnique({
        where: { id: dto.contactId },
        select: { leadId: true },
      });
      if (!c || c.leadId !== existing.leadId) {
        throw new BadRequestException('Contact does not belong to lead');
      }
    }

    const data: Prisma.MeetingUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title.trim();
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.meetingLink !== undefined) data.meetingLink = nullify(dto.meetingLink);
    if (dto.scheduledAt !== undefined) data.scheduledAt = new Date(dto.scheduledAt);
    if (dto.durationMin !== undefined) data.durationMin = dto.durationMin;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.notes !== undefined) data.notes = nullify(dto.notes);
    if (dto.nextAction !== undefined) data.nextAction = nullify(dto.nextAction);
    if (dto.assignedTo !== undefined) data.assignedTo = nullify(dto.assignedTo);
    if (dto.contactId !== undefined) {
      data.contact = dto.contactId
        ? { connect: { id: dto.contactId } }
        : { disconnect: true };
    }

    const updated = await this.prisma.meeting.update({
      where: { id },
      data,
      include: {
        lead:    { select: { id: true, businessName: true, stage: true } },
        contact: { select: { id: true, name: true, contactType: true } },
      },
    });

    // Side-effect on completion transition.
    if (
      dto.status === 'completed' &&
      existing.status !== 'completed'
    ) {
      await this.stageAutomation.onMeetingCompleted(updated.id);
    }

    return updated;
  }

  async remove(id: string) {
    const m = await this.prisma.meeting.findUnique({ where: { id } });
    if (!m) throw new NotFoundException('Meeting not found');
    await this.prisma.meeting.delete({ where: { id } });
    return { ok: true as const };
  }

  // ─── Where-clause builder ──────────────────────────────────────────────

  private buildWhere(f: ListMeetingsFilter): Prisma.MeetingWhereInput {
    const where: Prisma.MeetingWhereInput = {};
    const AND: Prisma.MeetingWhereInput[] = [];

    if (f.leadId) where.leadId = f.leadId;
    if (f.assignedTo) where.assignedTo = f.assignedTo;
    if (f.status?.length) where.status = { in: f.status };
    if (f.type?.length) where.type = { in: f.type };

    if (f.bucket) {
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      switch (f.bucket) {
        case 'upcoming':
          AND.push({ status: 'scheduled', scheduledAt: { gt: now } });
          break;
        case 'today':
          AND.push({
            status: 'scheduled',
            scheduledAt: { gte: startOfDay, lte: endOfDay },
          });
          break;
        case 'past':
          AND.push({
            scheduledAt: { lt: now },
            status: { in: ['completed', 'no_show', 'scheduled'] },
          });
          break;
        case 'cancelled':
          AND.push({ status: 'cancelled' });
          break;
      }
    }

    if (AND.length) where.AND = AND;
    return where;
  }
}

function nullify(v?: string | null): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const t = v.trim();
  return t === '' ? null : t;
}
