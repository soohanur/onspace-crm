import { Module } from '@nestjs/common';
import { EmailAccountsController } from './email-accounts.controller';
import { EmailAccountsService } from './email-accounts.service';
import { EmailController } from './email.controller';
import { EmailService } from './email.service';
import { GmailService } from './gmail.service';
import { GoogleCalendarService } from './google-calendar.service';
import { EmailReplyPoller } from './email-reply-poller.service';
import { TunnelService } from './tunnel.service';
import { LeadsModule } from '../leads/leads.module';

@Module({
  imports: [LeadsModule],
  controllers: [EmailAccountsController, EmailController],
  providers: [
    GmailService,
    GoogleCalendarService,
    TunnelService,
    EmailAccountsService,
    EmailService,
    EmailReplyPoller,
  ],
  exports: [
    EmailService,
    EmailAccountsService,
    GoogleCalendarService,
    TunnelService,
  ],
})
export class EmailModule {}
