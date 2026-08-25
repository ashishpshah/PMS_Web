import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert, Clock, Folder } from 'lucide-react';
import { Card, CardContent } from '../ui/Card';
import { InteractiveLink } from '../ui/InteractiveLink';
import { AtRiskData } from '../../types';
import { paginate, DashboardPaginationBar } from './DashboardPaginationBar';

interface Props {
  data: AtRiskData | null;
  loading: boolean;
}

// Current-state snapshot (overdue tasks + stalled projects) — intentionally not
// affected by the dashboard's date-range filter, styled like the existing
// "Blocked Tasks" card (red-tinted, ShieldAlert icon) since it's the same
// "things needing attention" pattern with a different data source.
export function AtRiskWidget({ data, loading }: Props) {
  const overdueTasks = data?.overdueTasks ?? [];
  const stalledProjects = data?.stalledProjects ?? [];
  const total = overdueTasks.length + stalledProjects.length;

  const [overduePage, setOverduePage] = useState(1);
  const [stalledPage, setStalledPage] = useState(1);
  const pagedOverdue = paginate(overdueTasks, overduePage);
  const pagedStalled = paginate(stalledProjects, stalledPage);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <ShieldAlert size={16} className="text-red-500" />
          <h3 className="text-sm font-black uppercase tracking-tight text-gray-900 dark:text-white">At Risk</h3>
          {total > 0 && (
            <span className="inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 bg-red-500 text-white text-[10px] font-black rounded-full">
              {total}
            </span>
          )}
        </div>
        <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">Right now</span>
      </div>
      <Card className="border-red-100 dark:border-red-900/30">
        <CardContent className="p-4">
          {loading ? (
            <p className="text-sm text-gray-400 text-center py-4">Loading…</p>
          ) : total === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Nothing at risk right now</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Overdue Tasks */}
              <div className="space-y-2">
                <h4 className="text-[9px] font-black uppercase tracking-widest text-gray-400 flex items-center gap-1">
                  <Clock size={11} className="text-red-400" /> Overdue Tasks
                </h4>
                {overdueTasks.length > 0 ? (
                  <>
                    {pagedOverdue.pageItems.map(t => (
                      <div key={t.id} className="flex items-center justify-between gap-2 p-2.5 bg-red-50/60 dark:bg-red-900/10 rounded-lg border border-red-100 dark:border-red-900/30">
                        <InteractiveLink type="task" id={t.id} className="text-[12px] font-bold text-gray-900 dark:text-gray-100 hover:text-red-600 transition-colors truncate">
                          {t.title}
                        </InteractiveLink>
                        <span className="text-[10px] font-mono font-bold text-red-600 shrink-0">{t.daysOverdue}d overdue</span>
                      </div>
                    ))}
                    <DashboardPaginationBar
                      page={pagedOverdue.page} totalPages={pagedOverdue.totalPages} totalCount={pagedOverdue.totalCount}
                      onPrev={() => setOverduePage(p => p - 1)} onNext={() => setOverduePage(p => p + 1)}
                    />
                  </>
                ) : (
                  <p className="text-[11px] text-gray-400 italic py-2">No overdue tasks</p>
                )}
              </div>
              {/* Stalled Projects */}
              <div className="space-y-2">
                <h4 className="text-[9px] font-black uppercase tracking-widest text-gray-400 flex items-center gap-1">
                  <Folder size={11} className="text-amber-400" /> Stalled Projects
                </h4>
                {stalledProjects.length > 0 ? (
                  <>
                    {pagedStalled.pageItems.map(p => (
                      <Link key={p.id} to={`/projects/${p.id}`} className="flex items-center justify-between gap-2 p-2.5 bg-amber-50/60 dark:bg-amber-900/10 rounded-lg border border-amber-100 dark:border-amber-900/30 hover:shadow-sm transition-shadow">
                        <span className="text-[12px] font-bold text-gray-900 dark:text-gray-100 truncate">{p.name}</span>
                        <span className="text-[10px] font-mono font-bold text-amber-600 shrink-0">{p.daysSinceActivity}d idle</span>
                      </Link>
                    ))}
                    <DashboardPaginationBar
                      page={pagedStalled.page} totalPages={pagedStalled.totalPages} totalCount={pagedStalled.totalCount}
                      onPrev={() => setStalledPage(p => p - 1)} onNext={() => setStalledPage(p => p + 1)}
                    />
                  </>
                ) : (
                  <p className="text-[11px] text-gray-400 italic py-2">No stalled projects</p>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
