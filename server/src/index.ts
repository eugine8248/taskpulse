import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { authRouter } from './routes/auth';
import { boardsRouter } from './routes/boards';
import { columnsRouter } from './routes/columns';
import { cardsRouter } from './routes/cards';
import { labelsRouter } from './routes/labels';
import { settingsRouter } from './routes/settings';
import { reportsRouter, REPORTS_DIR } from './routes/reports';
import { adminRouter } from './routes/admin';
import { eventsRouter } from './routes/events';
import { timeRouter } from './routes/time';
import { attachmentsRouter } from './routes/attachments';
import { searchRouter } from './routes/search';
import { viewsRouter } from './routes/views';
import { templatesRouter } from './routes/templates';
import { githubRouter, githubBoardRouter } from './routes/github';
import { setupWebSocket } from './services/wsHub';
import { startReportWatcher, stopReportWatcher } from './services/reportWatcher';
import { ensureFtsReady } from './services/fts';
import { validateEnv } from './lib/envValidation';
import { prisma } from './lib/prisma';

// --- Env validation: fail fast in prod, warn-and-continue in dev. ----------
try {
  validateEnv();
} catch (err) {
  // eslint-disable-next-line no-console
  console.error('[bootstrap] aborting due to env validation failure:', (err as Error).message);
  process.exit(1);
}

const PORT = parseInt(process.env.PORT || '3000', 10);
const IS_PROD = process.env.NODE_ENV === 'production';

const app = express();
const server = http.createServer(app);

// --- Helmet (hardened). ---------------------------------------------------
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        // 'wasm-unsafe-eval' is required so the lazy-loaded callmap engine
        // (v2.6) can instantiate the tree-sitter WASM module. This is a
        // narrower exception than 'unsafe-eval' — it only re-enables
        // WebAssembly.compile/instantiate, not raw `eval()`.
        scriptSrc: ["'self'", "'wasm-unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'"], // Tailwind injects inline styles
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'", 'ws:', 'wss:'],
        workerSrc: ["'self'", 'blob:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    hsts: { maxAge: 31536000, includeSubDomains: true },
  }),
);

// --- CORS. -----------------------------------------------------------------
const corsOrigin: cors.CorsOptions['origin'] = IS_PROD && process.env.CLIENT_ORIGIN
  ? process.env.CLIENT_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean)
  : true;
app.use(cors({ origin: corsOrigin, credentials: true }));

app.use(express.json({ limit: '1mb' }));
app.use(morgan(IS_PROD ? 'combined' : 'dev'));

// --- API routes. -----------------------------------------------------------
app.use('/api/auth', authRouter);
app.use('/api/boards', boardsRouter);
app.use('/api/columns', columnsRouter);
app.use('/api/cards', cardsRouter);
app.use('/api/labels', labelsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/events', eventsRouter);
app.use('/api/time', timeRouter);
app.use('/api/attachments', attachmentsRouter);
app.use('/api/search', searchRouter);
app.use('/api/views', viewsRouter);
app.use('/api/templates', templatesRouter);
app.use('/api/github', githubRouter);
// Board-scoped GitHub sub-routes — only /import-url remains after v2.6 cleanup.
app.use('/api/boards/:id/github', githubBoardRouter);

// Static serve attachments (guarded by authMiddleware via attachmentsRouter mount).
import { authMiddleware as _authMw } from './middleware/auth';
const ATTACHMENT_ROOT = path.resolve(process.cwd(), 'data', 'attachments');
if (!fs.existsSync(ATTACHMENT_ROOT)) {
  try {
    fs.mkdirSync(ATTACHMENT_ROOT, { recursive: true });
  } catch {
    /* ignore */
  }
}
app.use('/static/attachments', _authMw, express.static(ATTACHMENT_ROOT));

// Health endpoint with DB ping — orchestrator uses this for liveness checks.
// Returns 503 when the DB is unreachable so the container gets pulled out
// of rotation instead of serving 500s.
app.get('/api/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, ts: Date.now() });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[health] db ping failed:', err);
    res.status(503).json({ ok: false, ts: Date.now(), error: 'db' });
  }
});

// Static client (production build) — only mount if dist exists so `tsx watch`
// dev runs don't fail before the client has been built.
const clientDir = path.resolve(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDir)) {
  app.use(express.static(clientDir));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDir, 'index.html'));
  });
}

// Global safety net — if a handler leaks an error past its own try/catch,
// answer 500 instead of crashing or hanging.
app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _next: express.NextFunction,
  ) => {
    // eslint-disable-next-line no-console
    console.error('[express] unhandled:', err);
    if (res.headersSent) return;
    res.status(500).json({ success: false, error: 'Server error' });
  },
);

// --- WebSocket on /ws ------------------------------------------------------
setupWebSocket(server);

// --- Report watcher --------------------------------------------------------
startReportWatcher(REPORTS_DIR);

// --- FTS5 init (idempotent) ------------------------------------------------
ensureFtsReady().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[bootstrap] FTS init failed:', err);
});

const listening = server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`taskpulse listening on http://localhost:${PORT}`);
});

// GitHub auto-sync scheduler removed in v2.6 cleanup — boards no longer
// have a persistent repo binding, so there's nothing to poll. Per-card
// refresh remains available via POST /api/github/cards/:id/refresh.

// --- Graceful shutdown -----------------------------------------------------
let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  // eslint-disable-next-line no-console
  console.log(`[shutdown] received ${signal}, draining...`);
  listening.close((err) => {
    if (err) {
      // eslint-disable-next-line no-console
      console.error('[shutdown] server.close error:', err);
    }
  });
  try {
    await stopReportWatcher();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[shutdown] reportWatcher close error:', err);
  }
  try {
    await prisma.$disconnect();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[shutdown] prisma disconnect error:', err);
  }
  setTimeout(() => {
    // eslint-disable-next-line no-console
    console.log('[shutdown] exit');
    process.exit(0);
  }, 1500).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  // eslint-disable-next-line no-console
  console.error('[process] unhandledRejection:', reason);
});
