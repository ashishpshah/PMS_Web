import React from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { useTheme } from '../../context/ThemeContext';
import { STATUS_CFG } from './statusConfig';

interface Props {
  counts: Record<string, number>;
}

// The one "real chart" widget in Task Distribution — recharts is SVG-based and
// doesn't understand Tailwind dark-mode classes, so colors here are literal hex
// (shared with the pill/bar list via statusConfig.ts) rather than className.
export function StatusDonutChart({ counts }: Props) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const data = STATUS_CFG
    .map(s => ({ key: s.key, name: s.label, value: counts[s.key] ?? 0, color: s.hex }))
    .filter(d => d.value > 0);

  if (data.length === 0) {
    return <div className="h-[180px] flex items-center justify-center text-sm text-gray-400">No tasks yet</div>;
  }

  return (
    <div className="h-[180px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={45} outerRadius={70} paddingAngle={2}>
            {data.map(d => <Cell key={d.key} fill={d.color} />)}
          </Pie>
          <Tooltip
            contentStyle={{
              background: isDark ? '#111827' : '#ffffff',
              border: `1px solid ${isDark ? '#374151' : '#e5e7eb'}`,
              borderRadius: 8,
              fontSize: 11,
              color: isDark ? '#e5e7eb' : '#111827',
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
