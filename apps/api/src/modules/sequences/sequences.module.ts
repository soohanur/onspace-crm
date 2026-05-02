import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { LeadsModule } from '../leads/leads.module';
import { GroupsModule } from '../groups/groups.module';
import { TemplatesModule } from '../templates/templates.module';
import { EmailModule } from '../email/email.module';
import { SequencesController } from './sequences.controller';
import { SequencesService } from './sequences.service';
import { SequencesProcessor } from './sequences.processor';
import { SequencesScheduler } from './sequences.scheduler';
import { SEQUENCES_QUEUE } from './sequences.constants';

@Module({
  imports: [
    BullModule.registerQueue({ name: SEQUENCES_QUEUE }),
    LeadsModule,
    GroupsModule,
    TemplatesModule,
    forwardRef(() => EmailModule),
  ],
  controllers: [SequencesController],
  providers: [SequencesService, SequencesProcessor, SequencesScheduler],
  exports: [SequencesService],
})
export class SequencesModule {}
