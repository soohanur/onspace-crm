import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { LeadsModule } from '../leads/leads.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [LeadsModule, AuthModule],
  controllers: [TasksController],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}
