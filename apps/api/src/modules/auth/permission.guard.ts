import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { AuthenticatedRequestContext } from './auth.types';

/**
 * Reads permissions required by the route (via @RequirePermission) and the
 * permissions granted to the active member's role. Wildcards allowed:
 *
 *   role has "*"          → matches anything
 *   role has "crm.*"      → matches "crm.lead.write"
 *   role has "crm.lead.*" → matches "crm.lead.read", "crm.lead.write"
 *
 * Platform admins bypass the check.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>('permissions', [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    const platformAdminOnly = this.reflector.getAllAndOverride<boolean>('platformAdmin', [
      ctx.getHandler(),
      ctx.getClass(),
    ]);

    if (!required?.length && !platformAdminOnly) return true;

    const req = ctx.switchToHttp().getRequest();
    const auth = req.auth as AuthenticatedRequestContext | undefined;
    if (!auth) throw new ForbiddenException('No auth context');

    if (platformAdminOnly && !auth.user.isPlatformAdmin) {
      throw new ForbiddenException('Platform admin required');
    }

    if (required?.length) {
      const granted = auth.role.permissions;
      const allowed = required.every((perm) => matches(granted, perm));
      if (!allowed) throw new ForbiddenException(`Missing permission: ${required.join(', ')}`);
    }

    return true;
  }
}

function matches(granted: string[], required: string[] | string): boolean {
  const want = Array.isArray(required) ? required[0] : required;
  for (const g of granted) {
    if (g === '*') return true;
    if (g === want) return true;
    if (g.endsWith('.*') && want.startsWith(g.slice(0, -1))) return true;
  }
  return false;
}
