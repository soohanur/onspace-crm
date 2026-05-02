import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  MeetingStatus,
  MeetingType,
} from '@onspace/db';
import {
  ListMeetingsFilter,
  MeetingBucket,
  MeetingsService,
} from './meetings.service';
import { CreateMeetingDto, UpdateMeetingDto } from './dto';

const STATUSES = new Set<MeetingStatus>([
  'scheduled',
  'completed',
  'cancelled',
  'no_show',
]);
const TYPES = new Set<MeetingType>([
  'phone',
  'zoom',
  'google_meet',
  'in_person',
  'other',
]);
const BUCKETS = new Set<MeetingBucket>([
  'upcoming',
  'today',
  'past',
  'cancelled',
]);

@Controller()
export class MeetingsController {
  constructor(private readonly meetings: MeetingsService) {}

  @Get('meetings')
  list(@Query() q: Record<string, string>) {
    return this.meetings.list(this.parseFilter(q));
  }

  @Get('meetings/counts')
  counts() {
    return this.meetings.bucketCounts();
  }

  /**
   * Pre-flight check from the form modal: does this proposed slot
   * collide with another scheduled meeting on the same account?
   * Returns `{ conflict: <summary> | null }`. Does NOT throw — the form
   * uses this for live validation and disables Save itself; the
   * server-side enforcement lives in MeetingsService.create / update.
   */
  @Get('meetings/conflict-check')
  conflictCheck(
    @Query('accountId') accountId: string | undefined,
    @Query('scheduledAt') scheduledAt: string | undefined,
    @Query('durationMin') durationMin: string | undefined,
    @Query('excludeMeetingId') excludeMeetingId: string | undefined,
  ) {
    if (!accountId || !scheduledAt) return { conflict: null };
    const dur = Number(durationMin);
    if (!Number.isFinite(dur) || dur < 1) return { conflict: null };
    return this.meetings.conflictCheck({
      accountId,
      scheduledAt,
      durationMin: dur,
      excludeMeetingId: excludeMeetingId || null,
    });
  }

  @Get('meetings/:id')
  findOne(@Param('id') id: string) {
    return this.meetings.findOne(id);
  }

  @Post('meetings')
  create(@Body() dto: CreateMeetingDto) {
    return this.meetings.create(dto);
  }

  @Patch('meetings/:id')
  update(@Param('id') id: string, @Body() dto: UpdateMeetingDto) {
    return this.meetings.update(id, dto);
  }

  @Post('meetings/:id/sync-now')
  @HttpCode(HttpStatus.OK)
  syncNow(@Param('id') id: string) {
    return this.meetings.syncNow(id);
  }

  @Delete('meetings/:id')
  remove(@Param('id') id: string) {
    return this.meetings.remove(id);
  }

  @Get('leads/:leadId/meetings')
  listForLead(@Param('leadId') leadId: string) {
    return this.meetings.listForLead(leadId);
  }

  // ─── filter parsing ────────────────────────────────────────────────────

  private parseFilter(q: Record<string, string>): ListMeetingsFilter {
    const status = parseList<MeetingStatus>(q.status, STATUSES);
    const type = parseList<MeetingType>(q.type, TYPES);
    const bucket =
      q.bucket && BUCKETS.has(q.bucket as MeetingBucket)
        ? (q.bucket as MeetingBucket)
        : undefined;
    return {
      status,
      type,
      bucket,
      leadId: q.leadId,
      assignedTo: q.assignedTo,
      take: q.take ? Number(q.take) : undefined,
      cursor: q.cursor,
    };
  }
}

function parseList<T extends string>(
  v: string | undefined,
  allowed: Set<T>,
): T[] | undefined {
  if (!v) return undefined;
  const arr = v
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is T => allowed.has(s as T));
  return arr.length ? arr : undefined;
}
