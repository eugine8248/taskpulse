// Auth audit log helper. Fire-and-forget — DB writes never block responses.

import type { Request } from 'express';
import { prisma } from './prisma';

export type AuditAction =
  | 'login_success'
  | 'login_failure'
  | 'register'
  | 'password_change'
  | 'logout_everywhere';

function ipFromReq(req: Request): string {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length > 0) return xff.split(',')[0].trim();
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function uaFromReq(req: Request): string {
  return (req.headers['user-agent'] || '').slice(0, 500);
}

export function audit(
  req: Request,
  action: AuditAction,
  opts?: { userId?: number | null; meta?: Record<string, unknown> },
): void {
  const ip = ipFromReq(req);
  const userAgent = uaFromReq(req);
  const userId = opts?.userId ?? null;
  const metaJson = opts?.meta ? JSON.stringify(opts.meta) : null;
  prisma.auditLog
    .create({
      data: { userId: userId ?? undefined, ip, userAgent, action, meta: metaJson ?? undefined },
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('[audit] write failed:', err);
    });
}
