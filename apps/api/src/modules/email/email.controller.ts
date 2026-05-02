import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { EmailService } from './email.service';
import { SendEmailDto } from './dto';

@Controller()
export class EmailController {
  constructor(private readonly emails: EmailService) {}

  @Post('email/send')
  send(@Body() dto: SendEmailDto) {
    return this.emails.send(dto);
  }

  @Get('leads/:leadId/emails')
  history(@Param('leadId') leadId: string, @Query('take') take?: string) {
    return this.emails.listForLead(leadId, take ? Number(take) : undefined);
  }
}
