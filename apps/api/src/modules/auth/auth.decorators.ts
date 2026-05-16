import {
  applyDecorators,
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';

import { AuthenticatedRequestContext } from './auth.types';

/** Mark a route as not requiring authentication. */
export const Public = () => SetMetadata('isPublic', true);

/**
 * Require ALL listed permission strings. Wildcards in the user's role
 * (e.g. "crm.*" or "*") match prefixes.
 */
export const RequirePermission = (...permissions: string[]) =>
  applyDecorators(SetMetadata('permissions', permissions));

/** Restrict to platform admins (us). */
export const PlatformAdminOnly = () => SetMetadata('platformAdmin', true);

export const CurrentAuth = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthenticatedRequestContext => {
    return ctx.switchToHttp().getRequest().auth;
  },
);

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => {
    return ctx.switchToHttp().getRequest().auth?.user;
  },
);

export const CurrentMember = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => {
    return ctx.switchToHttp().getRequest().auth?.member;
  },
);

export const CurrentWorkspace = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => {
    return ctx.switchToHttp().getRequest().auth?.workspace;
  },
);
