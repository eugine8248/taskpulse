import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import {
  signToken,
  authMiddleware,
  AuthedRequest,
  isNoAuth,
  bumpTokenVersion,
} from '../middleware/auth';
import { loginLimiter, registerLimiter } from '../lib/rateLimit';
import { audit } from '../lib/auditLog';

export const authRouter = Router();

const credsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().optional(),
});

// Returns whether any user exists — drives the /setup vs /login first-launch UX
authRouter.get('/status', async (_req, res) => {
  try {
    const count = await prisma.user.count();
    res.json({
      success: true,
      data: { hasUsers: count > 0, noAuth: isNoAuth() },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[auth/status] db error:', err);
    res.status(500).json({ success: false, error: 'Auth status unavailable' });
  }
});

// First-launch only: create the admin user. 409 if any user already exists.
authRouter.post('/setup', registerLimiter, async (req, res) => {
  try {
    const exists = await prisma.user.count();
    if (exists > 0) {
      return res.status(409).json({ success: false, error: 'Setup already complete' });
    }
    const parsed = credsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.message });
    }
    const { email, password, name } = parsed.data;
    const user = await prisma.user.create({
      data: { email, passwordHash: bcrypt.hashSync(password, 10), name: name || null },
    });
    audit(req, 'register', { userId: user.id, meta: { email } });
    res.json({
      success: true,
      data: {
        token: signToken(user.id, user.tokenVersion),
        user: { id: user.id, email: user.email, name: user.name },
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[auth/setup] error:', err);
    res.status(500).json({ success: false, error: 'Setup failed' });
  }
});

authRouter.post('/login', loginLimiter, async (req, res) => {
  try {
    const parsed = z
      .object({ email: z.string().email(), password: z.string() })
      .safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.message });
    }
    const { email, password } = parsed.data;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
      audit(req, 'login_failure', { userId: user?.id ?? null, meta: { email } });
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }
    audit(req, 'login_success', { userId: user.id });
    res.json({
      success: true,
      data: {
        token: signToken(user.id, user.tokenVersion),
        user: { id: user.id, email: user.email, name: user.name },
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[auth/login] error:', err);
    res.status(500).json({ success: false, error: 'Login failed' });
  }
});

authRouter.get('/me', authMiddleware, async (req: AuthedRequest, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId! } });
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    res.json({
      success: true,
      data: { id: user.id, email: user.email, name: user.name },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[auth/me] error:', err);
    res.status(500).json({ success: false, error: 'User lookup failed' });
  }
});

// Logout-everywhere: bumps tokenVersion so every existing JWT for this
// user (including the caller's) stops verifying immediately.
authRouter.post('/logout-everywhere', authMiddleware, async (req: AuthedRequest, res) => {
  try {
    const userId = req.userId!;
    await bumpTokenVersion(userId);
    audit(req, 'logout_everywhere', { userId });
    res.json({ success: true });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[auth/logout-everywhere] error:', err);
    res.status(500).json({ success: false, error: 'Logout-everywhere failed' });
  }
});
