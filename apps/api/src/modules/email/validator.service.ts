import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { promises as dns } from 'node:dns';

export type EmailValidationReason =
  | 'syntax'
  | 'disposable'
  | 'no_mx'
  | 'nxdomain';

export interface EmailValidationResult {
  valid: boolean;
  /** When `valid=false`, the rule that rejected. */
  reason?: EmailValidationReason;
  /** When `valid=true` but we couldn't fully verify (e.g. DNS error). */
  ambiguous?: boolean;
}

/**
 * Three-layer cold-outreach email validator.
 *
 *   1. RFC-style syntax check (rejects obvious junk).
 *   2. Disposable-domain blacklist (~7k entries from the canonical
 *      `disposable-email-domains` repo, snapshot bundled at build time).
 *   3. DNS MX lookup with timeout (rejects domains that physically can't
 *      receive mail).
 *
 * Design rule: NEVER false-negative a valid email. If DNS is transiently
 * unreachable we return `valid=true, ambiguous=true` so the send still
 * proceeds — the bounce-handler will catch any genuinely bad address on
 * the second pass.
 */
@Injectable()
export class EmailValidatorService {
  private readonly log = new Logger(EmailValidatorService.name);
  private readonly disposable: Set<string>;
  /** Domain → result memo for the lifetime of this process. MX lookups
   * are slow and the same handful of domains repeat across thousands of
   * leads. */
  private readonly mxCache = new Map<string, boolean | 'error'>();

  constructor() {
    this.disposable = this.loadDisposable();
    this.log.log(
      `email validator armed (disposable set size = ${this.disposable.size})`,
    );
  }

  private loadDisposable(): Set<string> {
    const candidates = [
      path.resolve(__dirname, './disposable-domains.txt'),
      path.resolve(__dirname, '../../../src/modules/email/disposable-domains.txt'),
    ];
    for (const p of candidates) {
      try {
        const raw = fs.readFileSync(p, 'utf8');
        const lines = raw
          .split(/\r?\n/)
          .map((l) => l.trim().toLowerCase())
          .filter((l) => l && !l.startsWith('#'));
        return new Set(lines);
      } catch {
        // try next path
      }
    }
    this.log.warn(
      'disposable-domains.txt not found — disposable layer disabled',
    );
    return new Set();
  }

  /**
   * Quick offline-only check — syntax + disposable. Use this when you
   * need an instant boolean (e.g. inside scraper batch loops where DNS
   * latency would dominate).
   */
  isObviouslyInvalidSync(email: string): EmailValidationResult {
    if (!email || typeof email !== 'string') {
      return { valid: false, reason: 'syntax' };
    }
    const clean = email.trim().toLowerCase();
    if (!SYNTAX_RE.test(clean)) return { valid: false, reason: 'syntax' };
    const domain = clean.split('@')[1];
    if (this.disposable.has(domain)) {
      return { valid: false, reason: 'disposable' };
    }
    return { valid: true };
  }

  /** Full async check: syntax + disposable + MX. Conservative. */
  async validate(email: string): Promise<EmailValidationResult> {
    const quick = this.isObviouslyInvalidSync(email);
    if (!quick.valid) return quick;
    const domain = email.trim().toLowerCase().split('@')[1];
    const mxOk = await this.hasMx(domain);
    if (mxOk === true) return { valid: true };
    if (mxOk === false) return { valid: false, reason: 'no_mx' };
    // mxOk === 'error' → DNS failed transiently. Conservative: accept.
    return { valid: true, ambiguous: true };
  }

  async hasMx(domain: string): Promise<boolean | 'error'> {
    const cached = this.mxCache.get(domain);
    if (cached !== undefined) return cached;
    const result = await this.lookupWithTimeout(domain, 3000);
    this.mxCache.set(domain, result);
    return result;
  }

  private async lookupWithTimeout(
    domain: string,
    timeoutMs: number,
  ): Promise<boolean | 'error'> {
    let timer: NodeJS.Timeout | undefined;
    try {
      const lookup = (async () => {
        try {
          const mx = await dns.resolveMx(domain);
          if (mx && mx.length > 0) return true as const;
          // No MX → fall back to A record (per RFC 5321 §5.1).
          const a = await dns.resolve4(domain).catch(() => [] as string[]);
          return (a.length > 0) as boolean;
        } catch (err: any) {
          if (
            err?.code === 'ENOTFOUND' ||
            err?.code === 'ENODATA' ||
            err?.code === 'NXDOMAIN'
          ) {
            return false as const;
          }
          // SERVFAIL / TIMEOUT / EAI_AGAIN → transient
          return 'error' as const;
        }
      })();
      const timeout = new Promise<'error'>((resolve) => {
        timer = setTimeout(() => resolve('error'), timeoutMs);
      });
      return await Promise.race([lookup, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

// RFC 5322 compatible-ish. Rejects spaces, multiple @, missing TLD,
// etc. Doesn't try to match the full grammar — for our purposes "looks
// like email" is enough; MX check catches deeper issues.
const SYNTAX_RE =
  /^[a-z0-9!#$%&'*+/=?^_`{|}~.-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;
