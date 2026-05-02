import { Module } from '@nestjs/common';
import { LeadsModule } from '../leads/leads.module';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';

@Module({
  imports: [LeadsModule],
  controllers: [GroupsController],
  providers: [GroupsService],
})
export class GroupsModule {}
