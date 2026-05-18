import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';

import { PrismaModule } from './prisma/prisma.module';
import { ScrapeModule } from './modules/scrape/scrape.module';

/**
 * Slim entrypoint for the WORKER_ONLY=1 container.
 *
 * Loading the full AppModule on every worker doubles every BullMQ queue
 * (one Worker on the API host, one on each scraper container), and on
 * managed Redis providers like Upstash that quickly exceeds the daily
 * command quota (BullMQ polls each queue ~3-5x/sec).
 *
 * This module loads only what the scraper actually needs:
 *   - ConfigModule for env vars
 *   - BullModule with one shared Redis connection
 *   - PrismaModule (the worker writes leads to Postgres)
 *   - ScrapeModule (the queue + processor + service)
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),
    BullModule.forRoot({
      connection: (() => {
        const url = process.env.REDIS_URL;
        if (url) return { url } as any;
        const useTls = String(process.env.REDIS_TLS ?? '').toLowerCase() === 'true';
        return {
          host: process.env.REDIS_HOST ?? 'localhost',
          port: Number(process.env.REDIS_PORT ?? 6379),
          ...(process.env.REDIS_PASSWORD ? { password: process.env.REDIS_PASSWORD } : {}),
          ...(useTls ? { tls: {} } : {}),
        };
      })(),
    }),
    PrismaModule,
    ScrapeModule,
  ],
})
export class WorkerModule {}
