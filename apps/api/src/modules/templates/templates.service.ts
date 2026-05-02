import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTemplateDto, UpdateTemplateDto } from './dto';

@Injectable()
export class TemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.emailTemplate.findMany({
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const t = await this.prisma.emailTemplate.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('Template not found');
    return t;
  }

  async create(dto: CreateTemplateDto) {
    return this.prisma.emailTemplate.create({
      data: {
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        subject: dto.subject,
        bodyText: dto.bodyText,
        bodyHtml: dto.bodyHtml ?? null,
      },
    });
  }

  async update(id: string, dto: UpdateTemplateDto) {
    await this.findOne(id);
    return this.prisma.emailTemplate.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description?.trim() || null }
          : {}),
        ...(dto.subject !== undefined ? { subject: dto.subject } : {}),
        ...(dto.bodyText !== undefined ? { bodyText: dto.bodyText } : {}),
        ...(dto.bodyHtml !== undefined ? { bodyHtml: dto.bodyHtml || null } : {}),
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    const count = await this.prisma.campaign.count({
      where: { templateId: id },
    });
    if (count > 0) {
      throw new ConflictException(
        `Template is used by ${count} campaign(s) and cannot be deleted`,
      );
    }
    await this.prisma.emailTemplate.delete({ where: { id } });
    return { ok: true as const };
  }
}
