import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';

import { AuthService } from './auth.service';
import { LoginDto } from './auth.dto';
import { CurrentAuth, Public } from './auth.decorators';
import { AuthGuard } from './auth.guard';
import { PermissionGuard } from './permission.guard';
import { ACCESS_COOKIE, AuthenticatedRequestContext } from './auth.types';

@Controller('auth')
@UseGuards(AuthGuard, PermissionGuard)
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const { token, context } = await this.auth.login(dto.email, dto.password);
    this.setCookie(res, token);
    return context;
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Res({ passthrough: true }) res: Response) {
    this.clearCookie(res);
  }

  @Get('me')
  me(@CurrentAuth() ctx: AuthenticatedRequestContext) {
    return ctx;
  }

  private setCookie(res: Response, token: string) {
    const ttlSeconds = this.parseTtl(process.env.JWT_ACCESS_TTL ?? '15m');
    const isProd = process.env.NODE_ENV === 'production';
    res.cookie(ACCESS_COOKIE, token, {
      httpOnly: true,
      // Production runs web on Vercel + api on Render = cross-site requests.
      // Browsers require SameSite=None + Secure for the cookie to be sent on
      // cross-site fetches. Dev keeps SameSite=Lax because Secure=false there.
      sameSite: isProd ? 'none' : 'lax',
      secure: isProd,
      maxAge: ttlSeconds * 1000,
      path: '/',
    });
  }

  private clearCookie(res: Response) {
    const isProd = process.env.NODE_ENV === 'production';
    res.clearCookie(ACCESS_COOKIE, {
      path: '/',
      sameSite: isProd ? 'none' : 'lax',
      secure: isProd,
    });
  }

  private parseTtl(s: string): number {
    const m = s.match(/^(\d+)([smhd])$/);
    if (!m) return 900;
    const n = Number(m[1]);
    const unit = m[2];
    switch (unit) {
      case 's': return n;
      case 'm': return n * 60;
      case 'h': return n * 60 * 60;
      case 'd': return n * 60 * 60 * 24;
      default: return 900;
    }
  }
}
