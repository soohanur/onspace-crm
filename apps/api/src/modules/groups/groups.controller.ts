import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { GroupsService } from './groups.service';
import { CreateGroupDto, GroupLeadIdsDto, UpdateGroupDto } from './dto';

@Controller('groups')
export class GroupsController {
  constructor(private readonly groups: GroupsService) {}

  @Get()
  list() {
    return this.groups.list();
  }

  @Post()
  create(@Body() dto: CreateGroupDto) {
    return this.groups.create(dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.groups.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateGroupDto) {
    return this.groups.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.groups.remove(id);
  }

  @Get(':id/leads')
  listLeads(
    @Param('id') id: string,
    @Query('take') take?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.groups.listLeads(id, take ? Number(take) : undefined, cursor);
  }

  @Get(':id/email-coverage')
  emailCoverage(@Param('id') id: string) {
    return this.groups.emailCoverage(id);
  }

  @Post(':id/leads')
  addLeads(@Param('id') id: string, @Body() dto: GroupLeadIdsDto) {
    return this.groups.addLeads(id, dto);
  }

  @Delete(':id/leads')
  removeLeads(@Param('id') id: string, @Body() dto: GroupLeadIdsDto) {
    return this.groups.removeLeads(id, dto);
  }
}
