import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@onspace/db';
import { PrismaService } from '../../prisma/prisma.service';
import { LeadsService, LeadFilter } from '../leads/leads.service';
import { CreateGroupDto, GroupLeadIdsDto, UpdateGroupDto } from './dto';

const toJson = (v: Record<string, unknown> | undefined | null): Prisma.InputJsonValue =>
  (v ?? {}) as Prisma.InputJsonValue;

@Injectable()
export class GroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leads: LeadsService,
  ) {}

  async create(dto: CreateGroupDto) {
    if (dto.type === 'smart' && !dto.filterDsl) {
      throw new BadRequestException('smart groups require filterDsl');
    }
    return this.prisma.leadGroup.create({
      data: {
        name: dto.name.trim(),
        description: dto.description ?? null,
        type: dto.type,
        filterDsl: dto.filterDsl ? toJson(dto.filterDsl) : Prisma.JsonNull,
        color: dto.color ?? null,
      },
    });
  }

  async list() {
    const groups = await this.prisma.leadGroup.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { members: true } } },
    });
    return groups.map((g) => ({
      ...g,
      memberCount: g._count.members,
      _count: undefined,
    }));
  }

  async findOne(id: string) {
    const g = await this.prisma.leadGroup.findUnique({
      where: { id },
      include: { _count: { select: { members: true } } },
    });
    if (!g) throw new NotFoundException('Group not found');
    return { ...g, memberCount: g._count.members, _count: undefined };
  }

  async update(id: string, dto: UpdateGroupDto) {
    await this.findOne(id);
    return this.prisma.leadGroup.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.filterDsl !== undefined ? { filterDsl: toJson(dto.filterDsl) } : {}),
        ...(dto.color !== undefined ? { color: dto.color } : {}),
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.leadGroup.delete({ where: { id } });
    return { ok: true };
  }

  /**
   * Return leads belonging to a group.
   *  - manual: join via lead_group_members
   *  - smart : evaluate filterDsl against the live leads table
   *            via the existing LeadsService.list()
   */
  async listLeads(id: string, take?: number, cursor?: string) {
    const group = await this.prisma.leadGroup.findUnique({ where: { id } });
    if (!group) throw new NotFoundException('Group not found');

    if (group.type === 'manual') {
      return this.leads.list({ groupId: id, take, cursor });
    }
    // smart
    const dsl = (group.filterDsl ?? {}) as LeadFilter;
    return this.leads.list({ ...dsl, take, cursor });
  }

  async addLeads(id: string, dto: GroupLeadIdsDto) {
    const group = await this.findOne(id);
    if (group.type !== 'manual') {
      throw new BadRequestException('cannot add leads to a smart group');
    }
    // createMany skipDuplicates handles re-adds gracefully.
    await this.prisma.leadGroupMember.createMany({
      data: dto.leadIds.map((leadId) => ({ groupId: id, leadId })),
      skipDuplicates: true,
    });
    return { added: dto.leadIds.length };
  }

  async removeLeads(id: string, dto: GroupLeadIdsDto) {
    const group = await this.findOne(id);
    if (group.type !== 'manual') {
      throw new BadRequestException('cannot remove leads from a smart group');
    }
    await this.prisma.leadGroupMember.deleteMany({
      where: { groupId: id, leadId: { in: dto.leadIds } },
    });
    return { removed: dto.leadIds.length };
  }

  /**
   * Phase 9 — campaigns-wizard preview. Walks the group's leads and
   * classifies each one's resolvable email source so the wizard can
   * show "X resolved · Y duplicates · Z no email" before the user
   * commits to a campaign.
   */
  async emailCoverage(id: string) {
    const { items: leads } = await this.listLeads(id, 5000);
    const leadIds = leads.map((l) => l.id);
    const primaries = leadIds.length
      ? await this.prisma.contact.findMany({
          where: { leadId: { in: leadIds }, isPrimary: true },
          select: { leadId: true, email: true },
        })
      : [];
    const primaryEmailByLead = new Map<string, string | null>();
    for (const p of primaries) primaryEmailByLead.set(p.leadId, p.email);

    let totalLeads = leads.length;
    let withPrimaryContactEmail = 0;
    let withFallbackEmail = 0;
    let noEmail = 0;
    const seen = new Set<string>();
    let duplicateEmails = 0;
    for (const lead of leads) {
      const fromContact = primaryEmailByLead.get(lead.id)?.trim() || null;
      const fromLead = lead.email?.trim() || null;
      const toEmail = fromContact || fromLead || null;
      if (!toEmail) {
        noEmail += 1;
        continue;
      }
      if (fromContact) withPrimaryContactEmail += 1;
      else withFallbackEmail += 1;
      const k = toEmail.toLowerCase();
      if (seen.has(k)) duplicateEmails += 1;
      else seen.add(k);
    }
    return {
      totalLeads,
      withPrimaryContactEmail,
      withFallbackEmail,
      noEmail,
      duplicateEmails,
    };
  }
}
