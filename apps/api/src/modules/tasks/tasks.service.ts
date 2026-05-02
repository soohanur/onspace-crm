import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  TaskKind,
  TaskContext,
  TaskPriority,
  TaskStatus,
} from '@onspace/db';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTaskDto, UpdateTaskDto } from './dto';

export type TaskBucket = 'today' | 'overdue' | 'upcoming' | 'completed';

export interface ListTasksFilter {
  status?: TaskStatus[];
  kind?: TaskKind;
  context?: TaskContext;
  priority?: TaskPriority[];
  leadId?: string;
  assignedTo?: string;
  dueBefore?: Date;
  dueAfter?: Date;
  bucket?: TaskBucket;
  take?: number;
  cursor?: string;
}

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  async list(filter: ListTasksFilter) {
    const where = this.buildWhere(filter);
    const take = Math.min(Math.max(filter.take ?? 50, 1), 200);
    const items = await this.prisma.task.findMany({
      where,
      orderBy: [
        { dueAt: { sort: 'asc', nulls: 'last' } },
        { createdAt: 'desc' },
      ],
      take: take + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      include: {
        lead: {
          select: { id: true, businessName: true, stage: true, city: true, state: true },
        },
        contact: { select: { id: true, name: true, contactType: true } },
      },
    });
    const hasMore = items.length > take;
    const trimmed = hasMore ? items.slice(0, take) : items;
    return {
      items: trimmed,
      nextCursor: hasMore ? trimmed[trimmed.length - 1]?.id ?? null : null,
    };
  }

  async listForLead(leadId: string) {
    const lead = await this.prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) throw new NotFoundException('Lead not found');
    return this.prisma.task.findMany({
      where: { leadId },
      orderBy: [
        { status: 'asc' }, // open before done
        { dueAt: { sort: 'asc', nulls: 'last' } },
        { createdAt: 'desc' },
      ],
      include: {
        contact: { select: { id: true, name: true, contactType: true } },
      },
      take: 200,
    });
  }

  async findOne(id: string) {
    const t = await this.prisma.task.findUnique({
      where: { id },
      include: {
        lead: {
          select: { id: true, businessName: true, stage: true, city: true, state: true },
        },
        contact: { select: { id: true, name: true, contactType: true } },
      },
    });
    if (!t) throw new NotFoundException('Task not found');
    return t;
  }

  async create(dto: CreateTaskDto) {
    const lead = await this.prisma.lead.findUnique({
      where: { id: dto.leadId },
      select: { id: true, stage: true },
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

    return this.prisma.task.create({
      data: {
        leadId: dto.leadId,
        contactId: dto.contactId ?? null,
        title: dto.title.trim(),
        description: nullify(dto.description),
        status: dto.status ?? 'open',
        priority: dto.priority ?? 'medium',
        kind: dto.kind ?? 'general',
        context: dto.context ?? 'none',
        dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
        // stageAtCreation is server-filled from the lead's current stage so
        // future filters can scope by "tasks created when lead was X".
        stageAtCreation: lead.stage,
        assignedTo: nullify(dto.assignedTo),
      },
      include: {
        lead: {
          select: { id: true, businessName: true, stage: true, city: true, state: true },
        },
        contact: { select: { id: true, name: true, contactType: true } },
      },
    });
  }

  async update(id: string, dto: UpdateTaskDto) {
    const existing = await this.prisma.task.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Task not found');

    if (dto.contactId) {
      const c = await this.prisma.contact.findUnique({
        where: { id: dto.contactId },
        select: { leadId: true },
      });
      if (!c || c.leadId !== existing.leadId) {
        throw new BadRequestException('Contact does not belong to lead');
      }
    }

    const data: Prisma.TaskUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title.trim();
    if (dto.description !== undefined) data.description = nullify(dto.description);
    if (dto.priority !== undefined) data.priority = dto.priority;
    if (dto.kind !== undefined) data.kind = dto.kind;
    if (dto.context !== undefined) data.context = dto.context;
    if (dto.dueAt !== undefined) {
      data.dueAt = dto.dueAt ? new Date(dto.dueAt) : null;
    }
    if (dto.assignedTo !== undefined) data.assignedTo = nullify(dto.assignedTo);
    if (dto.contactId !== undefined) {
      data.contact = dto.contactId
        ? { connect: { id: dto.contactId } }
        : { disconnect: true };
    }
    if (dto.status !== undefined) {
      data.status = dto.status;
      if (dto.status === 'done') {
        // Server-side stamp so client clocks don't matter.
        data.completedAt = new Date();
      } else if (existing.status === 'done') {
        // Reopened from done → clear the completion timestamp.
        data.completedAt = null;
      }
    }

    return this.prisma.task.update({
      where: { id },
      data,
      include: {
        lead: {
          select: { id: true, businessName: true, stage: true, city: true, state: true },
        },
        contact: { select: { id: true, name: true, contactType: true } },
      },
    });
  }

  async remove(id: string) {
    const t = await this.prisma.task.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('Task not found');
    await this.prisma.task.delete({ where: { id } });
    return { ok: true as const };
  }

  /**
   * Bulk open-task counts for a list of lead IDs. The leads table calls
   * this with the page's visible row IDs so the column can show a badge
   * without N+1 round-trips.
   */
  async openCountsByLead(leadIds: string[]): Promise<Record<string, number>> {
    if (leadIds.length === 0) return {};
    const rows = await this.prisma.task.groupBy({
      by: ['leadId'],
      where: {
        leadId: { in: leadIds },
        status: { in: ['open', 'in_progress'] },
      },
      _count: { _all: true },
    });
    const out: Record<string, number> = {};
    for (const id of leadIds) out[id] = 0;
    for (const r of rows) out[r.leadId] = r._count._all;
    return out;
  }

  // ─── Where-clause builder ───────────────────────────────────────────────

  private buildWhere(f: ListTasksFilter): Prisma.TaskWhereInput {
    const where: Prisma.TaskWhereInput = {};
    const AND: Prisma.TaskWhereInput[] = [];

    if (f.leadId) where.leadId = f.leadId;
    if (f.kind) where.kind = f.kind;
    if (f.context) where.context = f.context;
    if (f.assignedTo) where.assignedTo = f.assignedTo;
    if (f.status && f.status.length) where.status = { in: f.status };
    if (f.priority && f.priority.length) where.priority = { in: f.priority };

    if (f.dueBefore || f.dueAfter) {
      where.dueAt = {
        ...(f.dueAfter ? { gte: f.dueAfter } : {}),
        ...(f.dueBefore ? { lte: f.dueBefore } : {}),
      };
    }

    if (f.bucket) {
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
      const open: TaskStatus[] = ['open', 'in_progress'];
      switch (f.bucket) {
        case 'today':
          AND.push({
            status: { in: open },
            dueAt: { gte: startOfDay, lte: endOfDay },
          });
          break;
        case 'overdue':
          AND.push({
            status: { in: open },
            dueAt: { lt: now },
          });
          break;
        case 'upcoming':
          AND.push({
            status: { in: open },
            dueAt: { gt: endOfDay },
          });
          break;
        case 'completed':
          AND.push({ status: 'done' });
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
