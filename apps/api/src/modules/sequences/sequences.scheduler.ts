import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  SEQUENCES_QUEUE,
  SEQUENCE_TICK_JOB,
} from './sequences.constants';

/**
 * Phase 18 — registers the sequence-tick repeatable job. Cron `*\/5 * * *
 * *` (every 5 minutes) so deferred enrollments get picked up without
 * running the worker continuously. Set `SEQUENCES_DISABLED=1` to skip
 * scheduling — useful for tests / local manual runs.
 */
@Injectable()
export class SequencesScheduler implements OnModuleInit {
  private readonly log = new Logger(SequencesScheduler.name);

  constructor(@InjectQueue(SEQUENCES_QUEUE) private readonly queue: Queue) {}

  async onModuleInit() {
    if (process.env.SEQUENCES_DISABLED === '1') {
      this.log.warn('sequences scheduler disabled via SEQUENCES_DISABLED=1');
      return;
    }
    try {
      await this.queue.add(
        SEQUENCE_TICK_JOB,
        {},
        {
          repeat: { pattern: '*/5 * * * *' },
          jobId: 'sequence-tick-cron',
          removeOnComplete: 50,
          removeOnFail: 100,
        },
      );
      this.log.log('sequence-tick repeatable job armed (every 5 minutes)');
    } catch (err) {
      this.log.error(
        `failed to arm sequence-tick: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}
