import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from './prisma/prisma.module';
import { HealthController } from './modules/health/health.controller';
import { AuthModule } from './modules/auth/auth.module';
import { MembersModule } from './modules/members/members.module';
import { RolesModule } from './modules/roles/roles.module';
import { ProfileModule } from './modules/profile/profile.module';
import { LeadsModule } from './modules/leads/leads.module';
import { ScrapeModule } from './modules/scrape/scrape.module';
import { SearchesModule } from './modules/searches/searches.module';
import { GroupsModule } from './modules/groups/groups.module';
import { NotesModule } from './modules/notes/notes.module';
import { ContactsModule } from './modules/contacts/contacts.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { AutomationModule } from './modules/automation/automation.module';
import { EmailModule } from './modules/email/email.module';
import { TemplatesModule } from './modules/templates/templates.module';
import { CampaignsModule } from './modules/campaigns/campaigns.module';
import { MeetingsModule } from './modules/meetings/meetings.module';
import { ProposalsModule } from './modules/proposals/proposals.module';
import { CallsModule } from './modules/calls/calls.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { ReportsModule } from './modules/reports/reports.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { SequencesModule } from './modules/sequences/sequences.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),
    BullModule.forRoot({
      // Supports both local plain Redis and TLS-wrapped managed providers
      // (Upstash uses rediss://). If REDIS_URL is set, it wins; otherwise we
      // fall back to discrete host/port/password (+ optional TLS) env vars.
      connection: (() => {
        const url = process.env.REDIS_URL;
        if (url) {
          // ioredis parses rediss://… and enables TLS automatically.
          return { url } as any;
        }
        const useTls = String(process.env.REDIS_TLS ?? '').toLowerCase() === 'true';
        return {
          host: process.env.REDIS_HOST ?? 'localhost',
          port: Number(process.env.REDIS_PORT ?? 6379),
          ...(process.env.REDIS_PASSWORD ? { password: process.env.REDIS_PASSWORD } : {}),
          ...(useTls ? { tls: {} } : {}),
        };
      })(),
    }),
    PrismaModule,
    AuthModule,
    MembersModule,
    RolesModule,
    ProfileModule,
    LeadsModule,
    SearchesModule,
    ScrapeModule,
    GroupsModule,
    NotesModule,
    ContactsModule,
    TasksModule,
    AutomationModule,
    EmailModule,
    TemplatesModule,
    CampaignsModule,
    MeetingsModule,
    ProposalsModule,
    CallsModule,
    DashboardModule,
    ReportsModule,
    NotificationsModule,
    SequencesModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
