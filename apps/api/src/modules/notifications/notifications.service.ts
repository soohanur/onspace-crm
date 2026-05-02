import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { NotificationKind, NotificationStatus } from '@onspace/db';
import { PrismaService } from '../../prisma/prisma.service';

export interface ListNotificationsFilter {
  status?: NotificationStatus;
  entityType?: string;
  entityId?: string;
  take?: number;
}

@Injectable()
export class NotificationsService {
  private readonly log = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Public creation API used by other modules. Wrapped in try/catch —
   * a failed notification is just a missed alert, not a broken
   * send/refresh/automation flow. Never bubbles.
   */
  async create(input: {
    kind: NotificationKind;
    title: string;
    message?: string | null;
    entityType?: string | null;
    entityId?: string | null;
    assignedTo?: string | null;
  }): Promise<void> {
    try {
      await this.prisma.notification.create({
        data: {
          kind: input.kind,
          title: input.title,
          message: input.message ?? null,
          entityType: input.entityType ?? null,
          entityId: input.entityId ?? null,
          assignedTo: input.assignedTo ?? null,
        },
      });
    } catch (err) {
      this.log.warn(
        `notification create failed (kind=${input.kind} entity=${input.entityType ?? '-'}:${input.entityId ?? '-'}): ${
          err instanceof Error ? err.message : err
        }`,
      );
    }
  }

  async list(filter: ListNotificationsFilter) {
    const take = Math.min(Math.max(filter.take ?? 30, 1), 200);
    return this.prisma.notification.findMany({
      where: {
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.entityType ? { entityType: filter.entityType } : {}),
        ...(filter.entityId ? { entityId: filter.entityId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  async unreadCount(): Promise<{ count: number }> {
    const count = await this.prisma.notification.count({
      where: { status: 'unread' },
    });
    return { count };
  }

  async markRead(id: string) {
    const existing = await this.prisma.notification.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Notification not found');
    return this.prisma.notification.update({
      where: { id },
      data: { status: 'read', readAt: new Date() },
    });
  }

  async markAllRead() {
    const r = await this.prisma.notification.updateMany({
      where: { status: 'unread' },
      data: { status: 'read', readAt: new Date() },
    });
    return { updated: r.count };
  }

  async dismiss(id: string) {
    const existing = await this.prisma.notification.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Notification not found');
    return this.prisma.notification.update({
      where: { id },
      data: { status: 'dismissed' },
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.notification.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Notification not found');
    await this.prisma.notification.delete({ where: { id } });
    return { ok: true as const };
  }
}
