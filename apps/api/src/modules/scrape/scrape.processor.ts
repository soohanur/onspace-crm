import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { spawn } from 'node:child_process';
import * as path from 'node:path';
import * as readline from 'node:readline';
import { PrismaService } from '../../prisma/prisma.service';
import { SCRAPE_QUEUE } from './scrape.constants';
import type { ScrapeJobPayload } from './scrape.service';

/**
 * BullMQ worker that runs the Python Playwright scraper as a subprocess.
 *
 * Why subprocess (and not a separate Python service in MVP):
 *   - One process tree = simpler dev (`pnpm dev` brings everything up).
 *   - Python writes leads directly to Postgres via DATABASE_URL.
 *   - We only stream tiny JSON status events back over stdout.
 *
 * Future: extract to a separate Python worker that consumes a Redis/Kafka
 * topic directly. The DB contract (Lead schema) is what stays stable.
 */
@Processor(SCRAPE_QUEUE, { concurrency: 2 })
export class ScrapeProcessor extends WorkerHost {
  private readonly log = new Logger(ScrapeProcessor.name);
  /** jobId → child process. Used by ScrapeService.cancel to send SIGTERM. */
  private readonly running = new Map<string, ReturnType<typeof spawn>>();

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /** Called from ScrapeService.cancel — kills the python subprocess. */
  cancelJob(jobId: string): boolean {
    const proc = this.running.get(jobId);
    if (!proc) return false;
    try {
      proc.kill('SIGTERM');
    } catch {
      /* noop */
    }
    return true;
  }

  async process(job: Job<ScrapeJobPayload>) {
    const { jobId, searchQuery, searchLocation } = job.data;

    await this.prisma.scrapeJob.update({
      where: { id: jobId },
      data: { status: 'running', startedAt: new Date() },
    });

    try {
      await this.runPython({ jobId, searchQuery, searchLocation });

      const totalSaved = await this.prisma.lead.count({ where: { jobId } });
      // If ScrapeService marked the job 'cancelled' (via SIGTERM), preserve that.
      const current = await this.prisma.scrapeJob.findUnique({
        where: { id: jobId },
        select: { status: true },
      });
      await this.prisma.scrapeJob.update({
        where: { id: jobId },
        data: {
          status: current?.status === 'cancelled' ? 'cancelled' : 'done',
          finishedAt: new Date(),
          totalSaved,
        },
      });
      return { ok: true, totalSaved };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.log.error(`scrape ${jobId} failed: ${message}`);
      await this.prisma.scrapeJob.update({
        where: { id: jobId },
        data: {
          status: 'failed',
          finishedAt: new Date(),
          error: message,
        },
      });
      throw err;
    }
  }

  private runPython(args: ScrapeJobPayload): Promise<void> {
    // dist/modules/scrape/ → apps/api/dist/modules/scrape  → up 4 to apps/  → /scraper
    const scraperRoot = path.resolve(
      __dirname,
      '../../../../scraper',
    );

    const python =
      process.env.SCRAPER_PYTHON ??
      path.join(scraperRoot, '.venv', 'bin', 'python');

    const cliArgs = [
      '-m',
      'scraper.main',
      '--job-id',
      args.jobId,
      '--query',
      args.searchQuery,
      '--location',
      args.searchLocation,
    ];

    return new Promise((resolve, reject) => {
      const proc = spawn(python, cliArgs, {
        cwd: scraperRoot,
        env: {
          ...process.env,
          PYTHONUNBUFFERED: '1',
          DATABASE_URL: process.env.DATABASE_URL,
        },
      });
      this.running.set(args.jobId, proc);

      const rl = readline.createInterface({ input: proc.stdout });
      rl.on('line', (line) => {
        try {
          const evt = JSON.parse(line);
          this.handleEvent(args.jobId, evt);
        } catch {
          this.log.debug(`[scraper:${args.jobId}] ${line}`);
        }
      });

      proc.stderr.on('data', (chunk) => {
        this.log.warn(`[scraper:${args.jobId}] ${chunk.toString().trim()}`);
      });

      proc.on('error', (err) => {
        this.running.delete(args.jobId);
        reject(err);
      });
      proc.on('close', (code, signal) => {
        this.running.delete(args.jobId);
        // Treat SIGTERM as a graceful cancel, not a failure.
        if (code === 0 || signal === 'SIGTERM' || signal === 'SIGKILL') {
          resolve();
        } else {
          reject(new Error(`scraper exited with code ${code}`));
        }
      });
    });
  }

  private async handleEvent(jobId: string, evt: { type: string; [k: string]: unknown }) {
    if (evt.type === 'progress' && typeof evt.totalFound === 'number') {
      await this.prisma.scrapeJob.update({
        where: { id: jobId },
        data: { totalFound: evt.totalFound },
      });
    } else if (evt.type === 'saved' && typeof evt.totalSaved === 'number') {
      await this.prisma.scrapeJob.update({
        where: { id: jobId },
        data: { totalSaved: evt.totalSaved },
      });
    } else if (evt.type === 'warn' && typeof evt.message === 'string') {
      this.log.warn(`[scraper:${jobId}] ${evt.message}`);
    } else if (evt.type === 'info' && typeof evt.message === 'string') {
      this.log.log(`[scraper:${jobId}] ${evt.message}`);
    } else if (evt.type === 'error' && typeof evt.message === 'string') {
      this.log.error(`[scraper:${jobId}] ${evt.message}`);
    }
  }
}
