import crypto from 'node:crypto';

/** AES-256-GCM encrypt raw invite token for storage alongside tokenHash (allows rebuilding invite links until expiry). */
export function encryptInviteToken(rawToken: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(rawToken, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64url');
}

/** Returns null if decryption fails or ciphertext is invalid. */
export function decryptInviteToken(stored: string | undefined): string | null {
  if (!stored) return null;
  try {
    const key = getKey();
    const buf = Buffer.from(stored, 'base64url');
    if (buf.length < 12 + 16 + 1) return null;
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const ciphertext = buf.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plain.toString('utf8');
  } catch {
    return null;
  }
}

function getKey(): Buffer {
  const extra = process.env['INVITE_TOKEN_ENCRYPTION_KEY'];
  const jwt = process.env['JWT_SECRET'];
  const raw = extra ?? jwt;
  if (!raw) throw new Error('JWT_SECRET or INVITE_TOKEN_ENCRYPTION_KEY must be set');
  return crypto.createHash('sha256').update(raw).digest();
}
