// TodayPane — surfaces the four most-recent daily cron reports
// (stocks, tech-radar, dev-gig, morning) in a single grid. Auto-refreshes
// every 60 sec via react-query staleTime so it picks up the 5:30 AM KL drop
// without the user having to hit reload.
//
// Each card links to the full report at /reports/<bucket>/<date>/<category>.
// Styled to match framedeck's surface idiom — soft-bordered cards with a
// kind-colored title icon + a monospace KL date pill.

import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Briefcase,
  Cpu,
  Newspaper,
  TrendingUp,
  Clock,
} from 'lucide-react';
import { api } from '../api/client';

interface TodayBucket {
  project: string;
  date: string;
  category: string;
  title: string;
  counts: { critical: number; important: number; minor: number };
  preview: string;
}

interface TodayResponse {
  buckets: Record<string, TodayBucket | null>;
  fetchedAt: string;
}

const BUCKETS: Array<{
  key: string;
  label: string;
  Icon: typeof TrendingUp;
  iconClass: string;
}> = [
  { key: 'stocks',     label: 'Stocks',           Icon: TrendingUp, iconClass: 'text-success' },
  { key: 'tech-radar', label: 'Tech Radar',       Icon: Cpu,        iconClass: 'text-accent'  },
  { key: 'dev-gig',    label: 'Dev Gigs',         Icon: Briefcase,  iconClass: 'text-warning' },
  { key: 'morning',    label: 'Morning Snapshot', Icon: Newspaper,  iconClass: 'text-text-2'  },
];

export default function TodayPane() {
  const { data, isLoading, error } = useQuery<TodayResponse>({
    queryKey: ['reports-today'],
    queryFn: () => api.get<TodayResponse>('/api/reports/today'),
    // 60-second refresh — matches the brief.
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Today</h1>
          <p className="text-sm text-text-2 mt-1">
            Morning briefing — fresh from your daily cron reports.
          </p>
        </div>
        {data?.fetchedAt && (
          <span className="text-xs text-text-muted inline-flex items-center gap-1 font-mono">
            <Clock className="w-3 h-3" />
            Last updated {new Date(data.fetchedAt).toLocaleTimeString()}
          </span>
        )}
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {BUCKETS.map((b) => (
            <div key={b.key} className="surface h-32 animate-pulse" />
          ))}
        </div>
      )}

      {error && (
        <div className="surface p-4 text-error text-sm">
          Failed to load today's reports: {(error as Error).message}
        </div>
      )}

      {data && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {BUCKETS.map(({ key, label, Icon, iconClass }) => {
            const b = data.buckets[key];
            return (
              <div key={key} className="surface p-4 flex flex-col shadow-xs">
                <div className="flex items-center gap-2 mb-2">
                  <Icon className={`w-4 h-4 ${iconClass}`} />
                  <h2 className="text-sm font-semibold text-text">{label}</h2>
                  {b?.date && (
                    <span className="pill ml-auto font-mono">{b.date}</span>
                  )}
                </div>
                {b ? (
                  <>
                    <div className="text-sm text-text-2 leading-snug line-clamp-4 whitespace-pre-wrap mb-3">
                      {b.preview || '(no preview)'}
                    </div>
                    <div className="mt-auto flex items-center justify-between text-xs">
                      <div className="flex gap-2">
                        {b.counts.critical > 0 && (
                          <span className="text-error">{b.counts.critical} critical</span>
                        )}
                        {b.counts.important > 0 && (
                          <span className="text-warning">{b.counts.important} important</span>
                        )}
                        {b.counts.minor > 0 && (
                          <span className="text-text-muted">{b.counts.minor} minor</span>
                        )}
                      </div>
                      <Link
                        to={`/reports/${b.project}/${b.date}/${b.category}`}
                        className="text-accent font-medium hover:underline"
                      >
                        Open full report →
                      </Link>
                    </div>
                  </>
                ) : (
                  <div className="text-xs text-text-muted italic">No report yet.</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
