import { Controller, Get, Query } from '@nestjs/common';
import { LeadsService } from './leads.service';

@Controller('leads')
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Get()
  async list(
    @Query('jobId') jobId?: string,
    @Query('searchQuery') searchQuery?: string,
    @Query('searchLocation') searchLocation?: string,
    @Query('hasWebsite') hasWebsite?: string,
    @Query('hasEmail') hasEmail?: string,
    @Query('hasPhone') hasPhone?: string,
    @Query('city') city?: string,
    @Query('state') state?: string,
    @Query('q') q?: string,
    @Query('take') take?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.leads.list({
      jobId,
      searchQuery,
      searchLocation,
      hasWebsite: parseBool(hasWebsite),
      hasEmail: parseBool(hasEmail),
      hasPhone: parseBool(hasPhone),
      city,
      state,
      q,
      take: take ? Number(take) : undefined,
      cursor,
    });
  }

  @Get('stats')
  async stats(
    @Query('jobId') jobId?: string,
    @Query('searchQuery') searchQuery?: string,
    @Query('searchLocation') searchLocation?: string,
  ) {
    return this.leads.stats({ jobId, searchQuery, searchLocation });
  }
}

function parseBool(v?: string): boolean | undefined {
  if (v === undefined || v === '' || v === 'all') return undefined;
  if (v === 'true' || v === '1' || v === 'yes') return true;
  if (v === 'false' || v === '0' || v === 'no') return false;
  return undefined;
}
