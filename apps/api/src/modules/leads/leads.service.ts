import { Injectable } from '@nestjs/common';
import { Prisma } from '@onspace/db';
import { PrismaService } from '../../prisma/prisma.service';

export interface LeadFilter {
  jobId?: string;
  searchQuery?: string;
  searchLocation?: string;
  hasWebsite?: boolean;
  hasEmail?: boolean;
  hasPhone?: boolean;
  city?: string;
  state?: string;
  q?: string;
  take?: number;
  cursor?: string;
}

@Injectable()
export class LeadsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(filter: LeadFilter) {
    const where: Prisma.LeadWhereInput = {};

    if (filter.jobId) where.jobId = filter.jobId;
    if (filter.searchQuery) where.searchQuery = filter.searchQuery;
    if (filter.searchLocation) where.searchLocation = filter.searchLocation;
    if (filter.city) where.city = filter.city;
    if (filter.state) where.state = filter.state;

    if (filter.hasWebsite !== undefined) {
      where.website = filter.hasWebsite ? { not: null } : null;
    }
    if (filter.hasEmail !== undefined) {
      where.email = filter.hasEmail ? { not: null } : null;
    }
    if (filter.hasPhone !== undefined) {
      where.phone = filter.hasPhone ? { not: null } : null;
    }

    if (filter.q) {
      where.OR = [
        { businessName: { contains: filter.q, mode: 'insensitive' } },
        { category: { contains: filter.q, mode: 'insensitive' } },
        { city: { contains: filter.q, mode: 'insensitive' } },
      ];
    }

    const take = Math.min(Math.max(filter.take ?? 50, 1), 200);

    const items = await this.prisma.lead.findMany({
      where,
      take: take + 1,
      ...(filter.cursor
        ? { cursor: { id: filter.cursor }, skip: 1 }
        : {}),
      orderBy: { createdAt: 'desc' },
    });

    const hasMore = items.length > take;
    const trimmed = hasMore ? items.slice(0, take) : items;

    return {
      items: trimmed,
      nextCursor: hasMore ? trimmed[trimmed.length - 1]?.id : null,
    };
  }

  async stats(filter: Pick<LeadFilter, 'jobId' | 'searchQuery' | 'searchLocation'>) {
    const where: Prisma.LeadWhereInput = {};
    if (filter.jobId) where.jobId = filter.jobId;
    if (filter.searchQuery) where.searchQuery = filter.searchQuery;
    if (filter.searchLocation) where.searchLocation = filter.searchLocation;

    const [total, withWebsite, withEmail, withPhone] = await Promise.all([
      this.prisma.lead.count({ where }),
      this.prisma.lead.count({ where: { ...where, website: { not: null } } }),
      this.prisma.lead.count({ where: { ...where, email: { not: null } } }),
      this.prisma.lead.count({ where: { ...where, phone: { not: null } } }),
    ]);

    return { total, withWebsite, withEmail, withPhone };
  }
}
