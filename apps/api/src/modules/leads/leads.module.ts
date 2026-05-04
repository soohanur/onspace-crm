import { Module } from '@nestjs/common';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';
import { StageAutomationService } from './stage-automation.service';
import { FollowUpStatusService } from './followup-status.service';
import { LeadActivityService } from './lead-activity.service';

@Module({
  controllers: [LeadsController],
  providers: [
    LeadsService,
    StageAutomationService,
    FollowUpStatusService,
    LeadActivityService,
  ],
  exports: [
    LeadsService,
    StageAutomationService,
    FollowUpStatusService,
    LeadActivityService,
  ],
})
export class LeadsModule {}
