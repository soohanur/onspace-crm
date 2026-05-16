import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

import { AuthService } from './auth.service';
import { ACCESS_COOKIE, JwtPayload } from './auth.types';

/**
 * Global auth guard. Reads the JWT from either:
 *   1. HttpOnly cookie (browser flow)
 *   2. `Authorization: Bearer …` (mobile / scripts)
 *
 * On success: attaches the full context to req.auth (and legacy req.user) so any
 * downstream handler can use `@CurrentAuth()` / `@CurrentMember()` / etc.
 *
 * Endpoints marked `@Public()` skip this guard entirely.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly auth: AuthService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request & { auth?: unknown }>();

    // Allow handlers/controllers to opt out via @Public()
    const isPublic = Reflect.getMetadata('isPublic', ctx.getHandler()) ||
                     Reflect.getMetadata('isPublic', ctx.getClass());
    if (isPublic) return true;

    const token = this.extractToken(req);
    if (!token) throw new UnauthorizedException('Not authenticated');

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Session expired');
    }

    const context = await this.auth.resolveContext(payload);
    (req as any).auth = context;
    return true;
  }

  private extractToken(req: Request): string | undefined {
    const cookieToken = (req as any).cookies?.[ACCESS_COOKIE];
    if (cookieToken) return cookieToken;
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) return header.slice(7);
    return undefined;
  }
}
