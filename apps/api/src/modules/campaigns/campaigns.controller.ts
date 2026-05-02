import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { CampaignStatus } from '@onspace/db';
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto } from './dto';

const CAMPAIGN_STATUSES = new Set<string>([
  'draft',
  'queued',
  'running',
  'paused',
  'completed',
  'failed',
  'cancelled',
]);
const RECIPIENT_STATUSES = new Set<string>([
  'pending',
  'sending',
  'sent',
  'failed',
  'skipped',
  'bounced',
]);

@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  @Get()
  list(@Query('status') status?: string) {
    return this.campaigns.list({ status: parseEnumList(status, CAMPAIGN_STATUSES) as CampaignStatus[] | undefined });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.campaigns.findOne(id);
  }

  @Get(':id/recipients')
  listRecipients(
    @Param('id') id: string,
    @Query('status') status?: string,
    @Query('take') take?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.campaigns.listRecipients(id, {
      status: parseEnumList(status, RECIPIENT_STATUSES),
      take: take ? Number(take) : undefined,
      cursor,
    });
  }

  @Post()
  create(@Body() dto: CreateCampaignDto) {
    return this.campaigns.create(dto);
  }

  @Post(':id/start')
  @HttpCode(HttpStatus.OK)
  start(
    @Param('id') id: string,
    @Query('acceptSkipped') acceptSkipped?: string,
  ) {
    return this.campaigns.start(id, acceptSkipped === '1');
  }

  @Post(':id/pause')
  @HttpCode(HttpStatus.OK)
  pause(@Param('id') id: string) {
    return this.campaigns.pause(id);
  }

  @Post(':id/resume')
  @HttpCode(HttpStatus.OK)
  resume(@Param('id') id: string) {
    return this.campaigns.resume(id);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@Param('id') id: string) {
    return this.campaigns.cancel(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.campaigns.remove(id);
  }
}

function parseEnumList(v: string | undefined, allowed: Set<string>): string[] | undefined {
  if (!v) return undefined;
  const parts = v
    .split(',')
    .map((s) => s.trim())
    .filter((s) => allowed.has(s));
  return parts.length ? parts : undefined;
}
