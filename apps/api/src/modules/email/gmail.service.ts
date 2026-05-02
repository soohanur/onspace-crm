import { Injectable, Logger } from '@nestjs/common';
import { google, Auth } from 'googleapis';

type OAuth2Client = Auth.OAuth2Client;
type Credentials = Auth.Credentials;

/** Scopes required to send mail and read the user's profile (for `email`). */
export const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

@Injectable()
export class GmailService {
  private readonly log = new Logger(GmailService.name);

  /** Build a fresh OAuth2 client. Caller sets credentials via setCredentials. */
  private oauth2Client(): OAuth2Client {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
    if (!clientId || !clientSecret || !redirectUri) {
      throw new Error(
        'Gmail OAuth not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_OAUTH_REDIRECT_URI in .env',
      );
    }
    return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  }

  /** First step: build the consent URL the browser should be redirected to. */
  buildAuthUrl(state: string): string {
    return this.oauth2Client().generateAuthUrl({
      access_type: 'offline',     // returns a refresh_token
      prompt: 'consent',           // forces refresh_token even on re-auth
      scope: GMAIL_SCOPES,
      state,
    });
  }

  /** Exchange an authorization code for tokens. */
  async exchangeCode(code: string): Promise<Credentials> {
    const client = this.oauth2Client();
    const { tokens } = await client.getToken(code);
    return tokens;
  }

  /** Refresh an expired access token with the stored refresh token. */
  async refresh(refreshToken: string): Promise<Credentials> {
    const client = this.oauth2Client();
    client.setCredentials({ refresh_token: refreshToken });
    const { credentials } = await client.refreshAccessToken();
    return credentials;
  }

  /** Fetch the connected account's profile (email + name). */
  async getProfile(accessToken: string, refreshToken: string) {
    const client = this.oauth2Client();
    client.setCredentials({ access_token: accessToken, refresh_token: refreshToken });
    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const me = await oauth2.userinfo.get();
    return {
      email: me.data.email ?? null,
      name: me.data.name ?? null,
    };
  }

  /**
   * Send an email via Gmail API. Returns Gmail's message id + thread id.
   *
   * The body is encoded as a standard RFC 2822 message and sent base64url-
   * encoded via users.messages.send.
   */
  async sendMail(opts: {
    accessToken: string;
    refreshToken: string;
    fromEmail: string;
    fromName?: string | null;
    to: string;
    cc?: string[];
    bcc?: string[];
    subject: string;
    bodyText: string;
    bodyHtml?: string;
  }): Promise<{ messageId: string; threadId: string }> {
    const client = this.oauth2Client();
    client.setCredentials({
      access_token: opts.accessToken,
      refresh_token: opts.refreshToken,
    });
    const gmail = google.gmail({ version: 'v1', auth: client });

    const raw = buildRawMessage({
      from: opts.fromName ? `${opts.fromName} <${opts.fromEmail}>` : opts.fromEmail,
      to: opts.to,
      cc: opts.cc ?? [],
      bcc: opts.bcc ?? [],
      subject: opts.subject,
      bodyText: opts.bodyText,
      bodyHtml: opts.bodyHtml,
    });

    const res = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw },
    });

    return {
      messageId: res.data.id ?? '',
      threadId: res.data.threadId ?? '',
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// MIME helpers
// ─────────────────────────────────────────────────────────────────────────

function base64Url(str: string): string {
  return Buffer.from(str, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

interface MessageInput {
  from: string;
  to: string;
  cc: string[];
  bcc: string[];
  subject: string;
  bodyText: string;
  bodyHtml?: string;
}

function buildRawMessage(m: MessageInput): string {
  const headers: string[] = [];
  headers.push(`From: ${m.from}`);
  headers.push(`To: ${m.to}`);
  if (m.cc.length) headers.push(`Cc: ${m.cc.join(', ')}`);
  if (m.bcc.length) headers.push(`Bcc: ${m.bcc.join(', ')}`);
  headers.push(`Subject: ${rfc2047(m.subject)}`);
  headers.push(`MIME-Version: 1.0`);

  if (m.bodyHtml) {
    const boundary = `=_b_${Date.now().toString(36)}`;
    headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    const body = [
      ``,
      `--${boundary}`,
      `Content-Type: text/plain; charset=UTF-8`,
      `Content-Transfer-Encoding: 7bit`,
      ``,
      m.bodyText,
      ``,
      `--${boundary}`,
      `Content-Type: text/html; charset=UTF-8`,
      `Content-Transfer-Encoding: 7bit`,
      ``,
      m.bodyHtml,
      ``,
      `--${boundary}--`,
    ].join('\r\n');
    return base64Url(headers.join('\r\n') + '\r\n' + body);
  }

  // Plain text only
  headers.push(`Content-Type: text/plain; charset=UTF-8`);
  headers.push(`Content-Transfer-Encoding: 7bit`);
  return base64Url(headers.join('\r\n') + '\r\n\r\n' + m.bodyText);
}

/** Encode non-ASCII subject lines per RFC 2047. */
function rfc2047(s: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(s)) return s;
  return `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`;
}
