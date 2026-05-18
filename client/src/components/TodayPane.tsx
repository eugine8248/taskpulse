// TodayPane — surfaces the four most-recent daily cron reports
// (stocks, tech-radar, dev-gig, morning) in a single grid. Auto-refreshes
// every 60 sec via react-query staleTime so it picks up the 5:30 AM KL drop
// without the user having to hit reload.
//
// Each card links to the full report at /reports/<bucket>/<date>/<category>.

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
  accent: string;
}> = [
  { key: 'stocks',     label: 'Stocks',      Icon: TrendingUp, accent: 'text-up'    },
  { key: 'tech-radar', label: 'Tech Radar',  Icon: Cpu,        accent: 'text-accent' },
  { key: 'dev-gig',    label: 'Dev Gigs',    Icon: Briefcase,  accent: 'text-warning' },
  { key: 'morning',    label: 'Morning Snapshot', Icon: Newspaper, accent: 'text-textMuted' },
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
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-lg text-textMuted font-medium">Today</h1>
        {data?.fetchedAt && (
          <span className="text-xs text-textFaint inline-flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {new Date(data.fetchedAt).toLocaleTimeString()}
          </span>
        )}
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {BUCKETS.map((b) => (
            <div
              key={b.key}
              className="h-32 rounded-lg bg-surface dark:bg-surface-dark border border-border dark:border-border-dark animate-pulse"
            />
          ))}
        </div>
      )}

      {error && (
        <div className="bg-surface dark:bg-surface-dark border border-down/40 rounded-lg p-4 text-down text-sm">
          Failed to load today's reports: {(error as Error).message}
        </div>
      )}

      {data && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {BUCKETS.map(({ key, label, Icon, accent }) => {
            const b = data.buckets[key];
            return (
              <div
                key={key}
                className="bg-surface dark:bg-surface-dark border border-border dark:border-border-dark rounded-lg p-4 flex flex-col"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Icon className={`w-4 h-4 ${accent}`} />
                  <h2 className="text-sm font-medium text-text dark:text-text-dark">{label}</h2>
                  {b?.date && (
                    <span className="ml-auto text-xs text-textFaint font-mono">{b.date}</span>
                  )}
                </div>
                {b ? (
                  <>
                    <div className="text-sm text-text/90 dark:text-text-dark/90 leading-snug line-clamp-4 whitespace-pre-wrap mb-3">
                      {b.preview || '(no preview)'}
                    </div>
                    <div className="mt-auto flex items-center justify-between text-xs">
                      <div className="flex gap-2 text-textMuted">
                        {b.counts.critical > 0 && (
                          <span className="text-down">{b.counts.critical} critical</span>
                        )}
                        {b.counts.important > 0 && (
                          <span className="text-warning">{b.counts.important} important</span>
                        )}
                        {b.counts.minor > 0 && (
                          <span>{b.counts.minor} minor</span>
                        )}
                      </div>
                      <Link
                        to={`/reports/${b.project}/${b.date}/${b.category}`}
                        className="text-accent hover:underline"
                      >
                        Open →
                      </Link>
                    </div>
                  </>
                ) : (
                  <div className="text-xs text-textFaint italic">No report yet.</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
