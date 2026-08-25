import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { BarChart2, Activity, ChevronDown, ChevronRight, ArrowUpDown, X, Clock, ChevronLeft, Users, Briefcase, ListTodo, Zap, TrendingUp, Target } from 'lucide-react';
import { useData } from '../context/DataContext';
import { Card, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { DateInput } from '../components/ui/DateInput';
import { PageTransition } from '../components/Layout/PageTransition';
import { useAuth } from '../context/AuthContext';
import { PeriodKey, PERIOD_OPTIONS, resolvePeriod, resolveCustom } from '../lib/dateRanges';
import { VSelect, SelectOption } from '../components/forms/VSelect';
import { formatSeconds } from '../lib/utils';
import { reportService } from '../services/report.service';
import {
  UserEffortReport, UserEffortReportItem,
  UserTransitionReport,
  UserTaskEffortReport, UserTaskEffortItem,
  UserDailyEffortReport, DailyEffortItem,
  HoursSummary, HoursSummaryUserRow, HoursSummaryTaskRow, HoursSummaryProjectRow,
  STATUS_BADGE_VARIANT, STATUS_LABELS, Status,
  UserDailyUtilizationReport, DailyUtilizationItem,
} from '../types';
import { motion, AnimatePresence } from 'motion/react';

type EffortSortKey = 'productiveSeconds' | 'pausedSeconds' | 'blockedSeconds' | 'underReviewSeconds' | 'totalElapsedSeconds' | 'taskCount';

function avatarUrl(name: string, url?: string) {
  return url || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`;
}

function RowSkeleton() {
  return (
    <div className="space-y-2 animate-pulse">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="h-10 bg-gray-100 dark:bg-gray-800 rounded-lg" />
      ))}
    </div>
  );
}

interface SortableThProps {
  label: string;
  sortKey: EffortSortKey;
  current: EffortSortKey;
  dir: 'asc' | 'desc';
  onSort: (k: EffortSortKey) => void;
}
function SortableTh({ label, sortKey, current, dir, onSort }: SortableThProps) {
  const active = current === sortKey;
  return (
    <th
      className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-widest text-gray-500 cursor-pointer select-none hover:text-indigo-600 whitespace-nowrap"
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown size={10} className={active ? 'text-indigo-500' : 'text-gray-300'} />
        {active && <span className="text-[9px] text-indigo-400">{dir === 'desc' ? '↓' : '↑'}</span>}
      </span>
    </th>
  );
}

// ── Period filter select (reused in both page and modal) ─────────────────────
interface PeriodFilterProps {
  period: PeriodKey;
  setPeriod: (p: PeriodKey) => void;
  customFrom: string;
  setCustomFrom: (v: string) => void;
  customTo: string;
  setCustomTo: (v: string) => void;
}
function PeriodFilter({ period, setPeriod, customFrom, setCustomFrom, customTo, setCustomTo }: PeriodFilterProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <VSelect
        options={PERIOD_OPTIONS.map((o): SelectOption => ({ value: o.key, label: o.label }))}
        value={{ value: period, label: PERIOD_OPTIONS.find(o => o.key === period)?.label ?? period }}
        onChange={(opt) => { if (opt) setPeriod(opt.value as PeriodKey); }}
        isSearchable={false}
        className="w-36"
      />
      {period === 'custom' && (
        <div className="flex items-center gap-1.5">
          <DateInput value={customFrom} onChange={setCustomFrom} className="px-2 py-1.5 text-[12px] bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500" />
          <span className="text-[10px] text-gray-400 font-bold">to</span>
          <DateInput value={customTo} onChange={setCustomTo} className="px-2 py-1.5 text-[12px] bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
      )}
    </div>
  );
}

// ── Shared: effort summary pills ─────────────────────────────────────────────
function EffortPills({ prod, paused, blocked, review, tasks }: { prod: number; paused: number; blocked: number; review: number; tasks: number }) {
  return (
    <div className="flex flex-wrap gap-2 pb-1">
      {[
        { label: 'Tasks',        value: String(tasks),          color: 'text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700' },
        { label: 'Productive',   value: formatSeconds(prod),    color: 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-100 dark:border-emerald-900/40' },
        { label: 'Paused',       value: formatSeconds(paused),  color: 'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border-amber-100 dark:border-amber-900/40' },
        { label: 'Blocked',      value: formatSeconds(blocked), color: 'text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border-rose-100 dark:border-rose-900/40' },
        { label: 'Under Review', value: formatSeconds(review),  color: 'text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/40 border-purple-100 dark:border-purple-900/40' },
      ].map(p => (
        <div key={p.label} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-bold ${p.color}`}>
          <span className="font-black text-[10px] uppercase tracking-widest opacity-60">{p.label}</span>
          <span className="font-mono">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ── Tab 1: Total (task list) ──────────────────────────────────────────────────
function TotalTab({ tasks, loading }: { tasks: UserTaskEffortItem[]; loading: boolean }) {
  const maxProd = tasks.length > 0 ? Math.max(...tasks.map(t => t.productiveSeconds), 1) : 1;
  if (loading) return <RowSkeleton />;
  if (tasks.length === 0) return (
    <div className="py-12 text-center text-[12px] text-gray-400 italic flex flex-col items-center gap-2">
      <Clock size={28} className="text-gray-200 dark:text-gray-700" />
      No effort recorded for this period.
    </div>
  );
  return (
    <div className="space-y-3">
      <EffortPills
        prod={tasks.reduce((s, t) => s + t.productiveSeconds, 0)}
        paused={tasks.reduce((s, t) => s + t.pausedSeconds, 0)}
        blocked={tasks.reduce((s, t) => s + t.blockedSeconds, 0)}
        review={tasks.reduce((s, t) => s + t.underReviewSeconds, 0)}
        tasks={tasks.length}
      />
      <div className="space-y-2">
        {tasks.map(t => {
          const pct = maxProd > 0 ? Math.round((t.productiveSeconds / maxProd) * 100) : 0;
          return (
            <div key={t.taskId} className="p-3 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-800/40 hover:border-indigo-200 dark:hover:border-indigo-800 transition-colors">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  {t.taskCode && <span className="text-[9px] font-black tracking-widest font-mono text-gray-400 shrink-0">{t.taskCode}</span>}
                  <span className="text-[13px] font-semibold text-gray-700 dark:text-gray-200 truncate">{t.taskTitle}</span>
                </div>
                <Badge variant={STATUS_BADGE_VARIANT[t.taskStatus as Status] ?? 'default'} className="text-[9px] uppercase tracking-tight shrink-0">
                  {STATUS_LABELS[t.taskStatus as Status] ?? t.taskStatus}
                </Badge>
              </div>
              <div className="flex items-center gap-2 mb-1.5">
                <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-[11px] font-mono font-black text-emerald-600 dark:text-emerald-400 w-14 text-right shrink-0">
                  {formatSeconds(t.productiveSeconds)}
                </span>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                {t.pausedSeconds > 0 && <span className="text-[10px] font-mono text-amber-600 dark:text-amber-400">Paused {formatSeconds(t.pausedSeconds)}</span>}
                {t.blockedSeconds > 0 && <span className="text-[10px] font-mono text-rose-600 dark:text-rose-400">Blocked {formatSeconds(t.blockedSeconds)}</span>}
                {t.underReviewSeconds > 0 && <span className="text-[10px] font-mono text-purple-600 dark:text-purple-400">Review {formatSeconds(t.underReviewSeconds)}</span>}
                <span className="text-[10px] font-mono text-gray-400 ml-auto">Total {formatSeconds(t.totalElapsedSeconds)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Tab 2: Date Wise ──────────────────────────────────────────────────────────
function DateWiseTab({ userId, period, customFrom, customTo }: { userId: number; period: PeriodKey; customFrom: string; customTo: string }) {
  const [report, setReport] = useState<UserDailyEffortReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [dayIndex, setDayIndex] = useState<number | null>(null); // null = not yet set

  const load = useCallback(() => {
    const range = period === 'custom' ? resolveCustom(customFrom, customTo) : resolvePeriod(period);
    if (period === 'custom' && !range.from && !range.to) return;
    let cancelled = false;
    setLoading(true);
    reportService.getUserDailyEffort(userId, range.from, range.to)
      .then(r => {
        if (!cancelled) {
          setReport(r);
          // Default to the last day (today / most recent with data)
          setDayIndex(r.days.length > 0 ? r.days.length - 1 : null);
        }
      })
      .catch(() => { if (!cancelled) { setReport(null); setDayIndex(null); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [userId, period, customFrom, customTo]);

  useEffect(() => { return load(); }, [load]);

  const days = report?.days ?? [];
  const idx = dayIndex ?? (days.length > 0 ? days.length - 1 : 0);
  const day = days[idx] ?? null;

  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  };

  if (loading) return <RowSkeleton />;
  if (!report || days.length === 0) return (
    <div className="py-12 text-center text-[12px] text-gray-400 italic flex flex-col items-center gap-2">
      <Clock size={28} className="text-gray-200 dark:text-gray-700" />
      No daily effort recorded for this period.
    </div>
  );

  const maxProd = Math.max(...days.map(d => d.productiveSeconds), 1);

  return (
    <div className="space-y-4">
      {/* Day navigator */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setDayIndex(i => Math.max(0, (i ?? idx) - 1))}
          disabled={idx === 0}
          className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label="Previous day"
        >
          <ChevronLeft size={15} />
        </button>
        <div className="flex-1 text-center">
          <span className="text-[13px] font-black text-gray-800 dark:text-gray-100">{day ? fmtDate(day.date) : '—'}</span>
          <span className="ml-2 text-[10px] text-gray-400 font-mono">{idx + 1} / {days.length}</span>
        </div>
        <button
          onClick={() => setDayIndex(i => Math.min(days.length - 1, (i ?? idx) + 1))}
          disabled={idx === days.length - 1}
          className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label="Next day"
        >
          <ChevronRight size={15} />
        </button>
      </div>

      {/* Day detail */}
      {day && day.totalElapsedSeconds > 0 ? (
        <>
          <EffortPills
            prod={day.productiveSeconds}
            paused={day.pausedSeconds}
            blocked={day.blockedSeconds}
            review={day.underReviewSeconds}
            tasks={day.taskCount}
          />

          {/* Visual bar for this day vs all days */}
          <div className="p-3 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-800/40 space-y-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Productive time — day breakdown</p>
            {/* Productive */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 w-20 shrink-0 font-semibold">In Progress</span>
              <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.round((day.productiveSeconds / maxProd) * 100)}%` }} />
              </div>
              <span className="text-[11px] font-mono font-black text-emerald-600 dark:text-emerald-400 w-14 text-right shrink-0">{formatSeconds(day.productiveSeconds)}</span>
            </div>
            {day.pausedSeconds > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-amber-600 dark:text-amber-400 w-20 shrink-0 font-semibold">Paused</span>
                <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-400 rounded-full" style={{ width: `${Math.round((day.pausedSeconds / maxProd) * 100)}%` }} />
                </div>
                <span className="text-[11px] font-mono font-black text-amber-600 dark:text-amber-400 w-14 text-right shrink-0">{formatSeconds(day.pausedSeconds)}</span>
              </div>
            )}
            {day.blockedSeconds > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-rose-600 dark:text-rose-400 w-20 shrink-0 font-semibold">Blocked</span>
                <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div className="h-full bg-rose-400 rounded-full" style={{ width: `${Math.round((day.blockedSeconds / maxProd) * 100)}%` }} />
                </div>
                <span className="text-[11px] font-mono font-black text-rose-600 dark:text-rose-400 w-14 text-right shrink-0">{formatSeconds(day.blockedSeconds)}</span>
              </div>
            )}
            {day.underReviewSeconds > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-purple-600 dark:text-purple-400 w-20 shrink-0 font-semibold">Review</span>
                <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div className="h-full bg-purple-400 rounded-full" style={{ width: `${Math.round((day.underReviewSeconds / maxProd) * 100)}%` }} />
                </div>
                <span className="text-[11px] font-mono font-black text-purple-600 dark:text-purple-400 w-14 text-right shrink-0">{formatSeconds(day.underReviewSeconds)}</span>
              </div>
            )}
            <div className="pt-1 border-t border-gray-100 dark:border-gray-800 flex justify-between text-[10px] font-mono text-gray-400">
              <span>Total working hours</span>
              <span className="font-black text-gray-600 dark:text-gray-300">{formatSeconds(day.totalElapsedSeconds)}</span>
            </div>
          </div>

          {/* Mini calendar strip — sparkline of all days */}
          <div className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">All days in period</p>
            <div className="flex gap-0.5 flex-wrap">
              {days.map((d, i) => {
                const pct = maxProd > 0 ? d.productiveSeconds / maxProd : 0;
                const isActive = i === idx;
                return (
                  <button
                    key={d.date}
                    onClick={() => setDayIndex(i)}
                    title={`${fmtDate(d.date)}: ${formatSeconds(d.productiveSeconds)}`}
                    className={`relative h-7 w-5 rounded flex flex-col justify-end overflow-hidden border transition-all ${isActive ? 'border-indigo-500 dark:border-indigo-400' : 'border-gray-100 dark:border-gray-800'}`}
                  >
                    <div
                      className={`w-full rounded-sm transition-all ${isActive ? 'bg-indigo-500' : d.productiveSeconds > 0 ? 'bg-emerald-400 dark:bg-emerald-500' : 'bg-gray-100 dark:bg-gray-800'}`}
                      style={{ height: `${Math.max(pct * 100, d.totalElapsedSeconds > 0 ? 15 : 0)}%` }}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        </>
      ) : (
        <div className="py-8 text-center text-[12px] text-gray-400 italic">No effort recorded on this day.</div>
      )}
    </div>
  );
}

// ── User Task Effort Modal ────────────────────────────────────────────────────
interface UserEffortModalProps {
  userId: number;
  userName: string;
  userAvatar?: string;
  onClose: () => void;
}
function UserEffortModal({ userId, userName, userAvatar, onClose }: UserEffortModalProps) {
  const [period, setPeriod] = useState<PeriodKey>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [report, setReport] = useState<UserTaskEffortReport | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    const range = period === 'custom' ? resolveCustom(customFrom, customTo) : resolvePeriod(period);
    if (period === 'custom' && !range.from && !range.to) return;
    let cancelled = false;
    setLoading(true);
    reportService.getUserTaskEffort(userId, range.from, range.to)
      .then(r => { if (!cancelled) setReport(r); })
      .catch(() => { if (!cancelled) setReport(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [userId, period, customFrom, customTo]);

  useEffect(() => { return load(); }, [load]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <AnimatePresence>
      <>
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
        />

        {/* Panel */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 16 }}
          transition={{ duration: 0.18 }}
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl z-[60] flex flex-col max-h-[88vh]"
          role="dialog"
          aria-modal="true"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <img
                src={avatarUrl(userName, userAvatar)}
                alt=""
                className="h-8 w-8 rounded-lg border border-gray-100 dark:border-gray-800 object-cover shrink-0"
              />
              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase tracking-widest text-gray-400">Effort Productivity</p>
                <h3 className="text-[15px] font-black text-gray-900 dark:text-white truncate">{userName}</h3>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <PeriodFilter
                period={period} setPeriod={setPeriod}
                customFrom={customFrom} setCustomFrom={setCustomFrom}
                customTo={customTo} setCustomTo={setCustomTo}
              />
              <button
                onClick={onClose}
                className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors ml-1"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-5">
            <TotalTab tasks={report?.tasks ?? []} loading={loading} />
          </div>
        </motion.div>
      </>
    </AnimatePresence>
  );
}

// ── Daily Utilization Section ─────────────────────────────────────────────────
const UTIL_MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

interface DailyUtilizationSectionProps {
  report: UserDailyUtilizationReport | null;
  loading: boolean;
  month: number;
  year: number;
  onMonthChange: (m: number) => void;
  onYearChange: (y: number) => void;
  isAdmin?: boolean;
  allUsers?: Array<{ id: number; name: string; role?: string }>;
  selectedUserId: number | null;
  onUserChange: (id: number | null) => void;
}

function DailyUtilizationSection({
  report, loading, month, year, onMonthChange, onYearChange,
  isAdmin, allUsers, selectedUserId, onUserChange,
}: DailyUtilizationSectionProps) {
  const [expanded, setExpanded] = useState(true);
  const now = new Date();
  const yearOptions = [now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2];
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const displayDays = report
    ? [...report.days].filter(d => d.date.slice(0, 10) <= todayStr).reverse()
    : [];

  const diaryTotal = Math.round(displayDays.reduce((s, d) => s + d.diaryHours, 0) * 10) / 10;
  const taskTotal  = Math.round(displayDays.reduce((s, d) => s + d.taskHours, 0) * 10) / 10;
  const totalLogged = Math.round(displayDays.reduce((s, d) => s + d.totalHours, 0) * 10) / 10;

  function barColor(item: DailyUtilizationItem) {
    if (!item.isWorkingDay) return 'bg-gray-200 dark:bg-gray-700';
    if (item.totalHours >= 8) return 'bg-emerald-500';
    if (item.totalHours >= 4) return 'bg-amber-400';
    if (item.totalHours > 0) return 'bg-rose-500';
    return 'bg-gray-200 dark:bg-gray-700';
  }

  return (
    <div className="space-y-3">
      {/* Section header + filters */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          onClick={() => setExpanded(e => !e)}
          className="text-sm font-black uppercase tracking-widest text-gray-400 flex items-center gap-2 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
        >
          <Target size={15} className="text-indigo-600" />
          Daily 8-Hour Utilization
          {loading && <span className="text-[10px] font-bold text-gray-400 normal-case tracking-normal">updating…</span>}
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && allUsers && (() => {
            const userOpts: SelectOption[] = [
              { value: 'none', label: 'Select User' },
              ...allUsers.map(u => ({ value: u.id, label: `${u.name}${u.role ? ` - ${u.role}` : ''}` })),
            ];
            return (
              <VSelect
                options={userOpts}
                value={selectedUserId ? (userOpts.find(o => o.value === selectedUserId) ?? null) : userOpts[0]}
                onChange={(opt) => onUserChange(opt && opt.value !== 'none' ? Number(opt.value) : null)}
                isSearchable
                placeholder="Select User"
                className="w-44"
              />
            );
          })()}
          <VSelect
            options={UTIL_MONTH_NAMES.map((name, i): SelectOption => ({ value: i + 1, label: name }))}
            value={{ value: month, label: UTIL_MONTH_NAMES[month - 1] }}
            onChange={opt => opt && onMonthChange(Number(opt.value))}
            isSearchable={false}
            size="sm"
            className="w-28"
          />
          <VSelect
            options={yearOptions.map((y): SelectOption => ({ value: y, label: String(y) }))}
            value={{ value: year, label: String(year) }}
            onChange={opt => opt && onYearChange(Number(opt.value))}
            isSearchable={false}
            size="sm"
            className="w-24"
          />
        </div>
      </div>

      {expanded && (
        <>
          {/* Summary pills */}
          {report && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {([
                { label: 'Working Days', val: String(report.totalWorkingDays), color: 'text-gray-600 dark:text-gray-300', bg: 'bg-gray-50 dark:bg-gray-900 border-gray-100 dark:border-gray-800' },
                { label: 'Days Complete', val: String(report.daysComplete), color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-100 dark:border-emerald-900/40' },
                { label: 'Days Partial', val: String(report.daysPartial), color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/40 border-amber-100 dark:border-amber-900/40' },
                { label: 'Total Hours', val: report.totalHoursLogged.toFixed(1) + 'h', color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-100 dark:border-indigo-900/40' },
              ] as const).map(pill => (
                <Card key={pill.label}>
                  <CardContent className="p-3 flex flex-col gap-0.5">
                    <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">{pill.label}</p>
                    <p className={`text-xl font-black font-mono ${pill.color}`}>{pill.val}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Per-day table */}
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              {loading ? (
                <div className="p-5"><RowSkeleton /></div>
              ) : !report || (isAdmin && !selectedUserId) ? (
                <div className="p-8 text-center text-[12px] text-gray-400 italic">
                  {isAdmin && !selectedUserId ? 'Select a user to view their daily utilization.' : 'No data available.'}
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="border-b border-gray-100 dark:border-gray-800">
                    <tr>
                      <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-widest text-gray-500 whitespace-nowrap">Date</th>
                      <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-widest text-gray-500 whitespace-nowrap">Day</th>
                      <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-widest text-blue-600 whitespace-nowrap">Diary Hrs</th>
                      <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-widest text-emerald-600 whitespace-nowrap">Task Hrs</th>
                      <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-widest text-indigo-600 whitespace-nowrap">Total</th>
                      <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-widest text-gray-400 whitespace-nowrap min-w-[120px]">Progress / 8h</th>
                      <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-widest text-gray-500 whitespace-nowrap">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-900">
                    {displayDays.map(item => {
                      const dateStr = item.date.slice(0, 10);
                      const isToday = dateStr === todayStr;
                      const barPct = Math.min(100, (item.totalHours / item.targetHours) * 100);
                      return (
                        <tr
                          key={item.date}
                          className={`transition-colors ${!item.isWorkingDay ? 'opacity-40' : 'hover:bg-gray-50/60 dark:hover:bg-gray-900/40'} ${isToday ? 'border-l-2 border-indigo-400' : ''}`}
                        >
                          <td className={`px-3 py-2.5 text-[12px] font-mono font-semibold whitespace-nowrap ${isToday ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-600 dark:text-gray-300'}`}>
                            {dateStr}
                          </td>
                          <td className="px-3 py-2.5 text-[11px] text-gray-500 dark:text-gray-400 whitespace-nowrap">{item.dayName}</td>
                          <td className="px-3 py-2.5 text-[12px] font-mono font-bold text-blue-600 dark:text-blue-400">
                            {item.isWorkingDay ? `${item.diaryHours.toFixed(1)}h` : '—'}
                          </td>
                          <td className="px-3 py-2.5 text-[12px] font-mono font-bold text-emerald-600 dark:text-emerald-400">
                            {item.isWorkingDay ? `${item.taskHours.toFixed(1)}h` : '—'}
                          </td>
                          <td className="px-3 py-2.5 text-[12px] font-mono font-bold text-indigo-600 dark:text-indigo-400">
                            {item.isWorkingDay ? `${item.totalHours.toFixed(1)}h` : '—'}
                          </td>
                          <td className="px-3 py-2.5 min-w-[120px]">
                            {item.isWorkingDay && (
                              <div className="flex items-center gap-1.5">
                                <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full transition-all ${barColor(item)}`} style={{ width: `${barPct}%` }} />
                                </div>
                                <span className="text-[10px] font-mono font-black text-gray-500 dark:text-gray-400 w-8 shrink-0">{Math.round(barPct)}%</span>
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            {!item.isWorkingDay ? (
                              <Badge variant="default" className="text-[9px] uppercase tracking-tight opacity-60">Non-Working</Badge>
                            ) : item.isComplete ? (
                              <Badge variant="success" className="text-[9px] uppercase tracking-tight">Complete</Badge>
                            ) : item.totalHours > 0 ? (
                              <Badge variant="warning" className="text-[9px] uppercase tracking-tight">Partial</Badge>
                            ) : (
                              <Badge variant="default" className="text-[9px] uppercase tracking-tight">No Hours</Badge>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="border-t-2 border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/30">
                    <tr>
                      <td colSpan={2} className="px-3 py-2.5 text-[10px] font-black uppercase tracking-widest text-gray-400">Month Total</td>
                      <td className="px-3 py-2.5 text-[12px] font-mono font-black text-blue-600 dark:text-blue-400">{diaryTotal.toFixed(1)}h</td>
                      <td className="px-3 py-2.5 text-[12px] font-mono font-black text-emerald-600 dark:text-emerald-400">{taskTotal.toFixed(1)}h</td>
                      <td className="px-3 py-2.5 text-[12px] font-mono font-black text-indigo-600 dark:text-indigo-400">{totalLogged.toFixed(1)}h</td>
                      <td colSpan={2} className="px-3 py-2.5 text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                        {displayDays.filter(d => d.isWorkingDay && d.isComplete).length} / {displayDays.filter(d => d.isWorkingDay).length} days complete
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ── Main Reports page ─────────────────────────────────────────────────────────
export default function Reports() {
  const { isAdmin, user: currentUser } = useAuth();
  const { users: allUsers, projects: allProjects } = useData();

  // Page-level period filter
  const [period, setPeriod] = useState<PeriodKey>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const [effortReport, setEffortReport] = useState<UserEffortReport | null>(null);
  const [effortLoading, setEffortLoading] = useState(false);

  const [transitionReport, setTransitionReport] = useState<UserTransitionReport | null>(null);
  const [transitionLoading, setTransitionLoading] = useState(false);

  const [sortKey, setSortKey] = useState<EffortSortKey>('productiveSeconds');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [expandedUserId, setExpandedUserId] = useState<number | null>(null);

  // ── Hours Summary state ───────────────────────────────────────────────────
  const [summary, setSummary] = useState<HoursSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryTab, setSummaryTab] = useState<'user' | 'task' | 'project'>('user');
  const [filterUserId, setFilterUserId] = useState<number | 'all'>('all');
  const [filterProjectId, setFilterProjectId] = useState<number | 'all'>('all');

  // ── Daily Utilization state ───────────────────────────────────────────────
  const _now = new Date();
  const [utilMonth, setUtilMonth] = useState(_now.getMonth() + 1);
  const [utilYear, setUtilYear] = useState(_now.getFullYear());
  const [utilReport, setUtilReport] = useState<UserDailyUtilizationReport | null>(null);
  const [utilLoading, setUtilLoading] = useState(false);
  const [utilUserId, setUtilUserId] = useState<number | null>(null);

  // Modal — for non-admins, auto-open on their own id immediately
  const [modalUser, setModalUser] = useState<{ id: number; name: string; avatar?: string } | null>(
    !isAdmin && currentUser ? { id: currentUser.id, name: currentUser.name, avatar: currentUser.avatar } : null
  );

  // Admins load all data; non-admins skip
  useEffect(() => {
    if (!isAdmin) return;
    const range = period === 'custom' ? resolveCustom(customFrom, customTo) : resolvePeriod(period);
    if (period === 'custom' && !range.from && !range.to) return;
    let cancelled = false;

    setEffortLoading(true);
    reportService.getUserEffortReport(range.from, range.to)
      .then(r => { if (!cancelled) setEffortReport(r); })
      .catch(() => { if (!cancelled) setEffortReport(null); })
      .finally(() => { if (!cancelled) setEffortLoading(false); });

    setTransitionLoading(true);
    reportService.getUserTransitionReport(range.from, range.to)
      .then(r => { if (!cancelled) setTransitionReport(r); })
      .catch(() => { if (!cancelled) setTransitionReport(null); })
      .finally(() => { if (!cancelled) setTransitionLoading(false); });

    return () => { cancelled = true; };
  }, [isAdmin, period, customFrom, customTo]);

  // Hours summary — re-fetches when period OR filters change
  useEffect(() => {
    if (!isAdmin) return;
    const range = period === 'custom' ? resolveCustom(customFrom, customTo) : resolvePeriod(period);
    if (period === 'custom' && !range.from && !range.to) return;
    let cancelled = false;
    setSummaryLoading(true);
    reportService.getHoursSummary(
      range.from, range.to,
      filterUserId !== 'all' ? filterUserId : undefined,
      filterProjectId !== 'all' ? filterProjectId : undefined,
    )
      .then(r => { if (!cancelled) setSummary(r); })
      .catch(() => { if (!cancelled) setSummary(null); })
      .finally(() => { if (!cancelled) setSummaryLoading(false); });
    return () => { cancelled = true; };
  }, [isAdmin, period, customFrom, customTo, filterUserId, filterProjectId]);

  // Daily utilization — load for current user (non-admin) or selected user (admin)
  useEffect(() => {
    const targetId = isAdmin ? utilUserId : (currentUser?.id ?? null);
    if (!targetId) return;
    let cancelled = false;
    setUtilLoading(true);
    reportService.getDailyUtilization(targetId, utilMonth, utilYear)
      .then(r => { if (!cancelled) setUtilReport(r); })
      .catch(() => { if (!cancelled) setUtilReport(null); })
      .finally(() => { if (!cancelled) setUtilLoading(false); });
    return () => { cancelled = true; };
  }, [isAdmin, currentUser, utilUserId, utilMonth, utilYear]);

  function handleSort(key: EffortSortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  }

  const sortedEffort: UserEffortReportItem[] = effortReport
    ? [...effortReport.users].sort((a, b) =>
        sortDir === 'desc' ? b[sortKey] - a[sortKey] : a[sortKey] - b[sortKey])
    : [];

  // ── Non-admin: show only own productivity card ───────────────────────────
  if (!isAdmin) {
    return (
      <PageTransition>
        <div className="space-y-6">
          {/* Page header */}
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/40 flex items-center justify-center">
              <BarChart2 size={18} className="text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h1 className="text-lg font-black uppercase tracking-tighter text-gray-900 dark:text-white">My Productivity</h1>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">Your personal effort and task time breakdown</p>
            </div>
          </div>

          {/* Personal card — click to open own modal */}
          {currentUser && (
            <Card>
              <CardContent className="p-5">
                <button
                  onClick={() => setModalUser({ id: currentUser.id, name: currentUser.name, avatar: currentUser.avatar })}
                  className="w-full flex items-center gap-4 group text-left"
                >
                  <img
                    src={avatarUrl(currentUser.name, currentUser.avatar)}
                    alt=""
                    className="h-12 w-12 rounded-xl border border-gray-100 dark:border-gray-800 object-cover shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-black text-gray-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors truncate">
                      {currentUser.name}
                    </p>
                    <p className="text-[11px] text-gray-400">{currentUser.role}</p>
                  </div>
                  <div className="shrink-0 px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/40 text-[11px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400 group-hover:bg-indigo-100 dark:group-hover:bg-indigo-900/60 transition-colors">
                    View Effort
                  </div>
                </button>
              </CardContent>
            </Card>
          )}

          {/* Daily 8-Hour Utilization */}
          <DailyUtilizationSection
            report={utilReport}
            loading={utilLoading}
            month={utilMonth}
            year={utilYear}
            onMonthChange={setUtilMonth}
            onYearChange={setUtilYear}
            selectedUserId={currentUser?.id ?? null}
            onUserChange={() => {}}
          />
        </div>

        {/* Own effort modal */}
        {modalUser && (
          <UserEffortModal
            userId={modalUser.id}
            userName={modalUser.name}
            userAvatar={modalUser.avatar}
            onClose={() => setModalUser(null)}
          />
        )}
      </PageTransition>
    );
  }

  // ── Admin: full multi-user tables ────────────────────────────────────────
  return (
    <PageTransition>
      <div className="space-y-6">
        {/* Page header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/40 flex items-center justify-center">
              <BarChart2 size={18} className="text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h1 className="text-lg font-black uppercase tracking-tighter text-gray-900 dark:text-white">Reports</h1>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">User-wise effort and activity breakdown</p>
            </div>
          </div>
          <PeriodFilter
            period={period} setPeriod={setPeriod}
            customFrom={customFrom} setCustomFrom={setCustomFrom}
            customTo={customTo} setCustomTo={setCustomTo}
          />
        </div>

        {/* ── Working Hours Summary ── */}
        <div className="space-y-3">
          {/* Section header + filters */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-black uppercase tracking-widest text-gray-400 flex items-center gap-2">
              <TrendingUp size={15} className="text-indigo-600" />
              Working Hours Summary
              {summaryLoading && <span className="text-[10px] font-bold text-gray-400 normal-case tracking-normal">updating…</span>}
            </h2>
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2">
              {(() => {
                const userOpts: SelectOption[] = [{ value: 'all', label: 'All Users' }, ...allUsers.map(u => ({ value: u.id, label: `${u.name} - ${u.role}` }))];
                return (
                  <VSelect
                    options={userOpts}
                    value={userOpts.find(o => o.value === filterUserId) ?? null}
                    onChange={(opt) => setFilterUserId(!opt || opt.value === 'all' ? 'all' : Number(opt.value))}
                    isSearchable
                    placeholder="All Users"
                    className="w-40"
                  />
                );
              })()}
              {(() => {
                const projectOpts: SelectOption[] = [{ value: 'all', label: 'All Projects' }, ...allProjects.map(p => ({ value: p.id, label: p.name }))];
                return (
                  <VSelect
                    options={projectOpts}
                    value={projectOpts.find(o => o.value === filterProjectId) ?? null}
                    onChange={(opt) => setFilterProjectId(!opt || opt.value === 'all' ? 'all' : Number(opt.value))}
                    isSearchable
                    placeholder="All Projects"
                    className="w-44"
                  />
                );
              })()}
            </div>
          </div>

          {/* Headline cards */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Total Working Hours', val: summaryLoading ? '—' : formatSeconds(summary?.totalWorkingSeconds ?? 0), icon: Clock, color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-100 dark:border-indigo-900/40' },
              { label: 'Total Productive Hours', val: summaryLoading ? '—' : formatSeconds(summary?.totalProductiveSeconds ?? 0), icon: Zap, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-100 dark:border-emerald-900/40' },
            ].map(c => (
              <Card key={c.label} className="h-full">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className={`h-10 w-10 rounded-lg flex items-center justify-center border ${c.bg}`}>
                      <c.icon size={18} className={c.color} />
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{c.label}</p>
                      <p className={`text-xl font-black font-mono ${c.color}`}>{c.val}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Sub-tab bar */}
          <div className="flex gap-0 border-b border-gray-100 dark:border-gray-800">
            {([
              { key: 'user',    label: 'By User',    icon: Users },
              { key: 'task',    label: 'By Task',    icon: ListTodo },
              { key: 'project', label: 'By Project', icon: Briefcase },
            ] as const).map(t => (
              <button key={t.key} onClick={() => setSummaryTab(t.key)}
                className={`flex items-center gap-1.5 py-2 px-4 text-[11px] font-black uppercase tracking-widest border-b-2 transition-colors ${summaryTab === t.key ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}>
                <t.icon size={12} />{t.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              {summaryLoading ? (
                <div className="p-5"><RowSkeleton /></div>
              ) : !summary || (summaryTab === 'user' && summary.byUser.length === 0) || (summaryTab === 'task' && summary.byTask.length === 0) || (summaryTab === 'project' && summary.byProject.length === 0) ? (
                <div className="p-8 text-center text-[12px] text-gray-400 italic">No data for the selected filters and period.</div>
              ) : summaryTab === 'user' ? (
                <table className="w-full text-sm">
                  <thead className="border-b border-gray-100 dark:border-gray-800">
                    <tr>
                      <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-widest text-gray-500">User</th>
                      <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-widest text-gray-500">Tasks</th>
                      <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-widest text-emerald-600">Productive</th>
                      <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-widest text-amber-600">Paused</th>
                      <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-widest text-rose-600">Blocked</th>
                      <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-widest text-purple-600">Review</th>
                      <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-widest text-gray-500">Total</th>
                      <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-widest text-gray-400">%&nbsp;Productive</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-900">
                    {summary.byUser.map(u => {
                      const pct = u.totalSeconds > 0 ? Math.round((u.productiveSeconds / u.totalSeconds) * 100) : 0;
                      return (
                        <tr key={u.userId} className="hover:bg-gray-50/60 dark:hover:bg-gray-900/40 transition-colors">
                          <td className="px-3 py-2.5">
                            <button onClick={() => setModalUser({ id: u.userId, name: u.userName, avatar: u.avatarUrl })} className="flex items-center gap-2 group text-left">
                              <img src={avatarUrl(u.userName, u.avatarUrl)} alt="" className="h-6 w-6 rounded border border-gray-100 dark:border-gray-800 object-cover shrink-0" />
                              <span className="text-[13px] font-semibold text-gray-700 dark:text-gray-200 truncate max-w-[130px] group-hover:text-indigo-600 underline underline-offset-2 decoration-dotted">{u.userName}</span>
                            </button>
                          </td>
                          <td className="px-3 py-2.5 text-[12px] font-mono font-bold text-gray-500">{u.taskCount}</td>
                          <td className="px-3 py-2.5 text-[12px] font-mono font-bold text-emerald-600 dark:text-emerald-400">{formatSeconds(u.productiveSeconds)}</td>
                          <td className="px-3 py-2.5 text-[12px] font-mono font-bold text-amber-600 dark:text-amber-400">{formatSeconds(u.pausedSeconds)}</td>
                          <td className="px-3 py-2.5 text-[12px] font-mono font-bold text-rose-600 dark:text-rose-400">{formatSeconds(u.blockedSeconds)}</td>
                          <td className="px-3 py-2.5 text-[12px] font-mono font-bold text-purple-600 dark:text-purple-400">{formatSeconds(u.underReviewSeconds)}</td>
                          <td className="px-3 py-2.5 text-[12px] font-mono font-bold text-gray-500 dark:text-gray-400">{formatSeconds(u.totalSeconds)}</td>
                          <td className="px-3 py-2.5 min-w-[100px]">
                            <div className="flex items-center gap-1.5">
                              <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-[10px] font-mono font-black text-emerald-600 dark:text-emerald-400 w-8 shrink-0">{pct}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : summaryTab === 'task' ? (
                <table className="w-full text-sm">
                  <thead className="border-b border-gray-100 dark:border-gray-800">
                    <tr>
                      <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-widest text-gray-500">Task</th>
                      <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-widest text-gray-500">Project</th>
                      <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-widest text-gray-500">Status</th>
                      <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-widest text-emerald-600">Productive</th>
                      <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-widest text-amber-600">Paused</th>
                      <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-widest text-rose-600">Blocked</th>
                      <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-widest text-purple-600">Review</th>
                      <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-widest text-gray-500">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-900">
                    {summary.byTask.map(t => (
                      <tr key={t.taskId} className="hover:bg-gray-50/60 dark:hover:bg-gray-900/40 transition-colors">
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {t.taskCode && <span className="text-[9px] font-black font-mono text-gray-400 shrink-0">{t.taskCode}</span>}
                            <span className="text-[12px] font-semibold text-gray-700 dark:text-gray-200 truncate max-w-[180px]">{t.taskTitle}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-[11px] text-gray-500 dark:text-gray-400 truncate max-w-[120px]">{t.projectName}</td>
                        <td className="px-3 py-2.5">
                          <Badge variant={STATUS_BADGE_VARIANT[t.taskStatus] ?? 'default'} className="text-[9px] uppercase tracking-tight">
                            {STATUS_LABELS[t.taskStatus] ?? t.taskStatus}
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5 text-[12px] font-mono font-bold text-emerald-600 dark:text-emerald-400">{formatSeconds(t.productiveSeconds)}</td>
                        <td className="px-3 py-2.5 text-[12px] font-mono font-bold text-amber-600 dark:text-amber-400">{formatSeconds(t.pausedSeconds)}</td>
                        <td className="px-3 py-2.5 text-[12px] font-mono font-bold text-rose-600 dark:text-rose-400">{formatSeconds(t.blockedSeconds)}</td>
                        <td className="px-3 py-2.5 text-[12px] font-mono font-bold text-purple-600 dark:text-purple-400">{formatSeconds(t.underReviewSeconds)}</td>
                        <td className="px-3 py-2.5 text-[12px] font-mono font-bold text-gray-500 dark:text-gray-400">{formatSeconds(t.totalSeconds)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table className="w-full text-sm">
                  <thead className="border-b border-gray-100 dark:border-gray-800">
                    <tr>
                      <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-widest text-gray-500">Project</th>
                      <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-widest text-gray-500">Tasks</th>
                      <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-widest text-gray-500">Users</th>
                      <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-widest text-emerald-600">Productive</th>
                      <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-widest text-amber-600">Paused</th>
                      <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-widest text-rose-600">Blocked</th>
                      <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-widest text-purple-600">Review</th>
                      <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-widest text-gray-500">Total</th>
                      <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-widest text-gray-400">%&nbsp;Productive</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-900">
                    {summary.byProject.map(p => {
                      const pct = p.totalSeconds > 0 ? Math.round((p.productiveSeconds / p.totalSeconds) * 100) : 0;
                      return (
                        <tr key={p.projectId} className="hover:bg-gray-50/60 dark:hover:bg-gray-900/40 transition-colors">
                          <td className="px-3 py-2.5 text-[13px] font-semibold text-gray-700 dark:text-gray-200 max-w-[180px] truncate">{p.projectName}</td>
                          <td className="px-3 py-2.5 text-[12px] font-mono font-bold text-gray-500">{p.taskCount}</td>
                          <td className="px-3 py-2.5 text-[12px] font-mono font-bold text-gray-500">{p.userCount}</td>
                          <td className="px-3 py-2.5 text-[12px] font-mono font-bold text-emerald-600 dark:text-emerald-400">{formatSeconds(p.productiveSeconds)}</td>
                          <td className="px-3 py-2.5 text-[12px] font-mono font-bold text-amber-600 dark:text-amber-400">{formatSeconds(p.pausedSeconds)}</td>
                          <td className="px-3 py-2.5 text-[12px] font-mono font-bold text-rose-600 dark:text-rose-400">{formatSeconds(p.blockedSeconds)}</td>
                          <td className="px-3 py-2.5 text-[12px] font-mono font-bold text-purple-600 dark:text-purple-400">{formatSeconds(p.underReviewSeconds)}</td>
                          <td className="px-3 py-2.5 text-[12px] font-mono font-bold text-gray-500 dark:text-gray-400">{formatSeconds(p.totalSeconds)}</td>
                          <td className="px-3 py-2.5 min-w-[100px]">
                            <div className="flex items-center gap-1.5">
                              <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-[10px] font-mono font-black text-emerald-600 dark:text-emerald-400 w-8 shrink-0">{pct}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Section 1: User Effort Summary */}
        <div className="space-y-3">
          <h2 className="text-sm font-black uppercase tracking-widest text-gray-400 flex items-center gap-2">
            <Activity size={15} className="text-indigo-600" />
            User Effort Summary
            {effortLoading && <span className="text-[10px] font-bold text-gray-400 normal-case tracking-normal">updating…</span>}
          </h2>
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              {effortLoading ? (
                <div className="p-5"><RowSkeleton /></div>
              ) : !effortReport || effortReport.users.length === 0 ? (
                <div className="p-8 text-center text-[12px] text-gray-400 italic">No effort data recorded for this period.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="border-b border-gray-100 dark:border-gray-800">
                    <tr>
                      <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-widest text-gray-500 whitespace-nowrap">User</th>
                      <SortableTh label="Tasks" sortKey="taskCount" current={sortKey} dir={sortDir} onSort={handleSort} />
                      <SortableTh label="Productive" sortKey="productiveSeconds" current={sortKey} dir={sortDir} onSort={handleSort} />
                      <SortableTh label="Paused" sortKey="pausedSeconds" current={sortKey} dir={sortDir} onSort={handleSort} />
                      <SortableTh label="Blocked" sortKey="blockedSeconds" current={sortKey} dir={sortDir} onSort={handleSort} />
                      <SortableTh label="Under Review" sortKey="underReviewSeconds" current={sortKey} dir={sortDir} onSort={handleSort} />
                      <SortableTh label="Total" sortKey="totalElapsedSeconds" current={sortKey} dir={sortDir} onSort={handleSort} />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-900">
                    {sortedEffort.map(u => (
                      <tr key={u.userId} className="hover:bg-gray-50/60 dark:hover:bg-gray-900/40 transition-colors">
                        <td className="px-3 py-2.5">
                          <button
                            onClick={() => setModalUser({ id: u.userId, name: u.userName, avatar: u.avatarUrl })}
                            className="flex items-center gap-2 group text-left"
                            title={`View ${u.userName}'s task breakdown`}
                          >
                            <img
                              src={avatarUrl(u.userName, u.avatarUrl)}
                              alt=""
                              className="h-6 w-6 rounded border border-gray-100 dark:border-gray-800 object-cover shrink-0"
                            />
                            <span className="text-[13px] font-semibold text-gray-700 dark:text-gray-200 truncate max-w-[140px] group-hover:text-indigo-600 dark:group-hover:text-indigo-400 underline underline-offset-2 decoration-dotted decoration-gray-300 dark:decoration-gray-600 group-hover:decoration-indigo-400 transition-colors">
                              {u.userName}
                            </span>
                          </button>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="text-[12px] font-mono font-bold text-gray-600 dark:text-gray-300">{u.taskCount}</span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="text-[12px] font-mono font-bold text-emerald-600 dark:text-emerald-400">{formatSeconds(u.productiveSeconds)}</span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="text-[12px] font-mono font-bold text-amber-600 dark:text-amber-400">{formatSeconds(u.pausedSeconds)}</span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="text-[12px] font-mono font-bold text-rose-600 dark:text-rose-400">{formatSeconds(u.blockedSeconds)}</span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="text-[12px] font-mono font-bold text-purple-600 dark:text-purple-400">{formatSeconds(u.underReviewSeconds)}</span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="text-[12px] font-mono font-bold text-gray-500 dark:text-gray-400">{formatSeconds(u.totalElapsedSeconds)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Section 2: Status Transitions by Assignee */}
        <div className="space-y-3">
          <h2 className="text-sm font-black uppercase tracking-widest text-gray-400 flex items-center gap-2">
            <Activity size={15} className="text-indigo-600" />
            Status Transitions by Assignee
            {transitionLoading && <span className="text-[10px] font-bold text-gray-400 normal-case tracking-normal">updating…</span>}
          </h2>
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              {transitionLoading ? (
                <div className="p-5"><RowSkeleton /></div>
              ) : !transitionReport || transitionReport.users.length === 0 ? (
                <div className="p-8 text-center text-[12px] text-gray-400 italic">No transitions recorded for this period.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="border-b border-gray-100 dark:border-gray-800">
                    <tr>
                      <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-widest text-gray-500 whitespace-nowrap">User</th>
                      <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-widest text-gray-500 whitespace-nowrap">Total</th>
                      <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-widest text-gray-500 whitespace-nowrap">Most Common</th>
                      <th className="px-3 py-2 w-10" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-900">
                    {transitionReport.users.map(u => (
                      <React.Fragment key={u.userId}>
                        <tr className="hover:bg-gray-50/60 dark:hover:bg-gray-900/40 transition-colors">
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              <img
                                src={avatarUrl(u.userName, u.avatarUrl)}
                                alt=""
                                className="h-6 w-6 rounded border border-gray-100 dark:border-gray-800 object-cover shrink-0"
                              />
                              <span className="text-[13px] font-semibold text-gray-700 dark:text-gray-200 truncate max-w-[140px]">{u.userName}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="text-[12px] font-mono font-bold text-gray-700 dark:text-gray-200">{u.totalTransitions}</span>
                          </td>
                          <td className="px-3 py-2.5">
                            {u.mostCommonTransition
                              ? <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">{u.mostCommonTransition}</span>
                              : <span className="text-[11px] text-gray-300 dark:text-gray-600 italic">—</span>}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <button
                              onClick={() => setExpandedUserId(prev => prev === u.userId ? null : u.userId)}
                              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-indigo-600 transition-colors"
                            >
                              {expandedUserId === u.userId ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </button>
                          </td>
                        </tr>
                        {expandedUserId === u.userId && u.breakdown.length > 0 && (
                          <tr>
                            <td colSpan={4} className="px-6 pb-3 pt-1 bg-gray-50/60 dark:bg-gray-900/30">
                              <div className="flex flex-wrap gap-2">
                                {u.breakdown.map((t, i) => (
                                  <div key={i} className="flex items-center gap-1.5 text-[11px]">
                                    <Badge variant={STATUS_BADGE_VARIANT[t.fromStatus as Status] ?? 'default'} className="text-[9px] uppercase tracking-tight">
                                      {STATUS_LABELS[t.fromStatus as Status] ?? t.fromStatus}
                                    </Badge>
                                    <span className="text-gray-400">→</span>
                                    <Badge variant={STATUS_BADGE_VARIANT[t.toStatus as Status] ?? 'default'} className="text-[9px] uppercase tracking-tight">
                                      {STATUS_LABELS[t.toStatus as Status] ?? t.toStatus}
                                    </Badge>
                                    <span className="font-mono font-black text-gray-600 dark:text-gray-300">×{t.count}</span>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Section 3: Daily 8-Hour Utilization */}
        <DailyUtilizationSection
          report={utilReport}
          loading={utilLoading}
          month={utilMonth}
          year={utilYear}
          onMonthChange={setUtilMonth}
          onYearChange={setUtilYear}
          isAdmin={isAdmin}
          allUsers={allUsers}
          selectedUserId={utilUserId}
          onUserChange={setUtilUserId}
        />
      </div>

      {/* User Effort Modal */}
      {modalUser && (
        <UserEffortModal
          userId={modalUser.id}
          userName={modalUser.name}
          userAvatar={modalUser.avatar}
          onClose={() => setModalUser(null)}
        />
      )}
    </PageTransition>
  );
}
