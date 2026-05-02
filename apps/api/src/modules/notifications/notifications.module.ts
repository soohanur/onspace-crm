import { Global, Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

/**
 * Phase 16 — display-layer notifications. Marked @Global so any other
 * module (email, campaigns, leads) can inject NotificationsService
 * without re-declaring the import. Notifications are best-effort by
 * design — see service.create() try/catch.
 */
@Global()
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
