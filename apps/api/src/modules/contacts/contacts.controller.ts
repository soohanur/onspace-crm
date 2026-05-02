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
  Query,
} from '@nestjs/common';
import {
  Confidence,
  ContactSource,
  ContactStatus,
  ContactType,
  LeadStage,
} from '@onspace/db';
import {
  ContactsService,
  GlobalContactsFilter,
} from './contacts.service';
import { CreateContactDto, UpdateContactDto } from './dto';

const CONTACT_TYPES = new Set<ContactType>([
  'owner',
  'manager',
  'staff',
  'general',
]);
const CONTACT_STATUSES = new Set<ContactStatus>([
  'unverified',
  'verified',
  'invalid',
]);
const CONFIDENCES = new Set<Confidence>(['low', 'medium', 'high']);
const CONTACT_SOURCES = new Set<ContactSource>([
  'manual',
  'website',
  'directory',
  'enrichment',
]);
const LEAD_STAGES = new Set<LeadStage>([
  'new',
  'approached',
  'no_response',
  'engaged',
  'push',
  'qualified',
  'interested',
  'booked',
  'proposal_sent',
  'converted',
  'not_converted',
  'lost',
]);

/**
 * Two route prefixes — one nested under a lead (list / create) and one
 * resource-scoped (update / delete / set-primary). Mirrors the way Notes
 * are scoped: list/create live under /leads/:leadId, mutations live on
 * /:id once we have it.
 *
 * Phase 13: adds the global directory endpoints (`/contacts`,
 * `/contacts/stats`, `/contacts/facets`). The static paths must come
 * BEFORE any `/contacts/:id` route to keep Nest from matching `:id`
 * against `stats` / `facets`.
 */
@Controller()
export class ContactsController {
  constructor(private readonly contacts: ContactsService) {}

  // ─── Phase 13: global directory ────────────────────────────────────────

  @Get('contacts')
  listGlobal(@Query() q: Record<string, string>) {
    return this.contacts.listGlobal(this.parseFilter(q));
  }

  @Get('contacts/stats')
  globalStats(@Query() q: Record<string, string>) {
    return this.contacts.stats(this.parseFilter(q));
  }

  @Get('contacts/facets')
  globalFacets() {
    return this.contacts.globalFacets();
  }

  // ─── Lead-scoped CRUD (existing) ───────────────────────────────────────

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

  // ─── Query parser ──────────────────────────────────────────────────────

  private parseFilter(q: Record<string, string>): GlobalContactsFilter {
    return {
      q: q.q || undefined,
      contactType: parseList<ContactType>(q.contactType, CONTACT_TYPES),
      status: parseList<ContactStatus>(q.status, CONTACT_STATUSES),
      confidence: parseList<Confidence>(q.confidence, CONFIDENCES),
      source: parseList<ContactSource>(q.source, CONTACT_SOURCES),
      isPrimary: parseBool(q.isPrimary),
      hasEmail: parseBool(q.hasEmail),
      hasPhone: parseBool(q.hasPhone),
      hasLinkedin: parseBool(q.hasLinkedin),
      leadCategory: q.leadCategory || undefined,
      leadCity: q.leadCity || undefined,
      leadState: q.leadState || undefined,
      leadStage: parseList<LeadStage>(q.leadStage, LEAD_STAGES),
      take: q.take ? Number(q.take) : undefined,
      cursor: q.cursor,
    };
  }
}

function parseList<T extends string>(
  v: string | undefined,
  allowed: Set<T>,
): T[] | undefined {
  if (!v) return undefined;
  const arr = v
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is T => allowed.has(s as T));
  return arr.length ? arr : undefined;
}

function parseBool(v: string | undefined): boolean | undefined {
  if (v === undefined || v === null || v === '' || v === 'all') return undefined;
  if (v === 'true' || v === '1') return true;
  if (v === 'false' || v === '0') return false;
  return undefined;
}
