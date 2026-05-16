import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { PasswordService } from '../auth/password.service';
import { ChangePasswordDto, UpdateProfileDto } from './profile.dto';

@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
  ) {}

  async update(userId: string, memberId: string | null, dto: UpdateProfileDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    if (dto.avatarUrl !== undefined && dto.avatarUrl !== null) {
      this.assertValidAvatar(dto.avatarUrl);
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.avatarUrl !== undefined ? { avatarUrl: dto.avatarUrl } : {}),
      },
      select: { id: true, name: true, email: true, avatarUrl: true, isPlatformAdmin: true, lastLoginAt: true },
    });

    // jobTitle lives on the active workspace membership, not the user.
    if (dto.jobTitle !== undefined && memberId) {
      await this.prisma.workspaceMember.update({
        where: { id: memberId },
        data: { jobTitle: dto.jobTitle },
      });
    }

    return updated;
  }

  private assertValidAvatar(value: string) {
    const isDataUri = /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(value);
    const isHttp = /^https?:\/\//i.test(value);
    if (!isDataUri && !isHttp) {
      throw new BadRequestException('avatarUrl must be a data:image/* URI or http(s) URL');
    }
    if (value.length > 360_000) {
      throw new BadRequestException('Avatar too large; please pick a smaller image');
    }
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.passwordHash) throw new NotFoundException('User not found');

    const ok = await this.passwords.verify(dto.currentPassword, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Current password is incorrect');

    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('New password must differ from the current one');
    }

    const newHash = await this.passwords.hash(dto.newPassword);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash },
    });
    return { ok: true as const };
  }
}
