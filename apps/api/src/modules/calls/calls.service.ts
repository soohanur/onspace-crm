import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  CallDirection,
  CallOutcome,
  CallStatus,
  Prisma,
} from '@onspace/db';
import { PrismaService } from '../../prisma/prisma.service';
import { StageAutomationService } from '../leads/stage-automation.service';
import { CreateCallDto, UpdateCallDto } from './dto';

export type CallBucket = 'scheduled' | 'today' | 'recent' | 'all';

export interface ListCallsFilter {
  direction?: CallDirection[];
  outcome?: CallOutcome[];
  status?: CallStatus[];
  leadId?: string;
  assignedTo?: string;
  bucket?: CallBucket;
  /** When true, return only soft-deleted (trashed) calls. */
  trash?: boolean;
  take?: number;
  cursor?: string;
}

const CALL_INCLUDE = {
  lead:    { select: { id: true, businessName: true, stage: true, city: true, state: true } },
  contact: { select: { id: true, name: true, contactType: true, phone: true } },
} as const;

@Injectable()
export class CallsService {
  private readonly log = new Logger(CallsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stageAutomation: StageAutomationService,
  ) {}

  // ─── Reads ─────────────────────────────────────────────────────────────

  async list(filter: ListCallsFilter) {
    const where = this.buildWhere(filter);
    const take = Math.min(Math.max(filter.take ?? 50, 1), 200);
    const items = await this.prisma.call.findMany({
      where,
      orderBy: [
        { occurredAt: 'desc' },
        { createdAt: 'desc' },
      ],
      take: take + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      include: CALL_INCLUDE,
    });
    const hasMore = items.length > take;
    return {
      items: hasMore ? items.slice(0, take) : items,
      nextCursor: hasMore ? items[take - 1]?.id ?? null : null,
    };
  }

  async listForLead(leadId: string) {
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      select: { id: true },
    });
    if (!lead) throw new NotFoundException('Lead not found');
    return this.prisma.call.findMany({
      where: { leadId, deletedAt: null },
      orderBy: { occurredAt: 'desc' },
      include: CALL_INCLUDE,
      take: 200,
    });
  }

  async findOne(id: string) {
    const c = await this.prisma.call.findUnique({
      where: { id },
      include: CALL_INCLUDE,
    });
    if (!c) throw new NotFoundException('Call not found');
    return c;
  }

  /**
   * Bucket counts driven by the same predicates as `list()`. Single
   * round-trip — cheaper than four findMany calls just to count.
   */
  async bucketCounts() {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [scheduled, today, recent, total, trash] = await Promise.all([
      this.prisma.call.count({
        where: { deletedAt: null, status: 'scheduled', occurredAt: { gt: now } },
      }),
      this.prisma.call.count({
        where: {
          deletedAt: null,
          status: 'completed',
          occurredAt: { gte: startOfDay, lte: endOfDay },
        },
      }),
      this.prisma.call.count({
        where: {
          deletedAt: null,
          status: 'completed',
          occurredAt: { gte: sevenDaysAgo },
        },
      }),
      this.prisma.call.count({ where: { deletedAt: null } }),
      this.prisma.call.count({ where: { deletedAt: { not: null } } }),
    ]);
    return { scheduled, today, recent, total, trash };
  }

  // ─── Mutations ─────────────────────────────────────────────────────────

  async create(dto: CreateCallDto) {
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

    const status = dto.status ?? 'completed';
    if (status === 'completed' && !dto.outcome) {
      throw new BadRequestException(
        'A completed call requires an outcome (answered, no_answer, voicemail, …).',
      );
    }

    const created = await this.prisma.call.create({
      data: {
        leadId: dto.leadId,
        contactId: dto.contactId ?? null,
        direction: dto.direction,
        toPhone: nullify(dto.toPhone),
        fromPhone: nullify(dto.fromPhone),
        occurredAt: new Date(dto.occurredAt),
        durationSec: dto.durationSec ?? null,
        outcome: dto.outcome ?? null,
        status,
        notes: nullify(dto.notes),
        voicemailLeft: dto.voicemailLeft ?? false,
        nextAction: nullify(dto.nextAction),
        assignedTo: nullify(dto.assignedTo),
      },
      include: CALL_INCLUDE,
    });

    if (created.status === 'completed') {
      await this.stageAutomation.onCallLogged(created.id);
    }
    return created;
  }

  async update(id: string, dto: UpdateCallDto) {
    const existing = await this.prisma.call.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Call not found');

    if (dto.contactId) {
      const c = await this.prisma.contact.findUnique({
        where: { id: dto.contactId },
        select: { leadId: true },
      });
      if (!c || c.leadId !== existing.leadId) {
        throw new BadRequestException('Contact does not belong to lead');
      }
    }

    const data: Prisma.CallUpdateInput = {};
    if (dto.direction !== undefined) data.direction = dto.direction;
    if (dto.toPhone !== undefined) data.toPhone = nullify(dto.toPhone);
    if (dto.fromPhone !== undefined) data.fromPhone = nullify(dto.fromPhone);
    if (dto.occurredAt !== undefined) data.occurredAt = new Date(dto.occurredAt);
    if (dto.durationSec !== undefined)
      data.durationSec = dto.durationSec === null ? null : dto.durationSec;
    if (dto.outcome !== undefined)
      data.outcome = dto.outcome === null ? null : dto.outcome;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.notes !== undefined) data.notes = nullify(dto.notes);
    if (dto.voicemailLeft !== undefined) data.voicemailLeft = dto.voicemailLeft;
    if (dto.nextAction !== undefined) data.nextAction = nullify(dto.nextAction);
    if (dto.assignedTo !== undefined) data.assignedTo = nullify(dto.assignedTo);
    if (dto.contactId !== undefined) {
      data.contact = dto.contactId
        ? { connect: { id: dto.contactId } }
        : { disconnect: true };
    }

    const updated = await this.prisma.call.update({
      where: { id },
      data,
      include: CALL_INCLUDE,
    });

    // A previously-scheduled call now happened — fire the deferred
    // automation. Other status transitions (completed → cancelled,
    // edits to a completed call's notes, etc.) don't re-fire.
    const becameCompleted =
      dto.status === 'completed' && existing.status !== 'completed';
    if (becameCompleted) {
      await this.stageAutomation.onCallLogged(updated.id);
    }
    return updated;
  }

  /** Soft-delete: moves the call to trash. Idempotent if already trashed. */
  async remove(id: string) {
    const existing = await this.prisma.call.findUnique({
      where: { id },
      select: { id: true, deletedAt: true },
    });
    if (!existing) throw new NotFoundException('Call not found');
    if (!existing.deletedAt) {
      await this.prisma.call.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
    }
    return { ok: true as const };
  }

  /** Restore a trashed call. */
  async restore(id: string) {
    const existing = await this.prisma.call.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Call not found');
    return this.prisma.call.update({
      where: { id },
      data: { deletedAt: null },
      include: CALL_INCLUDE,
    });
  }

  /** Hard-delete: only allowed on already-trashed calls. */
  async purge(id: string) {
    const existing = await this.prisma.call.findUnique({
      where: { id },
      select: { id: true, deletedAt: true },
    });
    if (!existing) throw new NotFoundException('Call not found');
    if (!existing.deletedAt) {
      throw new BadRequestException('Move the call to trash before deleting it permanently.');
    }
    await this.prisma.call.delete({ where: { id } });
    return { ok: true as const };
  }

  // ─── Where-clause builder ──────────────────────────────────────────────

  private buildWhere(f: ListCallsFilter): Prisma.CallWhereInput {
    const where: Prisma.CallWhereInput = {};
    const AND: Prisma.CallWhereInput[] = [];

    where.deletedAt = f.trash ? { not: null } : null;

    if (f.leadId) where.leadId = f.leadId;
    if (f.assignedTo) where.assignedTo = f.assignedTo;
    if (f.direction?.length) where.direction = { in: f.direction };
    if (f.outcome?.length) where.outcome = { in: f.outcome };
    if (f.status?.length) where.status = { in: f.status };

    if (f.bucket && f.bucket !== 'all') {
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      switch (f.bucket) {
        case 'scheduled':
          AND.push({ status: 'scheduled', occurredAt: { gt: now } });
          break;
        case 'today':
          AND.push({
            status: 'completed',
            occurredAt: { gte: startOfDay, lte: endOfDay },
          });
          break;
        case 'recent':
          AND.push({
            status: 'completed',
            occurredAt: { gte: sevenDaysAgo },
          });
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
