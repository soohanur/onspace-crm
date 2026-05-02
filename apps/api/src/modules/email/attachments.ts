import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import * as path from 'node:path';

/**
 * Filesystem-backed attachment store. Files live under
 * `apps/api/uploads/email/{emailLogId}/{filename}`.
 * MVP — replace with S3/GCS for production.
 */

export interface StoredAttachment {
  filename: string;
  mimeType: string;
  size: number;
  storagePath: string;
}

export function uploadsRoot(): string {
  // resolve relative to the running dist (apps/api/dist/...) → apps/api/uploads
  return path.resolve(__dirname, '../../..', 'uploads', 'email');
}

export async function saveAttachment(
  emailLogId: string,
  file: { originalname: string; mimetype: string; buffer: Buffer; size: number },
): Promise<StoredAttachment> {
  const safeName = sanitize(file.originalname);
  const dir = path.join(uploadsRoot(), emailLogId);
  await mkdir(dir, { recursive: true });
  const dest = path.join(dir, safeName);
  await writeFile(dest, file.buffer);
  return {
    filename: safeName,
    mimeType: file.mimetype || 'application/octet-stream',
    size: file.size,
    storagePath: dest,
  };
}

export async function readAttachment(
  emailLogId: string,
  filename: string,
): Promise<{ buffer: Buffer; size: number } | null> {
  const safeName = sanitize(filename);
  const dest = path.join(uploadsRoot(), emailLogId, safeName);
  try {
    const s = await stat(dest);
    const buffer = await readFile(dest);
    return { buffer, size: s.size };
  } catch {
    return null;
  }
}

function sanitize(name: string): string {
  return name
    .replace(/[^A-Za-z0-9._\- ]/g, '_')
    .replace(/\s+/g, ' ')
    .slice(0, 200);
}
