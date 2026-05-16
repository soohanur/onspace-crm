import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { CreateRoleDto, UpdateRoleDto } from './roles.dto';

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  list(workspaceId: string) {
    return this.prisma.role.findMany({
      where: { workspaceId },
      orderBy: [{ isSystem: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async create(workspaceId: string, dto: CreateRoleDto) {
    const existing = await this.prisma.role.findUnique({
      where: { workspaceId_key: { workspaceId, key: dto.key } },
    });
    if (existing) throw new ConflictException(`Role "${dto.key}" already exists`);
    this.assertNotReservedKey(dto.key);

    return this.prisma.role.create({
      data: {
        workspaceId,
        key: dto.key,
        name: dto.name,
        description: dto.description ?? null,
        permissions: dto.permissions,
        isSystem: false,
      },
    });
  }

  async update(workspaceId: string, id: string, dto: UpdateRoleDto) {
    const role = await this.prisma.role.findFirst({ where: { id, workspaceId } });
    if (!role) throw new NotFoundException('Role not found');

    // Owner permissions are immutable (always full access).
    if (role.key === 'owner' && dto.permissions) {
      throw new ForbiddenException('Owner permissions cannot be changed');
    }

    return this.prisma.role.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.permissions !== undefined ? { permissions: dto.permissions } : {}),
      },
    });
  }

  async remove(workspaceId: string, id: string) {
    const role = await this.prisma.role.findFirst({
      where: { id, workspaceId },
      include: { _count: { select: { members: true } } },
    });
    if (!role) throw new NotFoundException('Role not found');
    if (role.isSystem) throw new ForbiddenException('System roles cannot be deleted');
    if (role._count.members > 0) {
      throw new BadRequestException(
        `Role still has ${role._count.members} member(s). Reassign them first.`,
      );
    }
    await this.prisma.role.delete({ where: { id } });
    return { id };
  }

  private assertNotReservedKey(key: string) {
    const reserved = ['owner', 'admin', 'manager', 'sales', 'viewer'];
    if (reserved.includes(key)) {
      throw new ConflictException(`"${key}" is a reserved system role key`);
    }
  }
}
