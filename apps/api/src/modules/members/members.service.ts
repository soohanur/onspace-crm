import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { PasswordService } from '../auth/password.service';
import { InviteMemberDto, UpdateMemberDto } from './members.dto';

@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
  ) {}

  async list(workspaceId: string) {
    const members = await this.prisma.workspaceMember.findMany({
      where: { workspaceId },
      include: {
        user: { select: { id: true, email: true, name: true, avatarUrl: true, lastLoginAt: true } },
        role: { select: { id: true, key: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return members.map((m) => ({
      id: m.id,
      status: m.status,
      jobTitle: m.jobTitle,
      invitedAt: m.invitedAt,
      joinedAt: m.joinedAt,
      createdAt: m.createdAt,
      user: m.user,
      role: m.role,
    }));
  }

  async invite(workspaceId: string, invitedById: string, dto: InviteMemberDto) {
    const role = await this.prisma.role.findUnique({
      where: { workspaceId_key: { workspaceId, key: dto.roleKey } },
    });
    if (!role) throw new BadRequestException(`Unknown role: ${dto.roleKey}`);

    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: { _count: { select: { members: true } } },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');
    if (workspace._count.members >= workspace.seatLimit) {
      throw new ForbiddenException(`Seat limit reached (${workspace.seatLimit})`);
    }

    const email = dto.email.toLowerCase().trim();
    const password = dto.password ?? this.generateTempPassword();
    const passwordHash = await this.passwords.hash(password);

    const user = await this.prisma.user.upsert({
      where: { email },
      update: { name: dto.name },
      create: { email, name: dto.name, passwordHash },
    });

    const existing = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: user.id } },
    });
    if (existing) throw new ConflictException('User is already a member of this workspace');

    const member = await this.prisma.workspaceMember.create({
      data: {
        workspaceId,
        userId: user.id,
        roleId: role.id,
        jobTitle: dto.jobTitle ?? null,
        invitedById,
        invitedAt: new Date(),
        joinedAt: new Date(),
        status: 'active',
      },
      include: {
        user: { select: { id: true, email: true, name: true, avatarUrl: true, lastLoginAt: true } },
        role: { select: { id: true, key: true, name: true } },
      },
    });

    return {
      member,
      // Surfaced so the admin can hand it to the new employee.
      // In Phase 1A.5+ we replace this with a signed invite link.
      temporaryPassword: dto.password ? undefined : password,
    };
  }

  async update(workspaceId: string, memberId: string, dto: UpdateMemberDto, actorMemberId: string) {
    const member = await this.prisma.workspaceMember.findFirst({
      where: { id: memberId, workspaceId },
      include: { role: true },
    });
    if (!member) throw new NotFoundException('Member not found');

    // Protect the workspace owner from being demoted/suspended by anyone but themselves.
    if (member.role.key === 'owner' && actorMemberId !== member.id) {
      throw new ForbiddenException('Cannot modify the workspace owner');
    }

    const data: Record<string, unknown> = {};
    if (dto.jobTitle !== undefined) data.jobTitle = dto.jobTitle;
    if (dto.status) data.status = dto.status;
    if (dto.roleKey) {
      const newRole = await this.prisma.role.findUnique({
        where: { workspaceId_key: { workspaceId, key: dto.roleKey } },
      });
      if (!newRole) throw new BadRequestException(`Unknown role: ${dto.roleKey}`);
      data.roleId = newRole.id;
    }

    return this.prisma.workspaceMember.update({
      where: { id: memberId },
      data,
      include: {
        user: { select: { id: true, email: true, name: true, avatarUrl: true, lastLoginAt: true } },
        role: { select: { id: true, key: true, name: true } },
      },
    });
  }

  async remove(workspaceId: string, memberId: string, actorMemberId: string) {
    const member = await this.prisma.workspaceMember.findFirst({
      where: { id: memberId, workspaceId },
      include: { role: true },
    });
    if (!member) throw new NotFoundException('Member not found');
    if (member.role.key === 'owner') throw new ForbiddenException('Cannot remove the workspace owner');
    if (member.id === actorMemberId) throw new ForbiddenException('Cannot remove yourself');

    await this.prisma.workspaceMember.delete({ where: { id: memberId } });
    return { id: memberId };
  }

  private generateTempPassword(): string {
    // Memorable-ish: two short blocks + digits. Replace with proper invite tokens later.
    const blocks = Math.random().toString(36).slice(2, 7) + '-' + Math.random().toString(36).slice(2, 7);
    return blocks;
  }
}
