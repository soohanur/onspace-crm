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
import { EnrollmentStatus, SequenceStatus } from '@onspace/db';
import { SequencesService } from './sequences.service';
import { SequencesProcessor } from './sequences.processor';
import {
  CreateSequenceDto,
  EnrollLeadsDto,
  UpdateSequenceDto,
} from './dto';

const STATUSES = new Set<SequenceStatus>([
  'draft',
  'active',
  'paused',
  'archived',
]);
const ENROLLMENT_STATUSES = new Set<EnrollmentStatus>([
  'active',
  'completed',
  'exited_replied',
  'exited_stage',
  'exited_manual',
]);

@Controller()
export class SequencesController {
  constructor(
    private readonly sequences: SequencesService,
    private readonly processor: SequencesProcessor,
  ) {}

  @Get('sequences')
  list(@Query('status') statusCsv?: string) {
    return this.sequences.list({
      status: parseList<SequenceStatus>(statusCsv, STATUSES),
    });
  }

  @Get('sequences/:id')
  findOne(@Param('id') id: string) {
    return this.sequences.findOne(id);
  }

  @Get('sequences/:id/enrollments')
  enrollments(
    @Param('id') id: string,
    @Query('status') statusCsv?: string,
    @Query('take') take?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.sequences.listEnrollments(id, {
      status: parseList<EnrollmentStatus>(statusCsv, ENROLLMENT_STATUSES),
      take: take ? Number(take) : undefined,
      cursor,
    });
  }

  @Post('sequences')
  create(@Body() dto: CreateSequenceDto) {
    return this.sequences.create(dto);
  }

  @Patch('sequences/:id')
  update(@Param('id') id: string, @Body() dto: UpdateSequenceDto) {
    return this.sequences.update(id, dto);
  }

  @Post('sequences/:id/start')
  @HttpCode(HttpStatus.OK)
  start(@Param('id') id: string) {
    return this.sequences.start(id);
  }

  @Post('sequences/:id/pause')
  @HttpCode(HttpStatus.OK)
  pause(@Param('id') id: string) {
    return this.sequences.pause(id);
  }

  @Post('sequences/:id/resume')
  @HttpCode(HttpStatus.OK)
  resume(@Param('id') id: string) {
    return this.sequences.resume(id);
  }

  @Post('sequences/:id/archive')
  @HttpCode(HttpStatus.OK)
  archive(@Param('id') id: string) {
    return this.sequences.archive(id);
  }

  @Delete('sequences/:id')
  remove(@Param('id') id: string) {
    return this.sequences.remove(id);
  }

  @Post('sequences/:id/enroll')
  @HttpCode(HttpStatus.OK)
  enroll(@Param('id') id: string, @Body() dto: EnrollLeadsDto) {
    return this.sequences.enroll(id, dto);
  }

  @Post('sequences/:id/enrollments/:enrollmentId/unenroll')
  @HttpCode(HttpStatus.OK)
  unenroll(
    @Param('id') id: string,
    @Param('enrollmentId') enrollmentId: string,
  ) {
    return this.sequences.unenroll(id, enrollmentId);
  }

  @Post('sequences/run')
  @HttpCode(HttpStatus.OK)
  async run() {
    return this.processor.tick();
  }

  @Get('leads/:leadId/sequences')
  listForLead(@Param('leadId') leadId: string) {
    return this.sequences.listForLead(leadId);
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
