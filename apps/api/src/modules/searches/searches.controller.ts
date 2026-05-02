import { Controller, Get, Query } from '@nestjs/common';
import { SearchesService } from './searches.service';

@Controller('searches')
export class SearchesController {
  constructor(private readonly searches: SearchesService) {}

  @Get('queries')
  queries(@Query('q') q = '') {
    return this.searches.suggestQueries(q.trim());
  }

  @Get('locations')
  locations(@Query('q') q = '') {
    return this.searches.suggestLocations(q.trim());
  }
}
