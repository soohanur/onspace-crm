import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { LeadsModule } from '../leads/leads.module';
import { TasksModule } from '../tasks/tasks.module';
import { AutomationController } from './automation.controller';
import { AutomationProcessor } from './automation.processor';
import { AutomationScheduler } from './automation.scheduler';
import { AUTOMATION_QUEUE } from './automation.constants';

@Module({
  imports: [
    BullModule.registerQueue({ name: AUTOMATION_QUEUE }),
    LeadsModule,
    TasksModule,
  ],
  controllers: [AutomationController],
  providers: [AutomationProcessor, AutomationScheduler],
})
export class AutomationModule {}
