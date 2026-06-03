import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ScrapeService } from './scrape.service';
import { CreateScrapeJobBatchDto, CreateScrapeJobDto } from './dto';

@Controller('scrape-jobs')
export class ScrapeController {
  constructor(private readonly scrape: ScrapeService) {}

  @Post()
  create(@Body() dto: CreateScrapeJobDto) {
    return this.scrape.create(dto);
  }

  @Post('batch')
  createBatch(@Body() dto: CreateScrapeJobBatchDto) {
    return this.scrape.createBatch(dto);
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

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: CreateScrapeJobDto) {
    return this.scrape.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.scrape.remove(id);
  }
}
