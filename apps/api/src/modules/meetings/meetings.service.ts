import {
  BadRequestException,
  ConflictException,
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
import { GmailService } from '../email/gmail.service';
import { GoogleCalendarService } from '../email/google-calendar.service';
import { accountHasCalendarScope } from '../email/scopes';
import { CreateMeetingDto, UpdateMeetingDto } from './dto';

export type MeetingBucket =
  | 'today'
  | 'upcoming'
  | 'missed'
  | 'cancelled'
  | 'completed'
  | 'this_month'
  | 'all';

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
    private readonly gmail: GmailService,
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

  // ─── Conflict check ────────────────────────────────────────────────────

  /**
   * Returns the first existing scheduled meeting on `accountId` whose
   * time interval overlaps the proposed slot, or null when free. The
   * single Prisma raw query lets us express the half-open-interval
   * overlap rule cleanly. Same-account-only — different accounts can
   * book the same slot.
   *
   * Half-open interval semantics:
   *   conflict ⇔ existing.start < newEnd AND existing.end > newStart
   * `newEnd = newStart + durationMin minutes`. A back-to-back booking
   * (3:00–3:30 then 3:30–4:00) does NOT conflict.
   *
   * If `accountId` is null or empty we skip the check — the meeting
   * isn't getting GCal-synced anyway, so the local "double-booking"
   * concept doesn't apply.
   */
  async conflictCheck(input: {
    accountId: string | null;
    scheduledAt: string | Date;
    durationMin: number;
    excludeMeetingId?: string | null;
  }): Promise<{
    conflict:
      | {
          id: string;
          title: string;
          scheduledAt: string;
          durationMin: number;
          leadId: string;
          leadBusinessName: string;
        }
      | null;
  }> {
    if (!input.accountId) return { conflict: null };
    const start = new Date(input.scheduledAt);
    if (Number.isNaN(start.getTime())) return { conflict: null };
    const end = new Date(start.getTime() + Math.max(1, input.durationMin) * 60_000);

    // We do the half-open overlap math in JS rather than SQL: the raw
    // path got bitten by Postgres implicitly coercing `TIMESTAMP` columns
    // against `timestamptz` binds via the session timezone, which made
    // `scheduled_at + (duration_min * interval) > $start` silently false.
    // Pre-filter in the DB to a tight time window, then compute the
    // exact overlap on the few candidate rows in memory.
    //
    // MAX_DURATION_MIN bounds the lookback for the start side: any
    // meeting whose start is older than (newStart − MAX_DURATION) cannot
    // possibly still be running into our slot.
    const MAX_DURATION_MIN = 24 * 60;
    const lookbackStart = new Date(start.getTime() - MAX_DURATION_MIN * 60_000);

    const candidates = await this.prisma.meeting.findMany({
      where: {
        accountId: input.accountId,
        status: 'scheduled',
        ...(input.excludeMeetingId ? { id: { not: input.excludeMeetingId } } : {}),
        scheduledAt: { gt: lookbackStart, lt: end },
      },
      orderBy: { scheduledAt: 'asc' },
      select: {
        id: true,
        title: true,
        scheduledAt: true,
        durationMin: true,
        leadId: true,
        lead: { select: { businessName: true } },
      },
    });

    const newStartMs = start.getTime();
    const newEndMs = end.getTime();
    const hit = candidates.find((c) => {
      const cStart = c.scheduledAt.getTime();
      const cEnd = cStart + c.durationMin * 60_000;
      // half-open overlap: existing.start < newEnd AND existing.end > newStart
      return cStart < newEndMs && cEnd > newStartMs;
    });
    if (!hit) return { conflict: null };
    return {
      conflict: {
        id: hit.id,
        title: hit.title,
        scheduledAt: hit.scheduledAt.toISOString(),
        durationMin: hit.durationMin,
        leadId: hit.leadId,
        leadBusinessName: hit.lead?.businessName ?? '(unknown)',
      },
    };
  }

  /**
   * Throws ConflictException when the proposed slot overlaps an
   * existing scheduled meeting on the same account. Used by
   * create() / update() before any DB write or GCal call.
   */
  private async assertNoConflict(input: {
    accountId: string | null;
    scheduledAt: string | Date;
    durationMin: number;
    excludeMeetingId?: string | null;
  }): Promise<void> {
    const { conflict } = await this.conflictCheck(input);
    if (!conflict) return;
    throw new ConflictException({
      statusCode: 409,
      message: 'Time conflicts with another scheduled meeting on this account',
      conflict,
    });
  }

  async bucketCounts() {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const [today, upcoming, missed, cancelled, completed, thisMonth, all] =
      await Promise.all([
        this.prisma.meeting.count({
          where: {
            status: 'scheduled',
            scheduledAt: { gte: startOfDay, lte: endOfDay },
          },
        }),
        this.prisma.meeting.count({
          where: { status: 'scheduled', scheduledAt: { gt: endOfDay } },
        }),
        this.prisma.meeting.count({
          where: {
            OR: [
              { status: 'no_show' },
              { status: 'scheduled', scheduledAt: { lt: startOfDay } },
            ],
          },
        }),
        this.prisma.meeting.count({ where: { status: 'cancelled' } }),
        this.prisma.meeting.count({ where: { status: 'completed' } }),
        this.prisma.meeting.count({
          where: { scheduledAt: { gte: startOfMonth, lt: startOfNextMonth } },
        }),
        this.prisma.meeting.count(),
      ]);
    return { today, upcoming, missed, cancelled, completed, thisMonth, all };
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

    // Conflict guard runs ONLY when we have an account — see comment on
    // `conflictCheck`. Throws 409 with the colliding meeting's summary
    // before any DB write or GCal call.
    if ((dto.status ?? 'scheduled') === 'scheduled') {
      await this.assertNoConflict({
        accountId,
        scheduledAt: dto.scheduledAt,
        durationMin: dto.durationMin ?? 30,
      });
    }

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

    // Personalized invite email — opt-in, fully best-effort. Runs AFTER
    // sync so the auto-generated Meet URL is already persisted on the
    // row when we render the body.
    if (dto.sendInvite) {
      await this.sendPersonalizedInvite(created.id, {
        body: dto.emailMessage,
        subject: dto.emailSubject,
      });
    }

    // Forward-only stage promotion. Independent of sync result.
    await this.stageAutomation.onMeetingScheduled(created.leadId);

    // Re-read so the final return reflects the meeting-link overwrite from
    // sync (relevant for `type=google_meet`).
    const final = await this.prisma.meeting.findUnique({
      where: { id: created.id },
      include: {
        lead:    { select: { id: true, businessName: true, stage: true } },
        contact: { select: { id: true, name: true, contactType: true } },
        account: { select: { id: true, email: true, displayName: true } },
      },
    });
    return final ?? synced ?? created;
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

    // Conflict check — only fires when one of the four scheduling-shape
    // fields actually changes. If the user is just editing notes /
    // status to completed / etc., the slot itself isn't moving so we
    // skip the query. Status changes that move OUT of `scheduled`
    // also skip (cancelled / completed don't book the slot anymore).
    const willStaySchedulable =
      (dto.status ?? existing.status) === 'scheduled';
    const slotMoved =
      dto.scheduledAt !== undefined ||
      dto.durationMin !== undefined ||
      dto.accountId !== undefined ||
      (dto.status !== undefined && dto.status !== existing.status);
    if (slotMoved && willStaySchedulable) {
      await this.assertNoConflict({
        accountId:
          dto.accountId !== undefined ? dto.accountId ?? null : existing.accountId,
        scheduledAt:
          dto.scheduledAt !== undefined ? dto.scheduledAt : existing.scheduledAt,
        durationMin:
          dto.durationMin !== undefined ? dto.durationMin : existing.durationMin,
        excludeMeetingId: id,
      });
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
      const wantMeet = m.type === 'google_meet';
      const result = await this.calendar.createEvent({
        accessToken,
        refreshToken,
        summary: m.title,
        description: m.notes ?? undefined,
        location: this.locationFor(m.type, m.meetingLink),
        start: m.scheduledAt,
        end: new Date(m.scheduledAt.getTime() + m.durationMin * 60_000),
        attendeeEmails: m.attendeeEmails,
        withMeet: wantMeet,
      });
      // Persist the auto-generated Meet URL back as the meeting link so
      // the join button + email body have something concrete to point at.
      // Only overwrite when the user didn't supply their own link.
      if (wantMeet && result.meetLink && !m.meetingLink) {
        await this.prisma.meeting.update({
          where: { id: meetingId },
          data: { meetingLink: result.meetLink },
        });
      }
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
      const wantMeet = m.type === 'google_meet';
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
          withMeet: wantMeet,
        });
        if (wantMeet && result.meetLink && !m.meetingLink) {
          await this.prisma.meeting.update({
            where: { id: meetingId },
            data: { meetingLink: result.meetLink },
          });
        }
        return this.recordSyncSuccess(meetingId, result.eventId, result.htmlLink);
      }
      const patchResult = await this.calendar.updateEvent({
        accessToken,
        refreshToken,
        eventId: m.externalEventId,
        summary: m.title,
        description: m.notes ?? undefined,
        location: this.locationFor(m.type, m.meetingLink),
        start: m.scheduledAt,
        end: new Date(m.scheduledAt.getTime() + m.durationMin * 60_000),
        attendeeEmails: m.attendeeEmails,
        withMeet: wantMeet,
      });
      if (wantMeet && patchResult.meetLink && !m.meetingLink) {
        await this.prisma.meeting.update({
          where: { id: meetingId },
          data: { meetingLink: patchResult.meetLink },
        });
      }
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

  /**
   * Best-effort personalized invite email. Sent FROM the meeting's
   * Google account TO each attendee individually so the message reads
   * one-to-one rather than as a broadcast. All failures are logged and
   * swallowed — never blocks meeting creation.
   *
   * Skips silently when:
   *  - meeting has no attendees (nothing to send),
   *  - meeting has no account (no scope to send from),
   *  - the account is missing the gmail.send scope.
   */
  private async sendPersonalizedInvite(
    meetingId: string,
    opts: { body?: string; subject?: string },
  ): Promise<void> {
    const m = await this.prisma.meeting.findUnique({
      where: { id: meetingId },
      include: {
        lead: { select: { businessName: true } },
        contact: { select: { name: true } },
      },
    });
    if (!m || !m.accountId || (m.attendeeEmails ?? []).length === 0) return;

    const account = await this.prisma.emailAccount.findUnique({
      where: { id: m.accountId },
      select: { id: true, email: true, displayName: true, scopes: true, active: true },
    });
    if (!account || !account.active) return;
    if (!account.scopes.includes('https://www.googleapis.com/auth/gmail.send')) {
      this.log.warn(`[meeting:${meetingId}] invite email skipped — account missing gmail.send scope`);
      return;
    }

    let tokens;
    try {
      tokens = await this.emailAccounts.getReadyForSend(m.accountId);
    } catch (err) {
      this.log.warn(`[meeting:${meetingId}] invite email skipped — token refresh failed: ${err instanceof Error ? err.message : err}`);
      return;
    }

    const subject = (opts.subject?.trim() || `Invitation: ${m.title}`).slice(0, 300);
    const { html, text } = this.renderInviteBody({
      meeting: m,
      contactName: m.contact?.name ?? null,
      businessName: m.lead?.businessName ?? null,
      override: opts.body,
    });

    for (const to of m.attendeeEmails ?? []) {
      try {
        await this.gmail.sendMail({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          fromEmail: account.email,
          fromName: account.displayName ?? null,
          to,
          subject,
          bodyText: text,
          bodyHtml: html,
        });
      } catch (err) {
        this.log.warn(`[meeting:${meetingId}] invite email to ${to} failed: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  /**
   * Render the invite body. When `override` is provided it replaces the
   * whole message; we still wrap it in a minimal HTML shell and append a
   * footer line with the join link if there is one. Otherwise we
   * generate from title + notes + Meet/phone link + scheduled time.
   */
  private renderInviteBody(input: {
    meeting: {
      title: string;
      notes: string | null;
      type: MeetingType;
      meetingLink: string | null;
      scheduledAt: Date;
      durationMin: number;
    };
    contactName: string | null;
    businessName: string | null;
    override?: string;
  }): { html: string; text: string } {
    const { meeting, contactName, businessName, override } = input;
    const greeting = contactName?.trim()
      ? `Hi ${escapeHtml(contactName.trim().split(/\s+/)[0])},`
      : 'Hi,';
    const when = formatWhen(meeting.scheduledAt, meeting.durationMin);
    const linkLabel =
      meeting.type === 'google_meet'
        ? 'Join Google Meet'
        : meeting.type === 'zoom'
        ? 'Join Zoom'
        : meeting.type === 'phone'
        ? 'Phone'
        : 'Join';

    if (override && override.trim().length > 0) {
      const bodyHtml = escapeHtml(override).replace(/\n/g, '<br>');
      const linkLine = meeting.meetingLink
        ? `<p>${escapeHtml(linkLabel)}: <a href="${escapeAttr(meeting.meetingLink)}">${escapeHtml(meeting.meetingLink)}</a></p>`
        : '';
      const html = `<div style="font-family:system-ui,Segoe UI,Helvetica,Arial,sans-serif;font-size:14px;color:#1a1a1a;line-height:1.55">${bodyHtml}${linkLine}</div>`;
      const text = `${override}${meeting.meetingLink ? `\n\n${linkLabel}: ${meeting.meetingLink}` : ''}`;
      return { html, text };
    }

    const lines: string[] = [];
    lines.push(greeting);
    lines.push('');
    lines.push(
      businessName
        ? `Looking forward to our ${meeting.title} with ${businessName} on ${when}.`
        : `Looking forward to our ${meeting.title} on ${when}.`,
    );
    if (meeting.notes && meeting.notes.trim().length > 0) {
      lines.push('');
      lines.push(meeting.notes.trim());
    }
    if (meeting.meetingLink) {
      lines.push('');
      lines.push(`${linkLabel}: ${meeting.meetingLink}`);
    }
    lines.push('');
    lines.push('Talk soon.');

    const text = lines.join('\n');
    const htmlLines = lines.map((line) => {
      if (line === '') return '';
      if (line.startsWith(`${linkLabel}: `) && meeting.meetingLink) {
        return `<p>${escapeHtml(linkLabel)}: <a href="${escapeAttr(meeting.meetingLink)}">${escapeHtml(meeting.meetingLink)}</a></p>`;
      }
      return `<p>${escapeHtml(line)}</p>`;
    });
    const html = `<div style="font-family:system-ui,Segoe UI,Helvetica,Arial,sans-serif;font-size:14px;color:#1a1a1a;line-height:1.55">${htmlLines.join('')}</div>`;
    return { html, text };
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

    if (f.bucket && f.bucket !== 'all') {
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      switch (f.bucket) {
        case 'today':
          AND.push({
            status: 'scheduled',
            scheduledAt: { gte: startOfDay, lte: endOfDay },
          });
          break;
        case 'upcoming':
          AND.push({ status: 'scheduled', scheduledAt: { gt: endOfDay } });
          break;
        case 'missed':
          // Marked no-show, or a still-"scheduled" meeting whose time
          // has passed (before today).
          AND.push({
            OR: [
              { status: 'no_show' },
              { status: 'scheduled', scheduledAt: { lt: startOfDay } },
            ],
          });
          break;
        case 'cancelled':
          AND.push({ status: 'cancelled' });
          break;
        case 'completed':
          AND.push({ status: 'completed' });
          break;
        case 'this_month':
          AND.push({
            scheduledAt: { gte: startOfMonth, lt: startOfNextMonth },
          });
          break;
      }
    }

    if (AND.length) where.AND = AND;
    return where;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}

function formatWhen(start: Date, durationMin: number): string {
  const end = new Date(start.getTime() + durationMin * 60_000);
  const date = start.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const t = (d: Date) =>
    d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${date}, ${t(start)}–${t(end)}`;
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
