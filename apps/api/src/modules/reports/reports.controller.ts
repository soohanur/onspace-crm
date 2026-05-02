import { Controller, Get, Query } from '@nestjs/common';
import { ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('pipeline')
  pipeline() {
    return this.reports.pipeline();
  }

  @Get('campaigns')
  campaigns(@Query('days') days?: string) {
    return this.reports.campaigns(parseDays(days));
  }

  @Get('lead-sources')
  leadSources(@Query('days') days?: string) {
    return this.reports.leadSources(parseDays(days));
  }

  @Get('activity-volume')
  activityVolume(@Query('days') days?: string) {
    return this.reports.activityVolume(parseDays(days));
  }

  @Get('followup-health')
  followupHealth() {
    return this.reports.followupHealth();
  }
}

function parseDays(v: string | undefined): number {
  if (!v) return 30;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 1) return 30;
  return Math.min(n, 365);
}
