import { Body, Controller, Patch, Post, UseGuards } from '@nestjs/common';

import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/auth.decorators';
import { ChangePasswordDto, UpdateProfileDto } from './profile.dto';
import { ProfileService } from './profile.service';

@Controller('profile')
@UseGuards(AuthGuard)
export class ProfileController {
  constructor(private readonly profile: ProfileService) {}

  @Patch()
  update(@CurrentUser() user: { id: string }, @Body() dto: UpdateProfileDto) {
    return this.profile.update(user.id, dto);
  }

  @Post('password')
  changePassword(@CurrentUser() user: { id: string }, @Body() dto: ChangePasswordDto) {
    return this.profile.changePassword(user.id, dto);
  }
}
