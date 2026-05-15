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

export default function FindingsChart({ totals }: Props) {
  const data = [
    { name: 'Critical',  count: totals.critical,  fill: '#f0716a' },
    { name: 'Important', count: totals.important, fill: '#e8a86a' },
    { name: 'Minor',     count: totals.minor,     fill: '#5b8def' },
  ];
  return (
    <div className="w-full h-32 bg-surface dark:bg-surface-dark border border-border dark:border-border-dark rounded-md p-2">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(139,149,165,0.15)" />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'currentColor' }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'currentColor' }} />
          <Tooltip
            contentStyle={{
              background: 'rgba(20,20,25,0.95)',
              border: '1px solid #262c36',
              fontSize: '12px',
            }}
            labelStyle={{ color: '#e6e9ef' }}
            itemStyle={{ color: '#e6e9ef' }}
          />
          <Bar dataKey="count" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
