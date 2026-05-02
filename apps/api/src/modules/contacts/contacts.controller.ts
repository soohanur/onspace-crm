import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ContactsService } from './contacts.service';
import { CreateContactDto, UpdateContactDto } from './dto';

/**
 * Two route prefixes — one nested under a lead (list / create) and one
 * resource-scoped (update / delete / set-primary). Mirrors the way Notes
 * are scoped: list/create live under /leads/:leadId, mutations live on
 * /:id once we have it.
 */
@Controller()
export class ContactsController {
  constructor(private readonly contacts: ContactsService) {}

  @Get('leads/:leadId/contacts')
  list(@Param('leadId') leadId: string) {
    return this.contacts.list(leadId);
  }

  @Post('leads/:leadId/contacts')
  create(@Param('leadId') leadId: string, @Body() dto: CreateContactDto) {
    return this.contacts.create(leadId, dto);
  }

  @Patch('contacts/:id')
  update(@Param('id') id: string, @Body() dto: UpdateContactDto) {
    return this.contacts.update(id, dto);
  }

  @Delete('contacts/:id')
  remove(@Param('id') id: string) {
    return this.contacts.remove(id);
  }

  @Post('contacts/:id/set-primary')
  @HttpCode(HttpStatus.OK)
  setPrimary(@Param('id') id: string) {
    return this.contacts.setPrimary(id);
  }
}
