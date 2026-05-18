// AES-256-GCM symmetric encryption for PATs stored in the DB.
//
// Format on disk: "iv_b64.tag_b64.ciphertext_b64". Each field is base64url-
// independent; we use stdb64. The IV is 12 bytes (GCM standard) and the
// auth tag is the GCM-default 16 bytes.
//
// Key resolution order:
//   1. process.env.PAT_ENCRYPTION_KEY (base64; must decode to 32 bytes)
//   2. (dev only) SHA-256(JWT_SECRET) — emits a warning at first use
//
// In production with no key set, callers like routes/github.ts can call
// `assertEncryptionAvailable()` at request time to refuse 500 cleanly,
// but the bootstrap path in envValidation also flags it on startup.

import crypto from 'crypto';

const IV_LEN = 12;
const TAG_LEN = 16;
const KEY_LEN = 32; // 256-bit

let cachedKey: Buffer | null = null;
let warnedAboutDevKey = false;

function deriveKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.PAT_ENCRYPTION_KEY;
  const isProd = process.env.NODE_ENV === 'production';
  if (raw) {
    let buf: Buffer;
    try {
      buf = Buffer.from(raw, 'base64');
    } catch {
      throw new Error('PAT_ENCRYPTION_KEY is not valid base64');
    }
    if (buf.length !== KEY_LEN) {
      throw new Error(
        `PAT_ENCRYPTION_KEY must decode to exactly ${KEY_LEN} bytes (got ${buf.length}). ` +
          `Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`,
      );
    }
    cachedKey = buf;
    return cachedKey;
  }
  // Dev fallback — DERIVED, deterministic, and clearly flagged.
  if (isProd) {
    throw new Error(
      'PAT_ENCRYPTION_KEY is required in production. Generate with: ' +
        'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"',
    );
  }
  if (!warnedAboutDevKey) {
    warnedAboutDevKey = true;
    // eslint-disable-next-line no-console
    console.warn(
      '[encryption] PAT_ENCRYPTION_KEY unset — deriving dev key from JWT_SECRET. ' +
        'DO NOT use this in production.',
    );
  }
  const seed = process.env.JWT_SECRET || 'dev-secret-change-me';
  cachedKey = crypto.createHash('sha256').update(`taskpulse-pat:${seed}`).digest();
  return cachedKey;
}

/** Throws if encryption is unavailable. Use at boot / before storing a PAT. */
export function assertEncryptionAvailable(): void {
  deriveKey();
}

/** Encrypts UTF-8 plaintext, returns "iv.tag.ciphertext" base64-joined. */
export function encrypt(plaintext: string): string {
  const key = deriveKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join('.');
}

/** Decrypts a blob from `encrypt`. Throws on tampering or wrong key. */
export function decrypt(blob: string): string {
  const key = deriveKey();
  const parts = blob.split('.');
  if (parts.length !== 3) throw new Error('Invalid ciphertext shape');
  const iv = Buffer.from(parts[0], 'base64');
  const tag = Buffer.from(parts[1], 'base64');
  const ct = Buffer.from(parts[2], 'base64');
  if (iv.length !== IV_LEN) throw new Error('Invalid IV length');
  if (tag.length !== TAG_LEN) throw new Error('Invalid auth tag length');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString('utf8');
}

/** Test helper — reset cached key. Not exported via index. */
export function _resetKeyCacheForTests(): void {
  cachedKey = null;
  warnedAboutDevKey = false;
}
