import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';

/**
 * Symmetric encryption for refresh tokens at rest.
 * AES-256-GCM with a 12-byte IV; ciphertext format: iv | authTag | data (hex).
 *
 * The encryption key comes from EMAIL_TOKEN_ENC_KEY env var. We hash it to
 * exactly 32 bytes via SHA-256 so any string length is acceptable.
 */
function getKey(): Buffer {
  const raw = process.env.EMAIL_TOKEN_ENC_KEY;
  if (!raw) {
    throw new Error(
      'EMAIL_TOKEN_ENC_KEY is not set — refusing to handle OAuth tokens. ' +
        'Add a 32+ char string to your .env (see .env.example).',
    );
  }
  return createHash('sha256').update(raw).digest();
}

export function encrypt(plain: string): string {
  if (!plain) return '';
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('hex');
}

export function decrypt(payload: string): string {
  if (!payload) return '';
  const buf = Buffer.from(payload, 'hex');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
