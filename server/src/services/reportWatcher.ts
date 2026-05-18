// reportWatcher — watches the project-keyed reports dir
// (data/reports/<project>/...) recursively and emits in-process events on
// add / change / unlink. The 4 buckets the daily cron drops into:
//   stocks      → 2026-MM-DD-stock-analysis.md
//   tech-radar  → 2026-MM-DD-tech-radar.md
//   dev-gig     → 2026-MM-DD-dev-gig.md
//   morning     → 2026-MM-DD-morning-snapshot.md
//
// The watcher's responsibilities:
//   1. Maintain a per-bucket cache of the newest file we've seen, so the
//      /api/reports/today endpoint is O(1) instead of doing a fresh fs
//      readdir on every request.
//   2. Fan out events to a process-local EventEmitter — useful as a hook
//      for future SSE/WebSocket push-to-client without re-architecting.
//   3. Log new arrivals so the container journal carries a paper trail.

import chokidar, { type FSWatcher } from 'chokidar';
import path from 'path';
import fs from 'fs';
import { EventEmitter } from 'events';

export const reportEvents = new EventEmitter();

export interface WatchedReport {
  bucket: string;     // 'stocks' | 'tech-radar' | 'dev-gig' | 'morning' | ...
  date: string;       // YYYY-MM-DD
  category: string;   // 'stock-analysis' | 'tech-radar' | 'dev-gig' | 'morning-snapshot' | ...
  filePath: string;
  mtimeMs: number;
}

const KNOWN_BUCKETS = ['stocks', 'tech-radar', 'dev-gig', 'morning'] as const;
const FILE_RE = /^(\d{4}-\d{2}-\d{2})-([a-z][a-z0-9-]+)\.md$/;

// Cache: bucket → latest WatchedReport (sorted by date desc, then mtime desc)
class BucketCache {
  private map = new Map<string, WatchedReport>();

  upsert(filePath: string): WatchedReport | null {
    const bucket = path.basename(path.dirname(filePath));
    const base = path.basename(filePath);
    const m = FILE_RE.exec(base);
    if (!m) return null;
    let mtimeMs = 0;
    try {
      mtimeMs = fs.statSync(filePath).mtimeMs;
    } catch {
      return null;
    }
    const rec: WatchedReport = {
      bucket,
      date: m[1],
      category: m[2],
      filePath,
      mtimeMs,
    };
    const prev = this.map.get(bucket);
    if (!prev) {
      this.map.set(bucket, rec);
    } else if (
      rec.date > prev.date ||
      (rec.date === prev.date && rec.mtimeMs >= prev.mtimeMs)
    ) {
      this.map.set(bucket, rec);
    }
    return rec;
  }

  remove(filePath: string): { bucket: string; date: string } | null {
    const bucket = path.basename(path.dirname(filePath));
    const base = path.basename(filePath);
    const m = FILE_RE.exec(base);
    if (!m) return null;
    const date = m[1];
    const prev = this.map.get(bucket);
    if (prev && prev.filePath === filePath) {
      // We removed the cached latest — we don't know what's next without a
      // rescan, so blow away the entry; next /today call will repopulate.
      this.map.delete(bucket);
    }
    return { bucket, date };
  }

  latestPerBucket(): Record<string, WatchedReport | null> {
    const out: Record<string, WatchedReport | null> = {};
    for (const b of KNOWN_BUCKETS) out[b] = this.map.get(b) ?? null;
    return out;
  }

  reseed(reportsDir: string) {
    for (const bucket of fs.readdirSync(reportsDir, { withFileTypes: true })) {
      if (!bucket.isDirectory()) continue;
      const dir = path.join(reportsDir, bucket.name);
      let entries: string[] = [];
      try {
        entries = fs.readdirSync(dir);
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (FILE_RE.test(entry)) this.upsert(path.join(dir, entry));
      }
    }
  }
}

const cache = new BucketCache();
let watcher: FSWatcher | null = null;

export function getLatestPerBucket(): Record<string, WatchedReport | null> {
  return cache.latestPerBucket();
}

export function startReportWatcher(reportsDir: string): void {
  if (watcher) return;
  try {
    if (fs.existsSync(reportsDir) && fs.statSync(reportsDir).isDirectory()) {
      cache.reseed(reportsDir);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[reportWatcher] startup scan failed:', err);
  }

  watcher = chokidar.watch(reportsDir, {
    ignoreInitial: true,
    persistent: true,
    awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
    depth: 2, // <reportsDir>/<bucket>/<file.md>
  });

  watcher
    .on('add', (filePath: string) => {
      const rec = cache.upsert(filePath);
      if (rec) {
        // eslint-disable-next-line no-console
        console.log(`[reportWatcher] add ${rec.bucket}/${path.basename(filePath)}`);
        reportEvents.emit('report:added', rec);
      }
    })
    .on('change', (filePath: string) => {
      const rec = cache.upsert(filePath);
      if (rec) {
        // eslint-disable-next-line no-console
        console.log(`[reportWatcher] change ${rec.bucket}/${path.basename(filePath)}`);
        reportEvents.emit('report:changed', rec);
      }
    })
    .on('unlink', (filePath: string) => {
      const r = cache.remove(filePath);
      if (r) {
        // eslint-disable-next-line no-console
        console.log(`[reportWatcher] unlink ${r.bucket}/${r.date}`);
        reportEvents.emit('report:removed', { ...r, filePath });
      }
    })
    .on('error', (err) => {
      // eslint-disable-next-line no-console
      console.error('[reportWatcher] error:', err);
    });

  // eslint-disable-next-line no-console
  console.log(`[reportWatcher] watching ${reportsDir} (recursive, depth=2)`);
}

export async function stopReportWatcher(): Promise<void> {
  if (!watcher) return;
  await watcher.close();
  watcher = null;
}
