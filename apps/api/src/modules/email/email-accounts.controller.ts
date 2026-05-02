import {
  Controller,
  Delete,
  Get,
  Param,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { EmailAccountsService } from './email-accounts.service';

/** Mask middle of an OAuth client id so we can display it without leaking it. */
function mask(s: string): string {
  if (s.length < 12) return s;
  return `${s.slice(0, 8)}…${s.slice(-12)}`;
}

@Controller('email')
export class EmailAccountsController {
  constructor(private readonly accounts: EmailAccountsService) {}

  /**
   * Read-only check the UI uses to verify the Google OAuth env is set
   * correctly. Never returns the secret. Returns the exact redirect URI
   * we send to Google, so the user can copy-paste it into Cloud Console.
   */
  @Get('config')
  config() {
    const clientId = process.env.GOOGLE_CLIENT_ID ?? '';
    const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI ?? '';
    const hasSecret = !!process.env.GOOGLE_CLIENT_SECRET;
    const hasEncKey = !!process.env.EMAIL_TOKEN_ENC_KEY;
    return {
      configured: !!(clientId && hasSecret && redirectUri && hasEncKey),
      clientIdMasked: clientId ? mask(clientId) : null,
      redirectUri,
      hasSecret,
      hasEncKey,
      successRedirect:
        process.env.EMAIL_OAUTH_SUCCESS_REDIRECT ?? 'http://localhost:3000/settings',
    };
  }

  /** Browser hits this to start the OAuth dance. We 302 to Google. */
  @Get('auth/connect')
  connect(@Res() res: Response) {
    const { authUrl } = this.accounts.beginConnect();
    return res.redirect(authUrl);
  }

  /** Google redirects here with ?code=...&state=... */
  @Get('auth/callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ) {
    const success = process.env.EMAIL_OAUTH_SUCCESS_REDIRECT ?? 'http://localhost:3000/settings';

    if (error) {
      return res.redirect(`${success}?email_oauth=error&reason=${encodeURIComponent(error)}`);
    }
    if (!code || !state) {
      return res.redirect(`${success}?email_oauth=error&reason=missing_code`);
    }

    try {
      const account = await this.accounts.finishConnect(code, state);
      return res.redirect(
        `${success}?email_oauth=ok&email=${encodeURIComponent(account.email)}`,
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : 'unknown error';
      return res.redirect(
        `${success}?email_oauth=error&reason=${encodeURIComponent(message)}`,
      );
    }
  }

  @Get('accounts')
  list() {
    return this.accounts.list();
  }

  @Delete('accounts/:id')
  remove(@Param('id') id: string) {
    return this.accounts.disconnect(id);
  }
}
