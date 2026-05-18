import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts';

interface Props {
  totals: { critical: number; important: number; minor: number };
}

/**
 * Findings count bars — restyled to use the framedeck token palette.
 * Bar fills come from the live CSS variables so the chart re-themes
 * automatically when the user toggles dark mode (no recharts re-mount).
 *
 * Axis labels + grid use `currentColor` and an inherited muted color so they
 * adapt with the surrounding theme too.
 */
export default function FindingsChart({ totals }: Props) {
  const data = [
    { name: 'Critical',  count: totals.critical,  fill: 'var(--c-error)' },
    { name: 'Important', count: totals.important, fill: 'var(--c-warning)' },
    { name: 'Minor',     count: totals.minor,     fill: 'var(--c-accent)' },
  ];
  return (
    <div className="w-full h-32 surface p-2 text-text-muted">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--c-border-soft)" />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'currentColor' }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'currentColor' }} />
          <Tooltip
            contentStyle={{
              background: 'var(--c-surface)',
              border: '1px solid var(--c-border-soft)',
              borderRadius: 6,
              fontSize: '12px',
              color: 'var(--c-text)',
            }}
            labelStyle={{ color: 'var(--c-text)' }}
            itemStyle={{ color: 'var(--c-text)' }}
            cursor={{ fill: 'var(--c-accent-soft)' }}
          />
          <Bar dataKey="count" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
