import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { NotificationStatus } from '@onspace/db';
import { NotificationsService } from './notifications.service';

const STATUSES = new Set<NotificationStatus>(['unread', 'read', 'dismissed']);

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(
    @Query('status') status?: string,
    @Query('take') take?: string,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
  ) {
    return this.notifications.list({
      status:
        status && STATUSES.has(status as NotificationStatus)
          ? (status as NotificationStatus)
          : undefined,
      entityType: entityType || undefined,
      entityId: entityId || undefined,
      take: take ? Number(take) : undefined,
    });
  }

  @Get('unread-count')
  unread() {
    return this.notifications.unreadCount();
  }

  @Post(':id/mark-read')
  @HttpCode(HttpStatus.OK)
  markRead(@Param('id') id: string) {
    return this.notifications.markRead(id);
  }

  @Post('mark-all-read')
  @HttpCode(HttpStatus.OK)
  markAllRead() {
    return this.notifications.markAllRead();
  }

  @Post(':id/dismiss')
  @HttpCode(HttpStatus.OK)
  dismiss(@Param('id') id: string) {
    return this.notifications.dismiss(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.notifications.remove(id);
  }
}
