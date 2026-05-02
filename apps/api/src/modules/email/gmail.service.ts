import { Injectable, Logger } from '@nestjs/common';
import { google, Auth, gmail_v1 } from 'googleapis';

type OAuth2Client = Auth.OAuth2Client;
type Credentials = Auth.Credentials;

export const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly', // for fetching replies
  // Phase 10 — Google Calendar event create/update/delete + invites.
  // Existing accounts that connected before this scope was added will need
  // to disconnect + reconnect from Settings; we surface this in the UI.
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

export interface AttachmentInput {
  filename: string;
  mimeType: string;
  data: Buffer;
}

export interface GmailMessageDetail {
  gmailMessageId: string;
  threadId: string;
  subject: string | null;
  fromEmail: string | null;
  fromName: string | null;
  toEmail: string | null;
  snippet: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  internalDate: Date;
}

@Injectable()
export class GmailService {
  private readonly log = new Logger(GmailService.name);

  private oauth2Client(): OAuth2Client {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
    if (!clientId || !clientSecret || !redirectUri) {
      throw new Error(
        'Gmail OAuth not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_OAUTH_REDIRECT_URI.',
      );
    }
    return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  }

  buildAuthUrl(state: string): string {
    return this.oauth2Client().generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: GMAIL_SCOPES,
      state,
    });
  }

  async exchangeCode(code: string): Promise<Credentials> {
    const client = this.oauth2Client();
    const { tokens } = await client.getToken(code);
    return tokens;
  }

  async refresh(refreshToken: string): Promise<Credentials> {
    const client = this.oauth2Client();
    client.setCredentials({ refresh_token: refreshToken });
    const { credentials } = await client.refreshAccessToken();
    return credentials;
  }

  async getProfile(accessToken: string, refreshToken: string) {
    const client = this.oauth2Client();
    client.setCredentials({ access_token: accessToken, refresh_token: refreshToken });
    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const me = await oauth2.userinfo.get();
    return { email: me.data.email ?? null, name: me.data.name ?? null };
  }

  // ──────────────────────────────────────────────────────────────────────
  // Send
  // ──────────────────────────────────────────────────────────────────────

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
    attachments?: AttachmentInput[];
    /** When set, send as a reply in this Gmail thread. */
    threadId?: string;
    /** Original Message-ID, for In-Reply-To/References when continuing a thread. */
    inReplyTo?: string;
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
      attachments: opts.attachments ?? [],
      inReplyTo: opts.inReplyTo,
    });

    const res = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw,
        ...(opts.threadId ? { threadId: opts.threadId } : {}),
      },
    });

    return {
      messageId: res.data.id ?? '',
      threadId: res.data.threadId ?? '',
    };
  }

  // ──────────────────────────────────────────────────────────────────────
  // Reply detection
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Fetch all messages in a thread, decoded into a friendly shape.
   * We use this both for live reply polling and the manual "Refresh" button.
   */
  async fetchThread(opts: {
    accessToken: string;
    refreshToken: string;
    threadId: string;
  }): Promise<GmailMessageDetail[]> {
    const client = this.oauth2Client();
    client.setCredentials({
      access_token: opts.accessToken,
      refresh_token: opts.refreshToken,
    });
    const gmail = google.gmail({ version: 'v1', auth: client });
    const res = await gmail.users.threads.get({
      userId: 'me',
      id: opts.threadId,
      format: 'full',
    });
    const messages = res.data.messages ?? [];
    return messages.map((m) => decodeMessage(m));
  }
}

// ─────────────────────────────────────────────────────────────────────────
// MIME helpers
// ─────────────────────────────────────────────────────────────────────────

function base64Url(buf: Buffer | string): string {
  const b = typeof buf === 'string' ? Buffer.from(buf, 'utf8') : buf;
  return b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

interface MessageInput {
  from: string;
  to: string;
  cc: string[];
  bcc: string[];
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  attachments: AttachmentInput[];
  inReplyTo?: string;
}

function buildRawMessage(m: MessageInput): string {
  // Outer multipart/mixed when we have attachments, otherwise multipart/alternative
  // (or plain text if no html).
  const headers: string[] = [];
  headers.push(`From: ${m.from}`);
  headers.push(`To: ${m.to}`);
  if (m.cc.length) headers.push(`Cc: ${m.cc.join(', ')}`);
  if (m.bcc.length) headers.push(`Bcc: ${m.bcc.join(', ')}`);
  headers.push(`Subject: ${rfc2047(m.subject)}`);
  if (m.inReplyTo) {
    headers.push(`In-Reply-To: ${m.inReplyTo}`);
    headers.push(`References: ${m.inReplyTo}`);
  }
  headers.push(`MIME-Version: 1.0`);

  const hasAttachments = m.attachments.length > 0;
  const hasHtml = !!m.bodyHtml;

  // Alternative part (text + html) — always built when we'll use HTML or attachments.
  let bodyPart: string;
  if (hasHtml) {
    const altBoundary = `=_alt_${Date.now().toString(36)}`;
    bodyPart =
      `Content-Type: multipart/alternative; boundary="${altBoundary}"\r\n` +
      `\r\n` +
      `--${altBoundary}\r\n` +
      `Content-Type: text/plain; charset=UTF-8\r\n` +
      `Content-Transfer-Encoding: 7bit\r\n\r\n` +
      `${m.bodyText}\r\n` +
      `--${altBoundary}\r\n` +
      `Content-Type: text/html; charset=UTF-8\r\n` +
      `Content-Transfer-Encoding: 7bit\r\n\r\n` +
      `${m.bodyHtml}\r\n` +
      `--${altBoundary}--\r\n`;
  } else {
    bodyPart =
      `Content-Type: text/plain; charset=UTF-8\r\n` +
      `Content-Transfer-Encoding: 7bit\r\n\r\n` +
      `${m.bodyText}\r\n`;
  }

  if (!hasAttachments) {
    return base64Url(headers.join('\r\n') + '\r\n' + bodyPart);
  }

  // multipart/mixed wrapping bodyPart + attachments
  const mixedBoundary = `=_mixed_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  headers.push(`Content-Type: multipart/mixed; boundary="${mixedBoundary}"`);

  const parts: string[] = [];
  parts.push(`--${mixedBoundary}`);
  parts.push(bodyPart.trim());

  for (const att of m.attachments) {
    parts.push(`--${mixedBoundary}`);
    parts.push(
      `Content-Type: ${att.mimeType}; name="${att.filename.replace(/"/g, '')}"`,
    );
    parts.push(`Content-Transfer-Encoding: base64`);
    parts.push(
      `Content-Disposition: attachment; filename="${att.filename.replace(/"/g, '')}"`,
    );
    parts.push('');
    // base64 in 76-char lines per RFC
    parts.push(att.data.toString('base64').replace(/(.{76})/g, '$1\r\n'));
  }
  parts.push(`--${mixedBoundary}--`);

  return base64Url(headers.join('\r\n') + '\r\n\r\n' + parts.join('\r\n'));
}

function rfc2047(s: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(s)) return s;
  return `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`;
}

// ─────────────────────────────────────────────────────────────────────────
// Inbound message decoding
// ─────────────────────────────────────────────────────────────────────────

function decodeMessage(msg: gmail_v1.Schema$Message): GmailMessageDetail {
  const headers = (msg.payload?.headers ?? []).reduce<Record<string, string>>(
    (acc, h) => {
      if (h.name && h.value) acc[h.name.toLowerCase()] = h.value;
      return acc;
    },
    {},
  );

  const fromRaw = headers['from'] ?? '';
  const { email: fromEmail, name: fromName } = parseAddress(fromRaw);

  const { text, html } = extractBody(msg.payload ?? null);

  return {
    gmailMessageId: msg.id ?? '',
    threadId: msg.threadId ?? '',
    subject: headers['subject'] ?? null,
    fromEmail,
    fromName,
    toEmail: parseAddress(headers['to'] ?? '').email,
    snippet: msg.snippet ?? null,
    bodyText: text,
    bodyHtml: html,
    internalDate: msg.internalDate ? new Date(Number(msg.internalDate)) : new Date(),
  };
}

function parseAddress(raw: string): { email: string | null; name: string | null } {
  const m = raw.match(/^(?:"?([^"<]*)"?\s*)?<?([^>\s]+@[^>\s]+)>?$/);
  if (!m) return { email: raw || null, name: null };
  return { name: (m[1] || '').trim() || null, email: m[2] };
}

function extractBody(part: gmail_v1.Schema$MessagePart | null): {
  text: string | null;
  html: string | null;
} {
  if (!part) return { text: null, html: null };
  const out = { text: null as string | null, html: null as string | null };

  const visit = (p: gmail_v1.Schema$MessagePart) => {
    const mt = p.mimeType ?? '';
    if (p.body?.data) {
      const decoded = Buffer.from(
        p.body.data.replace(/-/g, '+').replace(/_/g, '/'),
        'base64',
      ).toString('utf8');
      if (mt === 'text/plain' && !out.text) out.text = decoded;
      else if (mt === 'text/html' && !out.html) out.html = decoded;
    }
    if (p.parts) p.parts.forEach(visit);
  };
  visit(part);
  return out;
}
