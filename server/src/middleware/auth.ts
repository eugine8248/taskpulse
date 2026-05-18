import type { Request, Response, NextFunction } from 'express';
import jwt, { type SignOptions } from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

/**
 * NO_AUTH single-user bypass.
 *
 * Stockpulse v0.2 shipped this with NO production guard — meaning a
 * misconfigured prod deploy could silently bypass auth for every request.
 * In taskpulse we hard-gate the bypass behind NODE_ENV !== 'production'.
 */
function noAuthActive(): boolean {
  if (process.env.NO_AUTH !== 'true') return false;
  if (process.env.NODE_ENV === 'production') {
    if (!warnedAboutProdNoAuth) {
      warnedAboutProdNoAuth = true;
      // eslint-disable-next-line no-console
      console.warn(
        '[auth] NO_AUTH=true is ignored in production (NODE_ENV=production). Auth remains required.',
      );
    }
    return false;
  }
  return true;
}
let warnedAboutProdNoAuth = false;

export interface AuthedRequest extends Request {
  userId?: number;
}

interface TokenPayload {
  userId: number;
  tv: number;
}

// Per-user tokenVersion cache (30s TTL). Saves a DB roundtrip on every
// authed request.
const TOKEN_VERSION_TTL_MS = 30_000;
const versionCache = new Map<number, { version: number; expiresAt: number }>();

async function getTokenVersion(userId: number): Promise<number | null> {
  const cached = versionCache.get(userId);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.version;
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { tokenVersion: true },
  });
  if (!row) return null;
  versionCache.set(userId, { version: row.tokenVersion, expiresAt: now + TOKEN_VERSION_TTL_MS });
  return row.tokenVersion;
}

/** Bump after password change / logout-everywhere. Invalidates every JWT. */
export async function bumpTokenVersion(userId: number): Promise<number> {
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { tokenVersion: { increment: 1 } },
    select: { tokenVersion: true },
  });
  versionCache.set(userId, {
    version: updated.tokenVersion,
    expiresAt: Date.now() + TOKEN_VERSION_TTL_MS,
  });
  return updated.tokenVersion;
}

export async function ensureNoAuthUser(): Promise<number> {
  let u = await prisma.user.findFirst({ where: { email: 'local@taskpulse.local' } });
  if (!u) {
    u = await prisma.user.create({
      data: {
        email: 'local@taskpulse.local',
        passwordHash: bcrypt.hashSync('no-auth-mode', 4),
        name: 'Local User',
      },
    });
  }
  return u.id;
}

export function signToken(userId: number, tokenVersion: number): string {
  const opts: SignOptions = {
    expiresIn: EXPIRES_IN as unknown as SignOptions['expiresIn'],
    algorithm: 'HS256',
  };
  return jwt.sign({ userId, tv: tokenVersion }, SECRET, opts);
}

export async function verifyTokenSafe(token: string): Promise<number | null> {
  let payload: TokenPayload;
  try {
    payload = jwt.verify(token, SECRET, { algorithms: ['HS256'] }) as TokenPayload;
  } catch {
    return null;
  }
  if (typeof payload.userId !== 'number' || typeof payload.tv !== 'number') return null;
  const current = await getTokenVersion(payload.userId);
  if (current === null) return null;
  if (current !== payload.tv) return null;
  return payload.userId;
}

export async function authMiddleware(req: AuthedRequest, res: Response, next: NextFunction) {
  if (noAuthActive()) {
    try {
      const id = await ensureNoAuthUser();
      req.userId = id;
      return next();
    } catch (err) {
      return next(err);
    }
  }
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ success: false, error: 'No token' });
  const userId = await verifyTokenSafe(token);
  if (!userId) return res.status(401).json({ success: false, error: 'Invalid token' });
  req.userId = userId;
  next();
}

export function isNoAuth(): boolean {
  return noAuthActive();
}
