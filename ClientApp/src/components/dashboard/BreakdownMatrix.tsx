import React, { useEffect, useState } from 'react';
import { LayoutGrid } from 'lucide-react';
import { Card, CardContent } from '../ui/Card';
import { dashboardService } from '../../services/dashboard.service';
import { ProjectStatusMatrix } from '../../types';
import { STATUS_CFG } from './statusConfig';

interface Props {
  from?: string;
  to?: string;
  userId?: number;
}

// Admin-only project x status / teammate x status breakdown table. The
// teammate-axis view doubles as the "All Users combined" per-person
// breakdown the user asked for — no separate endpoint needed for that.
export function BreakdownMatrix({ from, to, userId }: Props) {
  const [axis, setAxis] = useState<'project' | 'assignee'>('project');
  const [matrix, setMatrix] = useState<ProjectStatusMatrix | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    dashboardService.getStatusMatrix(axis, from, to, userId)
      .then(data => { if (!cancelled) setMatrix(data); })
      .catch(() => { if (!cancelled) setMatrix(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [axis, from, to, userId]);

  const rows = matrix?.rows ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-sm font-black uppercase tracking-widest text-gray-400 flex items-center gap-2">
          <LayoutGrid size={15} className="text-indigo-500" /> Breakdown Matrix
        </h2>
        <div className="flex items-center gap-1 rounded-lg border border-gray-100 dark:border-gray-800 p-0.5 bg-gray-50/50 dark:bg-gray-900/30">
          {(['project', 'assignee'] as const).map(a => (
            <button
              key={a}
              onClick={() => setAxis(a)}
              className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-widest transition-colors ${
                axis === a
                  ? 'bg-white dark:bg-gray-800 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
              }`}
            >
              {a === 'project' ? 'By Project' : 'By Teammate'}
            </button>
          ))}
        </div>
      </div>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <p className="text-sm text-gray-400 text-center py-8">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No data for this range</p>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  <th className="px-4 py-2.5 text-[9px] font-black uppercase tracking-widest text-gray-400">
                    {axis === 'project' ? 'Project' : 'Teammate'}
                  </th>
                  {STATUS_CFG.map(s => (
                    <th key={s.key} className="px-3 py-2.5 text-[9px] font-black uppercase tracking-widest text-gray-400 text-right">
                      {s.label}
                    </th>
                  ))}
                  <th className="px-4 py-2.5 text-[9px] font-black uppercase tracking-widest text-gray-400 text-right">Total</th>
                  {axis === 'assignee' && (
                    <>
                      <th className="px-4 py-2.5 text-[9px] font-black uppercase tracking-widest text-gray-400 text-right">Est Hours</th>
                      <th className="px-4 py-2.5 text-[9px] font-black uppercase tracking-widest text-gray-400 text-right">Working Hours</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.id} className="border-b border-gray-50 dark:border-gray-900 last:border-0 hover:bg-gray-50/50 dark:hover:bg-gray-900/30 transition-colors">
                    <td className="px-4 py-2.5 text-[12px] font-bold text-gray-800 dark:text-gray-200 truncate max-w-[200px]">{row.name}</td>
                    {STATUS_CFG.map(s => (
                      <td key={s.key} className="px-3 py-2.5 text-[12px] font-mono text-right text-gray-500 dark:text-gray-400">
                        {row.countsByStatus[s.key] ?? 0}
                      </td>
                    ))}
                    <td className="px-4 py-2.5 text-[12px] font-mono font-black text-right text-gray-800 dark:text-gray-200">{row.total}</td>
                    {axis === 'assignee' && (
                      <>
                        <td className="px-4 py-2.5 text-[12px] font-mono text-right text-gray-500 dark:text-gray-400">{row.assignedHours}h</td>
                        <td className="px-4 py-2.5 text-[12px] font-mono text-right text-indigo-600">{row.workingHours}h</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
