import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { InteractiveLink } from '../ui/InteractiveLink';
import { dashboardService } from '../../services/dashboard.service';
import { ProjectStatusMatrix } from '../../types';
import { STATUS_CFG } from './statusConfig';

interface Props {
  from?: string;
  to?: string;
  userId?: number;
}

const fmtHours = (h: number) => (h % 1 === 0 ? h.toFixed(0) : h.toFixed(1));

// Task Distribution's "list view": one row per user — User, every task
// status as its own column, Estimated Hours (sum of EstimatedHours on their
// tasks), Total Hours (computed effort from status transitions), and a button linking to that user's filtered task list.
export function UserStatusList({ from, to, userId }: Props) {
  const [matrix, setMatrix] = useState<ProjectStatusMatrix | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    dashboardService.getStatusMatrix('assignee', from, to, userId)
      .then(data => { if (!cancelled) setMatrix(data); })
      .catch(() => { if (!cancelled) setMatrix(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [from, to, userId]);

  const rows = matrix?.rows ?? [];

  // Totals across all users
  const totalTasks = rows.reduce((sum, r) => sum + r.total, 0);
  const totalEstHours = rows.reduce((sum, r) => sum + r.assignedHours, 0);
  const totalActualHours = rows.reduce((sum, r) => sum + r.workingHours, 0);

  if (loading) return <p className="text-sm text-gray-400 text-center py-6">Loading…</p>;
  if (rows.length === 0) return <p className="text-sm text-gray-400 text-center py-6">No tasks for this range</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-gray-100 dark:border-gray-800">
            <th className="px-3 py-2.5 text-[9px] font-black uppercase tracking-widest text-gray-400">User</th>
            {STATUS_CFG.map(s => (
              <th key={s.key} className="px-3 py-2.5 text-[9px] font-black uppercase tracking-widest text-gray-400 text-right">
                {s.label}
              </th>
            ))}
            <th className="px-3 py-2.5 text-[9px] font-black uppercase tracking-widest text-gray-400 text-right">Total</th>
            <th className="px-3 py-2.5 text-[9px] font-black uppercase tracking-widest text-gray-400 text-right">Est. Hours</th>
            <th className="px-3 py-2.5 text-[9px] font-black uppercase tracking-widest text-gray-400 text-right">Total Hours</th>
            <th className="px-3 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.id} className="border-b border-gray-50 dark:border-gray-900 last:border-0 hover:bg-gray-50/50 dark:hover:bg-gray-900/30 transition-colors">
              <td className="px-3 py-2.5">
                <InteractiveLink type="user" id={row.id} className="flex items-center gap-2 hover:text-indigo-600">
                  <img
                    src={`https://ui-avatars.com/api/?name=${encodeURIComponent(row.name)}&background=random&size=32`}
                    alt=""
                    className="h-6 w-6 rounded-full object-cover border border-gray-100 dark:border-gray-800 shrink-0"
                  />
                  <span className="text-[12px] font-bold text-gray-800 dark:text-gray-200 truncate max-w-[160px]">{row.name}</span>
                </InteractiveLink>
              </td>
              {STATUS_CFG.map(s => (
                <td key={s.key} className="px-3 py-2.5 text-[12px] font-mono text-right text-gray-500 dark:text-gray-400">
                  {row.countsByStatus[s.key] ?? 0}
                </td>
              ))}
              <td className="px-3 py-2.5 text-[12px] font-mono font-black text-right text-gray-800 dark:text-gray-200">{row.total}</td>
              <td className="px-3 py-2.5 text-[12px] font-mono text-right text-gray-500 dark:text-gray-400">{fmtHours(row.assignedHours)}h</td>
              <td className="px-3 py-2.5 text-[12px] font-mono text-right text-indigo-600">{fmtHours(row.workingHours)}h</td>
              <td className="px-3 py-2.5 text-right">
                <Link
                  to={`/tasks?userId=${row.id}`}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-widest text-indigo-600 border border-indigo-100 dark:border-indigo-900/40 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors whitespace-nowrap"
                >
                  Tasks <ArrowRight size={10} />
                </Link>
              </td>
            </tr>
          ))}
          {/* Totals row */}
          <tr className="bg-gray-50 dark:bg-gray-900/50 border-t-2 border-gray-200 dark:border-gray-700">
            <td className="px-3 py-2.5 text-[11px] font-black text-gray-700 dark:text-gray-300">TOTAL</td>
            {STATUS_CFG.map(s => (
              <td key={s.key} className="px-3 py-2.5 text-[11px] font-mono font-black text-right text-gray-500 dark:text-gray-400">
                {rows.reduce((sum, r) => sum + (r.countsByStatus[s.key] ?? 0), 0)}
              </td>
            ))}
            <td className="px-3 py-2.5 text-[11px] font-mono font-black text-right text-gray-800 dark:text-gray-200">{totalTasks}</td>
            <td className="px-3 py-2.5 text-[11px] font-mono font-black text-right text-gray-500 dark:text-gray-400">{fmtHours(totalEstHours)}h</td>
            <td className="px-3 py-2.5 text-[11px] font-mono font-black text-right text-indigo-600">{fmtHours(totalActualHours)}h</td>
            <td />
          </tr>
        </tbody>
      </table>
    </div>
  );
}
