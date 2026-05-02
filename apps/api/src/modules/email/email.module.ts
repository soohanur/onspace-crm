import { Module } from '@nestjs/common';
import { EmailAccountsController } from './email-accounts.controller';
import { EmailAccountsService } from './email-accounts.service';
import { EmailController } from './email.controller';
import { EmailService } from './email.service';
import { GmailService } from './gmail.service';

@Module({
  controllers: [EmailAccountsController, EmailController],
  providers: [GmailService, EmailAccountsService, EmailService],
  exports: [EmailService],
})
export class EmailModule {}
