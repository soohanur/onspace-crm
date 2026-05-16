import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { AuthGuard } from '../auth/auth.guard';
import {
  CurrentMember,
  CurrentWorkspace,
  RequirePermission,
} from '../auth/auth.decorators';
import { PermissionGuard } from '../auth/permission.guard';
import { InviteMemberDto, UpdateMemberDto } from './members.dto';
import { MembersService } from './members.service';

@Controller('members')
@UseGuards(AuthGuard, PermissionGuard)
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get()
  @RequirePermission('member.read')
  list(@CurrentWorkspace() ws: { id: string }) {
    return this.members.list(ws.id);
  }

  @Post()
  @RequirePermission('member.invite')
  invite(
    @CurrentWorkspace() ws: { id: string },
    @CurrentMember() actor: { id: string },
    @Body() dto: InviteMemberDto,
  ) {
    return this.members.invite(ws.id, actor.id, dto);
  }

  @Patch(':id')
  @RequirePermission('member.manage')
  update(
    @CurrentWorkspace() ws: { id: string },
    @CurrentMember() actor: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdateMemberDto,
  ) {
    return this.members.update(ws.id, id, dto, actor.id);
  }

  @Delete(':id')
  @RequirePermission('member.manage')
  remove(
    @CurrentWorkspace() ws: { id: string },
    @CurrentMember() actor: { id: string },
    @Param('id') id: string,
  ) {
    return this.members.remove(ws.id, id, actor.id);
  }
}
