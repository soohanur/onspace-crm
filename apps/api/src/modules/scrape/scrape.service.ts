import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateScrapeJobDto } from './dto';
import { SCRAPE_QUEUE } from './scrape.constants';
import { ScrapeProcessor } from './scrape.processor';

export interface ScrapeJobPayload {
  jobId: string;
  searchQuery: string;
  searchLocation: string;
}

@Injectable()
export class ScrapeService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(SCRAPE_QUEUE) private readonly queue: Queue<ScrapeJobPayload>,
    // ScrapeProcessor only exists on hosts that consume the queue (worker
    // containers, local dev). On Render free / Vercel the API only enqueues,
    // so the processor isn't registered and this injection stays undefined.
    @Optional() private readonly processor: ScrapeProcessor | null,
  ) {}

  async create(dto: CreateScrapeJobDto) {
    const job = await this.prisma.scrapeJob.create({
      data: {
        searchQuery: dto.searchQuery.trim(),
        searchLocation: dto.searchLocation.trim(),
        status: 'queued',
      },
    });

    await this.queue.add(
      'scrape',
      {
        jobId: job.id,
        searchQuery: job.searchQuery,
        searchLocation: job.searchLocation,
      },
      {
        jobId: job.id,
        // Up to 5 attempts with exponential backoff (30s, 1m, 2m, 4m).
        // Each retry resumes from `scrape_jobs.last_page + 1` so the
        // crawl never re-walks pages it already saved. A scrape that
        // hits a permanent error (e.g. YP blocks an IP for hours) will
        // still fail after the 5th try and surface the error.
        attempts: 5,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: 1000,
        removeOnFail: 1000,
      },
    );

    return job;
  }

  async findOne(id: string) {
    const job = await this.prisma.scrapeJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('Scrape job not found');
    return job;
  }

  async list(take = 20) {
    return this.prisma.scrapeJob.findMany({
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  async cancel(id: string) {
    const job = await this.findOne(id);
    if (job.status === 'done' || job.status === 'failed' || job.status === 'cancelled') {
      throw new BadRequestException(`job already ${job.status}`);
    }

    // Mark cancelled FIRST so the processor's close handler can read it.
    const updated = await this.prisma.scrapeJob.update({
      where: { id },
      data: { status: 'cancelled', finishedAt: new Date() },
    });

    // Best-effort: kill the running python subprocess. Only the host that
    // actually runs the worker has the processor; on API-only hosts (Render
    // free) this is a no-op and the worker will notice the DB status flip on
    // its next tick.
    const killed = this.processor?.cancelJob(id) ?? false;

    // Also remove the BullMQ job if still queued.
    try {
      const bull = await this.queue.getJob(id);
      if (bull && (await bull.getState()) === 'waiting') {
        await bull.remove();
      }
    } catch {
      /* noop */
    }

    return { ...updated, killed };
  }
}
