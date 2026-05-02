import { Module } from '@nestjs/common';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';
import { StageAutomationService } from './stage-automation.service';

@Module({
  controllers: [LeadsController],
  providers: [LeadsService, StageAutomationService],
  exports: [LeadsService, StageAutomationService],
})
export class LeadsModule {}
