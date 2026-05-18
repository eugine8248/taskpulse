// Centralised env-var validation. Called once at boot from index.ts.

const KNOWN_DEV_DEFAULTS = new Set([
  'dev-secret-change-me',
  'dev-secret-for-local',
  'dev-secret-for-local-stockpulse',
  'dev-secret-for-local-taskpulse',
  'dev-secret-for-local-framedeck',
  'change-me-locally',
  'change-me',
  'secret',
  'test',
]);

export interface ValidatedEnv {
  isProd: boolean;
  jwtSecret: string;
  databaseUrl: string;
  clientOrigin: string | null;
}

export function validateEnv(): ValidatedEnv {
  const isProd = process.env.NODE_ENV === 'production';
  const warnings: string[] = [];
  const errors: string[] = [];

  let jwtSecret = process.env.JWT_SECRET || '';
  if (!jwtSecret) {
    if (isProd) errors.push('JWT_SECRET is required in production');
    else {
      warnings.push('JWT_SECRET not set — using dev default (UNSAFE for prod)');
      jwtSecret = 'dev-secret-change-me';
      process.env.JWT_SECRET = jwtSecret;
    }
  } else if (jwtSecret.length < 32) {
    if (isProd) errors.push(`JWT_SECRET is too short (${jwtSecret.length} chars, need >=32)`);
    else warnings.push(`JWT_SECRET is shorter than 32 chars (${jwtSecret.length}) — boot will fail in prod`);
  } else if (KNOWN_DEV_DEFAULTS.has(jwtSecret)) {
    if (isProd) errors.push('JWT_SECRET equals a well-known dev default. Generate one with: openssl rand -base64 48');
    else warnings.push('JWT_SECRET equals a well-known dev default — DO NOT use this in prod');
  }

  const databaseUrl = process.env.DATABASE_URL || '';
  if (!databaseUrl) {
    if (isProd) errors.push('DATABASE_URL is required');
    else warnings.push('DATABASE_URL not set');
  }

  const clientOrigin = process.env.CLIENT_ORIGIN || null;
  if (!clientOrigin && isProd) {
    warnings.push('CLIENT_ORIGIN not set — CORS will accept any origin (dev-mode default). Set this to your front-end URL for prod.');
  }

  // NO_AUTH guard double-check — the middleware already refuses to honour it
  // in prod, but having a startup warning means an operator who *intended*
  // for it to work in prod sees an obvious signal.
  if (process.env.NO_AUTH === 'true' && isProd) {
    warnings.push('NO_AUTH=true is set in production but is being ignored. Remove it.');
  }

  // GitHub PAT encryption (v2.5). In prod, refuse to start if missing/weak —
  // the encryption module throws on bad keys, so we exercise it here to fail
  // fast at boot rather than at first POST /api/github/pat.
  const patKey = process.env.PAT_ENCRYPTION_KEY;
  if (isProd) {
    if (!patKey) errors.push('PAT_ENCRYPTION_KEY is required in production (base64-encoded 32 bytes)');
    else {
      try {
        const buf = Buffer.from(patKey, 'base64');
        if (buf.length !== 32) errors.push(`PAT_ENCRYPTION_KEY must decode to 32 bytes (got ${buf.length})`);
      } catch {
        errors.push('PAT_ENCRYPTION_KEY is not valid base64');
      }
    }
  } else if (!patKey) {
    warnings.push('PAT_ENCRYPTION_KEY not set — dev fallback derived from JWT_SECRET. Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"');
  }

  // GitHub webhook (optional). When unset, webhook endpoint 404s.
  const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
  if (webhookSecret && webhookSecret.length < 16) {
    warnings.push(`GITHUB_WEBHOOK_SECRET is short (${webhookSecret.length} chars) — recommend 32+ random chars`);
  }

  for (const w of warnings) {
    // eslint-disable-next-line no-console
    console.warn(`[env] ${w}`);
  }
  if (errors.length > 0) {
    for (const e of errors) {
      // eslint-disable-next-line no-console
      console.error(`[env] FATAL ${e}`);
    }
    throw new Error(`Env validation failed (${errors.length} error${errors.length === 1 ? '' : 's'})`);
  }

  return { isProd, jwtSecret, databaseUrl, clientOrigin };
}
