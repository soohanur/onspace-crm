import { Injectable, NotFoundException } from '@nestjs/common';
import {
  Confidence,
  ContactSource,
  ContactStatus,
  ContactType,
  LeadStage,
  Prisma,
} from '@onspace/db';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateContactDto, UpdateContactDto } from './dto';

/**
 * Phase 13 — global contacts directory filter shape. Mirrors the URL
 * params parsed in the controller. `lead*` fields select on the parent
 * Lead via Prisma's nested relation filter.
 */
export interface GlobalContactsFilter {
  q?: string;
  contactType?: ContactType[];
  status?: ContactStatus[];
  confidence?: Confidence[];
  source?: ContactSource[];
  isPrimary?: boolean;

  hasEmail?: boolean;
  hasPhone?: boolean;
  hasLinkedin?: boolean;

  leadCategory?: string;
  leadCity?: string;
  leadState?: string;
  leadStage?: LeadStage[];

  take?: number;
  cursor?: string;
}

const CONTACT_LEAD_INCLUDE = {
  lead: {
    select: {
      id: true,
      businessName: true,
      city: true,
      state: true,
      stage: true,
      score: true,
      category: true,
    },
  },
} as const;

@Injectable()
export class ContactsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(leadId: string) {
    const lead = await this.prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) throw new NotFoundException('Lead not found');
    return this.prisma.contact.findMany({
      where: { leadId },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async create(leadId: string, dto: CreateContactDto) {
    const lead = await this.prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) throw new NotFoundException('Lead not found');

    // If creating as primary, demote any existing primary on the same lead
    // in a single transaction so the invariant (≤1 primary per lead) holds.
    if (dto.isPrimary) {
      return this.prisma.$transaction(async (tx) => {
        await tx.contact.updateMany({
          where: { leadId, isPrimary: true },
          data: { isPrimary: false },
        });
        return tx.contact.create({ data: this.toCreateData(leadId, dto) });
      });
    }

    return this.prisma.contact.create({ data: this.toCreateData(leadId, dto) });
  }

  async update(id: string, dto: UpdateContactDto) {
    const existing = await this.prisma.contact.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Contact not found');

    if (dto.isPrimary === true && !existing.isPrimary) {
      // Promotion via PATCH — also demote others.
      return this.prisma.$transaction(async (tx) => {
        await tx.contact.updateMany({
          where: { leadId: existing.leadId, isPrimary: true, NOT: { id } },
          data: { isPrimary: false },
        });
        return tx.contact.update({
          where: { id },
          data: this.toUpdateData(dto),
        });
      });
    }

    return this.prisma.contact.update({
      where: { id },
      data: this.toUpdateData(dto),
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.contact.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Contact not found');
    await this.prisma.contact.delete({ where: { id } });
    return { ok: true as const };
  }

  /**
   * Atomically: this contact becomes the lead's primary; every other contact
   * on the same lead is demoted. Single transaction so concurrent calls
   * can't leave the lead with two primaries.
   */
  async setPrimary(id: string) {
    const existing = await this.prisma.contact.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Contact not found');

    return this.prisma.$transaction(async (tx) => {
      await tx.contact.updateMany({
        where: { leadId: existing.leadId, NOT: { id } },
        data: { isPrimary: false },
      });
      return tx.contact.update({
        where: { id },
        data: { isPrimary: true },
      });
    });
  }

  // ─── Phase 13: global directory ────────────────────────────────────────

  private buildGlobalWhere(f: GlobalContactsFilter): Prisma.ContactWhereInput {
    const where: Prisma.ContactWhereInput = {};
    const AND: Prisma.ContactWhereInput[] = [];

    if (f.contactType?.length) where.contactType = { in: f.contactType };
    if (f.status?.length) where.status = { in: f.status };
    if (f.confidence?.length) where.confidence = { in: f.confidence };
    if (f.source?.length) where.source = { in: f.source };
    if (f.isPrimary !== undefined) where.isPrimary = f.isPrimary;

    if (f.hasEmail !== undefined)
      where.email = f.hasEmail ? { not: null } : null;
    if (f.hasPhone !== undefined)
      where.phone = f.hasPhone ? { not: null } : null;
    if (f.hasLinkedin !== undefined)
      where.linkedin = f.hasLinkedin ? { not: null } : null;

    // Lead-side filters via Prisma's nested relation filter — generates
    // the appropriate JOIN automatically.
    const leadIs: Prisma.LeadWhereInput = {};
    if (f.leadCity) leadIs.city = f.leadCity;
    if (f.leadState) leadIs.state = f.leadState;
    if (f.leadStage?.length) leadIs.stage = { in: f.leadStage };
    if (f.leadCategory) {
      leadIs.OR = [
        { category: f.leadCategory },
        { categories: { has: f.leadCategory } },
      ];
    }
    if (Object.keys(leadIs).length > 0) {
      where.lead = { is: leadIs };
    }

    if (f.q) {
      const q = f.q;
      AND.push({
        OR: [
          { name:  { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
          { phone: { contains: q, mode: 'insensitive' } },
          { lead:  { is: { businessName: { contains: q, mode: 'insensitive' } } } },
        ],
      });
    }

    if (AND.length) where.AND = AND;
    return where;
  }

  /**
   * Cross-lead contact directory listing. Cursor-paginated. Includes a
   * lean lead summary so the UI can render the business pill + stage
   * badge without a second fetch.
   */
  async listGlobal(filter: GlobalContactsFilter) {
    const where = this.buildGlobalWhere(filter);
    const take = Math.min(Math.max(filter.take ?? 50, 1), 200);

    const items = await this.prisma.contact.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      take: take + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      include: CONTACT_LEAD_INCLUDE,
    });

    const hasMore = items.length > take;
    const trimmed = hasMore ? items.slice(0, take) : items;
    return {
      items: trimmed,
      nextCursor: hasMore ? trimmed[trimmed.length - 1]?.id ?? null : null,
    };
  }

  async stats(filter: GlobalContactsFilter) {
    const where = this.buildGlobalWhere(filter);
    const [total, owners, verified, withEmail, withPhone] = await Promise.all([
      this.prisma.contact.count({ where }),
      this.prisma.contact.count({ where: { ...where, contactType: 'owner' } }),
      this.prisma.contact.count({ where: { ...where, status: 'verified' } }),
      this.prisma.contact.count({ where: { ...where, email: { not: null } } }),
      this.prisma.contact.count({ where: { ...where, phone: { not: null } } }),
    ]);
    return { total, owners, verified, withEmail, withPhone };
  }

  /**
   * Distinct lead-side values for the contacts filter dropdowns. Mirrors
   * LeadsService.facets but joined through the contact table so the
   * lists only include lead categories/cities/states that actually have
   * a contact attached. Caps each list to 200.
   */
  async globalFacets() {
    const [categoryRows, cityRows, stateRows] = await Promise.all([
      this.prisma.$queryRaw<{ value: string }[]>`
        SELECT DISTINCT unnest(l.categories) AS value
        FROM contacts c
        JOIN leads l ON l.id = c.lead_id
        WHERE l.categories IS NOT NULL AND array_length(l.categories, 1) > 0
        ORDER BY value
        LIMIT 200
      `,
      this.prisma.contact.findMany({
        where: { lead: { is: { city: { not: null } } } },
        distinct: ['leadId'],
        select: { lead: { select: { city: true } } },
        take: 5_000,
      }),
      this.prisma.contact.findMany({
        where: { lead: { is: { state: { not: null } } } },
        distinct: ['leadId'],
        select: { lead: { select: { state: true } } },
        take: 5_000,
      }),
    ]);

    const dedupSorted = (vals: (string | null | undefined)[], cap: number) =>
      Array.from(
        new Set(vals.filter((v): v is string => typeof v === 'string' && v.length > 0)),
      )
        .sort((a, b) => a.localeCompare(b))
        .slice(0, cap);

    return {
      leadCategories: categoryRows.map((r) => r.value).filter(Boolean).slice(0, 200),
      leadCities: dedupSorted(cityRows.map((r) => r.lead?.city), 200),
      leadStates: dedupSorted(stateRows.map((r) => r.lead?.state), 100),
    };
  }

  private toCreateData(
    leadId: string,
    dto: CreateContactDto,
  ): Prisma.ContactUncheckedCreateInput {
    return {
      leadId,
      name: dto.name.trim(),
      contactType: dto.contactType,
      email: nullify(dto.email),
      phone: nullify(dto.phone),
      linkedin: nullify(dto.linkedin),
      socialProfile: nullify(dto.socialProfile),
      source: dto.source,
      confidence: dto.confidence,
      status: dto.status,
      isPrimary: dto.isPrimary ?? false,
      notes: nullify(dto.notes),
    };
  }

  private toUpdateData(
    dto: UpdateContactDto,
  ): Prisma.ContactUncheckedUpdateInput {
    return {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.contactType !== undefined ? { contactType: dto.contactType } : {}),
      ...(dto.email !== undefined ? { email: nullify(dto.email) } : {}),
      ...(dto.phone !== undefined ? { phone: nullify(dto.phone) } : {}),
      ...(dto.linkedin !== undefined ? { linkedin: nullify(dto.linkedin) } : {}),
      ...(dto.socialProfile !== undefined
        ? { socialProfile: nullify(dto.socialProfile) }
        : {}),
      ...(dto.source !== undefined ? { source: dto.source } : {}),
      ...(dto.confidence !== undefined ? { confidence: dto.confidence } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      ...(dto.isPrimary !== undefined ? { isPrimary: dto.isPrimary } : {}),
      ...(dto.notes !== undefined ? { notes: nullify(dto.notes) } : {}),
    };
  }
}

function nullify(v?: string): string | null | undefined {
  if (v === undefined) return undefined;
  const t = v.trim();
  return t === '' ? null : t;
}
