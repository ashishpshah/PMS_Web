import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { formatDateTime, formatSeconds, toHHMM } from '../lib/utils';
import { Card, CardContent } from '../components/ui/Card';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { DashboardSkeleton } from '../components/skeletons/DashboardSkeleton';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { Folder, CheckCircle2, Users, ClipboardCheck, ShieldAlert, UserCheck, Calendar, Clock, Zap, Activity, PauseCircle, Trophy, BookOpen, XCircle, BarChart2, ChevronRight, X, ChevronLeft, Briefcase, TrendingUp, LayoutDashboard } from 'lucide-react';
import { InteractiveLink } from '../components/ui/InteractiveLink';
import { Badge } from '../components/ui/Badge';
import { PageTransition } from '../components/Layout/PageTransition';
import { ReassignModal } from '../components/ui/ReassignModal';
import { DateInput } from '../components/ui/DateInput';
import { VSelect, SelectOption } from '../components/forms/VSelect';
import {
  ReasonTag, BLOCK_REASON_TAGS, STATUS_BADGE_VARIANT, STATUS_LABELS, DashboardEffort, DashboardStats,
  PROJECT_STATUSES, PROJECT_STATUS_LABELS, PROJECT_STATUS_BADGE_VARIANT, AtRiskData, Task, Status,
  UserTaskEffortReport, UserTaskEffortItem,
  UserDailyEffortReport, HoursSummary,
} from '../types';
import { taskService } from '../services/task.service';
import { dashboardService } from '../services/dashboard.service';
import { diaryService, WorkDiaryEntry } from '../services/diary.service';
import { reportService } from '../services/report.service';
import { PeriodKey, PERIOD_OPTIONS, resolvePeriod, resolveCustom } from '../lib/dateRanges';
import { showSuccess, showError } from '../lib/toast';
import { BlockIssueDialog } from '../components/BlockIssueDialog';
import { AtRiskWidget } from '../components/dashboard/AtRiskWidget';
import { ProjectTimelineBars } from '../components/dashboard/ProjectTimelineBars';
import { paginate, DashboardPaginationBar, DASHBOARD_PAGE_SIZE } from '../components/dashboard/DashboardPaginationBar';
import { motion, AnimatePresence } from 'motion/react';

// Local (not UTC) yyyy-mm-dd so "today"/"yesterday" match the user's calendar day.
const ymdLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
// Present a yyyy-mm-dd string as dd-mm-yyyy for the badge label.
const dmy = (s: string) => { const [y, m, d] = s.split('-'); return `${d}-${m}-${y}`; };

// ════════════════════════════════════════════════════════════════════════════
// Reports content, mirrored verbatim from ClientApp/src/pages/Reports.tsx so
// /dashboard shows the exact same Working Hours Summary / User Effort Summary /
// Status Transitions / Daily 8-Hour Utilization content at the top of the page.
// Reports.tsx itself is untouched — /reports keeps working exactly as before.
// Everything below (down to the "── end Reports content ──" marker) is a
// same-to-same copy; only names that collided with Dashboard's own existing
// state were prefixed with `reports`/`Reports`.
// ════════════════════════════════════════════════════════════════════════════

function reportsAvatarUrl(name: string, url?: string) {
  return url || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`;
}

function ReportsRowSkeleton() {
  return (
    <div className="space-y-2 animate-pulse">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="h-10 bg-gray-100 dark:bg-gray-800 rounded-lg" />
      ))}
    </div>
  );
}

// ── Period filter select (reused in both page and modal) ─────────────────────
interface ReportsPeriodFilterProps {
  period: PeriodKey;
  setPeriod: (p: PeriodKey) => void;
  customFrom: string;
  setCustomFrom: (v: string) => void;
  customTo: string;
  setCustomTo: (v: string) => void;
}
function ReportsPeriodFilter({ period, setPeriod, customFrom, setCustomFrom, customTo, setCustomTo }: ReportsPeriodFilterProps) {
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
function ReportsEffortPills({ prod, paused, blocked, review, tasks }: { prod: number; paused: number; blocked: number; review: number; tasks: number }) {
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
function ReportsTotalTab({ tasks, loading }: { tasks: UserTaskEffortItem[]; loading: boolean }) {
  const maxProd = tasks.length > 0 ? Math.max(...tasks.map(t => t.productiveSeconds), 1) : 1;
  if (loading) return <ReportsRowSkeleton />;
  if (tasks.length === 0) return (
    <div className="py-12 text-center text-[12px] text-gray-400 italic flex flex-col items-center gap-2">
      <Clock size={28} className="text-gray-200 dark:text-gray-700" />
      No effort recorded for this period.
    </div>
  );
  return (
    <div className="space-y-3">
      <ReportsEffortPills
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
function ReportsDateWiseTab({ userId, period, customFrom, customTo }: { userId: number; period: PeriodKey; customFrom: string; customTo: string }) {
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

  if (loading) return <ReportsRowSkeleton />;
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
          <ReportsEffortPills
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
interface ReportsUserEffortModalProps {
  userId: number;
  userName: string;
  userAvatar?: string;
  onClose: () => void;
}
function ReportsUserEffortModal({ userId, userName, userAvatar, onClose }: ReportsUserEffortModalProps) {
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
                src={reportsAvatarUrl(userName, userAvatar)}
                alt=""
                className="h-8 w-8 rounded-lg border border-gray-100 dark:border-gray-800 object-cover shrink-0"
              />
              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase tracking-widest text-gray-400">Effort Productivity</p>
                <h3 className="text-[15px] font-black text-gray-900 dark:text-white truncate">{userName}</h3>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <ReportsPeriodFilter
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
            <ReportsTotalTab tasks={report?.tasks ?? []} loading={loading} />
          </div>
        </motion.div>
      </>
    </AnimatePresence>
  );
}

// ── end Reports content helper components ─────────────────────────────────────

export default function Dashboard() {
  const { projects, users, assignableUsers, loading, reassignTask } = useData();
  const { isAdmin, isSystemAdmin, user: currentUser } = useAuth();
  const [reassigningTaskId, setReassigningTaskId] = useState<number | null>(null);

  // ── Pagination state — only for cards that keep pagination. Assigned to Me /
  // Overdue & Upcoming Deadlines / Created by Me / Recent Tasks / Blocked Tasks
  // show only their top/latest 10 (no pagination) per explicit request.
  const [whUserPage, setWhUserPage] = useState(1);
  const [whProjectPage, setWhProjectPage] = useState(1);
  const [activeProjectsPage, setActiveProjectsPage] = useState(1);
  const [diaryTeamPage, setDiaryTeamPage] = useState(1);

  // ════════════════════════════════════════════════════════════════════════
  // Reports content state — mirrors ClientApp/src/pages/Reports.tsx's own
  // Reports() component state verbatim. Runs its own independent period/user/
  // project filters, separate from the shared DashboardFilterBar below.
  // ════════════════════════════════════════════════════════════════════════
  // Default to "Today" scoped to the logged-in user — except System Admin, who
  // defaults to "All time" / "All users" (matching the previous behavior for that role only).
  const [reportsPeriod, setReportsPeriod] = useState<PeriodKey>(isSystemAdmin ? 'all' : 'today');
  const [reportsCustomFrom, setReportsCustomFrom] = useState('');
  const [reportsCustomTo, setReportsCustomTo] = useState('');

  // ── Hours Summary state ───────────────────────────────────────────────────
  const [summary, setSummary] = useState<HoursSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryTab, setSummaryTab] = useState<'user' | 'project'>('user');
  const [reportsFilterUserId, setReportsFilterUserId] = useState<number | 'all'>(
    isSystemAdmin ? 'all' : (currentUser?.id ?? 'all')
  );
  const [filterProjectId, setFilterProjectId] = useState<number | 'all'>('all');

  // Modal — for non-admins, auto-open on their own id immediately
  const [modalUser, setModalUser] = useState<{ id: number; name: string; avatar?: string } | null>(
    !isAdmin && currentUser ? { id: currentUser.id, name: currentUser.name, avatar: currentUser.avatar } : null
  );

  // Hours summary — re-fetches when period OR filters change
  useEffect(() => {
    if (!isAdmin) return;
    const range = reportsPeriod === 'custom' ? resolveCustom(reportsCustomFrom, reportsCustomTo) : resolvePeriod(reportsPeriod);
    if (reportsPeriod === 'custom' && !range.from && !range.to) return;
    let cancelled = false;
    setSummaryLoading(true);
    reportService.getHoursSummary(
      range.from, range.to,
      reportsFilterUserId !== 'all' ? reportsFilterUserId : undefined,
      filterProjectId !== 'all' ? filterProjectId : undefined,
    )
      .then(r => { if (!cancelled) setSummary(r); })
      .catch(() => { if (!cancelled) setSummary(null); })
      .finally(() => { if (!cancelled) setSummaryLoading(false); });
    return () => { cancelled = true; };
  }, [isAdmin, reportsPeriod, reportsCustomFrom, reportsCustomTo, reportsFilterUserId, filterProjectId]);

  // ── end Reports content state ─────────────────────────────────────────────

  // ── Role-wise + date-range scoping (drives Task Distribution, Project Status,
  // Effort, Breakdown Matrix, Recent/Blocked Tasks). The filter bar UI that used
  // to control these was removed — non-admins are always scoped to themselves,
  // admins always see all users/all time (defaults below). "My Work" boxes
  // (Assigned to Me / Created by Me / My Deadlines) intentionally stay tied to
  // the logged-in user regardless of this — "My" shouldn't show someone else's
  // data. At-risk / timeline widgets apply the user dimension only, not the
  // date range (they're current-state snapshots, not historical).
  const [filterUserId] = useState<number | null>(null); // admin scope; null = "All Users"
  const scopedUserId: number | null = isAdmin ? filterUserId : (currentUser?.id ?? null);

  const [period] = useState<PeriodKey>('all');
  const [customFrom] = useState('');
  const [customTo] = useState('');
  const range = period === 'custom' ? resolveCustom(customFrom, customTo) : resolvePeriod(period);
  const rangeReady = !(period === 'custom' && !range.from && !range.to);

  const [effortStats, setEffortStats] = useState<DashboardEffort | null>(null);
  const [effortLoading, setEffortLoading] = useState(false);

  // ── Dashboard stats (all 7 statuses + Section 10 metrics), role + date scoped ─
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);

  // ── Safe computed stats — never throw if dashboardStats is null ────────────
  const safeDashboardStats = useMemo(() => ({
    totalProjects: dashboardStats?.totalProjects ?? 0,
    totalTasks: dashboardStats?.totalTasks ?? 0,
    completedTasks: dashboardStats?.completedTasks ?? 0,
    tasksByStatus: dashboardStats?.tasksByStatus ?? [],
  }), [dashboardStats]);
  useEffect(() => {
    if (!rangeReady) return;
    let cancelled = false;
    dashboardService.getStats(scopedUserId ?? undefined, range.from, range.to)
      .then(s => { if (!cancelled) setDashboardStats(s); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [scopedUserId, range.from, range.to, rangeReady]);

  useEffect(() => {
    if (!rangeReady) return;
    let cancelled = false;
    setEffortLoading(true);
    dashboardService.getEffortStats(range.from, range.to, scopedUserId ?? undefined)
      .then(s => { if (!cancelled) setEffortStats(s); })
      .catch(() => { if (!cancelled) setEffortStats(null); })
      .finally(() => { if (!cancelled) setEffortLoading(false); });
    return () => { cancelled = true; };
  }, [scopedUserId, range.from, range.to, rangeReady]);

  // ── At-risk snapshot: user-scoped only, not date-range filtered ────────────
  const [atRisk, setAtRisk] = useState<AtRiskData | null>(null);
  const [atRiskLoading, setAtRiskLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    setAtRiskLoading(true);
    dashboardService.getAtRisk(scopedUserId ?? undefined)
      .then(d => { if (!cancelled) setAtRisk(d); })
      .catch(() => { if (!cancelled) setAtRisk(null); })
      .finally(() => { if (!cancelled) setAtRiskLoading(false); });
    return () => { cancelled = true; };
  }, [scopedUserId]);

  // ── Dashboard's own scoped task fetching. DataContext.tasks is dead (always
  // []), so every task-row section here fetches directly instead of relying on
  // it — this also fixes those sections rather than depending on a wider fix.
  const [myAssignedTasks, setMyAssignedTasks] = useState<Task[]>([]);
  const [myCreatedTasks, setMyCreatedTasks] = useState<Task[]>([]);
  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;
    Promise.all([
      taskService.getAll({ assigneeId: currentUser.id }, 1, 50),
      taskService.getAll({ createdById: currentUser.id }, 1, 50),
    ])
      .then(([assigned, created]) => {
        if (cancelled) return;
        setMyAssignedTasks(assigned.tasks);
        setMyCreatedTasks(created.tasks);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [currentUser?.id]);

  // Recent Tasks + Blocked Tasks lists — scoped by the shared filter's user
  // dimension (assignee), unscoped org-wide when admin selects "All Users".
  const [scopedRecentTasks, setScopedRecentTasks] = useState<Task[]>([]);
  const [scopedBlockedTasks, setScopedBlockedTasks] = useState<Task[]>([]);
  const [scopedTasksLoading, setScopedTasksLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    setScopedTasksLoading(true);
    const base = scopedUserId != null ? { assigneeId: scopedUserId } : {};
    Promise.all([
      taskService.getAll(base, 1, 10),
      taskService.getAll({ ...base, status: 'blocked' }, 1, 10),
    ])
      .then(([recent, blocked]) => {
        if (cancelled) return;
        setScopedRecentTasks(recent.tasks);
        setScopedBlockedTasks(blocked.tasks);
      })
      .catch(() => { if (!cancelled) { setScopedRecentTasks([]); setScopedBlockedTasks([]); } })
      .finally(() => { if (!cancelled) setScopedTasksLoading(false); });
    return () => { cancelled = true; };
  }, [scopedUserId]);

  // ── Work Diary ─────────────────────────────────────────────────────────────
  const [diaryEntries, setDiaryEntries] = useState<WorkDiaryEntry[]>([]);
  const [diaryLoading, setDiaryLoading] = useState(true);
  // Date filter for the Work Diary box: Today / Yesterday / a picked past day.
  const [diaryFilter, setDiaryFilter] = useState<'today' | 'yesterday' | 'custom'>('today');
  const [diaryCustomDate, setDiaryCustomDate] = useState(''); // yyyy-mm-dd (local)

  useEffect(() => {
    // Resolve the day to fetch (local date, yyyy-mm-dd) from the active filter.
    let day: string | null;
    if (diaryFilter === 'custom') {
      day = diaryCustomDate || null;
    } else {
      const d = new Date();
      if (diaryFilter === 'yesterday') d.setDate(d.getDate() - 1);
      day = ymdLocal(d);
    }
    if (!day) { setDiaryEntries([]); setDiaryLoading(false); return; }

    let cancelled = false;
    setDiaryLoading(true);
    (isAdmin
      ? diaryService.getAllDiary({ from: day, to: day }, /* silent */ true)
      : diaryService.getMyDiary({ from: day, to: day }, /* silent */ true)
    )
      .then(e => { if (!cancelled) setDiaryEntries(e); })
      .catch(() => { if (!cancelled) setDiaryEntries([]); })
      .finally(() => { if (!cancelled) setDiaryLoading(false); });
    return () => { cancelled = true; };
  }, [isAdmin, diaryFilter, diaryCustomDate]);

  if (loading) {
    return (
      <div className="space-y-6">
        <DashboardSkeleton />
      </div>
    );
  }

  // "My Work" lists always reflect the logged-in user, independent of the
  // admin's shared filter selection. Both fetches are already sorted by the
  // backend (CreatedAt desc), so no client-side re-sort is needed here. Shows
  // only the top/latest 10 — no pagination on this card.
  const assignedToMe = myAssignedTasks.slice(0, 10);
  const createdByMe = myCreatedTasks.slice(0, 10);

  // Stat cards + blocked-count derive from dashboardStats (already accurately
  // role/date scoped server-side) rather than the capped task-row fetches above.
  const blockedCount = dashboardStats?.tasksByStatus.find(s => s.status === 'blocked')?.count ?? 0;
  const activeTaskCount = dashboardStats ? dashboardStats.totalTasks - dashboardStats.completedTasks : 0;

  const stats = [
    { id: 1, label: 'Total Projects', value: String(dashboardStats?.totalProjects ?? projects.length), icon: Folder, color: 'indigo', href: '/projects' },
    { id: 2, label: 'Active Tasks', value: String(activeTaskCount), icon: CheckCircle2, color: 'emerald', href: '/tasks' },
    { id: 3, label: 'Team Members', value: String(users.length), icon: Users, color: 'blue', href: '/users' },
    { id: 4, label: 'Blocked Tasks', value: String(blockedCount), icon: ShieldAlert, color: blockedCount > 0 ? 'red' : 'teal', href: '/tasks' },
  ];

  // Top/latest 10 only — no pagination on these cards.
  const recentTasks = scopedRecentTasks.slice(0, 10);
  const blockedTasks = scopedBlockedTasks.slice(0, 10);

  // Projects scoped by the shared filter's user dimension (owner or member) —
  // date range is applied to Project Status only (via startDate), not to the
  // at-risk/timeline widgets which are current-state views.
  const inDateRange = (dateStr?: string) => {
    if (!dateStr) return true;
    if (range.from && new Date(dateStr) < new Date(range.from)) return false;
    if (range.to && new Date(dateStr) >= new Date(range.to)) return false;
    return true;
  };
  const isProjectInScope = (p: typeof projects[number]) =>
    scopedUserId == null || p.ownerId === scopedUserId || (p.memberIds ?? []).includes(scopedUserId);
  const scopedProjectsForStatus = projects.filter(p => isProjectInScope(p) && inDateRange(p.startDate));
  const scopedProjectsForTimeline = projects.filter(isProjectInScope);

  const colorMap: Record<string, string> = {
    indigo: 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 border-indigo-100 dark:border-indigo-900/40',
    emerald: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/40',
    blue: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-100 dark:border-blue-900/40',
    teal: 'bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400 border-teal-100 dark:border-teal-900/40',
    red: 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-100 dark:border-red-900/40',
    amber: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border-amber-100 dark:border-amber-900/40',
  };

  const reassigningTask = reassigningTaskId ? blockedTasks.find(t => t.id === reassigningTaskId) : null;

  return (
    <PageTransition>
      {/* Auto-surface blocked / open-issue tasks once per session */}
      <BlockIssueDialog />
      <div className="space-y-6">
        {/* Page header */}
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/40 flex items-center justify-center">
            <LayoutDashboard size={18} className="text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-lg font-black uppercase tracking-tighter text-gray-900 dark:text-white">Dashboard</h1>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">Your workspace at a glance</p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map(stat => {
            const Icon = stat.icon;
            return (
              <Link key={stat.id} to={stat.href}>
                <Card className="h-full hover:shadow-md transition-all duration-200 cursor-pointer group">
                  <CardContent className="p-5">
                    <div className="flex items-center space-x-3 mb-3">
                      <div className={`h-10 w-10 rounded-lg flex items-center justify-center border ${colorMap[stat.color]}`}>
                        <Icon size={18} />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{stat.label}</p>
                        <p className="text-2xl font-black text-gray-900 dark:text-white font-mono">{stat.value}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            {([
              { label: 'Working Hours', value: formatSeconds(effortStats?.workingSeconds ?? 0), icon: Clock, color: 'indigo' },
              { label: 'Productive Hours', value: formatSeconds(effortStats?.productiveSeconds ?? 0), icon: Zap, color: 'emerald' },
              { label: 'Currently Working', value: String(effortStats?.usersCurrentlyWorking ?? 0), icon: Activity, color: 'emerald' },
              { label: 'In Pause / Review', value: String(effortStats?.usersInPauseReview ?? 0), icon: PauseCircle, color: 'amber' },
              { label: 'Blocked Tasks', value: String(blockedCount), icon: ShieldAlert, color: blockedCount > 0 ? 'red' : 'teal' },
            ] as const).map((w, i) => {
              const Icon = w.icon;
              return (
                <Card key={i} className="h-full">
                  <CardContent className="p-5">
                    <div className="flex items-center space-x-3">
                      <div className={`h-10 w-10 rounded-lg flex items-center justify-center border ${colorMap[w.color]}`}>
                        <Icon size={18} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide truncate">{w.label}</p>
                        <p className="text-xl font-black text-gray-900 dark:text-white font-mono">{w.value}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

        {/* ════════════════════════════════════════════════════════════════════
            Reports content, mirrored from /reports (same-to-same). Own filters,
            independent of the shared DashboardFilterBar below.
            ════════════════════════════════════════════════════════════════════ */}
        {isAdmin ? (
          <div className="space-y-6">
            {/* ── Working Hours Summary ── */}
            <Card>
              {/* Card header: Title | filters (project, user, time) on right */}
              <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-5">
                <h2 className="text-sm font-black uppercase tracking-widest text-gray-400 flex items-center gap-2">
                  <TrendingUp size={15} className="text-indigo-600" />
                  Working Hours Summary
                  {summaryLoading && <span className="text-[10px] font-bold text-gray-400 normal-case tracking-normal">updating…</span>}
                </h2>
                {/* Filters */}
                <div className="flex flex-wrap items-center gap-2">
                  {(() => {
                    const projectOpts: SelectOption[] = [{ value: 'all', label: 'All Projects' }, ...projects.map(p => ({ value: p.id, label: p.name }))];
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
                  {(() => {
                    const userOpts: SelectOption[] = [{ value: 'all', label: 'All Users' }, ...users.map(u => ({ value: u.id, label: `${u.name} - ${u.role}` }))];
                    return (
                      <VSelect
                        options={userOpts}
                        value={userOpts.find(o => o.value === reportsFilterUserId) ?? null}
                        onChange={(opt) => setReportsFilterUserId(!opt || opt.value === 'all' ? 'all' : Number(opt.value))}
                        isSearchable
                        placeholder="All Users"
                        className="w-40"
                      />
                    );
                  })()}
                  <ReportsPeriodFilter
                    period={reportsPeriod} setPeriod={setReportsPeriod}
                    customFrom={reportsCustomFrom} setCustomFrom={setReportsCustomFrom}
                    customTo={reportsCustomTo} setCustomTo={setReportsCustomTo}
                  />
                </div>
              </div>

              <CardContent className="p-5 space-y-4">
                
                {/* Tab bar: By User, By Project */}
                <div className="flex gap-0 border-b border-gray-100 dark:border-gray-800">
                  {([
                    { key: 'user',    label: 'By User',    icon: Users },
                    { key: 'project', label: 'By Project', icon: Briefcase },
                  ] as const).map(t => (
                    <button key={t.key} onClick={() => setSummaryTab(t.key)}
                      className={`flex items-center gap-1.5 py-2 px-4 text-[11px] font-black uppercase tracking-widest border-b-2 transition-colors ${summaryTab === t.key ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}>
                      <t.icon size={12} />{t.label}
                    </button>
                  ))}
                </div>

                {/* Tab content */}
                {(() => {
                  const pagedByUser = paginate(summary?.byUser ?? [], whUserPage);
                  const pagedByProject = paginate(summary?.byProject ?? [], whProjectPage);
                  return (
                    <>
                <div className="overflow-x-auto -mx-5">
                  {summaryLoading ? (
                    <div className="p-5"><ReportsRowSkeleton /></div>
                  ) : !summary || (summaryTab === 'user' && summary.byUser.length === 0) || (summaryTab === 'project' && summary.byProject.length === 0) ? (
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
                          <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-widest text-blue-600">Est.&nbsp;Hours</th>
                          <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-widest text-indigo-600">Working Hours</th>
                          <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-widest text-gray-400">%&nbsp;Productive</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 dark:divide-gray-900">
                        {pagedByUser.pageItems.map(u => {
                          const pct = u.totalSeconds > 0 ? Math.round((u.productiveSeconds / u.totalSeconds) * 100) : 0;
                          return (
                            <tr key={u.userId} className="hover:bg-gray-50/60 dark:hover:bg-gray-900/40 transition-colors">
                              <td className="px-3 py-2.5">
                                <button onClick={() => setModalUser({ id: u.userId, name: u.userName, avatar: u.avatarUrl })} className="flex items-center gap-2 group text-left">
                                  <img src={reportsAvatarUrl(u.userName, u.avatarUrl)} alt="" className="h-6 w-6 rounded border border-gray-100 dark:border-gray-800 object-cover shrink-0" />
                                  <span className="text-[13px] font-semibold text-gray-700 dark:text-gray-200 truncate max-w-[130px] group-hover:text-indigo-600 underline underline-offset-2 decoration-dotted">{u.userName}</span>
                                </button>
                              </td>
                              <td className="px-3 py-2.5 text-[12px] font-mono font-bold text-gray-500">{u.taskCount}</td>
                              <td className="px-3 py-2.5 text-[12px] font-mono font-bold text-emerald-600 dark:text-emerald-400">{formatSeconds(u.productiveSeconds)}</td>
                              <td className="px-3 py-2.5 text-[12px] font-mono font-bold text-amber-600 dark:text-amber-400">{formatSeconds(u.pausedSeconds)}</td>
                              <td className="px-3 py-2.5 text-[12px] font-mono font-bold text-rose-600 dark:text-rose-400">{formatSeconds(u.blockedSeconds)}</td>
                              <td className="px-3 py-2.5 text-[12px] font-mono font-bold text-purple-600 dark:text-purple-400">{formatSeconds(u.underReviewSeconds)}</td>
                              <td className="px-3 py-2.5 text-[12px] font-mono font-bold text-indigo-600 dark:text-indigo-400">{toHHMM(u.workingHoursSpent)}</td>
                              <td className="px-3 py-2.5 text-[12px] font-mono font-bold text-blue-600 dark:text-blue-400">{toHHMM(u.estimatedHours)}</td>
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
                        {pagedByProject.pageItems.map(p => {
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
                </div>
                {!summaryLoading && summary && summaryTab === 'user' && (
                  <DashboardPaginationBar
                    page={pagedByUser.page} totalPages={pagedByUser.totalPages} totalCount={pagedByUser.totalCount}
                    onPrev={() => setWhUserPage(p => p - 1)} onNext={() => setWhUserPage(p => p + 1)}
                  />
                )}
                {!summaryLoading && summary && summaryTab === 'project' && (
                  <DashboardPaginationBar
                    page={pagedByProject.page} totalPages={pagedByProject.totalPages} totalCount={pagedByProject.totalCount}
                    onPrev={() => setWhProjectPage(p => p - 1)} onNext={() => setWhProjectPage(p => p + 1)}
                  />
                )}
                    </>
                  );
                })()}
              </CardContent>
            </Card>
          </div>
        ) : (
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
                      src={reportsAvatarUrl(currentUser.name, currentUser.avatar)}
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
          </div>
        )}

        {/* Own/selected effort modal (Reports content) */}
        {modalUser && (
          <ReportsUserEffortModal
            userId={modalUser.id}
            userName={modalUser.name}
            userAvatar={modalUser.avatar}
            onClose={() => setModalUser(null)}
          />
        )}
        {/* ── end Reports content ────────────────────────────────────────────── */}

        {/* ── Project Status ─────────────────────────────────────────────────── */}
        {(() => {
          // Reuses Badge's own color palette (emerald/amber/sky) so this section
          // doesn't introduce yet another ad hoc status→color map.
          const VARIANT_DOT: Record<string, string> = {
            success: 'bg-emerald-500', warning: 'bg-amber-500', info: 'bg-sky-500',
          };
          const VARIANT_BAR: Record<string, string> = {
            success: 'bg-emerald-500', warning: 'bg-amber-400', info: 'bg-sky-500',
          };
          const VARIANT_TEXT: Record<string, string> = {
            success: 'text-emerald-600', warning: 'text-amber-600', info: 'text-sky-600',
          };
          const total = scopedProjectsForStatus.length || 1;
          const activeProjects = scopedProjectsForStatus.filter(p => p.status === 'active');

          return (
            <div className="space-y-3">
              <h2 className="text-sm font-black uppercase tracking-widest text-gray-400 flex items-center gap-2">
                <Folder size={15} className="text-indigo-500" /> Project Status
              </h2>
              <Card>
                <CardContent className="p-5 space-y-4">
                  {/* Status pills row */}
                  <div className="flex flex-wrap gap-2">
                    {PROJECT_STATUSES.map(s => {
                      const count = scopedProjectsForStatus.filter(p => p.status === s).length;
                      const variant = PROJECT_STATUS_BADGE_VARIANT[s];
                      return (
                        <Link key={s} to="/projects"
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/30 hover:shadow-sm transition-shadow group">
                          <span className={`h-2 w-2 rounded-full shrink-0 ${VARIANT_DOT[variant]}`} />
                          <span className="text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-200">{PROJECT_STATUS_LABELS[s]}</span>
                          <span className={`text-[13px] font-black font-mono ${VARIANT_TEXT[variant]}`}>{count}</span>
                        </Link>
                      );
                    })}
                  </div>
                  {/* Progress bars */}
                  <div className="space-y-1.5">
                    {PROJECT_STATUSES.map(s => {
                      const count = scopedProjectsForStatus.filter(p => p.status === s).length;
                      const pct = Math.round((count / total) * 100);
                      const variant = PROJECT_STATUS_BADGE_VARIANT[s];
                      return (
                        <div key={s} className="flex items-center gap-3">
                          <span className="text-[9px] font-black uppercase tracking-widest text-gray-400 w-20 shrink-0">{PROJECT_STATUS_LABELS[s]}</span>
                          <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all duration-500 ${VARIANT_BAR[variant]}`} style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-[10px] font-mono font-bold text-gray-500 dark:text-gray-400 w-8 text-right shrink-0">{count}</span>
                        </div>
                      );
                    })}
                  </div>
                  {/* Active projects drill-down */}
                  {activeProjects.length > 0 && (() => {
                    const pagedActive = paginate(activeProjects, activeProjectsPage);
                    return (
                      <div className="pt-2 border-t border-gray-100 dark:border-gray-800 space-y-1.5">
                        {pagedActive.pageItems.map(p => (
                          <Link key={p.id} to={`/projects/${p.id}`}
                            className="flex items-center justify-between gap-3 px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900/40 transition-colors group">
                            <span className="text-xs font-semibold text-gray-700 dark:text-gray-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 truncate">{p.name}</span>
                            <Badge variant={PROJECT_STATUS_BADGE_VARIANT[p.status]}>{PROJECT_STATUS_LABELS[p.status]}</Badge>
                          </Link>
                        ))}
                        <DashboardPaginationBar
                          page={pagedActive.page} totalPages={pagedActive.totalPages} totalCount={pagedActive.totalCount}
                          onPrev={() => setActiveProjectsPage(p => p - 1)} onNext={() => setActiveProjectsPage(p => p + 1)}
                        />
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>
            </div>
          );
        })()}

        {/* ── Project Timelines (progress vs elapsed time) ───────────────────── */}
        <ProjectTimelineBars projects={scopedProjectsForTimeline} />

        {/* ── At Risk (overdue tasks + stalled projects, current-state) ──────── */}
        <AtRiskWidget data={atRisk} loading={atRiskLoading} />

        {/* ── Work Diary ─────────────────────────────────────────────────────── */}
        {(() => {
          const DIARY_GOAL = 8;
          // The day currently shown (yyyy-mm-dd), derived from the active filter.
          const shownDay = (() => {
            if (diaryFilter === 'custom') return diaryCustomDate || null;
            const d = new Date();
            if (diaryFilter === 'yesterday') d.setDate(d.getDate() - 1);
            return ymdLocal(d);
          })();
          const shownLabel = shownDay
            ? new Date(`${shownDay}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
            : '—';

          // The third badge lets the user pick any day before yesterday.
          const maxPastDay = (() => { const d = new Date(); d.setDate(d.getDate() - 2); return ymdLocal(d); })();
          const badgeBase = 'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-colors cursor-pointer';
          const badgeActive = 'bg-teal-600 text-white border-teal-600';
          const badgeIdle = 'bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-teal-400';

          const filterBadges = (
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => setDiaryFilter('today')}
                className={`${badgeBase} ${diaryFilter === 'today' ? badgeActive : badgeIdle}`}
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setDiaryFilter('yesterday')}
                className={`${badgeBase} ${diaryFilter === 'yesterday' ? badgeActive : badgeIdle}`}
              >
                Yesterday
              </button>
              <label className={`relative ${badgeBase} ${diaryFilter === 'custom' ? badgeActive : badgeIdle}`}>
                <Calendar size={11} />
                {diaryFilter === 'custom' && diaryCustomDate ? dmy(diaryCustomDate) : 'Pick day'}
                <input
                  type="date"
                  max={maxPastDay}
                  value={diaryFilter === 'custom' ? diaryCustomDate : ''}
                  onClick={ev => { const el = ev.currentTarget as HTMLInputElement & { showPicker?: () => void }; el.showPicker?.(); }}
                  onChange={ev => { setDiaryCustomDate(ev.target.value); setDiaryFilter('custom'); }}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  aria-label="Pick a past day"
                />
              </label>
            </div>
          );

          const header = (title: string) => (
            <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
              <h2 className="text-sm font-black uppercase tracking-widest text-gray-400 flex items-center gap-2">
                <BookOpen size={15} className="text-teal-600" />{title}
                <span className="text-[10px] text-gray-400 font-medium normal-case tracking-normal">{shownLabel}</span>
              </h2>
              <div className="flex items-center gap-3">
                {filterBadges}
                <Link to="/diary" className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800">View All →</Link>
              </div>
            </div>
          );

          // Keep the box (and its current data) visible during a refetch; just
          // float a spinner over it instead of blanking the content out.
          const loadingOverlay = diaryLoading ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60 dark:bg-gray-900/60 backdrop-blur-[1px] rounded-xl">
              <LoadingSpinner size="sm" />
            </div>
          ) : null;

          if (isAdmin) {
            // Group diary entries by userId, sum hours
            const byUser: Record<number, number> = {};
            for (const e of diaryEntries) {
              byUser[e.userId] = (byUser[e.userId] ?? 0) + (e.hoursSpent ?? 0);
            }
            const rows = assignableUsers.map(u => ({
              userId: u.id,
              name: u.name,
              avatar: u.avatar,
              hours: byUser[u.id] ?? 0,
            }));
            const incomplete = rows.filter(r => r.hours < DIARY_GOAL).sort((a, b) => a.hours - b.hours);
            const complete   = rows.filter(r => r.hours >= DIARY_GOAL);

            return (
              <div>
                {header('Work Diary')}
                <Card>
                  <CardContent className="p-5 relative min-h-[96px]">
                    {loadingOverlay}
                    {rows.length === 0 ? (
                      <p className="text-[12px] text-gray-400 italic">No team members found.</p>
                    ) : (
                      <>
                        <div className="flex items-center justify-between mb-4">
                          <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400">
                            {complete.length} of {rows.length} members logged ≥{DIARY_GOAL}h on {shownLabel}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black bg-red-50 dark:bg-red-900/20 text-red-600 border border-red-100 dark:border-red-900/40">
                              {incomplete.length} incomplete
                            </span>
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 border border-emerald-100 dark:border-emerald-900/40">
                              {complete.length} done
                            </span>
                          </div>
                        </div>
                        {(() => {
                          const pagedTeam = paginate([...incomplete, ...complete], diaryTeamPage);
                          return (
                            <div className="space-y-2">
                              {pagedTeam.pageItems.map(r => {
                                const pct  = Math.min(100, Math.round((r.hours / DIARY_GOAL) * 100));
                                const done = r.hours >= DIARY_GOAL;
                                const barColor = done ? 'bg-emerald-500' : r.hours > 0 ? 'bg-amber-400' : 'bg-gray-200 dark:bg-gray-700';
                                const textColor = done ? 'text-emerald-600' : r.hours > 0 ? 'text-amber-500' : 'text-gray-400';
                                return (
                                  <div key={r.userId} className="flex items-center gap-3">
                                    <img
                                      src={r.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(r.name)}&background=random&size=32`}
                                      alt=""
                                      className="h-7 w-7 rounded-full object-cover border border-gray-100 dark:border-gray-800 shrink-0"
                                    />
                                    <span className="text-[12px] font-semibold text-gray-700 dark:text-gray-300 w-32 shrink-0 truncate">{r.name}</span>
                                    <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                                      <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                                    </div>
                                    <span className={`text-[11px] font-mono font-bold shrink-0 w-20 text-right ${textColor}`}>
                                      {r.hours.toFixed(1)}h / {DIARY_GOAL}h
                                    </span>
                                    {done
                                      ? <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
                                      : <div className="w-[13px] h-[13px] rounded-full border-2 border-gray-200 dark:border-gray-700 shrink-0" />
                                    }
                                  </div>
                                );
                              })}
                              <DashboardPaginationBar
                                page={pagedTeam.page} totalPages={pagedTeam.totalPages} totalCount={pagedTeam.totalCount}
                                onPrev={() => setDiaryTeamPage(p => p - 1)} onNext={() => setDiaryTeamPage(p => p + 1)}
                              />
                            </div>
                          );
                        })()}
                      </>
                    )}
                  </CardContent>
                </Card>
              </div>
            );
          }

          // Regular user view
          const totalHours = diaryEntries.reduce((s, e) => s + (e.hoursSpent ?? 0), 0);
          const pct  = Math.min(100, Math.round((totalHours / DIARY_GOAL) * 100));
          const done = totalHours >= DIARY_GOAL;
          const barColor  = done ? 'bg-emerald-500' : totalHours > 0 ? 'bg-amber-400' : 'bg-gray-200 dark:bg-gray-700';
          const textColor = done ? 'text-emerald-600' : totalHours > 0 ? 'text-amber-500' : 'text-gray-400';

          return (
            <div>
              {header('My Work Diary')}
              <Card>
                <CardContent className="p-5 relative min-h-[96px]">
                  {loadingOverlay}
                  {(
                    <>
                      {/* Progress bar */}
                      <div className="flex items-center gap-4 mb-4">
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400">Hours logged · {shownLabel}</span>
                            <span className={`text-[12px] font-mono font-black ${textColor}`}>
                              {totalHours.toFixed(1)}h / {DIARY_GOAL}h
                            </span>
                          </div>
                          <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                        <span className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${done ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 border-emerald-100 dark:border-emerald-900/40' : 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 border-amber-100 dark:border-amber-900/40'}`}>
                          {done ? 'Complete ✓' : 'Incomplete'}
                        </span>
                      </div>
                      {/* Entry list */}
                      {diaryEntries.length > 0 ? (
                        <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                          {diaryEntries.map(e => (
                            <div key={e.id} className="flex items-center justify-between gap-2 py-1 border-b border-gray-50 dark:border-gray-900 last:border-0">
                              <div className="flex items-center gap-2 min-w-0">
                                {e.category && (
                                  <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 rounded shrink-0">
                                    {e.category}
                                  </span>
                                )}
                                <span className="text-[12px] text-gray-600 dark:text-gray-400 truncate">{e.description}</span>
                              </div>
                              <span className="text-[11px] font-mono font-bold text-gray-500 dark:text-gray-400 shrink-0">
                                {(e.hoursSpent ?? 0).toFixed(1)}h
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[12px] text-gray-400 italic">No diary entries for {shownLabel}. <Link to="/diary" className="text-indigo-600 hover:underline">Add one →</Link></p>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          );
        })()}

        {/* My Work: Assigned to Me | Created by Me (if any) */}
        {(() => {
          const renderRow = (task: Task) => {
            const assignee = users.find(u => u.id === task.assigneeId);
            return (
              <div key={task.id} className="flex items-start justify-between gap-2 py-1.5 border-b border-gray-50 dark:border-gray-900 last:border-0">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    {task.code && <span className="text-[8px] font-black tracking-widest font-mono text-gray-400 shrink-0">{task.code}</span>}
                    <InteractiveLink type="task" id={task.id} className="text-[13px] font-semibold text-gray-700 dark:text-gray-300 hover:text-indigo-600 truncate">
                      {task.title}
                    </InteractiveLink>
                    {task.isBlocked && <ShieldAlert size={11} className="text-red-500 shrink-0" />}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge variant={STATUS_BADGE_VARIANT[task.status] ?? 'default'} className="text-[8px] uppercase tracking-tight">
                      {STATUS_LABELS[task.status] ?? task.status}
                    </Badge>
                    {assignee && (
                      <span className="flex items-center gap-1 text-[10px] font-semibold text-indigo-500 dark:text-indigo-400 truncate">
                        <img src={assignee.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(assignee.name)}&background=random&size=20`} alt="" className="h-3.5 w-3.5 rounded-full object-cover" />
                        <span className="truncate max-w-[80px]">{assignee.name}</span>
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-[10px] font-mono text-gray-400 whitespace-nowrap shrink-0 mt-0.5 flex items-center gap-1"><Clock size={9} className="opacity-60" />{task.estimatedHours != null ? toHHMM(task.estimatedHours) : '—'}</span>
              </div>
            );
          };

          const simpleBox = (title: string, Icon: typeof UserCheck, items: Task[], empty: string, viewAllTo: string) => {
            return (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Icon size={16} className="text-indigo-500" />
                    <h3 className="text-sm font-black uppercase tracking-tight text-gray-900 dark:text-white">{title}</h3>
                    {items.length > 0 && (
                      <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-400">{items.length}</span>
                    )}
                  </div>
                  <Link to={viewAllTo} className="text-xs text-indigo-600 font-semibold hover:underline">View all →</Link>
                </div>
                <Card>
                  <CardContent className="p-4 space-y-1">
                    {items.length === 0
                      ? <p className="text-sm text-gray-400 text-center py-4">{empty}</p>
                      : items.map(t => renderRow(t))}
                  </CardContent>
                </Card>
              </div>
            );
          };


          return (
            <div className="space-y-4">
              {simpleBox('Assigned to Me', UserCheck, assignedToMe, 'No tasks assigned to you', '/tasks?mine=1')}
              {/* Created by Me (only if any) */}
              {createdByMe.length > 0 && simpleBox('Created by Me', ClipboardCheck, createdByMe, 'You have not created any tasks', '/tasks?createdByMe=1')}
            </div>
          );
        })()}

        {/* Row: Recent Tasks (left) | Blocked Tasks (right) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">

        {/* Recent Tasks */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <CheckCircle2 size={16} className="text-indigo-500" />
              <h3 className="text-sm font-black uppercase tracking-tight text-gray-900 dark:text-white">
                Recent Tasks
              </h3>
            </div>
            <Link to={isAdmin ? '/tasks' : '/tasks?mine=1'} className="text-xs text-indigo-600 font-semibold hover:underline">
              View all →
            </Link>
          </div>
          <Card>
            <CardContent className="p-4 space-y-3">
              {scopedTasksLoading ? (
                <p className="text-sm text-gray-400 text-center py-4">Loading…</p>
              ) : recentTasks.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">No tasks yet</p>
              ) : (
                <div className="divide-y divide-gray-50 dark:divide-gray-900">
                  {recentTasks.map(task => {
                    const project  = projects.find(p => p.id === task.projectId);
                    const assignee = users.find(u => u.id === task.assigneeId);
                    const creator  = users.find(u => u.id === task.createdById);
                    const owner    = project ? users.find(u => u.id === project.ownerId) : undefined;

                    const checkTotal = task.checklistItems?.length ?? 0;
                    const checkDone  = task.checklistItems?.filter(c => c.isCompleted).length ?? 0;
                    const progress   = task.progress ?? (checkTotal > 0 ? Math.round((checkDone / checkTotal) * 100) : 0);

                    const priorityDot =
                      task.priority === 'critical' ? 'bg-rose-600' :
                      task.priority === 'high'     ? 'bg-red-500' :
                      task.priority === 'medium'   ? 'bg-amber-500' : 'bg-emerald-500';

                    const priorityLabel =
                      task.priority === 'critical' ? 'text-rose-700 bg-rose-50 dark:bg-rose-900/20 border-rose-100 dark:border-rose-900/40' :
                      task.priority === 'high'     ? 'text-red-600 bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-900/40' :
                      task.priority === 'medium'   ? 'text-amber-600 bg-amber-50 dark:bg-amber-900/20 border-amber-100 dark:border-amber-900/40' :
                                                     'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-900/40';

                    const statusVariant = STATUS_BADGE_VARIANT[task.status] ?? 'default';

                    const progressColor = progress === 100 ? 'bg-emerald-500' : task.isBlocked ? 'bg-red-400' : 'bg-indigo-500';

                    return (
                      <div key={task.id} className="p-4 hover:bg-gray-50/60 dark:hover:bg-gray-900/30 transition-colors group">
                        {/* Row 1: title + status + priority + blocked */}
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`h-2 w-2 rounded-full shrink-0 ${priorityDot}`} />
                            <InteractiveLink type="task" id={task.id} className="text-[13px] font-bold text-gray-900 dark:text-gray-100 hover:text-indigo-600 transition-colors leading-tight font-display truncate">
                              {task.title}
                            </InteractiveLink>
                            {task.isBlocked && (
                              <span className="shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded text-[8px] font-black uppercase tracking-widest text-red-600">
                                <ShieldAlert size={8} /> Blocked
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border ${priorityLabel}`}>
                              {task.priority}
                            </span>
                            <Badge variant={statusVariant} className="text-[9px] uppercase tracking-tight">
                              {STATUS_LABELS[task.status] ?? task.status}
                            </Badge>
                          </div>
                        </div>

                        {/* Row 2: project name */}
                        {project && (
                          <div className="mb-2">
                            <InteractiveLink type="project" id={project.id} className="text-[9px] font-black uppercase tracking-widest text-indigo-500/70 hover:text-indigo-600 transition-colors">
                              {project.name}
                            </InteractiveLink>
                          </div>
                        )}

                        {/* Row 3: progress bar */}
                        <div className="mb-2.5">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">
                              {checkTotal > 0 ? `Checklist ${checkDone}/${checkTotal}` : 'Progress'}
                            </span>
                            <span className={`text-[9px] font-black font-mono ${progress === 100 ? 'text-emerald-600' : 'text-indigo-500'}`}>{progress}%</span>
                          </div>
                          <div className="h-1 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all duration-500 ${progressColor}`} style={{ width: `${progress}%` }} />
                          </div>
                        </div>

                        {/* Row 4: users (creator, assignee, owner) + due date */}
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-3">
                            {/* Creator */}
                            {creator && (
                              <div className="flex items-center gap-1" title={`Created by ${creator.name}`}>
                                <span className="text-[8px] font-black uppercase tracking-widest text-gray-400">By</span>
                                <InteractiveLink type="user" id={creator.id} className="flex items-center gap-1 hover:opacity-80 transition-opacity">
                                  <img src={creator.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(creator.name)}&background=random&size=20`} alt={creator.name} className="h-4 w-4 rounded-full object-cover border border-gray-200 dark:border-gray-700" />
                                  <span className="text-[9px] font-bold text-gray-600 dark:text-gray-400 max-w-[60px] truncate">{creator.name.split(' ')[0]}</span>
                                </InteractiveLink>
                              </div>
                            )}

                            {/* Assignee */}
                            {assignee && (
                              <div className="flex items-center gap-1" title={`Assigned to ${assignee.name}`}>
                                <span className="text-[8px] font-black uppercase tracking-widest text-gray-400">To</span>
                                <InteractiveLink type="user" id={assignee.id} className="flex items-center gap-1 hover:opacity-80 transition-opacity">
                                  <img src={assignee.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(assignee.name)}&background=random&size=20`} alt={assignee.name} className="h-4 w-4 rounded-full object-cover border border-indigo-200 dark:border-indigo-800" />
                                  <span className="text-[9px] font-bold text-indigo-600 dark:text-indigo-400 max-w-[60px] truncate">{assignee.name.split(' ')[0]}</span>
                                </InteractiveLink>
                              </div>
                            )}

                            {/* Project owner (only if different from creator & assignee) */}
                            {owner && owner.id !== assignee?.id && owner.id !== creator?.id && (
                              <div className="flex items-center gap-1" title={`Project owner: ${owner.name}`}>
                                <span className="text-[8px] font-black uppercase tracking-widest text-gray-400">Own</span>
                                <InteractiveLink type="user" id={owner.id} className="flex items-center gap-1 hover:opacity-80 transition-opacity">
                                  <img src={owner.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(owner.name)}&background=random&size=20`} alt={owner.name} className="h-4 w-4 rounded-full object-cover border border-amber-200 dark:border-amber-800" />
                                  <span className="text-[9px] font-bold text-amber-600 dark:text-amber-400 max-w-[60px] truncate">{owner.name.split(' ')[0]}</span>
                                </InteractiveLink>
                              </div>
                            )}
                          </div>

                          {/* Estimate Hours */}
                          <span className="text-[10px] font-mono font-semibold flex items-center gap-1 text-gray-400">
                            <Clock size={9} className="opacity-60" />
                            {task.estimatedHours != null ? toHHMM(task.estimatedHours) : '—'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>{/* end Recent Tasks col */}

          {/* Blocked Tasks */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <ShieldAlert size={16} className="text-red-500" />
                <h3 className="text-sm font-black uppercase tracking-tight text-gray-900 dark:text-white">
                  Blocked Tasks
                </h3>
                {blockedTasks.length > 0 && (
                  <span className="inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 bg-red-500 text-white text-[10px] font-black rounded-full">
                    {blockedTasks.length}
                  </span>
                )}
              </div>
              <Link to={isAdmin ? '/tasks?blocked=1' : '/tasks?mine=1&blocked=1'} className="text-xs text-red-600 font-semibold hover:underline">
                View all →
              </Link>
            </div>
            <Card className="border-red-100 dark:border-red-900/30">
              <CardContent className="p-4 space-y-3">
                {scopedTasksLoading ? (
                  <p className="text-sm text-gray-400 text-center py-4">Loading…</p>
                ) : blockedTasks.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-4">No blocked tasks</p>
                ) : (
                  blockedTasks.map(task => {
                    const assignee = users.find(u => u.id === task.assigneeId);
                    const project = projects.find(p => p.id === task.projectId);
                    const activeBlock = task.blockEntries?.find(b => b.isActive && b.blockedById === task.assigneeId);
                    return (
                      <div key={task.id} className="flex items-start gap-3 p-3 bg-red-50/60 dark:bg-red-900/10 rounded-lg border border-red-100 dark:border-red-900/30">
                        <div className="mt-0.5 shrink-0">
                          <ShieldAlert size={14} className="text-red-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 flex-wrap">
                            <InteractiveLink type="task" id={task.id} className="text-[13px] font-bold text-gray-900 dark:text-gray-100 hover:text-red-600 transition-colors leading-tight font-display truncate">
                              {task.title}
                            </InteractiveLink>
                            {project && (
                              <span className="text-[9px] font-black uppercase tracking-wider text-gray-400 shrink-0">
                                {project.name}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 mt-1">
                            <UserCheck size={10} className="text-gray-400 shrink-0" />
                            {assignee ? (
                              <InteractiveLink type="user" id={assignee.id} className="text-[11px] font-bold text-gray-600 dark:text-gray-400 hover:text-indigo-600 flex items-center gap-1">
                                <img src={assignee.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(assignee.name)}&background=random&size=20`} alt="" className="h-4 w-4 rounded-full object-cover" />
                                {assignee.name}
                              </InteractiveLink>
                            ) : (
                              <span className="text-[11px] text-gray-400 italic">Unassigned</span>
                            )}
                          </div>
                          {activeBlock && (
                            <p className="mt-1.5 text-[11px] text-red-700 dark:text-red-300 italic leading-snug">
                              "{activeBlock.reason}"
                              <span className="ml-1.5 text-[9px] not-italic font-mono text-red-400">{formatDateTime(activeBlock.blockedAt)}</span>
                            </p>
                          )}
                        </div>
                        {isAdmin && (
                          <button
                            onClick={() => setReassigningTaskId(task.id)}
                            className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-widest border border-amber-300 dark:border-amber-700 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg transition-colors whitespace-nowrap"
                          >
                            <UserCheck size={11} /> Reassign
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </div>
        </div>{/* end Recent | Blocked row */}

        {/* Reassign modal (for blocked tasks) */}
        {reassigningTask && (
          <ReassignModal
            isOpen={true}
            onClose={() => setReassigningTaskId(null)}
            title="Reassign Blocked Task"
            currentAssigneeId={reassigningTask.assigneeId}
            availableUsers={users.map(u => ({ id: u.id, name: u.name, avatar: u.avatar }))}
            reasonTags={BLOCK_REASON_TAGS}
            onConfirm={async (newUserId: number, reasonTag: ReasonTag) => {
              try {
                await reassignTask(reassigningTask.id, newUserId, reasonTag);
                showSuccess('Task reassigned successfully');
              } catch (err) {
                showError(err instanceof Error ? err.message : 'Failed to reassign task');
              }
              setReassigningTaskId(null);
            }}
          />
        )}
      </div>
    </PageTransition>
  );
}
