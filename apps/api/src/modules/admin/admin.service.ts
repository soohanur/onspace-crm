import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { PasswordService } from '../auth/password.service';
import {
  CreateWorkspaceDto,
  ToggleFeatureDto,
  ToggleProductDto,
  UpdateWorkspaceDto,
  UpsertSubscriptionDto,
} from './admin.dto';

const DEFAULT_ROLES: Array<{
  key: 'owner' | 'admin' | 'manager' | 'sales' | 'viewer';
  name: string;
  description: string;
  permissions: string[];
}> = [
  { key: 'owner',   name: 'Owner',   description: 'Full access. Cannot be deleted.', permissions: ['*'] },
  { key: 'admin',   name: 'Admin',   description: 'Manage workspace + members + data.', permissions: ['crm.*', 'workspace.settings', 'member.*', 'role.*', 'audit.read'] },
  { key: 'manager', name: 'Manager', description: 'Manage CRM data + assign tasks.', permissions: ['crm.lead.*', 'crm.contact.*', 'crm.group.*', 'crm.task.*', 'crm.note.*', 'crm.email.*', 'crm.meeting.*', 'crm.proposal.*', 'crm.report.read', 'member.read', 'role.read'] },
  { key: 'sales',   name: 'Sales',   description: 'Work on assigned leads/tasks.', permissions: ['crm.lead.read', 'crm.lead.write', 'crm.contact.read', 'crm.contact.write', 'crm.note.read', 'crm.note.write', 'crm.task.read.assigned', 'crm.task.complete.own', 'crm.email.send', 'crm.email.read', 'crm.meeting.read', 'crm.meeting.write.own', 'crm.call.read', 'crm.call.write.own'] },
  { key: 'viewer',  name: 'Viewer',  description: 'Read-only across CRM.', permissions: ['crm.lead.read', 'crm.contact.read', 'crm.group.read', 'crm.note.read', 'crm.task.read', 'crm.report.read'] },
];

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
  ) {}

  // ─── Workspaces ───────────────────────────────────────────────────────

  async listWorkspaces() {
    return this.prisma.workspace.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { members: true } },
        subscription: true,
        products: { include: { product: { select: { key: true, name: true } } } },
      },
    });
  }

  async getWorkspace(id: string) {
    const ws = await this.prisma.workspace.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        members: {
          include: {
            user: { select: { id: true, name: true, email: true, lastLoginAt: true } },
            role: { select: { id: true, key: true, name: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
        products: { include: { product: true } },
        features: { include: { feature: { include: { product: { select: { key: true } } } } } },
        subscription: true,
      },
    });
    if (!ws) throw new NotFoundException('Workspace not found');
    return ws;
  }

  async createWorkspace(actorUserId: string, dto: CreateWorkspaceDto) {
    const existing = await this.prisma.workspace.findUnique({ where: { slug: dto.slug } });
    if (existing) throw new ConflictException(`Workspace slug "${dto.slug}" already taken`);

    const email = dto.ownerEmail.toLowerCase().trim();
    const password = dto.ownerPassword ?? this.generateTempPassword();
    const passwordHash = await this.passwords.hash(password);

    const owner = await this.prisma.user.upsert({
      where: { email },
      update: { name: dto.ownerName },
      create: { email, name: dto.ownerName, passwordHash },
    });

    // Resolve any product keys we want enabled at creation.
    const productKeys = dto.productKeys?.length ? dto.productKeys : ['crm'];
    const products = await this.prisma.product.findMany({
      where: { key: { in: productKeys } },
      include: { features: true },
    });

    const ws = await this.prisma.$transaction(async (tx) => {
      const w = await tx.workspace.create({
        data: {
          slug: dto.slug,
          name: dto.name,
          ownerId: owner.id,
          seatLimit: dto.seatLimit ?? 5,
          timezone: dto.timezone ?? 'Asia/Dhaka',
          currency: dto.currency ?? 'BDT',
        },
      });

      // Seed default roles
      for (const r of DEFAULT_ROLES) {
        await tx.role.create({
          data: {
            workspaceId: w.id,
            key: r.key,
            name: r.name,
            description: r.description,
            permissions: r.permissions,
            isSystem: true,
          },
        });
      }
      const ownerRole = await tx.role.findFirstOrThrow({ where: { workspaceId: w.id, key: 'owner' } });

      // Make the owner a member
      await tx.workspaceMember.create({
        data: {
          workspaceId: w.id,
          userId: owner.id,
          roleId: ownerRole.id,
          status: 'active',
          joinedAt: new Date(),
        },
      });

      // Enable selected products + their default features
      for (const p of products) {
        await tx.workspaceProduct.create({
          data: { workspaceId: w.id, productId: p.id, enabled: true },
        });
        for (const f of p.features) {
          await tx.workspaceFeature.create({
            data: { workspaceId: w.id, featureId: f.id, enabled: f.defaultEnabled },
          });
        }
      }

      await tx.auditLog.create({
        data: {
          workspaceId: w.id,
          actorUserId,
          action: 'workspace.create',
          meta: { slug: w.slug, name: w.name, productKeys },
        },
      });

      return w;
    });

    return {
      workspace: ws,
      ownerTemporaryPassword: dto.ownerPassword ? undefined : password,
    };
  }

  async updateWorkspace(actorUserId: string, id: string, dto: UpdateWorkspaceDto) {
    const ws = await this.prisma.workspace.findUnique({ where: { id } });
    if (!ws) throw new NotFoundException('Workspace not found');

    const updated = await this.prisma.workspace.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.seatLimit !== undefined ? { seatLimit: dto.seatLimit } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.timezone !== undefined ? { timezone: dto.timezone } : {}),
        ...(dto.currency !== undefined ? { currency: dto.currency } : {}),
      },
    });
    await this.prisma.auditLog.create({
      data: {
        workspaceId: id,
        actorUserId,
        action: 'workspace.update',
        meta: dto as object,
      },
    });
    return updated;
  }

  // ─── Products / Features per workspace ────────────────────────────────

  async toggleProduct(actorUserId: string, workspaceId: string, dto: ToggleProductDto) {
    const product = await this.prisma.product.findUnique({
      where: { key: dto.productKey },
      include: { features: true },
    });
    if (!product) throw new NotFoundException(`Product ${dto.productKey} not found`);

    const wp = await this.prisma.workspaceProduct.upsert({
      where: { workspaceId_productId: { workspaceId, productId: product.id } },
      update: { enabled: dto.enabled },
      create: { workspaceId, productId: product.id, enabled: dto.enabled },
    });

    // When enabling, also seed default-enabled features. When disabling,
    // we leave WorkspaceFeature rows alone so re-enabling restores them.
    if (dto.enabled) {
      for (const f of product.features) {
        await this.prisma.workspaceFeature.upsert({
          where: { workspaceId_featureId: { workspaceId, featureId: f.id } },
          update: {},
          create: { workspaceId, featureId: f.id, enabled: f.defaultEnabled },
        });
      }
    }

    await this.prisma.auditLog.create({
      data: {
        workspaceId,
        actorUserId,
        action: 'workspace.product.toggle',
        meta: { productKey: dto.productKey, enabled: dto.enabled },
      },
    });
    return wp;
  }

  async toggleFeature(actorUserId: string, workspaceId: string, dto: ToggleFeatureDto) {
    // Feature keys are unique only within a product, so we look up by key alone
    // assuming no cross-product collision (we control the seeder).
    const feature = await this.prisma.feature.findFirst({
      where: { key: dto.featureKey },
    });
    if (!feature) throw new NotFoundException(`Feature ${dto.featureKey} not found`);

    const wf = await this.prisma.workspaceFeature.upsert({
      where: { workspaceId_featureId: { workspaceId, featureId: feature.id } },
      update: { enabled: dto.enabled, changedById: actorUserId, changedAt: new Date() },
      create: {
        workspaceId,
        featureId: feature.id,
        enabled: dto.enabled,
        changedById: actorUserId,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        workspaceId,
        actorUserId,
        action: 'workspace.feature.toggle',
        meta: { featureKey: dto.featureKey, enabled: dto.enabled },
      },
    });
    return wf;
  }

  // ─── Subscription ─────────────────────────────────────────────────────

  async upsertSubscription(actorUserId: string, workspaceId: string, dto: UpsertSubscriptionDto) {
    const ws = await this.prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!ws) throw new NotFoundException('Workspace not found');

    if (new Date(dto.expiresAt) <= new Date(dto.startsAt)) {
      throw new BadRequestException('expiresAt must be after startsAt');
    }

    const sub = await this.prisma.subscription.upsert({
      where: { workspaceId },
      update: {
        planName: dto.planName,
        startsAt: new Date(dto.startsAt),
        expiresAt: new Date(dto.expiresAt),
        status: dto.status ?? 'active',
        amountPaid: dto.amountPaid != null ? (dto.amountPaid as unknown as any) : undefined,
        currency: dto.currency ?? 'BDT',
        notes: dto.notes,
      },
      create: {
        workspaceId,
        planName: dto.planName,
        startsAt: new Date(dto.startsAt),
        expiresAt: new Date(dto.expiresAt),
        status: dto.status ?? 'active',
        amountPaid: dto.amountPaid != null ? (dto.amountPaid as unknown as any) : null,
        currency: dto.currency ?? 'BDT',
        notes: dto.notes,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        workspaceId,
        actorUserId,
        action: 'subscription.upsert',
        meta: { planName: dto.planName, expiresAt: dto.expiresAt, status: sub.status },
      },
    });
    return sub;
  }

  // ─── Catalog ──────────────────────────────────────────────────────────

  listProducts() {
    return this.prisma.product.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { features: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  // ─── Audit log ────────────────────────────────────────────────────────

  listAudit(workspaceId?: string, take = 100) {
    return this.prisma.auditLog.findMany({
      where: workspaceId ? { workspaceId } : {},
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(take, 1), 500),
    });
  }

  private generateTempPassword(): string {
    return (
      Math.random().toString(36).slice(2, 7) + '-' + Math.random().toString(36).slice(2, 7)
    );
  }
}
