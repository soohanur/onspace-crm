import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { PrismaService } from '../../prisma/prisma.service';
import { PasswordService } from './password.service';
import {
  AuthenticatedRequestContext,
  JwtPayload,
} from './auth.types';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly jwt: JwtService,
  ) {}

  /**
   * Verify credentials and pick an active workspace membership.
   * If the user has no active membership → 401 (we don't leak which side failed).
   */
  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      include: {
        memberships: {
          where: { status: 'active' },
          include: { workspace: true, role: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!user || !user.passwordHash) throw new UnauthorizedException('Invalid credentials');

    const ok = await this.passwords.verify(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    if (this.passwords.isLegacy(user.passwordHash)) {
      const upgraded = await this.passwords.hash(password);
      await this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: upgraded },
      });
    }

    const membership = user.memberships[0];
    if (!membership) throw new UnauthorizedException('No active workspace for this user');

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const payload: JwtPayload = {
      sub: user.id,
      mid: membership.id,
      wid: membership.workspaceId,
    };
    const token = await this.jwt.signAsync(payload);

    return {
      token,
      context: await this.buildContext({
        user,
        membership,
        workspace: membership.workspace,
        role: membership.role,
      }),
    };
  }

  /**
   * Resolve a JWT payload into a full request context.
   * Used by the auth guard on every request.
   */
  async resolveContext(payload: JwtPayload): Promise<AuthenticatedRequestContext> {
    const member = await this.prisma.workspaceMember.findUnique({
      where: { id: payload.mid },
      include: { user: true, workspace: true, role: true },
    });
    if (!member) throw new UnauthorizedException('Session invalid');
    if (member.status !== 'active') throw new UnauthorizedException('Membership not active');
    if (member.workspace.status !== 'active') throw new UnauthorizedException('Workspace not active');

    return this.buildContext({
      user: member.user,
      membership: member,
      workspace: member.workspace,
      role: member.role,
    });
  }

  // ── private ──

  /**
   * Fetch the workspace's products, features, and subscription.
   * Used by login + resolveContext. Done in a single round-trip via Promise.all.
   */
  private async loadWorkspaceCapabilities(workspaceId: string) {
    const [products, features, sub] = await Promise.all([
      this.prisma.workspaceProduct.findMany({
        where: { workspaceId, enabled: true },
        include: { product: { select: { key: true, name: true } } },
      }),
      this.prisma.workspaceFeature.findMany({
        where: { workspaceId, enabled: true },
        include: { feature: { select: { key: true } } },
      }),
      this.prisma.subscription.findUnique({ where: { workspaceId } }),
    ]);
    return {
      products: products.map((p) => ({ key: p.product.key, name: p.product.name })),
      features: features.map((f) => f.feature.key),
      subscription: sub,
    };
  }

  private async buildContext(args: {
    user: { id: string; email: string; name: string; isPlatformAdmin: boolean };
    membership: { id: string; roleId: string; status: string; jobTitle: string | null };
    workspace: { id: string; slug: string; name: string; status: string };
    role: { id: string; key: string; name: string; permissions: string[] };
  }): Promise<AuthenticatedRequestContext> {
    const caps = await this.loadWorkspaceCapabilities(args.workspace.id);

    let subscription: AuthenticatedRequestContext['subscription'] = null;
    if (caps.subscription) {
      const now = Date.now();
      const exp = caps.subscription.expiresAt.getTime();
      const daysRemaining = Math.max(0, Math.ceil((exp - now) / (24 * 60 * 60 * 1000)));
      subscription = {
        planName: caps.subscription.planName,
        status: caps.subscription.status,
        startsAt: caps.subscription.startsAt.toISOString(),
        expiresAt: caps.subscription.expiresAt.toISOString(),
        daysRemaining,
      };
    }

    return {
      user: {
        id: args.user.id,
        email: args.user.email,
        name: args.user.name,
        isPlatformAdmin: args.user.isPlatformAdmin,
      },
      member: {
        id: args.membership.id,
        roleId: args.membership.roleId,
        status: args.membership.status,
        jobTitle: args.membership.jobTitle,
      },
      workspace: {
        id: args.workspace.id,
        slug: args.workspace.slug,
        name: args.workspace.name,
        status: args.workspace.status,
      },
      role: {
        id: args.role.id,
        key: args.role.key,
        name: args.role.name,
        permissions: args.role.permissions,
      },
      products: caps.products,
      features: caps.features,
      subscription,
    };
  }
}
