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
  TaskContext,
  TaskKind,
  TaskPriority,
  TaskStatus,
} from '@onspace/db';
import {
  ListTasksFilter,
  TaskBucket,
  TasksService,
} from './tasks.service';
import { CreateTaskDto, UpdateTaskDto } from './dto';

const BUCKETS = new Set<TaskBucket>([
  'today',
  'overdue',
  'upcoming',
  'completed',
]);

const STATUSES = new Set<TaskStatus>(['open', 'in_progress', 'done', 'cancelled']);
const PRIORITIES = new Set<TaskPriority>(['low', 'medium', 'high', 'urgent']);
const KINDS = new Set<TaskKind>(['general', 'followup']);
const CONTEXTS = new Set<TaskContext>([
  'none',
  'approached_followup',
  'engaged_followup',
  'qualified_followup',
  'meeting_followup',
  'proposal_followup',
  'no_response_followup',
  'push_followup',
  'interested_followup',
]);

@Controller()
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get('tasks')
  list(@Query() q: Record<string, string>) {
    return this.tasks.list(this.parseFilter(q));
  }

  @Get('tasks/counts')
  async counts(@Query('leadIds') leadIdsParam?: string) {
    const ids = (leadIdsParam ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return this.tasks.openCountsByLead(ids);
  }

  @Get('tasks/:id')
  findOne(@Param('id') id: string) {
    return this.tasks.findOne(id);
  }

  @Post('tasks')
  create(@Body() dto: CreateTaskDto) {
    return this.tasks.create(dto);
  }

  @Patch('tasks/:id')
  update(@Param('id') id: string, @Body() dto: UpdateTaskDto) {
    return this.tasks.update(id, dto);
  }

  @Delete('tasks/:id')
  remove(@Param('id') id: string) {
    return this.tasks.remove(id);
  }

  @Get('leads/:leadId/tasks')
  listForLead(@Param('leadId') leadId: string) {
    return this.tasks.listForLead(leadId);
  }

  // ─── filter parsing ─────────────────────────────────────────────────────

  private parseFilter(q: Record<string, string>): ListTasksFilter {
    const status = parseList<TaskStatus>(q.status, STATUSES);
    const priority = parseList<TaskPriority>(q.priority, PRIORITIES);
    const kind = q.kind && KINDS.has(q.kind as TaskKind) ? (q.kind as TaskKind) : undefined;
    const context =
      q.context && CONTEXTS.has(q.context as TaskContext)
        ? (q.context as TaskContext)
        : undefined;
    const bucket =
      q.bucket && BUCKETS.has(q.bucket as TaskBucket)
        ? (q.bucket as TaskBucket)
        : undefined;
    return {
      status,
      priority,
      kind,
      context,
      bucket,
      leadId: q.leadId,
      assignedTo: q.assignedTo,
      dueBefore: q.dueBefore ? new Date(q.dueBefore) : undefined,
      dueAfter: q.dueAfter ? new Date(q.dueAfter) : undefined,
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
