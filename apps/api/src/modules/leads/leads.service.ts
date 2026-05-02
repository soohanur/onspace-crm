import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@onspace/db';
import { PrismaService } from '../../prisma/prisma.service';

export type OrderBy = 'recent' | 'name' | 'rating' | 'years';

/**
 * Shared shape used by:
 *   - GET /api/leads             (query string)
 *   - LeadGroup.filterDsl json   (smart-group definition)
 *
 * Keep these names stable — they're a public contract.
 */
export interface LeadFilter {
  // text
  q?: string;

  // ingest provenance
  jobId?: string;
  searchQuery?: string;
  searchLocation?: string;

  // grouping
  groupId?: string;

  // facets
  category?: string;
  city?: string;
  state?: string;

  // booleans
  hasWebsite?: boolean;
  hasEmail?: boolean;
  hasPhone?: boolean;
  hasSocials?: boolean;
  claimed?: boolean;

  // numerics
  ratingMin?: number;
  ratingMax?: number;
  yearsMin?: number;
  yearsMax?: number;

  // pagination + sort
  orderBy?: OrderBy;
  take?: number;
  cursor?: string;
}

@Injectable()
export class LeadsService {
  constructor(private readonly prisma: PrismaService) {}

  private buildWhere(f: LeadFilter): Prisma.LeadWhereInput {
    const where: Prisma.LeadWhereInput = {};
    const AND: Prisma.LeadWhereInput[] = [];

    if (f.jobId) where.jobId = f.jobId;
    if (f.searchQuery) where.searchQuery = f.searchQuery;
    if (f.searchLocation) where.searchLocation = f.searchLocation;
    if (f.city) where.city = f.city;
    if (f.state) where.state = f.state;

    if (f.category) {
      // matches if `category` exact OR `categories` array contains it
      AND.push({
        OR: [
          { category: f.category },
          { categories: { has: f.category } },
        ],
      });
    }

    if (f.hasWebsite !== undefined) where.website = f.hasWebsite ? { not: null } : null;
    if (f.hasEmail !== undefined) where.email = f.hasEmail ? { not: null } : null;
    if (f.hasPhone !== undefined) where.phone = f.hasPhone ? { not: null } : null;
    if (f.hasSocials !== undefined) {
      // Postgres: array_length(socials, 1) > 0  ⇨  socials ≠ '{}'
      where.socials = f.hasSocials ? { isEmpty: false } : { isEmpty: true };
    }
    if (f.claimed !== undefined) where.claimed = f.claimed;

    if (f.ratingMin !== undefined || f.ratingMax !== undefined) {
      where.rating = {
        ...(f.ratingMin !== undefined ? { gte: f.ratingMin } : {}),
        ...(f.ratingMax !== undefined ? { lte: f.ratingMax } : {}),
      };
    }
    if (f.yearsMin !== undefined || f.yearsMax !== undefined) {
      where.yearsInBusiness = {
        ...(f.yearsMin !== undefined ? { gte: f.yearsMin } : {}),
        ...(f.yearsMax !== undefined ? { lte: f.yearsMax } : {}),
      };
    }

    if (f.q) {
      AND.push({
        OR: [
          { businessName: { contains: f.q, mode: 'insensitive' } },
          { category: { contains: f.q, mode: 'insensitive' } },
          { city: { contains: f.q, mode: 'insensitive' } },
          { description: { contains: f.q, mode: 'insensitive' } },
        ],
      });
    }

    if (f.groupId) {
      AND.push({ groupMemberships: { some: { groupId: f.groupId } } });
    }

    if (AND.length) where.AND = AND;
    return where;
  }

  private buildOrderBy(orderBy?: OrderBy): Prisma.LeadOrderByWithRelationInput[] {
    switch (orderBy) {
      case 'name':
        return [{ businessName: 'asc' }];
      case 'rating':
        return [{ rating: 'desc' }, { reviewCount: 'desc' }];
      case 'years':
        return [{ yearsInBusiness: 'desc' }];
      case 'recent':
      default:
        return [{ createdAt: 'desc' }];
    }
  }

  async list(filter: LeadFilter) {
    const where = this.buildWhere(filter);
    const orderBy = this.buildOrderBy(filter.orderBy);
    const take = Math.min(Math.max(filter.take ?? 50, 1), 200);

    const items = await this.prisma.lead.findMany({
      where,
      orderBy,
      take: take + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    });

    const hasMore = items.length > take;
    const trimmed = hasMore ? items.slice(0, take) : items;

    return {
      items: trimmed,
      nextCursor: hasMore ? trimmed[trimmed.length - 1]?.id : null,
    };
  }

  async findOne(id: string) {
    const lead = await this.prisma.lead.findUnique({
      where: { id },
      include: {
        job: true,
        groupMemberships: {
          include: { group: true },
        },
      },
    });
    if (!lead) throw new NotFoundException('Lead not found');
    return lead;
  }

  async stats(filter: Pick<LeadFilter, 'jobId' | 'searchQuery' | 'searchLocation' | 'groupId'>) {
    const where = this.buildWhere(filter);
    const [total, withWebsite, withEmail, withPhone, withSocials] = await Promise.all([
      this.prisma.lead.count({ where }),
      this.prisma.lead.count({ where: { ...where, website: { not: null } } }),
      this.prisma.lead.count({ where: { ...where, email: { not: null } } }),
      this.prisma.lead.count({ where: { ...where, phone: { not: null } } }),
      this.prisma.lead.count({ where: { ...where, socials: { isEmpty: false } } }),
    ]);
    return { total, withWebsite, withEmail, withPhone, withSocials };
  }

  /**
   * Distinct values used to populate filter dropdowns on the Global Leads UI.
   * Cheap with the existing indexes; cap to 200 items each.
   */
  async facets() {
    const [categories, cities, states] = await Promise.all([
      this.prisma.$queryRaw<{ value: string }[]>`
        SELECT DISTINCT unnest(categories) AS value
        FROM leads
        WHERE categories IS NOT NULL AND array_length(categories, 1) > 0
        ORDER BY value
        LIMIT 200
      `,
      this.prisma.lead.findMany({
        where: { city: { not: null } },
        distinct: ['city'],
        select: { city: true },
        orderBy: { city: 'asc' },
        take: 200,
      }),
      this.prisma.lead.findMany({
        where: { state: { not: null } },
        distinct: ['state'],
        select: { state: true },
        orderBy: { state: 'asc' },
        take: 100,
      }),
    ]);

    return {
      categories: categories.map((r) => r.value).filter(Boolean),
      cities: cities.map((r) => r.city!).filter(Boolean),
      states: states.map((r) => r.state!).filter(Boolean),
    };
  }
}
