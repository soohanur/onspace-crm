import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Distinct previous searches power autocomplete on the Lead Scraper page.
 * Backed by `scrape_jobs` rather than a separate table — every job already
 * carries (search_query, search_location).
 */
@Injectable()
export class SearchesService {
  constructor(private readonly prisma: PrismaService) {}

  async suggestQueries(prefix: string, limit = 8) {
    const rows = await this.prisma.scrapeJob.findMany({
      where: prefix
        ? { searchQuery: { startsWith: prefix, mode: 'insensitive' } }
        : {},
      distinct: ['searchQuery'],
      orderBy: { createdAt: 'desc' },
      select: { searchQuery: true },
      take: limit,
    });
    return rows.map((r) => r.searchQuery);
  }

  async suggestLocations(prefix: string, limit = 8) {
    const rows = await this.prisma.scrapeJob.findMany({
      where: prefix
        ? { searchLocation: { startsWith: prefix, mode: 'insensitive' } }
        : {},
      distinct: ['searchLocation'],
      orderBy: { createdAt: 'desc' },
      select: { searchLocation: true },
      take: limit,
    });
    return rows.map((r) => r.searchLocation);
  }
}
