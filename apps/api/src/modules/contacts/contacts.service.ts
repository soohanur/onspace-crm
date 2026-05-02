import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@onspace/db';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateContactDto, UpdateContactDto } from './dto';

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
