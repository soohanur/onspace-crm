import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { EnrollmentStatus, Prisma, SequenceStatus } from '@onspace/db';
import { PrismaService } from '../../prisma/prisma.service';
import { GroupsService } from '../groups/groups.service';
import {
  SEQUENCES_QUEUE,
  SEQUENCE_TICK_JOB,
} from './sequences.constants';
import {
  CreateSequenceDto,
  EnrollLeadsDto,
  UpdateSequenceDto,
} from './dto';

const SEQUENCE_INCLUDE = {
  steps: { orderBy: { order: 'asc' } as const },
  group: { select: { id: true, name: true } },
  account: { select: { id: true, email: true, displayName: true } },
} as const;

interface ResolvedRecipient {
  leadId: string;
  contactId: string | null;
  toEmail: string;
}

@Injectable()
export class SequencesService {
  private readonly log = new Logger(SequencesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly groups: GroupsService,
    @InjectQueue(SEQUENCES_QUEUE) private readonly queue: Queue,
  ) {}

  // ─── Reads ─────────────────────────────────────────────────────────────

  async list(filter: { status?: SequenceStatus[] }) {
    const where: Prisma.SequenceWhereInput = {};
    if (filter.status?.length) where.status = { in: filter.status };
    return this.prisma.sequence.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        ...SEQUENCE_INCLUDE,
        _count: { select: { steps: true, enrollments: true } },
      },
    });
  }

  async findOne(id: string) {
    const s = await this.prisma.sequence.findUnique({
      where: { id },
      include: {
        ...SEQUENCE_INCLUDE,
        _count: { select: { steps: true, enrollments: true } },
      },
    });
    if (!s) throw new NotFoundException('Sequence not found');
    return s;
  }

  async listEnrollments(
    sequenceId: string,
    filter: { status?: EnrollmentStatus[]; take?: number; cursor?: string } = {},
  ) {
    await this.assertExists(sequenceId);
    const take = Math.min(Math.max(filter.take ?? 50, 1), 200);
    const items = await this.prisma.sequenceEnrollment.findMany({
      where: {
        sequenceId,
        ...(filter.status?.length ? { status: { in: filter.status } } : {}),
      },
      orderBy: [{ enrolledAt: 'desc' }, { createdAt: 'desc' }],
      take: take + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      include: {
        lead: {
          select: { id: true, businessName: true, stage: true, city: true, state: true },
        },
        contact: { select: { id: true, name: true, contactType: true } },
        sends: {
          orderBy: { sentAt: 'desc' },
          take: 1,
          include: {
            emailLog: {
              select: { id: true, sentAt: true, openedAt: true, repliedAt: true },
            },
          },
        },
      },
    });
    const hasMore = items.length > take;
    return {
      items: hasMore ? items.slice(0, take) : items,
      nextCursor: hasMore ? items[take - 1]?.id ?? null : null,
    };
  }

  async listForLead(leadId: string) {
    return this.prisma.sequenceEnrollment.findMany({
      where: { leadId },
      orderBy: { enrolledAt: 'desc' },
      include: {
        sequence: {
          select: {
            id: true,
            name: true,
            status: true,
            _count: { select: { steps: true } },
          },
        },
        sends: { orderBy: { stepOrder: 'asc' } },
      },
      take: 50,
    });
  }

  // ─── Mutations ─────────────────────────────────────────────────────────

  async create(dto: CreateSequenceDto) {
    if (dto.steps.length === 0) {
      throw new BadRequestException('At least one step is required');
    }
    // Validate templateIds + accountId + groupId.
    const account = await this.prisma.emailAccount.findUnique({
      where: { id: dto.accountId },
      select: { id: true, active: true },
    });
    if (!account?.active) {
      throw new BadRequestException('Account not active');
    }
    if (dto.groupId) {
      const g = await this.prisma.leadGroup.findUnique({
        where: { id: dto.groupId },
        select: { id: true },
      });
      if (!g) throw new BadRequestException('Group not found');
    }
    const templateIds = Array.from(new Set(dto.steps.map((s) => s.templateId)));
    const found = await this.prisma.emailTemplate.findMany({
      where: { id: { in: templateIds } },
      select: { id: true },
    });
    if (found.length !== templateIds.length) {
      throw new BadRequestException('One or more templates not found');
    }

    return this.prisma.sequence.create({
      data: {
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        groupId: dto.groupId ?? null,
        accountId: dto.accountId,
        dailySendLimit: dto.dailySendLimit ?? 250,
        sendIntervalSec: dto.sendIntervalSec ?? 12,
        steps: {
          create: dto.steps.map((s, idx) => ({
            order: idx,
            // First step always fires immediately on enrollment, regardless
            // of what the caller sent for delayDays.
            delayDays: idx === 0 ? 0 : s.delayDays,
            templateId: s.templateId,
            stopOnReply: s.stopOnReply ?? true,
            stopOnStageProgression: s.stopOnStageProgression ?? true,
          })),
        },
      },
      include: {
        ...SEQUENCE_INCLUDE,
        _count: { select: { steps: true, enrollments: true } },
      },
    });
  }

  async update(id: string, dto: UpdateSequenceDto) {
    const existing = await this.findOne(id);
    if (existing.status === 'archived') {
      throw new ConflictException('Archived sequences are read-only');
    }
    return this.prisma.sequence.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description?.trim() || null }
          : {}),
        ...(dto.dailySendLimit !== undefined
          ? { dailySendLimit: dto.dailySendLimit }
          : {}),
        ...(dto.sendIntervalSec !== undefined
          ? { sendIntervalSec: dto.sendIntervalSec }
          : {}),
      },
      include: {
        ...SEQUENCE_INCLUDE,
        _count: { select: { steps: true, enrollments: true } },
      },
    });
  }

  async start(id: string) {
    const seq = await this.findOne(id);
    if (seq.status !== 'draft' && seq.status !== 'paused') {
      throw new ConflictException(
        `Cannot start sequence in status=${seq.status}`,
      );
    }

    let enrolledCount = 0;
    let skippedNoEmail = 0;

    if (seq.groupId) {
      const { items: leads } = await this.groups.listLeads(seq.groupId, 5000);
      const recipients = await this.resolveRecipients(leads.map((l: { id: string }) => l.id));
      const existing = await this.prisma.sequenceEnrollment.findMany({
        where: { sequenceId: id },
        select: { leadId: true },
      });
      const already = new Set(existing.map((e) => e.leadId));
      const fresh = recipients.filter((r) => !already.has(r.leadId));
      skippedNoEmail = leads.length - recipients.length;
      enrolledCount = fresh.length;
      if (fresh.length > 0) {
        await this.prisma.sequenceEnrollment.createMany({
          data: fresh.map((r) => ({
            sequenceId: id,
            leadId: r.leadId,
            contactId: r.contactId,
            toEmail: r.toEmail,
            nextStepOrder: 0,
            nextSendAt: new Date(),
          })),
          skipDuplicates: true,
        });
      }
    }

    const updated = await this.prisma.sequence.update({
      where: { id },
      data: {
        status: 'active',
        startedAt: seq.startedAt ?? new Date(),
        enrolledCount: { increment: enrolledCount },
      },
      include: {
        ...SEQUENCE_INCLUDE,
        _count: { select: { steps: true, enrollments: true } },
      },
    });

    await this.kickTick();
    return { sequence: updated, enrolledCount, skippedNoEmail };
  }

  async pause(id: string) {
    const seq = await this.findOne(id);
    if (seq.status !== 'active') {
      throw new ConflictException(
        `Cannot pause sequence in status=${seq.status}`,
      );
    }
    return this.prisma.sequence.update({
      where: { id },
      data: { status: 'paused' },
      include: {
        ...SEQUENCE_INCLUDE,
        _count: { select: { steps: true, enrollments: true } },
      },
    });
  }

  async resume(id: string) {
    const seq = await this.findOne(id);
    if (seq.status !== 'paused') {
      throw new ConflictException(
        `Cannot resume sequence in status=${seq.status}`,
      );
    }
    const updated = await this.prisma.sequence.update({
      where: { id },
      data: { status: 'active' },
      include: {
        ...SEQUENCE_INCLUDE,
        _count: { select: { steps: true, enrollments: true } },
      },
    });
    await this.kickTick();
    return updated;
  }

  async archive(id: string) {
    const seq = await this.findOne(id);
    if (seq.status === 'archived') return seq;
    // Exit every still-active enrollment.
    await this.prisma.sequenceEnrollment.updateMany({
      where: { sequenceId: id, status: 'active' },
      data: {
        status: 'exited_manual',
        exitReason: 'sequence archived',
        exitedAt: new Date(),
      },
    });
    return this.prisma.sequence.update({
      where: { id },
      data: { status: 'archived', archivedAt: new Date() },
      include: {
        ...SEQUENCE_INCLUDE,
        _count: { select: { steps: true, enrollments: true } },
      },
    });
  }

  async remove(id: string) {
    const seq = await this.findOne(id);
    if (seq.status !== 'draft' && seq.status !== 'archived') {
      throw new ConflictException(
        'Only draft or archived sequences can be deleted',
      );
    }
    await this.prisma.sequence.delete({ where: { id } });
    return { ok: true as const };
  }

  async enroll(id: string, dto: EnrollLeadsDto) {
    const seq = await this.findOne(id);
    if (seq.status === 'archived') {
      throw new ConflictException('Archived sequences cannot accept new enrollments');
    }
    const recipients = await this.resolveRecipients(dto.leadIds);
    const skippedNoEmail = dto.leadIds.length - recipients.length;
    const existing = await this.prisma.sequenceEnrollment.findMany({
      where: { sequenceId: id, leadId: { in: dto.leadIds } },
      select: { leadId: true },
    });
    const already = new Set(existing.map((e) => e.leadId));
    const fresh = recipients.filter((r) => !already.has(r.leadId));
    const skippedAlreadyEnrolled = recipients.length - fresh.length;
    if (fresh.length > 0) {
      await this.prisma.sequenceEnrollment.createMany({
        data: fresh.map((r) => ({
          sequenceId: id,
          leadId: r.leadId,
          contactId: r.contactId,
          toEmail: r.toEmail,
          nextStepOrder: 0,
          nextSendAt: new Date(),
        })),
        skipDuplicates: true,
      });
      await this.prisma.sequence.update({
        where: { id },
        data: { enrolledCount: { increment: fresh.length } },
      });
      await this.kickTick();
    }
    return {
      enrolled: fresh.length,
      skippedAlreadyEnrolled,
      skippedNoEmail,
    };
  }

  async unenroll(sequenceId: string, enrollmentId: string) {
    const enrollment = await this.prisma.sequenceEnrollment.findUnique({
      where: { id: enrollmentId },
      select: { id: true, sequenceId: true, status: true },
    });
    if (!enrollment || enrollment.sequenceId !== sequenceId) {
      throw new NotFoundException('Enrollment not found');
    }
    if (enrollment.status !== 'active') {
      // Idempotent — already terminal.
      return this.prisma.sequenceEnrollment.findUnique({
        where: { id: enrollmentId },
      });
    }
    const updated = await this.prisma.sequenceEnrollment.update({
      where: { id: enrollmentId },
      data: {
        status: 'exited_manual',
        exitReason: 'manually unenrolled',
        exitedAt: new Date(),
      },
    });
    await this.prisma.sequence.update({
      where: { id: sequenceId },
      data: { exitedCount: { increment: 1 } },
    });
    return updated;
  }

  // ─── Helpers ───────────────────────────────────────────────────────────

  /**
   * Resolve recipient emails for a batch of leads. Skips leads with no
   * resolvable email (no primary contact email AND no lead.email). Returns
   * one ResolvedRecipient per lead that's eligible.
   */
  private async resolveRecipients(leadIds: string[]): Promise<ResolvedRecipient[]> {
    if (leadIds.length === 0) return [];
    const leads = await this.prisma.lead.findMany({
      where: { id: { in: leadIds } },
      select: {
        id: true,
        email: true,
        contacts: {
          where: { email: { not: null } },
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }],
          select: { id: true, email: true, isPrimary: true },
          take: 1,
        },
      },
    });
    const out: ResolvedRecipient[] = [];
    for (const l of leads) {
      const primary = l.contacts[0];
      if (primary?.email) {
        out.push({ leadId: l.id, contactId: primary.id, toEmail: primary.email });
        continue;
      }
      if (l.email) {
        out.push({ leadId: l.id, contactId: null, toEmail: l.email });
      }
    }
    return out;
  }

  /** Schedule a sequence-tick to run ASAP (~1s delay so the worker can pick it up). */
  private async kickTick() {
    try {
      await this.queue.add(
        SEQUENCE_TICK_JOB,
        {},
        {
          jobId: `tick-${Date.now()}`,
          delay: 1_000,
          removeOnComplete: 50,
          removeOnFail: 100,
        },
      );
    } catch (err) {
      this.log.warn(
        `kickTick enqueue failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  private async assertExists(id: string) {
    const seq = await this.prisma.sequence.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!seq) throw new NotFoundException('Sequence not found');
  }
}
