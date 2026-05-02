import { Module } from '@nestjs/common';
import { LeadsModule } from '../leads/leads.module';
import { EmailModule } from '../email/email.module';
import { TasksModule } from '../tasks/tasks.module';
import { ProposalsController } from './proposals.controller';
import { ProposalsService } from './proposals.service';

@Module({
  imports: [LeadsModule, EmailModule, TasksModule],
  controllers: [ProposalsController],
  providers: [ProposalsService],
  exports: [ProposalsService],
})
export class ProposalsModule {}
