import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class NotesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(leadId: string) {
    const lead = await this.prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) throw new NotFoundException('Lead not found');
    return this.prisma.note.findMany({
      where: { leadId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async create(leadId: string, body: string) {
    const lead = await this.prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) throw new NotFoundException('Lead not found');
    return this.prisma.note.create({
      data: { leadId, body: body.trim() },
    });
  }

  async remove(leadId: string, noteId: string) {
    const note = await this.prisma.note.findFirst({
      where: { id: noteId, leadId },
    });
    if (!note) throw new NotFoundException('Note not found');
    await this.prisma.note.delete({ where: { id: noteId } });
    return { ok: true };
  }
}
