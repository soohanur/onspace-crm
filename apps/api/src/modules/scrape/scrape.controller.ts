import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ScrapeService } from './scrape.service';
import { CreateScrapeJobDto } from './dto';

@Controller('scrape-jobs')
export class ScrapeController {
  constructor(private readonly scrape: ScrapeService) {}

  @Post()
  create(@Body() dto: CreateScrapeJobDto) {
    return this.scrape.create(dto);
  }

  @Get()
  list(@Query('take') take?: string) {
    return this.scrape.list(take ? Number(take) : undefined);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.scrape.findOne(id);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.scrape.cancel(id);
  }
}
