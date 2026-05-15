import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

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
    // Warn once per process — but DO NOT bypass.
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

export function authMiddleware(req: AuthedRequest, res: Response, next: NextFunction) {
  if (noAuthActive()) {
    ensureNoAuthUser()
      .then((id) => {
        req.userId = id;
        next();
      })
      .catch(next);
    return;
  }
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ success: false, error: 'No token' });
  try {
    const payload = jwt.verify(token, SECRET) as { userId: number };
    req.userId = payload.userId;
    next();
  } catch {
    return res.status(401).json({ success: false, error: 'Invalid token' });
  }
}

export function signToken(userId: number): string {
  return jwt.sign({ userId }, SECRET, { expiresIn: '7d' });
}

export function verifyTokenSafe(token: string): number | null {
  try {
    const payload = jwt.verify(token, SECRET) as { userId: number };
    return payload.userId;
  } catch {
    return null;
  }
}

export function isNoAuth(): boolean {
  return noAuthActive();
}
