import { Module } from '@nestjs/common';
import { LeadsModule } from '../leads/leads.module';
import { TasksModule } from '../tasks/tasks.module';
import { MeetingsController } from './meetings.controller';
import { MeetingsService } from './meetings.service';

@Module({
  imports: [LeadsModule, TasksModule],
  controllers: [MeetingsController],
  providers: [MeetingsService],
  exports: [MeetingsService],
})
export class MeetingsModule {}
