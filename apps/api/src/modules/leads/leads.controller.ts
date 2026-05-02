import { Controller, Get, Param, Query } from '@nestjs/common';
import { LeadsService, LeadFilter, OrderBy } from './leads.service';

@Controller('leads')
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

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

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.leads.findOne(id);
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
