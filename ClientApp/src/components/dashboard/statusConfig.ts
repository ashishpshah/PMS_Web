// Single source of truth for task-status visual treatment on the Dashboard —
// shared by the Task Distribution section, the breakdown matrix, and the
// recharts donut chart (which needs literal hex, not Tailwind classes).
export interface StatusCfgEntry {
  key: string;
  label: string;
  dot: string;
  bar: string;
  text: string;
  hex: string;
}

export const STATUS_CFG: StatusCfgEntry[] = [
  { key: 'new',          label: 'New',          dot: 'bg-gray-400',    bar: 'bg-gray-300',    text: 'text-gray-500',    hex: '#9ca3af' },
  { key: 'in-progress',  label: 'In Progress',  dot: 'bg-indigo-500',  bar: 'bg-indigo-500',  text: 'text-indigo-600',  hex: '#6366f1' },
  { key: 'paused',       label: 'Paused',       dot: 'bg-amber-500',   bar: 'bg-amber-400',   text: 'text-amber-600',   hex: '#f59e0b' },
  { key: 'blocked',      label: 'Blocked',      dot: 'bg-red-500',     bar: 'bg-red-400',     text: 'text-red-600',     hex: '#ef4444' },
  { key: 'under-review', label: 'Under Review', dot: 'bg-purple-500',  bar: 'bg-purple-400',  text: 'text-purple-600',  hex: '#a855f7' },
  { key: 'issues',       label: 'Issues',       dot: 'bg-orange-500',  bar: 'bg-orange-400',  text: 'text-orange-600',  hex: '#f97316' },
  { key: 'completed',    label: 'Completed',    dot: 'bg-emerald-500', bar: 'bg-emerald-500', text: 'text-emerald-600', hex: '#10b981' },
];
