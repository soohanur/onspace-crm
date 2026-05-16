import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'node:crypto';

/**
 * Supports two hash formats during the seed → live transition:
 *
 *   - scrypt$<saltHex>$<hashHex>   ← written by the seed script (zero-dep)
 *   - $2a$…                        ← bcrypt; what new writes use
 *
 * After a successful verify against scrypt, the caller should re-hash with bcrypt
 * (via `upgradeIfLegacy`) so the user transitions silently on next login.
 */
@Injectable()
export class PasswordService {
  private readonly cost = 12;

  async hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, this.cost);
  }

  async verify(plain: string, stored: string): Promise<boolean> {
    if (!stored) return false;
    if (stored.startsWith('scrypt$')) return this.verifyScrypt(plain, stored);
    return bcrypt.compare(plain, stored);
  }

  isLegacy(stored: string): boolean {
    return stored?.startsWith('scrypt$') ?? false;
  }

  private verifyScrypt(plain: string, stored: string): boolean {
    const [, saltHex, hashHex] = stored.split('$');
    if (!saltHex || !hashHex) return false;
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(hashHex, 'hex');
    const actual = crypto.scryptSync(plain, salt, expected.length);
    return crypto.timingSafeEqual(expected, actual);
  }
}
