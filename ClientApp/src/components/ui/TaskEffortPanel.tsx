import { useState, useMemo } from 'react';
import { Clock, Activity, User, ChevronLeft, ChevronRight } from 'lucide-react';
import { Status, STATUS_LABELS, TaskEffort, EffortTimelineSegment } from '../../types';
import { formatSeconds, formatDateTime } from '../../lib/utils';

interface TaskEffortPanelProps {
  effort: TaskEffort | null;
  loading?: boolean;
}

const EFFORT_STATUS_BG: Record<Status, string> = {
  'new':          'bg-gray-400',
  'in-progress':  'bg-indigo-500',
  'paused':       'bg-amber-500',
  'blocked':      'bg-red-500',
  'under-review': 'bg-purple-500',
  'issues':       'bg-orange-500',
  'completed':    'bg-emerald-500',
};

const EFFORT_STATUS_BAR: Record<Status, string> = {
  'new':          'bg-gray-300 dark:bg-gray-600',
  'in-progress':  'bg-indigo-500',
  'paused':       'bg-amber-400',
  'blocked':      'bg-red-400',
  'under-review': 'bg-purple-400',
  'issues':       'bg-orange-400',
  'completed':    'bg-emerald-500',
};

// ── Day derivation from timeline ─────────────────────────────────────────────
// Office hours 10:00–19:00 — mirrors backend WorkingOverlapForDay.
const WORK_START_H = 10;
const WORK_END_H   = 19;

interface DayBucket {
  date: string;           // 'YYYY-MM-DD'
  label: string;          // 'Mon, 02 Jun 2025'
  byStatus: Record<string, number>; // status → working seconds
  total: number;
  productive: number;
}

function workingSecondsForDay(segStart: Date, segEnd: Date, day: Date): number {
  const dayWork0 = new Date(day); dayWork0.setHours(WORK_START_H, 0, 0, 0);
  const dayWork1 = new Date(day); dayWork1.setHours(WORK_END_H,   0, 0, 0);
  const sliceStart = segStart > dayWork0 ? segStart : dayWork0;
  const sliceEnd   = segEnd   < dayWork1 ? segEnd   : dayWork1;
  if (sliceEnd <= sliceStart) return 0;
  return Math.floor((sliceEnd.getTime() - sliceStart.getTime()) / 1000);
}

function buildDayBuckets(timeline: EffortTimelineSegment[]): DayBucket[] {
  const map = new Map<string, DayBucket>();

  for (const seg of timeline) {
    const start = new Date(seg.startAt);
    const end   = new Date(seg.endAt);
    if (end <= start) continue;

    // Iterate each calendar day this segment spans.
    const cursor = new Date(start); cursor.setHours(0, 0, 0, 0);
    const last   = new Date(end);   last.setHours(0, 0, 0, 0);

    while (cursor <= last) {
      const ov = workingSecondsForDay(start, end, cursor);
      if (ov > 0) {
        const key = cursor.toISOString().slice(0, 10);
        if (!map.has(key)) {
          map.set(key, {
            date: key,
            label: cursor.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }),
            byStatus: {},
            total: 0,
            productive: 0,
          });
        }
        const bucket = map.get(key)!;
        bucket.byStatus[seg.status] = (bucket.byStatus[seg.status] ?? 0) + ov;
        bucket.total += ov;
        if (seg.isProductive) bucket.productive += ov;
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

// ── Tab: Total ───────────────────────────────────────────────────────────────
function TotalTab({ effort }: { effort: TaskEffort }) {
  const total       = effort.totalElapsedSeconds;
  const nonProd     = effort.pausedSeconds + effort.blockedSeconds + effort.underReviewSeconds;
  const barSegments = effort.byStatus.filter(s => s.seconds > 0);

  return (
    <div className="space-y-2">
      {/* Headline totals */}
      <div className="grid grid-cols-3 gap-2">
        <div className="p-2 bg-gray-50/50 dark:bg-gray-900/50 rounded-lg border border-gray-100/50 dark:border-gray-800/50">
          <div className="text-[8px] font-black uppercase tracking-widest text-gray-400 mb-0.5">Total</div>
          <div className="text-[13px] font-black font-mono text-gray-700 dark:text-gray-200">{formatSeconds(total)}</div>
        </div>
        <div className="p-2 bg-indigo-50/60 dark:bg-indigo-900/20 rounded-lg border border-indigo-100/50 dark:border-indigo-900/30">
          <div className="text-[8px] font-black uppercase tracking-widest text-indigo-400 mb-0.5">Productive</div>
          <div className="text-[13px] font-black font-mono text-indigo-600 dark:text-indigo-300">{formatSeconds(effort.productiveSeconds)}</div>
        </div>
        <div className="p-2 bg-gray-50/50 dark:bg-gray-900/50 rounded-lg border border-gray-100/50 dark:border-gray-800/50">
          <div className="text-[8px] font-black uppercase tracking-widest text-gray-400 mb-0.5">Paused/Blocked/Review</div>
          <div className="text-[13px] font-black font-mono text-amber-600 dark:text-amber-400">{formatSeconds(nonProd)}</div>
        </div>
      </div>

      {/* Stacked segment bar */}
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
        {barSegments.map(s => (
          <div
            key={s.status}
            className={EFFORT_STATUS_BG[s.status] ?? 'bg-gray-400'}
            style={{ width: `${(s.seconds / total) * 100}%` }}
            title={`${STATUS_LABELS[s.status] ?? s.status}: ${formatSeconds(s.seconds)}`}
          />
        ))}
      </div>

      {/* Time in each status */}
      <div className="space-y-1">
        {barSegments.map(s => (
          <div key={s.status} className="flex items-center justify-between text-[10px]">
            <span className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-sm ${EFFORT_STATUS_BG[s.status] ?? 'bg-gray-400'}`} />
              <span className="font-bold text-gray-600 dark:text-gray-300">{STATUS_LABELS[s.status] ?? s.status}</span>
              {s.isProductive && (
                <span className="text-[7px] font-black uppercase tracking-widest text-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 px-1 py-0.5 rounded">Productive</span>
              )}
            </span>
            <span className="font-mono font-bold text-gray-500 dark:text-gray-400">{formatSeconds(s.seconds)}</span>
          </div>
        ))}
      </div>

      {/* Per-user effort */}
      {effort.byUser.length > 0 && (
        <div className="space-y-1 pt-1">
          <h4 className="text-[8px] font-black uppercase tracking-widest text-gray-400 px-0.5 flex items-center gap-1">
            <User size={8} className="text-indigo-400" /> User-wise Effort
          </h4>
          {effort.byUser.map(u => (
            <div key={u.userId} className="p-2 bg-white dark:bg-gray-900 rounded-lg border border-gray-100 dark:border-gray-800">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[11px] font-bold text-gray-700 dark:text-gray-200 truncate">{u.userName}</span>
                <span className="text-[10px] font-mono font-black text-indigo-600 dark:text-indigo-300 shrink-0 ml-2">{formatSeconds(u.productiveSeconds)}</span>
              </div>
              <div className="flex items-center gap-2 text-[8px] text-gray-400 font-mono flex-wrap">
                {u.pausedSeconds > 0 && <span>paused {formatSeconds(u.pausedSeconds)}</span>}
                {u.assignedAt && <span>assigned {formatDateTime(u.assignedAt)}</span>}
                {u.firstStartedAt && <span>started {formatDateTime(u.firstStartedAt)}</span>}
                {u.completedAt && <span className="text-emerald-500">completed {formatDateTime(u.completedAt)}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Timeline */}
      {effort.timeline.length > 0 && (
        <div className="space-y-1 pt-1">
          <h4 className="text-[8px] font-black uppercase tracking-widest text-gray-400 px-0.5 flex items-center gap-1">
            <Activity size={8} className="text-indigo-400" /> Timeline
          </h4>
          <div className="space-y-0.5 pl-2 border-l-2 border-gray-100 dark:border-gray-800">
            {effort.timeline.map((seg, i) => (
              <div key={i} className="flex items-center gap-2 text-[9px]">
                <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${EFFORT_STATUS_BG[seg.status] ?? 'bg-gray-400'}`} />
                <span className="font-bold text-gray-500 dark:text-gray-400 w-20 shrink-0">{STATUS_LABELS[seg.status] ?? seg.status}</span>
                <span className="font-mono text-gray-400">{formatDateTime(seg.startAt)}</span>
                <span className="font-mono text-gray-400 ml-auto shrink-0">{formatSeconds(seg.seconds)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab: Date Wise ────────────────────────────────────────────────────────────
function DateWiseTab({ days }: { days: DayBucket[] }) {
  const [idx, setIdx] = useState(days.length > 0 ? days.length - 1 : 0);
  const safeIdx = Math.min(idx, days.length - 1);
  const day = days[safeIdx];
  const maxProd = useMemo(() => Math.max(...days.map(d => d.productive), 1), [days]);

  if (days.length === 0 || !day) {
    return (
      <div className="py-6 text-center text-[10px] text-gray-400 italic">No daily effort data.</div>
    );
  }

  const statuses = Object.entries(day.byStatus).filter(([, v]) => v > 0) as [Status, number][];

  return (
    <div className="space-y-2">
      {/* Navigator */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => setIdx(i => Math.max(0, i - 1))}
          disabled={safeIdx === 0}
          className="p-1 rounded-md border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label="Previous day"
        >
          <ChevronLeft size={12} />
        </button>
        <div className="flex-1 text-center">
          <span className="text-[11px] font-black text-gray-800 dark:text-gray-100">{day.label}</span>
          <span className="ml-1.5 text-[9px] text-gray-400 font-mono">{safeIdx + 1}/{days.length}</span>
        </div>
        <button
          onClick={() => setIdx(i => Math.min(days.length - 1, i + 1))}
          disabled={safeIdx === days.length - 1}
          className="p-1 rounded-md border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label="Next day"
        >
          <ChevronRight size={12} />
        </button>
      </div>

      {/* Day detail */}
      {day.total > 0 ? (
        <>
          {/* Totals row */}
          <div className="grid grid-cols-2 gap-1.5">
            <div className="p-1.5 bg-indigo-50/60 dark:bg-indigo-900/20 rounded-lg border border-indigo-100/50 dark:border-indigo-900/30">
              <div className="text-[7px] font-black uppercase tracking-widest text-indigo-400 mb-0.5">Productive</div>
              <div className="text-[12px] font-black font-mono text-indigo-600 dark:text-indigo-300">{formatSeconds(day.productive)}</div>
            </div>
            <div className="p-1.5 bg-gray-50/50 dark:bg-gray-900/50 rounded-lg border border-gray-100/50 dark:border-gray-800/50">
              <div className="text-[7px] font-black uppercase tracking-widest text-gray-400 mb-0.5">Total (office hrs)</div>
              <div className="text-[12px] font-black font-mono text-gray-700 dark:text-gray-200">{formatSeconds(day.total)}</div>
            </div>
          </div>

          {/* Per-status bars */}
          <div className="space-y-1">
            {statuses.map(([status, secs]) => (
              <div key={status} className="flex items-center gap-1.5">
                <span className="text-[9px] font-semibold text-gray-500 dark:text-gray-400 w-16 shrink-0 truncate">{STATUS_LABELS[status] ?? status}</span>
                <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${EFFORT_STATUS_BAR[status] ?? 'bg-gray-400'}`}
                    style={{ width: `${Math.round((secs / Math.max(day.total, 1)) * 100)}%` }}
                  />
                </div>
                <span className="text-[9px] font-mono font-bold text-gray-500 dark:text-gray-400 w-10 text-right shrink-0">{formatSeconds(secs)}</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="text-center text-[10px] text-gray-400 italic py-3">No office-hour effort on this day.</p>
      )}

      {/* Sparkline strip — all days */}
      <div className="pt-1 space-y-1">
        <div className="text-[7px] font-black uppercase tracking-widest text-gray-400">All days</div>
        <div className="flex gap-0.5 flex-wrap">
          {days.map((d, i) => {
            const pct = maxProd > 0 ? d.productive / maxProd : 0;
            const isActive = i === safeIdx;
            return (
              <button
                key={d.date}
                onClick={() => setIdx(i)}
                title={`${d.label}: ${formatSeconds(d.productive)}`}
                className={`relative h-6 w-4 rounded flex flex-col justify-end overflow-hidden border transition-all ${isActive ? 'border-indigo-500 dark:border-indigo-400' : 'border-gray-100 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-600'}`}
              >
                <div
                  className={`w-full rounded-sm ${isActive ? 'bg-indigo-500' : d.productive > 0 ? 'bg-indigo-300 dark:bg-indigo-700' : 'bg-gray-100 dark:bg-gray-800'}`}
                  style={{ height: `${Math.max(pct * 100, d.total > 0 ? 12 : 0)}%` }}
                />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────
export function TaskEffortPanel({ effort, loading }: TaskEffortPanelProps) {
  const [tab, setTab] = useState<'total' | 'datewise'>('total');

  const days = useMemo(
    () => (effort ? buildDayBuckets(effort.timeline) : []),
    [effort]
  );

  if (loading) {
    return (
      <div className="space-y-1.5 pt-1">
        <h3 className="text-[9px] font-black uppercase tracking-widest text-gray-400 px-0.5 flex items-center gap-1">
          <Clock size={9} className="text-indigo-400" /> Effort Tracking
        </h3>
        <div className="h-16 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 animate-pulse" />
      </div>
    );
  }

  if (!effort || effort.totalElapsedSeconds <= 0) {
    return (
      <div className="space-y-1.5 pt-1">
        <h3 className="text-[9px] font-black uppercase tracking-widest text-gray-400 px-0.5 flex items-center gap-1">
          <Clock size={9} className="text-indigo-400" /> Effort Tracking
        </h3>
        <p className="text-[10px] text-gray-400 italic px-0.5">No effort recorded yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 pt-1">
      {/* Header + running indicator */}
      <div className="flex items-center justify-between">
        <h3 className="text-[9px] font-black uppercase tracking-widest text-gray-400 px-0.5 flex items-center gap-1">
          <Clock size={9} className="text-indigo-400" /> Effort Tracking
          {effort.isRunning && (
            <span className="ml-1 flex items-center gap-1 text-emerald-500">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[8px] font-black uppercase tracking-widest">Running</span>
            </span>
          )}
        </h3>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-gray-100 dark:border-gray-800">
        {(['total', 'datewise'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`py-1 px-0.5 mr-4 text-[9px] font-black uppercase tracking-widest border-b-2 transition-colors ${
              tab === t
                ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
            }`}
          >
            {t === 'total' ? 'Total' : 'Date Wise'}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'total'
        ? <TotalTab effort={effort} />
        : <DateWiseTab days={days} />
      }
    </div>
  );
}
