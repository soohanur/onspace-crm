import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  SEQUENCES_QUEUE,
  SEQUENCE_AUTO_ENROLL_JOB,
  SEQUENCE_TICK_JOB,
} from './sequences.constants';
import { SequencesService } from './sequences.service';

/**
 * Registers the sequence repeatable jobs and provisions the default
 * outreach sequence on boot.
 *
 * - `sequence-tick` (every 5 min): drains due enrollments + sends.
 * - `sequence-auto-enroll` (every 5 min): enrolls fresh leads into
 *   every sequence with `autoEnrollAll=true`.
 *
 * Set `SEQUENCES_DISABLED=1` to skip both — useful for tests / local
 * manual runs.
 */
@Injectable()
export class SequencesScheduler implements OnModuleInit {
  private readonly log = new Logger(SequencesScheduler.name);

  constructor(
    @InjectQueue(SEQUENCES_QUEUE) private readonly queue: Queue,
    private readonly sequences: SequencesService,
  ) {}

  async onModuleInit() {
    if (process.env.SEQUENCES_DISABLED === '1') {
      this.log.warn('sequences scheduler disabled via SEQUENCES_DISABLED=1');
      return;
    }
    // Seed the workspace's default outreach sequence (idempotent — bails
    // if one already exists or no email account is connected yet).
    try {
      const result = await this.sequences.ensureDefaultOutreachSequence();
      if (result.created) this.log.log('default outreach sequence created');
    } catch (err) {
      this.log.warn(
        `default outreach sequence ensure failed: ${err instanceof Error ? err.message : err}`,
      );
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
      await this.queue.add(
        SEQUENCE_AUTO_ENROLL_JOB,
        {},
        {
          repeat: { pattern: '*/5 * * * *' },
          jobId: 'sequence-auto-enroll-cron',
          removeOnComplete: 50,
          removeOnFail: 100,
        },
      );
      this.log.log(
        'sequence repeatables armed: tick (5m) + auto-enroll (5m)',
      );
    } catch (err) {
      this.log.error(
        `failed to arm sequence repeatables: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}
