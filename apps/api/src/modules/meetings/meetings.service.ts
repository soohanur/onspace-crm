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
import { EmailAccountsService } from '../email/email-accounts.service';
import { GoogleCalendarService } from '../email/google-calendar.service';
import { accountHasCalendarScope } from '../email/scopes';
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

const NO_SCOPE_MSG = 'no calendar-scoped account available';

@Injectable()
export class MeetingsService {
  private readonly log = new Logger(MeetingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stageAutomation: StageAutomationService,
    private readonly emailAccounts: EmailAccountsService,
    private readonly calendar: GoogleCalendarService,
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
        account: { select: { id: true, email: true, displayName: true } },
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
        account: { select: { id: true, email: true, displayName: true } },
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
        account: { select: { id: true, email: true, displayName: true } },
      },
    });
    if (!m) throw new NotFoundException('Meeting not found');
    return m;
  }

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
      select: { id: true, email: true },
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

    // Resolve attendees: prefer explicit list, else primary contact email,
    // else lead.email. Empty array is fine — we just won't invite anyone.
    let attendees = dto.attendeeEmails ?? [];
    if (attendees.length === 0) {
      const fallback = await this.resolveDefaultAttendee(dto.leadId, dto.contactId);
      if (fallback) attendees = [fallback];
    }

    // Resolve account for sync.
    const accountId = await this.resolveAccountId(dto.leadId, dto.accountId);

    const created = await this.prisma.meeting.create({
      data: {
        leadId: dto.leadId,
        contactId: dto.contactId ?? null,
        accountId,
        title: dto.title.trim(),
        type: dto.type ?? 'phone',
        meetingLink: nullify(dto.meetingLink),
        scheduledAt: new Date(dto.scheduledAt),
        durationMin: dto.durationMin ?? 30,
        status: dto.status ?? 'scheduled',
        notes: nullify(dto.notes),
        nextAction: nullify(dto.nextAction),
        assignedTo: nullify(dto.assignedTo),
        attendeeEmails: attendees,
      },
      include: {
        lead:    { select: { id: true, businessName: true, stage: true } },
        contact: { select: { id: true, name: true, contactType: true } },
        account: { select: { id: true, email: true, displayName: true } },
      },
    });

    // Sync to GCal — wrapped, never throws.
    const synced = await this.syncCreate(created.id);

    // Forward-only stage promotion. Independent of sync result.
    await this.stageAutomation.onMeetingScheduled(created.leadId);

    return synced ?? created;
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
    if (dto.attendeeEmails !== undefined) data.attendeeEmails = dto.attendeeEmails;
    if (dto.contactId !== undefined) {
      data.contact = dto.contactId
        ? { connect: { id: dto.contactId } }
        : { disconnect: true };
    }
    if (dto.accountId !== undefined) {
      data.account = dto.accountId
        ? { connect: { id: dto.accountId } }
        : { disconnect: true };
    }

    const updated = await this.prisma.meeting.update({
      where: { id },
      data,
      include: {
        lead:    { select: { id: true, businessName: true, stage: true } },
        contact: { select: { id: true, name: true, contactType: true } },
        account: { select: { id: true, email: true, displayName: true } },
      },
    });

    // Decide what to do with the GCal event based on transitions.
    const becameCancelled = dto.status === 'cancelled' && existing.status !== 'cancelled';
    const becameCompleted = dto.status === 'completed' && existing.status !== 'completed';

    if (becameCancelled) {
      // Delete the GCal event so attendees get a cancellation email.
      const synced = await this.syncCancel(updated.id);
      if (becameCompleted) {
        // Defensive: a single PATCH can't be both; only fires its own branch.
      }
      if (synced) return synced;
    } else if (didSchedulingChange(existing, dto)) {
      // Anything attendees would care about changed → re-sync.
      const synced = await this.syncUpdate(updated.id);
      if (synced) {
        if (becameCompleted) {
          await this.stageAutomation.onMeetingCompleted(updated.id);
        }
        return synced;
      }
    }

    if (becameCompleted) {
      await this.stageAutomation.onMeetingCompleted(updated.id);
    }

    return updated;
  }

  async remove(id: string) {
    const m = await this.prisma.meeting.findUnique({ where: { id } });
    if (!m) throw new NotFoundException('Meeting not found');

    // Best-effort GCal delete first; failure logs but never blocks the
    // local delete. Orphan events are unfortunate but tolerable.
    if (m.externalEventId && m.accountId) {
      try {
        const { accessToken, refreshToken } = await this.emailAccounts.getReadyForSend(m.accountId);
        await this.calendar.deleteEvent({
          accessToken,
          refreshToken,
          eventId: m.externalEventId,
        });
      } catch (err) {
        this.log.warn(
          `[meeting:${id}] best-effort GCal delete failed before local delete: ${
            err instanceof Error ? err.message : err
          } (event ${m.externalEventId} may now be orphaned in Google Calendar)`,
        );
      }
    }

    await this.prisma.meeting.delete({ where: { id } });
    return { ok: true as const };
  }

  /**
   * Manual retry trigger from the UI. Idempotent: if the event already
   * exists upstream we patch; otherwise we insert. Cancelled / completed
   * meetings are no-ops.
   */
  async syncNow(id: string) {
    const m = await this.prisma.meeting.findUnique({ where: { id } });
    if (!m) throw new NotFoundException('Meeting not found');
    if (m.status === 'cancelled' || m.status === 'completed') {
      return this.findOne(id);
    }
    if (m.externalEventId) {
      await this.syncUpdate(id);
    } else {
      await this.syncCreate(id);
    }
    return this.findOne(id);
  }

  // ─── Internal helpers ──────────────────────────────────────────────────

  private async syncCreate(meetingId: string) {
    const m = await this.prisma.meeting.findUnique({ where: { id: meetingId } });
    if (!m) return null;
    if (!m.accountId) {
      return this.recordSyncSkip(meetingId, NO_SCOPE_MSG);
    }
    const account = await this.prisma.emailAccount.findUnique({
      where: { id: m.accountId },
      select: { id: true, scopes: true, active: true },
    });
    if (!account || !account.active || !accountHasCalendarScope(account.scopes)) {
      return this.recordSyncSkip(meetingId, NO_SCOPE_MSG);
    }
    try {
      const { accessToken, refreshToken } = await this.emailAccounts.getReadyForSend(m.accountId);
      const result = await this.calendar.createEvent({
        accessToken,
        refreshToken,
        summary: m.title,
        description: m.notes ?? undefined,
        location: this.locationFor(m.type, m.meetingLink),
        start: m.scheduledAt,
        end: new Date(m.scheduledAt.getTime() + m.durationMin * 60_000),
        attendeeEmails: m.attendeeEmails,
      });
      return this.recordSyncSuccess(meetingId, result.eventId, result.htmlLink);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log.warn(`[meeting:${meetingId}] createEvent failed: ${msg}`);
      return this.recordSyncFailure(meetingId, msg);
    }
  }

  private async syncUpdate(meetingId: string) {
    const m = await this.prisma.meeting.findUnique({ where: { id: meetingId } });
    if (!m) return null;
    if (!m.accountId) return this.recordSyncSkip(meetingId, NO_SCOPE_MSG);

    const account = await this.prisma.emailAccount.findUnique({
      where: { id: m.accountId },
      select: { id: true, scopes: true, active: true },
    });
    if (!account || !account.active || !accountHasCalendarScope(account.scopes)) {
      return this.recordSyncSkip(meetingId, NO_SCOPE_MSG);
    }

    try {
      const { accessToken, refreshToken } = await this.emailAccounts.getReadyForSend(m.accountId);
      // No upstream event yet — fall through to create.
      if (!m.externalEventId) {
        const result = await this.calendar.createEvent({
          accessToken,
          refreshToken,
          summary: m.title,
          description: m.notes ?? undefined,
          location: this.locationFor(m.type, m.meetingLink),
          start: m.scheduledAt,
          end: new Date(m.scheduledAt.getTime() + m.durationMin * 60_000),
          attendeeEmails: m.attendeeEmails,
        });
        return this.recordSyncSuccess(meetingId, result.eventId, result.htmlLink);
      }
      await this.calendar.updateEvent({
        accessToken,
        refreshToken,
        eventId: m.externalEventId,
        summary: m.title,
        description: m.notes ?? undefined,
        location: this.locationFor(m.type, m.meetingLink),
        start: m.scheduledAt,
        end: new Date(m.scheduledAt.getTime() + m.durationMin * 60_000),
        attendeeEmails: m.attendeeEmails,
      });
      return this.recordSyncSuccess(meetingId, m.externalEventId, m.externalLink ?? '');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log.warn(`[meeting:${meetingId}] updateEvent failed: ${msg}`);
      return this.recordSyncFailure(meetingId, msg);
    }
  }

  private async syncCancel(meetingId: string) {
    const m = await this.prisma.meeting.findUnique({ where: { id: meetingId } });
    if (!m || !m.externalEventId || !m.accountId) return null;
    try {
      const { accessToken, refreshToken } = await this.emailAccounts.getReadyForSend(m.accountId);
      await this.calendar.deleteEvent({
        accessToken,
        refreshToken,
        eventId: m.externalEventId,
      });
      const updated = await this.prisma.meeting.update({
        where: { id: meetingId },
        data: {
          externalEventId: null,
          externalLink: null,
          lastSyncedAt: new Date(),
          syncError: null,
        },
        include: {
          lead:    { select: { id: true, businessName: true, stage: true } },
          contact: { select: { id: true, name: true, contactType: true } },
          account: { select: { id: true, email: true, displayName: true } },
        },
      });
      return updated;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log.warn(`[meeting:${meetingId}] cancel deleteEvent failed: ${msg}`);
      return this.recordSyncFailure(meetingId, msg);
    }
  }

  private async recordSyncSkip(meetingId: string, reason: string) {
    return this.prisma.meeting.update({
      where: { id: meetingId },
      data: {
        externalProvider: null,
        externalEventId: null,
        externalLink: null,
        lastSyncedAt: new Date(),
        syncError: reason,
      },
      include: {
        lead:    { select: { id: true, businessName: true, stage: true } },
        contact: { select: { id: true, name: true, contactType: true } },
        account: { select: { id: true, email: true, displayName: true } },
      },
    });
  }

  private async recordSyncSuccess(meetingId: string, eventId: string, htmlLink: string) {
    return this.prisma.meeting.update({
      where: { id: meetingId },
      data: {
        externalProvider: 'google_calendar',
        externalEventId: eventId,
        externalLink: htmlLink || null,
        lastSyncedAt: new Date(),
        syncError: null,
      },
      include: {
        lead:    { select: { id: true, businessName: true, stage: true } },
        contact: { select: { id: true, name: true, contactType: true } },
        account: { select: { id: true, email: true, displayName: true } },
      },
    });
  }

  private async recordSyncFailure(meetingId: string, reason: string) {
    return this.prisma.meeting.update({
      where: { id: meetingId },
      data: {
        lastSyncedAt: new Date(),
        syncError: reason,
      },
      include: {
        lead:    { select: { id: true, businessName: true, stage: true } },
        contact: { select: { id: true, name: true, contactType: true } },
        account: { select: { id: true, email: true, displayName: true } },
      },
    });
  }

  /**
   * Pick the EmailAccount most associated with this lead: explicit user
   * choice → most-recently-used for this lead → most-recent overall →
   * any active. Returns null if none active.
   */
  private async resolveAccountId(
    leadId: string,
    explicit?: string | null,
  ): Promise<string | null> {
    if (explicit) {
      const a = await this.prisma.emailAccount.findUnique({
        where: { id: explicit },
        select: { id: true, active: true },
      });
      if (a?.active) return a.id;
    }
    const recentLog = await this.prisma.emailLog.findFirst({
      where: { leadId, accountId: { not: null } },
      orderBy: { sentAt: 'desc' },
      select: { accountId: true },
    });
    if (recentLog?.accountId) {
      const a = await this.prisma.emailAccount.findUnique({
        where: { id: recentLog.accountId },
        select: { id: true, active: true },
      });
      if (a?.active) return a.id;
    }
    const fallback = await this.prisma.emailAccount.findFirst({
      where: { active: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    return fallback?.id ?? null;
  }

  private async resolveDefaultAttendee(
    leadId: string,
    contactId?: string,
  ): Promise<string | null> {
    if (contactId) {
      const c = await this.prisma.contact.findUnique({
        where: { id: contactId },
        select: { email: true },
      });
      if (c?.email) return c.email;
    }
    const primary = await this.prisma.contact.findFirst({
      where: { leadId, isPrimary: true, email: { not: null } },
      select: { email: true },
    });
    if (primary?.email) return primary.email;
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      select: { email: true },
    });
    return lead?.email ?? null;
  }

  private locationFor(type: string, link: string | null): string | undefined {
    if (!link) return undefined;
    if (type === 'in_person') return link;
    // Phone numbers / video links go in description as well, but Google
    // Calendar shows location prominently — keep them visible.
    return link;
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

/**
 * "Did anything attendees would care about change?" — drives whether the
 * GCal event needs a re-sync. Pure DB-side comparison so we don't fire
 * spurious updates when the user only flipped, say, `assignedTo`.
 */
function didSchedulingChange(
  existing: { title: string; notes: string | null; scheduledAt: Date; durationMin: number; meetingLink: string | null; attendeeEmails: string[] },
  dto: UpdateMeetingDto,
): boolean {
  if (dto.title !== undefined && dto.title.trim() !== existing.title) return true;
  if (dto.notes !== undefined && (dto.notes ?? null) !== existing.notes) return true;
  if (
    dto.scheduledAt !== undefined &&
    new Date(dto.scheduledAt).getTime() !== existing.scheduledAt.getTime()
  ) return true;
  if (dto.durationMin !== undefined && dto.durationMin !== existing.durationMin) return true;
  if (dto.meetingLink !== undefined && (dto.meetingLink ?? null) !== existing.meetingLink) return true;
  if (
    dto.attendeeEmails !== undefined &&
    JSON.stringify(dto.attendeeEmails) !== JSON.stringify(existing.attendeeEmails)
  ) return true;
  return false;
}
