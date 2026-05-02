import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { GroupsModule } from '../groups/groups.module';
import { EmailModule } from '../email/email.module';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';
import { CampaignsProcessor } from './campaigns.processor';
import { CAMPAIGNS_QUEUE } from './campaigns.constants';

@Module({
  imports: [
    BullModule.registerQueue({ name: CAMPAIGNS_QUEUE }),
    GroupsModule,
    forwardRef(() => EmailModule),
  ],
  controllers: [CampaignsController],
  providers: [CampaignsService, CampaignsProcessor],
  exports: [CampaignsService],
})
export class CampaignsModule {}
