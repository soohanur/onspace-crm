import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ScrapeController } from './scrape.controller';
import { ScrapeService } from './scrape.service';
import { ScrapeProcessor } from './scrape.processor';
import { SCRAPE_QUEUE } from './scrape.constants';

@Module({
  imports: [BullModule.registerQueue({ name: SCRAPE_QUEUE })],
  controllers: [ScrapeController],
  providers: [ScrapeService, ScrapeProcessor],
  exports: [ScrapeService],
})
export class ScrapeModule {}
