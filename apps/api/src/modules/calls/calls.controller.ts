import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  CallDirection,
  CallOutcome,
  CallStatus,
} from '@onspace/db';
import {
  CallBucket,
  CallsService,
  ListCallsFilter,
} from './calls.service';
import { CreateCallDto, UpdateCallDto } from './dto';

const DIRECTIONS = new Set<CallDirection>(['outbound', 'inbound']);
const OUTCOMES = new Set<CallOutcome>([
  'answered',
  'no_answer',
  'voicemail',
  'busy',
  'wrong_number',
  'do_not_call',
  'scheduled_callback',
]);
const STATUSES = new Set<CallStatus>(['scheduled', 'completed', 'cancelled']);
const BUCKETS = new Set<CallBucket>(['scheduled', 'today', 'recent', 'all']);

@Controller()
export class CallsController {
  constructor(private readonly calls: CallsService) {}

  @Get('calls')
  list(@Query() q: Record<string, string>) {
    return this.calls.list(this.parseFilter(q));
  }

  @Get('calls/counts')
  counts() {
    return this.calls.bucketCounts();
  }

  @Get('calls/:id')
  findOne(@Param('id') id: string) {
    return this.calls.findOne(id);
  }

  @Post('calls')
  create(@Body() dto: CreateCallDto) {
    return this.calls.create(dto);
  }

  @Patch('calls/:id')
  update(@Param('id') id: string, @Body() dto: UpdateCallDto) {
    return this.calls.update(id, dto);
  }

  @Delete('calls/:id')
  remove(@Param('id') id: string) {
    return this.calls.remove(id);
  }

  @Post('calls/:id/restore')
  restore(@Param('id') id: string) {
    return this.calls.restore(id);
  }

  @Delete('calls/:id/purge')
  purge(@Param('id') id: string) {
    return this.calls.purge(id);
  }

  @Get('leads/:leadId/calls')
  listForLead(@Param('leadId') leadId: string) {
    return this.calls.listForLead(leadId);
  }

  // ─── filter parsing ────────────────────────────────────────────────────

  private parseFilter(q: Record<string, string>): ListCallsFilter {
    const direction = parseList<CallDirection>(q.direction, DIRECTIONS);
    const outcome = parseList<CallOutcome>(q.outcome, OUTCOMES);
    const status = parseList<CallStatus>(q.status, STATUSES);
    const bucket =
      q.bucket && BUCKETS.has(q.bucket as CallBucket)
        ? (q.bucket as CallBucket)
        : undefined;
    const trash =
      q.trash === '1' || q.trash === 'true' || q.trash === 'yes';
    return {
      direction,
      outcome,
      status,
      bucket,
      trash,
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
