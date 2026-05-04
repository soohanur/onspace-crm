import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { LeadStage, LeadValidity } from '@onspace/db';
import { LeadsService, LeadFilter, OrderBy } from './leads.service';
import { LeadActivityService } from './lead-activity.service';

const STAGE_VALUES = new Set<string>([
  'new',
  'approached',
  'no_response',
  'engaged',
  'push',
  'qualified',
  'interested',
  'booked',
  'proposal_sent',
  'converted',
  'not_converted',
  'lost',
]);

const VALIDITY_VALUES = new Set<string>(['valid', 'invalid']);

@Controller('leads')
export class LeadsController {
  constructor(
    private readonly leads: LeadsService,
    private readonly activity: LeadActivityService,
  ) {}

  @Get()
  async list(@Query() q: Record<string, string>) {
    return this.leads.list(this.parseFilter(q));
  }

  @Get('stats')
  async stats(@Query() q: Record<string, string>) {
    return this.leads.stats(this.parseFilter(q));
  }

  @Get('facets')
  async facets() {
    return this.leads.facets();
  }

  @Get(':leadId/activity')
  async leadActivity(
    @Param('leadId') leadId: string,
    @Query('days') days?: string,
    @Query('limit') limit?: string,
  ) {
    return this.activity.listForLead(leadId, {
      days: days ? Number(days) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.leads.findOne(id);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.leads.remove(id);
  }

  @Post('bulk-delete')
  async bulkDelete(@Body() body: { ids: string[] }) {
    return this.leads.removeMany(body?.ids ?? []);
  }

  @Patch(':id/stage')
  async updateStage(
    @Param('id') id: string,
    @Body() body: { stage: string },
  ) {
    if (!body?.stage || !STAGE_VALUES.has(body.stage)) {
      throw new BadRequestException(`Invalid stage: ${body?.stage}`);
    }
    return this.leads.updateStage(id, body.stage as LeadStage);
  }

  @Patch(':id/score')
  async updateScore(
    @Param('id') id: string,
    @Body() body: { score: number },
  ) {
    const score = Number(body?.score);
    if (!Number.isFinite(score) || score < 0 || score > 100) {
      throw new BadRequestException('score must be a number between 0 and 100');
    }
    return this.leads.updateScore(id, Math.round(score));
  }

  @Delete(':leadId/stage-history/:entryId')
  async removeStageHistory(
    @Param('leadId') leadId: string,
    @Param('entryId') entryId: string,
  ) {
    return this.leads.deleteStageHistoryEntry(leadId, entryId);
  }

  @Patch(':id/validity')
  async updateValidity(
    @Param('id') id: string,
    @Body() body: { validity: string },
  ) {
    if (!body?.validity || !VALIDITY_VALUES.has(body.validity)) {
      throw new BadRequestException(`Invalid validity: ${body?.validity}`);
    }
    return this.leads.updateValidity(id, body.validity as LeadValidity);
  }

  /** Centralized parser so /leads + /leads/stats + smart-group resolution share it. */
  private parseFilter(q: Record<string, string>): LeadFilter {
    return {
      q: q.q,
      jobId: q.jobId,
      searchQuery: q.searchQuery,
      searchLocation: q.searchLocation,
      groupId: q.groupId,
      category: q.category,
      city: q.city,
      state: q.state,
      hasWebsite: parseBool(q.hasWebsite),
      hasEmail: parseBool(q.hasEmail),
      hasPhone: parseBool(q.hasPhone),
      hasSocials: parseBool(q.hasSocials),
      claimed: parseBool(q.claimed),
      ratingMin: parseNum(q.ratingMin),
      ratingMax: parseNum(q.ratingMax),
      yearsMin: parseNum(q.yearsMin),
      yearsMax: parseNum(q.yearsMax),
      stage: parseStageList(q.stage),
      validity: parseValidity(q.validity),
      scoreMin: parseNum(q.scoreMin),
      scoreMax: parseNum(q.scoreMax),
      orderBy: q.orderBy as OrderBy | undefined,
      take: parseNum(q.take),
      cursor: q.cursor,
    };
  }
}

function parseBool(v?: string): boolean | undefined {
  if (v === undefined || v === '' || v === 'all') return undefined;
  if (v === 'true' || v === '1' || v === 'yes') return true;
  if (v === 'false' || v === '0' || v === 'no') return false;
  return undefined;
}

function parseNum(v?: string): number | undefined {
  if (v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Comma-separated `?stage=engaged,qualified` list, filtered to valid values. */
function parseStageList(v?: string): LeadStage[] | undefined {
  if (!v) return undefined;
  const parts = v
    .split(',')
    .map((s) => s.trim())
    .filter((s) => STAGE_VALUES.has(s));
  return parts.length ? (parts as LeadStage[]) : undefined;
}

function parseValidity(v?: string): LeadValidity | undefined {
  if (!v || v === 'all') return undefined;
  return VALIDITY_VALUES.has(v) ? (v as LeadValidity) : undefined;
}
