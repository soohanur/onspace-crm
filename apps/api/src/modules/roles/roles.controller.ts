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
import { CurrentWorkspace, RequirePermission } from '../auth/auth.decorators';
import { PermissionGuard } from '../auth/permission.guard';
import { CreateRoleDto, UpdateRoleDto } from './roles.dto';
import { RolesService } from './roles.service';

@Controller('roles')
@UseGuards(AuthGuard, PermissionGuard)
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  @RequirePermission('role.read')
  list(@CurrentWorkspace() ws: { id: string }) {
    return this.roles.list(ws.id);
  }

  @Post()
  @RequirePermission('role.manage')
  create(@CurrentWorkspace() ws: { id: string }, @Body() dto: CreateRoleDto) {
    return this.roles.create(ws.id, dto);
  }

  @Patch(':id')
  @RequirePermission('role.manage')
  update(
    @CurrentWorkspace() ws: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.roles.update(ws.id, id, dto);
  }

  @Delete(':id')
  @RequirePermission('role.manage')
  remove(@CurrentWorkspace() ws: { id: string }, @Param('id') id: string) {
    return this.roles.remove(ws.id, id);
  }
}
