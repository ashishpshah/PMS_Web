import React from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock } from 'lucide-react';
import { Card, CardContent } from '../ui/Card';
import { Project } from '../../types';

interface Props {
  projects: Project[];
}

// Progress % vs elapsed time per project, using existing startDate/endDate/progress
// fields (no backend call — projects are already loaded via DataContext). Skips any
// project missing a start or end date, since the mapper coerces a null backend date
// to '' rather than leaving it undefined.
export function ProjectTimelineBars({ projects }: Props) {
  const withDates = projects.filter(p => p.status !== 'completed' && p.startDate && p.endDate);

  if (withDates.length === 0) return null;

  const now = Date.now();
  const rows = withDates.map(p => {
    const start = new Date(`${p.startDate}T00:00:00`).getTime();
    const end = new Date(`${p.endDate}T00:00:00`).getTime();
    const span = end - start;
    const elapsedPct = span > 0 ? Math.min(100, Math.max(0, Math.round(((now - start) / span) * 100))) : 100;
    const progressPct = Math.min(100, Math.max(0, p.progress || 0));
    return { project: p, elapsedPct, progressPct, behind: elapsedPct - progressPct > 15 };
  });

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-black uppercase tracking-widest text-gray-400 flex items-center gap-2">
        <CalendarClock size={15} className="text-indigo-500" /> Project Timelines
      </h2>
      <Card>
        <CardContent className="p-5 space-y-5">
          {rows.map(({ project, elapsedPct, progressPct, behind }) => (
            <Link key={project.id} to={`/projects/${project.id}`} className="block group">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[12px] font-bold text-gray-800 dark:text-gray-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 truncate">{project.name}</span>
                {behind && (
                  <span className="text-[9px] font-black uppercase tracking-widest text-amber-600 shrink-0">Behind schedule</span>
                )}
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <span className="text-[9px] font-black uppercase tracking-widest text-gray-400 w-16 shrink-0">Progress</span>
                  <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-emerald-500 transition-all duration-500" style={{ width: `${progressPct}%` }} />
                  </div>
                  <span className="text-[10px] font-mono font-bold text-gray-500 dark:text-gray-400 w-9 text-right shrink-0">{progressPct}%</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[9px] font-black uppercase tracking-widest text-gray-400 w-16 shrink-0">Elapsed</span>
                  <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-500 ${behind ? 'bg-amber-400' : 'bg-gray-300 dark:bg-gray-600'}`} style={{ width: `${elapsedPct}%` }} />
                  </div>
                  <span className="text-[10px] font-mono font-bold text-gray-500 dark:text-gray-400 w-9 text-right shrink-0">{elapsedPct}%</span>
                </div>
              </div>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
