import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  AUTOMATION_QUEUE,
  DAILY_AUTOMATION_JOB,
} from './automation.constants';

/**
 * Registers the daily-automation repeatable job on boot. Cron runs at
 * 02:00 server-local. Set `AUTOMATION_DISABLED=1` in the environment to
 * skip registration (useful for tests / dev).
 */
@Injectable()
export class AutomationScheduler implements OnModuleInit {
  private readonly log = new Logger(AutomationScheduler.name);

  constructor(
    @InjectQueue(AUTOMATION_QUEUE) private readonly queue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    if (process.env.AUTOMATION_DISABLED === '1') {
      this.log.warn('automation disabled via AUTOMATION_DISABLED=1');
      return;
    }
    try {
      await this.queue.add(
        DAILY_AUTOMATION_JOB,
        {},
        {
          repeat: { pattern: '0 2 * * *' },
          jobId: 'daily-automation-cron',
          removeOnComplete: 50,
          removeOnFail: 100,
        },
      );
      this.log.log('daily automation cron scheduled (0 2 * * *)');
    } catch (err) {
      this.log.warn(
        `failed to register daily automation: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}
