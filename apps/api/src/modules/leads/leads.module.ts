import { Module } from '@nestjs/common';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';
import { StageAutomationService } from './stage-automation.service';
import { FollowUpStatusService } from './followup-status.service';

@Module({
  controllers: [LeadsController],
  providers: [LeadsService, StageAutomationService, FollowUpStatusService],
  exports: [LeadsService, StageAutomationService, FollowUpStatusService],
})
export class LeadsModule {}
