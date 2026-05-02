import { Controller, Get, Query } from '@nestjs/common';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('summary')
  summary() {
    return this.dashboard.summary();
  }

  @Get('activity')
  activity(@Query('limit') limit?: string, @Query('days') days?: string) {
    return this.dashboard.activity({
      limit: limit ? Number(limit) : undefined,
      days: days ? Number(days) : undefined,
    });
  }
}
