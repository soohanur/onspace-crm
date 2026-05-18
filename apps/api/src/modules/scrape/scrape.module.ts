import { Module, type Provider } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ScrapeController } from './scrape.controller';
import { ScrapeService } from './scrape.service';
import { ScrapeProcessor } from './scrape.processor';
import { SCRAPE_QUEUE } from './scrape.constants';

// Hosts that can't run Python + Chromium (Render free, Vercel, etc.) set
// SCRAPER_DISABLED=1. The API still enqueues jobs; another worker process
// (a local docker container, a BD VPS, a Fly machine, …) actually consumes
// them. Skipping the processor here means BullMQ never spins up a Worker on
// this host, so jobs sit in the queue until a real worker picks them up.
const includeProcessor = process.env.SCRAPER_DISABLED !== '1';

const providers: Provider[] = includeProcessor
  ? [ScrapeService, ScrapeProcessor]
  : [ScrapeService];

@Module({
  imports: [BullModule.registerQueue({ name: SCRAPE_QUEUE })],
  controllers: [ScrapeController],
  providers,
  exports: [ScrapeService],
})
export class ScrapeModule {}
