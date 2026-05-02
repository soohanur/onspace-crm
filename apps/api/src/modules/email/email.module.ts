import { Module } from '@nestjs/common';
import { EmailAccountsController } from './email-accounts.controller';
import { EmailAccountsService } from './email-accounts.service';
import { EmailController } from './email.controller';
import { EmailService } from './email.service';
import { GmailService } from './gmail.service';
import { EmailReplyPoller } from './email-reply-poller.service';
import { TunnelService } from './tunnel.service';

@Module({
  controllers: [EmailAccountsController, EmailController],
  providers: [
    GmailService,
    TunnelService,
    EmailAccountsService,
    EmailService,
    EmailReplyPoller,
  ],
  exports: [EmailService, TunnelService],
})
export class EmailModule {}
