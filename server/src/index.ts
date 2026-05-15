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
import { reportsRouter } from './routes/reports';
import { setupWebSocket } from './services/wsHub';

const PORT = parseInt(process.env.PORT || '3000', 10);
const app = express();
const server = http.createServer(app);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

// API routes
app.use('/api/auth', authRouter);
app.use('/api/boards', boardsRouter);
app.use('/api/columns', columnsRouter);
app.use('/api/cards', cardsRouter);
app.use('/api/labels', labelsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/reports', reportsRouter);
app.get('/api/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

// Static client (production build) — last so it doesn't shadow API.
// Only mount if the dist exists, so `tsx watch` dev runs don't fail before the
// client has been built.
const clientDir = path.resolve(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDir)) {
  app.use(express.static(clientDir));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDir, 'index.html'));
  });
}

// WebSocket on /ws
setupWebSocket(server);

// Global safety net — if a handler somehow leaks an error past its own try/catch,
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

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`taskpulse listening on http://localhost:${PORT}`);
});

// Hard-stop on unhandled promise rejections so stockpulse-style silent
// crashes can't happen. In dev (tsx watch) this will surface and restart;
// in prod the orchestrator (docker / pm2) will restart the process.
process.on('unhandledRejection', (reason) => {
  // eslint-disable-next-line no-console
  console.error('[process] unhandledRejection:', reason);
});
