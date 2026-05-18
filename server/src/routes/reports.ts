// Reports surface: read markdown from data/reports/<project>/<date>-<category>.md.
//
// Filename convention: YYYY-MM-DD-<category>.md where category is one of
// 'code-quality' | 'ui-layout' | 'qa'.
//
// Endpoints:
//   GET /api/reports                                  — list all available reports w/ headline counts
//   GET /api/reports/:project/:date/:category         — parsed report
//   GET /api/reports/:project/:date/:category/raw     — raw markdown

import { Router } from 'express';
import path from 'path';
import fs from 'fs/promises';
import { authMiddleware } from '../middleware/auth';
import { parseReport } from '../services/reportParser';
import { getLatestPerBucket } from '../services/reportWatcher';

export const reportsRouter = Router();
reportsRouter.use(authMiddleware);

export const REPORTS_DIR =
  process.env.REPORTS_DIR ||
  path.resolve(__dirname, '..', '..', '..', 'data', 'reports');

const FILE_RE = /^(\d{4}-\d{2}-\d{2})-([a-z][a-z0-9-]+)\.md$/;
const PROJECT_RE = /^[a-z0-9][a-z0-9_-]{0,62}$/i;

async function listAllFiles(): Promise<
  { project: string; date: string; category: string; filePath: string }[]
> {
  const out: { project: string; date: string; category: string; filePath: string }[] = [];
  let projects: string[] = [];
  try {
    projects = await fs.readdir(REPORTS_DIR);
  } catch {
    return out;
  }
  for (const project of projects) {
    if (!PROJECT_RE.test(project)) continue;
    const projDir = path.join(REPORTS_DIR, project);
    let entries: string[] = [];
    try {
      const stat = await fs.stat(projDir);
      if (!stat.isDirectory()) continue;
      entries = await fs.readdir(projDir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const m = FILE_RE.exec(entry);
      if (!m) continue;
      out.push({
        project,
        date: m[1],
        category: m[2],
        filePath: path.join(projDir, entry),
      });
    }
  }
  // newest first, then by project asc, then by category asc
  out.sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    if (a.project !== b.project) return a.project.localeCompare(b.project);
    return a.category.localeCompare(b.category);
  });
  return out;
}

// GET /api/reports/today — returns the most-recent report per known bucket
// (stocks, tech-radar, dev-gig, morning). Used by the TodayPane client
// component. The watcher pre-computes the per-bucket pointer; the parsing
// happens here on read.
reportsRouter.get('/today', async (_req, res) => {
  try {
    const latest = getLatestPerBucket();
    const buckets: Record<string, unknown> = {};
    await Promise.all(
      Object.entries(latest).map(async ([bucket, rec]) => {
        if (!rec) {
          buckets[bucket] = null;
          return;
        }
        try {
          const md = await fs.readFile(rec.filePath, 'utf8');
          const parsed = parseReport(md, {
            project: bucket,
            date: rec.date,
            category: rec.category,
          });
          buckets[bucket] = {
            project: parsed.project,
            date: parsed.date,
            category: parsed.category,
            title: parsed.title,
            counts: parsed.counts,
            // Trim raw markdown for over-the-wire size — clients can hit the
            // dedicated /:project/:date/:category endpoint for the full body.
            preview: parsed.sections[0]?.body?.slice(0, 600) ?? '',
          };
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error(`[reports/today] failed to read ${rec.filePath}:`, err);
          buckets[bucket] = null;
        }
      }),
    );
    res.json({ success: true, data: { buckets, fetchedAt: new Date().toISOString() } });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[reports/today] error:', err);
    res.status(500).json({ success: false, error: 'Today fetch failed' });
  }
});

reportsRouter.get('/', async (_req, res) => {
  try {
    const files = await listAllFiles();
    const data = await Promise.all(
      files.map(async (f) => {
        try {
          const md = await fs.readFile(f.filePath, 'utf8');
          const parsed = parseReport(md, {
            project: f.project,
            date: f.date,
            category: f.category,
          });
          return {
            project: parsed.project,
            date: parsed.date,
            category: parsed.category,
            title: parsed.title,
            counts: parsed.counts,
          };
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error(`[reports/list] failed to parse ${f.filePath}:`, err);
          return null;
        }
      }),
    );
    res.json({ success: true, data: { reports: data.filter(Boolean) } });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[reports/list] error:', err);
    res.status(500).json({ success: false, error: 'Reports list failed' });
  }
});

function validateParams(project: string, date: string, category: string): string | null {
  if (!PROJECT_RE.test(project)) return 'Invalid project';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'Invalid date';
  if (!/^[a-z][a-z0-9-]+$/.test(category)) return 'Invalid category';
  return null;
}

reportsRouter.get('/:project/:date/:category', async (req, res) => {
  try {
    const { project, date, category } = req.params;
    const err = validateParams(project, date, category);
    if (err) return res.status(400).json({ success: false, error: err });
    const filePath = path.join(REPORTS_DIR, project, `${date}-${category}.md`);
    let md: string;
    try {
      md = await fs.readFile(filePath, 'utf8');
    } catch {
      return res.status(404).json({ success: false, error: 'Report not found' });
    }
    const parsed = parseReport(md, { project, date, category });
    res.json({ success: true, data: parsed });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[reports/get] error:', err);
    res.status(500).json({ success: false, error: 'Report fetch failed' });
  }
});

reportsRouter.get('/:project/:date/:category/raw', async (req, res) => {
  try {
    const { project, date, category } = req.params;
    const err = validateParams(project, date, category);
    if (err) return res.status(400).json({ success: false, error: err });
    const filePath = path.join(REPORTS_DIR, project, `${date}-${category}.md`);
    try {
      const md = await fs.readFile(filePath, 'utf8');
      res.type('text/markdown').send(md);
    } catch {
      res.status(404).json({ success: false, error: 'Report not found' });
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[reports/raw] error:', err);
    res.status(500).json({ success: false, error: 'Report fetch failed' });
  }
});
