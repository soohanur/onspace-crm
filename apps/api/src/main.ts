import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { WorkerModule } from './worker.module';

/**
 * WORKER_ONLY=1 boots a slim Nest context that registers only the scrape
 * queue + processor (not the full AppModule). Loading every BullMQ queue
 * doubles polling traffic on the shared Upstash Redis and trivially blows
 * past the free-tier daily command quota.
 */
async function bootstrapWorker() {
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: ['log', 'warn', 'error'],
  });
  await app.init();
  Logger.log('[worker] slim Nest context up — scrape queue only', 'bootstrap');
  // Keep process alive so workers stay registered.
  await new Promise(() => {});
}

async function bootstrap() {
  // CORS origin(s) — comma-separated FRONTEND_URL list lets one deployment
  // serve multiple domains (e.g. www + apex) without code changes.
  const frontendUrls = (process.env.FRONTEND_URL ?? 'http://localhost:3000')
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean);

  const app = await NestFactory.create(AppModule, {
    cors: {
      origin: frontendUrls,
      credentials: true,
    },
  });

  app.use(cookieParser());
  // Allow avatar data-URIs (~ 350 KB after client-side resize).
  app.use(json({ limit: '1mb' }));
  app.use(urlencoded({ limit: '1mb', extended: true }));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.setGlobalPrefix('api');

  // Render / Fly / Heroku inject PORT. Fallback to API_PORT for our local dev.
  const port = Number(process.env.PORT ?? process.env.API_PORT ?? 4000);
  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`[api] listening on http://localhost:${port}/api`);
}

if (process.env.WORKER_ONLY === '1') {
  bootstrapWorker();
} else {
  bootstrap();
}
