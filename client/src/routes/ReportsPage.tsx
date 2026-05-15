import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Filter, Copy, ChevronDown, ChevronRight } from 'lucide-react';
import { api } from '../api/client';
import FindingsChart from '../components/reports/FindingsChart';

interface ReportSummary {
  project: string;
  date: string;
  category: string;
  title: string;
  counts: { critical: number; important: number; minor: number };
}

interface ReportDetail extends ReportSummary {
  sections: { heading: string; body: string }[];
  rawMarkdown: string;
}

function categoryLabel(c: string): string {
  switch (c) {
    case 'code-quality':
      return 'Code Quality';
    case 'ui-layout':
      return 'UI Layout';
    case 'qa':
      return 'QA';
    default:
      return c;
  }
}

function projectLabel(p: string): string {
  return p.charAt(0).toUpperCase() + p.slice(1);
}

export default function ReportsPage() {
  const list = useQuery({
    queryKey: ['reports'],
    queryFn: () => api.get<{ reports: ReportSummary[] }>('/api/reports'),
  });

  const reports = list.data?.reports || [];

  const allProjects = useMemo(
    () => Array.from(new Set(reports.map((r) => r.project))).sort(),
    [reports],
  );
  const allCategories = useMemo(
    () => Array.from(new Set(reports.map((r) => r.category))).sort(),
    [reports],
  );

  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [active, setActive] = useState<{ project: string; date: string; category: string } | null>(
    null,
  );
  const [filtersOpenMobile, setFiltersOpenMobile] = useState(false);

  const filtered = useMemo(() => {
    return reports.filter((r) => {
      if (selectedProjects.length && !selectedProjects.includes(r.project)) return false;
      if (selectedCategories.length && !selectedCategories.includes(r.category)) return false;
      if (dateFrom && r.date < dateFrom) return false;
      if (dateTo && r.date > dateTo) return false;
      return true;
    });
  }, [reports, selectedProjects, selectedCategories, dateFrom, dateTo]);

  const totals = useMemo(
    () =>
      filtered.reduce(
        (acc, r) => ({
          critical: acc.critical + r.counts.critical,
          important: acc.important + r.counts.important,
          minor: acc.minor + r.counts.minor,
        }),
        { critical: 0, important: 0, minor: 0 },
      ),
    [filtered],
  );

  const detail = useQuery({
    queryKey: ['report', active?.project, active?.date, active?.category],
    queryFn: () =>
      api.get<ReportDetail>(
        `/api/reports/${active!.project}/${active!.date}/${active!.category}`,
      ),
    enabled: !!active,
  });

  const toggle = (arr: string[], v: string): string[] =>
    arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];

  return (
    <div className="flex flex-col md:flex-row gap-4 h-[calc(100vh-3.5rem-2rem)]">
      {/* Filter rail */}
      <aside className="md:w-64 shrink-0 bg-surface dark:bg-surface-dark border border-border dark:border-border-dark rounded-md p-3 space-y-3 md:overflow-y-auto">
        <div className="flex items-center justify-between md:hidden">
          <span className="text-sm font-semibold inline-flex items-center gap-2">
            <Filter className="w-4 h-4" /> Filters
          </span>
          <button
            onClick={() => setFiltersOpenMobile((v) => !v)}
            className="min-h-11 min-w-11 inline-flex items-center justify-center rounded hover:bg-elevated dark:hover:bg-elevated-dark"
            aria-label="Toggle filters"
          >
            {filtersOpenMobile ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </div>
        <div className={`${filtersOpenMobile ? '' : 'hidden'} md:block space-y-3`}>
          <div>
            <h3 className="text-xs uppercase tracking-wide text-textMuted dark:text-textMuted-dark mb-2">
              Projects
            </h3>
            <div className="space-y-1">
              {allProjects.length === 0 && (
                <div className="text-xs text-textFaint">No reports yet.</div>
              )}
              {allProjects.map((p) => (
                <label key={p} className="flex items-center gap-2 text-sm cursor-pointer min-h-11">
                  <input
                    type="checkbox"
                    checked={selectedProjects.includes(p)}
                    onChange={() => setSelectedProjects(toggle(selectedProjects, p))}
                    className="accent-accent w-4 h-4"
                  />
                  {projectLabel(p)}
                </label>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-xs uppercase tracking-wide text-textMuted dark:text-textMuted-dark mb-2">
              Categories
            </h3>
            <div className="space-y-1">
              {allCategories.map((c) => (
                <label key={c} className="flex items-center gap-2 text-sm cursor-pointer min-h-11">
                  <input
                    type="checkbox"
                    checked={selectedCategories.includes(c)}
                    onChange={() => setSelectedCategories(toggle(selectedCategories, c))}
                    className="accent-accent w-4 h-4"
                  />
                  {categoryLabel(c)}
                </label>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-xs uppercase tracking-wide text-textMuted dark:text-textMuted-dark mb-2">
              Date range
            </h3>
            <div className="space-y-2">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full bg-bg dark:bg-bg-dark border border-border dark:border-border-dark rounded px-2 py-2 text-base sm:text-sm min-h-11"
                aria-label="From"
              />
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full bg-bg dark:bg-bg-dark border border-border dark:border-border-dark rounded px-2 py-2 text-base sm:text-sm min-h-11"
                aria-label="To"
              />
            </div>
          </div>
        </div>
      </aside>

      {/* List + detail */}
      <div className="flex-1 flex flex-col md:flex-row gap-4 min-w-0">
        {/* List */}
        <section className="md:w-80 shrink-0 flex flex-col gap-3 min-w-0">
          <FindingsChart totals={totals} />
          <div className="text-xs text-textMuted dark:text-textMuted-dark">
            {filtered.length} report{filtered.length === 1 ? '' : 's'} ·{' '}
            <span className="text-danger">C {totals.critical}</span> ·{' '}
            <span className="text-warning">I {totals.important}</span> ·{' '}
            <span className="text-accent">M {totals.minor}</span>
          </div>
          <div className="flex-1 overflow-y-auto space-y-2">
            {filtered.length === 0 && !list.isLoading && (
              <div className="text-sm text-textMuted dark:text-textMuted-dark">
                No reports match your filters.
              </div>
            )}
            {filtered.map((r) => {
              const isActive =
                active &&
                active.project === r.project &&
                active.date === r.date &&
                active.category === r.category;
              return (
                <button
                  key={`${r.project}-${r.date}-${r.category}`}
                  onClick={() =>
                    setActive({ project: r.project, date: r.date, category: r.category })
                  }
                  className={[
                    'w-full text-left bg-surface dark:bg-surface-dark border rounded-md p-3 min-h-11',
                    isActive
                      ? 'border-accent'
                      : 'border-border dark:border-border-dark hover:border-accent',
                  ].join(' ')}
                >
                  <div className="text-xs text-textMuted dark:text-textMuted-dark font-mono">
                    {r.date} · {projectLabel(r.project)} · {categoryLabel(r.category)}
                  </div>
                  <div className="text-sm font-medium mt-1 leading-snug line-clamp-2">
                    {r.title}
                  </div>
                  <div className="mt-2 flex gap-2 text-[11px] font-mono">
                    <span className="text-danger">C {r.counts.critical}</span>
                    <span className="text-warning">I {r.counts.important}</span>
                    <span className="text-accent">M {r.counts.minor}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Detail */}
        <section className="flex-1 min-w-0 bg-surface dark:bg-surface-dark border border-border dark:border-border-dark rounded-md p-4 overflow-y-auto">
          {!active ? (
            <div className="text-sm text-textMuted dark:text-textMuted-dark">
              Select a report to read.
            </div>
          ) : detail.isLoading ? (
            <div className="text-sm text-textMuted dark:text-textMuted-dark">Loading…</div>
          ) : detail.error ? (
            <div className="text-sm text-danger">
              Failed to load report: {(detail.error as Error).message}
            </div>
          ) : detail.data ? (
            <ReportDetailView report={detail.data} />
          ) : null}
        </section>
      </div>
    </div>
  );
}

function ReportDetailView({ report }: { report: ReportDetail }) {
  return (
    <article className="space-y-5">
      <header className="space-y-1">
        <div className="text-xs font-mono text-textMuted dark:text-textMuted-dark">
          {report.date} · {projectLabel(report.project)} · {categoryLabel(report.category)}
        </div>
        <h1 className="text-xl font-semibold">{report.title}</h1>
        <div className="text-xs flex gap-3 font-mono">
          <span className="text-danger">Critical: {report.counts.critical}</span>
          <span className="text-warning">Important: {report.counts.important}</span>
          <span className="text-accent">Minor: {report.counts.minor}</span>
        </div>
      </header>
      {report.sections.map((s, i) => (
        <Section key={`${i}-${s.heading}`} heading={s.heading} body={s.body} />
      ))}
      {report.sections.length === 0 && (
        <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-text dark:text-text-dark">
          {report.rawMarkdown}
        </pre>
      )}
    </article>
  );
}

function Section({ heading, body }: { heading: string; body: string }) {
  const [open, setOpen] = useState(true);
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard
      .writeText(body)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {
        /* clipboard unavailable */
      });
  }

  return (
    <section className="border border-border dark:border-border-dark rounded-md">
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-elevated dark:bg-elevated-dark rounded-t-md">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 text-sm font-semibold min-h-11"
        >
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          {heading}
        </button>
        <button
          onClick={copy}
          className="inline-flex items-center gap-1 text-xs text-textMuted dark:text-textMuted-dark hover:text-text dark:hover:text-text-dark min-h-11 px-2"
          title="Copy section to clipboard"
        >
          <Copy className="w-4 h-4" /> {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      {open && (
        <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed p-3 text-text dark:text-text-dark">
          {body}
        </pre>
      )}
    </section>
  );
}
