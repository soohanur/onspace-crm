import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';

import { PrismaModule } from './prisma/prisma.module';
import { HealthController } from './modules/health/health.controller';
import { LeadsModule } from './modules/leads/leads.module';
import { ScrapeModule } from './modules/scrape/scrape.module';
import { SearchesModule } from './modules/searches/searches.module';
import { GroupsModule } from './modules/groups/groups.module';
import { NotesModule } from './modules/notes/notes.module';
import { ContactsModule } from './modules/contacts/contacts.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { AutomationModule } from './modules/automation/automation.module';
import { EmailModule } from './modules/email/email.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST ?? 'localhost',
        port: Number(process.env.REDIS_PORT ?? 6379),
      },
    }),
    PrismaModule,
    LeadsModule,
    SearchesModule,
    ScrapeModule,
    GroupsModule,
    NotesModule,
    ContactsModule,
    TasksModule,
    AutomationModule,
    EmailModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
