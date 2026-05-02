import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { GmailService, GMAIL_SCOPES } from './gmail.service';
import { decrypt, encrypt } from './crypto';
import { accountHasCalendarScope, accountHasReadScope } from './scopes';

/**
 * Manages connected email accounts (OAuth tokens stored encrypted in the DB).
 * MVP is single-tenant — every account is shared. Multi-tenant adds a userId
 * column later.
 */
@Injectable()
export class EmailAccountsService {
  /** in-memory state-cookie store for OAuth flow. ~5 min TTL. */
  private readonly stateStore = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly gmail: GmailService,
  ) {}

  /** Step 1 of OAuth — return a Google consent URL. */
  beginConnect(): { authUrl: string; state: string } {
    const state = randomBytes(16).toString('hex');
    this.stateStore.set(state, Date.now() + 5 * 60_000);
    this.gcStates();
    const authUrl = this.gmail.buildAuthUrl(state);
    return { authUrl, state };
  }

  /** Step 2 — exchange the code, fetch profile, persist. */
  async finishConnect(code: string, state: string) {
    if (!this.stateStore.has(state)) {
      throw new BadRequestException('OAuth state expired or invalid — start again.');
    }
    this.stateStore.delete(state);

    const tokens = await this.gmail.exchangeCode(code);
    if (!tokens.access_token || !tokens.refresh_token) {
      throw new BadRequestException(
        'Google did not return a refresh token. Revoke this app at ' +
          'https://myaccount.google.com/permissions and try again.',
      );
    }

    const profile = await this.gmail.getProfile(tokens.access_token, tokens.refresh_token);
    if (!profile.email) {
      throw new BadRequestException('Google did not return an email for this account.');
    }

    const expiresAt = tokens.expiry_date
      ? new Date(tokens.expiry_date)
      : new Date(Date.now() + 55 * 60_000);

    return this.prisma.emailAccount.upsert({
      where: { email: profile.email },
      create: {
        email: profile.email,
        displayName: profile.name ?? null,
        provider: 'gmail',
        accessToken: encrypt(tokens.access_token),
        refreshToken: encrypt(tokens.refresh_token),
        expiresAt,
        scopes: tokens.scope?.split(' ') ?? GMAIL_SCOPES,
        active: true,
      },
      update: {
        displayName: profile.name ?? undefined,
        accessToken: encrypt(tokens.access_token),
        refreshToken: encrypt(tokens.refresh_token),
        expiresAt,
        active: true,
      },
    });
  }

  /** List active accounts — never returns the encrypted tokens. */
  async list() {
    const rows = await this.prisma.emailAccount.findMany({
      where: { active: true },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        email: true,
        displayName: true,
        provider: true,
        scopes: true,
        active: true,
        expiresAt: true,
        createdAt: true,
      },
    });
    // Surface whether each account has the read + calendar scopes so the
    // UI can prompt the user to reconnect when those features won't work.
    return rows.map((a) => ({
      ...a,
      hasReadScope: accountHasReadScope(a.scopes),
      hasCalendarScope: accountHasCalendarScope(a.scopes),
    }));
  }

  async disconnect(id: string) {
    const acc = await this.prisma.emailAccount.findUnique({ where: { id } });
    if (!acc) throw new NotFoundException('Account not found');
    await this.prisma.emailAccount.delete({ where: { id } });
    return { ok: true };
  }

  /**
   * Internal: load + decrypt + auto-refresh a single account, ready to send.
   * Used by EmailService.sendEmail.
   */
  async getReadyForSend(id: string | null) {
    const account = id
      ? await this.prisma.emailAccount.findUnique({ where: { id, active: true } })
      : await this.prisma.emailAccount.findFirst({
          where: { active: true },
          orderBy: { createdAt: 'asc' },
        });
    if (!account) {
      throw new NotFoundException(
        id ? 'Email account not found or inactive.' : 'No connected email accounts. Connect Gmail in Settings first.',
      );
    }

    let accessToken = decrypt(account.accessToken);
    const refreshToken = decrypt(account.refreshToken);

    // Refresh if within 60s of expiry
    if (account.expiresAt.getTime() < Date.now() + 60_000) {
      const fresh = await this.gmail.refresh(refreshToken);
      if (fresh.access_token) {
        accessToken = fresh.access_token;
        await this.prisma.emailAccount.update({
          where: { id: account.id },
          data: {
            accessToken: encrypt(accessToken),
            expiresAt: fresh.expiry_date
              ? new Date(fresh.expiry_date)
              : new Date(Date.now() + 55 * 60_000),
          },
        });
      }
    }

    return {
      account,
      accessToken,
      refreshToken,
    };
  }

  private gcStates() {
    const now = Date.now();
    for (const [k, exp] of this.stateStore.entries()) {
      if (exp < now) this.stateStore.delete(k);
    }
  }
}
