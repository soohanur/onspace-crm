import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';

import { AuthGuard } from '../auth/auth.guard';
import {
  CurrentUser,
  PlatformAdminOnly,
} from '../auth/auth.decorators';
import { PermissionGuard } from '../auth/permission.guard';
import {
  CreateWorkspaceDto,
  ToggleFeatureDto,
  ToggleProductDto,
  UpdateWorkspaceDto,
  UpsertSubscriptionDto,
} from './admin.dto';
import { AdminService } from './admin.service';

@Controller('admin')
@UseGuards(AuthGuard, PermissionGuard)
@PlatformAdminOnly()
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('catalog/products')
  listProducts() {
    return this.admin.listProducts();
  }

  @Get('workspaces')
  list() {
    return this.admin.listWorkspaces();
  }

  @Get('workspaces/:id')
  one(@Param('id') id: string) {
    return this.admin.getWorkspace(id);
  }

  @Post('workspaces')
  create(@CurrentUser() user: { id: string }, @Body() dto: CreateWorkspaceDto) {
    return this.admin.createWorkspace(user.id, dto);
  }

  @Patch('workspaces/:id')
  update(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdateWorkspaceDto,
  ) {
    return this.admin.updateWorkspace(user.id, id, dto);
  }

  @Post('workspaces/:id/product')
  toggleProduct(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: ToggleProductDto,
  ) {
    return this.admin.toggleProduct(user.id, id, dto);
  }

  @Post('workspaces/:id/feature')
  toggleFeature(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: ToggleFeatureDto,
  ) {
    return this.admin.toggleFeature(user.id, id, dto);
  }

  @Put('workspaces/:id/subscription')
  upsertSubscription(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: UpsertSubscriptionDto,
  ) {
    return this.admin.upsertSubscription(user.id, id, dto);
  }

  @Get('audit')
  listAudit(@Query('workspaceId') workspaceId?: string, @Query('take') take?: string) {
    return this.admin.listAudit(workspaceId, take ? Number(take) : 100);
  }
}
