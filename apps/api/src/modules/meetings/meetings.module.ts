import { Module } from '@nestjs/common';
import { LeadsModule } from '../leads/leads.module';
import { TasksModule } from '../tasks/tasks.module';
import { EmailModule } from '../email/email.module';
import { MeetingsController } from './meetings.controller';
import { MeetingsService } from './meetings.service';

@Module({
  imports: [LeadsModule, TasksModule, EmailModule],
  controllers: [MeetingsController],
  providers: [MeetingsService],
  exports: [MeetingsService],
})
export class MeetingsModule {}
