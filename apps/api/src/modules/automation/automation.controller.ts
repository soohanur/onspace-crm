import { InjectQueue } from '@nestjs/bullmq';
import { Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Queue } from 'bullmq';
import { AutomationProcessor } from './automation.processor';
import { AUTOMATION_QUEUE } from './automation.constants';

/**
 * Manual-trigger endpoint. Runs the rule chain in-process and returns the
 * summary so callers (cli / test) get an immediate result. The cron path
 * still goes through BullMQ — this just bypasses the queue for one-shot
 * use.
 */
@Controller('automation')
export class AutomationController {
  constructor(
    private readonly processor: AutomationProcessor,
    @InjectQueue(AUTOMATION_QUEUE) private readonly queue: Queue,
  ) {}

  @Post('run')
  @HttpCode(HttpStatus.OK)
  async runNow() {
    return this.processor.runAllRules();
  }
}
