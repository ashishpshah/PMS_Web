import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { formatDate, formatDateTime, formatSeconds } from '../lib/utils';
import { Card, CardContent } from '../components/ui/Card';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { DashboardSkeleton } from '../components/skeletons/DashboardSkeleton';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { Folder, CheckCircle2, Users, ClipboardCheck, ShieldAlert, UserCheck, Calendar, Clock, Zap, Activity, PauseCircle, Trophy, BookOpen, ListTodo, XCircle, AlertCircle, GitBranch } from 'lucide-react';
import { InteractiveLink } from '../components/ui/InteractiveLink';
import { Badge } from '../components/ui/Badge';
import { PageTransition } from '../components/Layout/PageTransition';
import { ReassignModal } from '../components/ui/ReassignModal';
import { ReasonTag, BLOCK_REASON_TAGS, STATUS_BADGE_VARIANT, STATUS_LABELS, DashboardEffort, DashboardStats, PROJECT_STATUSES, PROJECT_STATUS_LABELS, PROJECT_STATUS_BADGE_VARIANT, AtRiskData, Task } from '../types';
import { taskService } from '../services/task.service';
import { dashboardService } from '../services/dashboard.service';
import { diaryService, WorkDiaryEntry } from '../services/diary.service';
import { PeriodKey, resolvePeriod, resolveCustom } from '../lib/dateRanges';
import { showSuccess, showError } from '../lib/toast';
import { BlockIssueDialog } from '../components/BlockIssueDialog';
import { DashboardFilterBar } from '../components/dashboard/DashboardFilterBar';
import { BreakdownMatrix } from '../components/dashboard/BreakdownMatrix';
import { AtRiskWidget } from '../components/dashboard/AtRiskWidget';
import { ProjectTimelineBars } from '../components/dashboard/ProjectTimelineBars';
import { StatusDonutChart } from '../components/dashboard/StatusDonutChart';
import { STATUS_CFG } from '../components/dashboard/statusConfig';

// Local (not UTC) yyyy-mm-dd so "today"/"yesterday" match the user's calendar day.
const ymdLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
// Present a yyyy-mm-dd string as dd-mm-yyyy for the badge label.
const dmy = (s: string) => { const [y, m, d] = s.split('-'); return `${d}-${m}-${y}`; };

export default function Dashboard() {
  const { projects, users, assignableUsers, loading, reassignTask } = useData();
  const { isAdmin, user: currentUser } = useAuth();
  const [reassigningTaskId, setReassigningTaskId] = useState<number | null>(null);

  // ── Shared role-wise + date-range filter (drives Task Distribution, Project
  // Status, Effort, Breakdown Matrix, Recent/Blocked Tasks). "My Work" boxes
  // (Assigned to Me / Created by Me / My Deadlines) intentionally stay tied to
  // the logged-in user regardless of this filter — "My" shouldn't show someone
  // else's data. At-risk / timeline widgets apply the user dimension only, not
  // the date range (they're current-state snapshots, not historical).
  const [filterUserId, setFilterUserId] = useState<number | null>(null); // admin selection; null = "All Users"
  const scopedUserId: number | null = isAdmin ? filterUserId : (currentUser?.id ?? null);

  const [period, setPeriod] = useState<PeriodKey>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const range = period === 'custom' ? resolveCustom(customFrom, customTo) : resolvePeriod(period);
  const rangeReady = !(period === 'custom' && !range.from && !range.to);

  const [effortStats, setEffortStats] = useState<DashboardEffort | null>(null);
  const [effortLoading, setEffortLoading] = useState(false);

  // ── Dashboard stats (all 7 statuses + Section 10 metrics), role + date scoped ─
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
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
      taskService.getAll({ ...base, status: 'blocked' }, 1, 20),
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

  const taskIsOverdue = (t: Task) =>
    !!t.dueDate && new Date(t.dueDate).getTime() < Date.now() && t.status !== 'completed';

  // "My Work" lists always reflect the logged-in user, independent of the
  // admin's shared filter selection. Both fetches are already sorted by the
  // backend (CreatedAt desc), so no client-side re-sort is needed here.
  const assignedToMe = myAssignedTasks.slice(0, 10);
  const createdByMe = myCreatedTasks;
  const myMerged = (() => {
    const map = new Map<number, Task>();
    for (const t of myAssignedTasks) map.set(t.id, t);
    for (const t of myCreatedTasks) map.set(t.id, t);
    return Array.from(map.values());
  })();
  const myDeadlines = currentUser
    ? myMerged
        .filter(t => t.status !== 'completed' && !!t.dueDate)
        .sort((a, b) => {
          const ao = taskIsOverdue(a), bo = taskIsOverdue(b);
          if (ao !== bo) return ao ? -1 : 1;            // overdue group first
          return new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime(); // then soonest due
        })
        .slice(0, 8)
    : [];

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

  const recentTasks = scopedRecentTasks.slice(0, 5);
  const blockedTasks = scopedBlockedTasks;

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
        {/* ── Shared filter bar (role-wise + date range) ────────────────────── */}
        <DashboardFilterBar
          isAdminView={isAdmin}
          users={users}
          selectedUserId={filterUserId}
          onSelectedUserIdChange={setFilterUserId}
          period={period}
          onPeriodChange={setPeriod}
          customFrom={customFrom}
          onCustomFromChange={setCustomFrom}
          customTo={customTo}
          onCustomToChange={setCustomTo}
        />

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

        {/* ── Task Status Distribution ──────────────────────────────────────── */}
        {dashboardStats && (() => {
          const total = dashboardStats.tasksByStatus.reduce((s, x) => s + x.count, 0) || 1;
          const getCount = (key: string) => dashboardStats.tasksByStatus.find(x => x.status === key)?.count ?? 0;
          const countsMap = Object.fromEntries(STATUS_CFG.map(s => [s.key, getCount(s.key)]));

          return (
            <div className="space-y-3">
              <h2 className="text-sm font-black uppercase tracking-widest text-gray-400 flex items-center gap-2">
                <GitBranch size={15} className="text-indigo-500" /> Task Distribution
              </h2>
              <Card>
                <CardContent className="p-5 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                    {/* Status pills row */}
                    <div className="flex flex-wrap gap-2 content-start">
                      {STATUS_CFG.map(s => {
                        const count = getCount(s.key);
                        return (
                          <Link key={s.key} to={`/tasks?status=${s.key}`}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/30 hover:shadow-sm transition-shadow group">
                            <span className={`h-2 w-2 rounded-full shrink-0 ${s.dot}`} />
                            <span className="text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-200">{s.label}</span>
                            <span className={`text-[13px] font-black font-mono ${s.text}`}>{count}</span>
                          </Link>
                        );
                      })}
                    </div>
                    {/* Donut chart */}
                    <StatusDonutChart counts={countsMap} />
                  </div>
                </CardContent>
              </Card>

              {/* Section 10: Checklist / Review / Blockers / Issues metrics */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {/* Dev Checklist */}
                <Card>
                  <CardContent className="p-4 space-y-2">
                    <h4 className="text-[9px] font-black uppercase tracking-widest text-gray-400 flex items-center gap-1">
                      <ListTodo size={11} className="text-indigo-400" /> Dev Checklist
                    </h4>
                    <div className="space-y-1">
                      {[
                        { label: 'Total',     value: dashboardStats.devChecklist.total,     cls: 'text-gray-700 dark:text-gray-200' },
                        { label: 'Completed', value: dashboardStats.devChecklist.completed,  cls: 'text-emerald-600' },
                        { label: 'Remaining', value: dashboardStats.devChecklist.remaining,  cls: dashboardStats.devChecklist.remaining > 0 ? 'text-amber-600' : 'text-emerald-600' },
                      ].map(r => (
                        <div key={r.label} className="flex justify-between items-center">
                          <span className="text-[10px] text-gray-400">{r.label}</span>
                          <span className={`text-[13px] font-black font-mono ${r.cls}`}>{r.value}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Review Checklist */}
                <Card>
                  <CardContent className="p-4 space-y-2">
                    <h4 className="text-[9px] font-black uppercase tracking-widest text-gray-400 flex items-center gap-1">
                      <CheckCircle2 size={11} className="text-purple-400" /> Review QA
                    </h4>
                    <div className="space-y-1">
                      {[
                        { label: 'Pending', value: dashboardStats.reviewChecklist.pending, cls: 'text-gray-500' },
                        { label: 'Passed',  value: dashboardStats.reviewChecklist.passed,  cls: 'text-emerald-600' },
                        { label: 'Failed',  value: dashboardStats.reviewChecklist.failed,  cls: dashboardStats.reviewChecklist.failed > 0 ? 'text-red-600' : 'text-gray-400' },
                      ].map(r => (
                        <div key={r.label} className="flex justify-between items-center">
                          <span className="text-[10px] text-gray-400">{r.label}</span>
                          <span className={`text-[13px] font-black font-mono ${r.cls}`}>{r.value}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Blockers */}
                <Card>
                  <CardContent className="p-4 space-y-2">
                    <h4 className="text-[9px] font-black uppercase tracking-widest text-gray-400 flex items-center gap-1">
                      <ShieldAlert size={11} className="text-red-400" /> Blockers
                    </h4>
                    <div className="space-y-1">
                      {[
                        { label: 'Active',   value: dashboardStats.blockers.active,   cls: dashboardStats.blockers.active > 0 ? 'text-red-600' : 'text-gray-400' },
                        { label: 'Resolved', value: dashboardStats.blockers.resolved, cls: 'text-emerald-600' },
                      ].map(r => (
                        <div key={r.label} className="flex justify-between items-center">
                          <span className="text-[10px] text-gray-400">{r.label}</span>
                          <span className={`text-[13px] font-black font-mono ${r.cls}`}>{r.value}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Issues */}
                <Card>
                  <CardContent className="p-4 space-y-2">
                    <h4 className="text-[9px] font-black uppercase tracking-widest text-gray-400 flex items-center gap-1">
                      <AlertCircle size={11} className="text-orange-400" /> Issues
                    </h4>
                    <div className="space-y-1">
                      {[
                        { label: 'Open',     value: dashboardStats.issues.open,     cls: dashboardStats.issues.open > 0 ? 'text-orange-600' : 'text-gray-400' },
                        { label: 'Resolved', value: dashboardStats.issues.resolved, cls: 'text-emerald-600' },
                      ].map(r => (
                        <div key={r.label} className="flex justify-between items-center">
                          <span className="text-[10px] text-gray-400">{r.label}</span>
                          <span className={`text-[13px] font-black font-mono ${r.cls}`}>{r.value}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          );
        })()}

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
                  {activeProjects.length > 0 && (
                    <div className="pt-2 border-t border-gray-100 dark:border-gray-800 space-y-1.5">
                      {activeProjects.slice(0, 5).map(p => (
                        <Link key={p.id} to={`/projects/${p.id}`}
                          className="flex items-center justify-between gap-3 px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900/40 transition-colors group">
                          <span className="text-xs font-semibold text-gray-700 dark:text-gray-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 truncate">{p.name}</span>
                          <Badge variant={PROJECT_STATUS_BADGE_VARIANT[p.status]}>{PROJECT_STATUS_LABELS[p.status]}</Badge>
                        </Link>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          );
        })()}

        {/* ── Project Timelines (progress vs elapsed time) ───────────────────── */}
        <ProjectTimelineBars projects={scopedProjectsForTimeline} />

        {/* ── At Risk (overdue tasks + stalled projects, current-state) ──────── */}
        <AtRiskWidget data={atRisk} loading={atRiskLoading} />

        {/* ── Breakdown Matrix (admin only) ───────────────────────────────────── */}
        {isAdmin && <BreakdownMatrix from={range.from} to={range.to} />}

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
                        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                          {[...incomplete, ...complete].map(r => {
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
                        </div>
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

        {/* ── Effort & Productivity widgets ─────────────────────────────────── */}
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-black uppercase tracking-widest text-gray-400 flex items-center gap-2">
              <Activity size={15} className="text-indigo-600" /> Effort & Productivity
              {effortLoading && <span className="text-[10px] font-bold text-gray-400 normal-case tracking-normal">updating…</span>}
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            {([
              { label: 'Active Users', value: String(effortStats?.totalActiveUsers ?? 0), icon: Users, color: 'blue' },
              { label: 'Working Hours', value: formatSeconds(effortStats?.workingSeconds ?? 0), icon: Clock, color: 'indigo' },
              { label: 'Productive Hours', value: formatSeconds(effortStats?.productiveSeconds ?? 0), icon: Zap, color: 'emerald' },
              { label: 'Currently Working', value: String(effortStats?.usersCurrentlyWorking ?? 0), icon: Activity, color: 'emerald' },
              { label: 'In Pause / Review', value: String(effortStats?.usersInPauseReview ?? 0), icon: PauseCircle, color: 'amber' },
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

          {/* Top productive users */}
          <Card>
            <CardContent className="p-5">
              <h3 className="text-[11px] font-black uppercase tracking-widest text-gray-400 flex items-center gap-1.5 mb-3">
                <Trophy size={13} className="text-amber-500" /> Top Productive Users
              </h3>
              {effortStats && effortStats.topProductiveUsers.length > 0 ? (
                <div className="space-y-2">
                  {effortStats.topProductiveUsers.map((u, i) => {
                    const max = effortStats.topProductiveUsers[0].productiveSeconds || 1;
                    const pct = Math.round((u.productiveSeconds / max) * 100);
                    return (
                      <div key={u.userId} className="flex items-center gap-3">
                        <span className="text-[11px] font-black text-gray-400 w-4 shrink-0">{i + 1}</span>
                        <InteractiveLink type="user" id={u.userId} className="flex items-center gap-2 w-40 shrink-0 min-w-0">
                          <img src={u.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.userName)}&background=random`} alt="" className="h-6 w-6 rounded border border-gray-100 dark:border-gray-800 object-cover" />
                          <span className="text-[12px] font-bold text-gray-700 dark:text-gray-200 truncate hover:text-indigo-600">{u.userName}</span>
                        </InteractiveLink>
                        <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-500" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-[11px] font-mono font-bold text-gray-500 dark:text-gray-400 shrink-0 w-16 text-right">{formatSeconds(u.productiveSeconds)}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[11px] text-gray-400 italic">No productive time recorded for this period.</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* My Work: Assigned to Me | Created by Me (if any) */}
        {(() => {
          const renderRow = (task: Task) => {
            const assignee = users.find(u => u.id === task.assigneeId);
            const daysLeft = task.dueDate ? Math.ceil((new Date(task.dueDate).getTime() - Date.now()) / 86400000) : null;
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
                {daysLeft != null && taskIsOverdue(task)
                  ? <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold whitespace-nowrap shrink-0 mt-0.5 bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400">{Math.abs(daysLeft)}d overdue</span>
                  : task.dueDate && <span className="text-[10px] font-mono text-gray-400 whitespace-nowrap shrink-0 mt-0.5 flex items-center gap-1"><Calendar size={9} className="opacity-60" />{formatDate(task.dueDate)}</span>}
              </div>
            );
          };

          const simpleBox = (title: string, Icon: typeof UserCheck, items: Task[], empty: string, viewAllTo: string) => (
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

          // Deadlines box (overdue first, then upcoming) — shown right of "Assigned to Me"
          const hasOverdue = myDeadlines.some(taskIsOverdue);
          const deadlinesBox = (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <ClipboardCheck size={16} className={hasOverdue ? 'text-red-500' : 'text-indigo-500'} />
                  <h3 className="text-sm font-black uppercase tracking-tight text-gray-900 dark:text-white">Overdue &amp; Upcoming Deadlines</h3>
                  {hasOverdue && (
                    <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400">
                      {myDeadlines.filter(taskIsOverdue).length} overdue
                    </span>
                  )}
                </div>
                <Link to={`/tasks?mine=1&due=${hasOverdue ? 'overdue' : 'upcoming'}`} className="text-xs text-indigo-600 font-semibold hover:underline">View all →</Link>
              </div>
              <Card>
                <CardContent className="p-4 space-y-2">
                  {myDeadlines.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4">No upcoming or overdue deadlines</p>
                  ) : (
                    myDeadlines.map((task, idx) => {
                      const assignee = users.find(u => u.id === task.assigneeId);
                      const daysLeft = Math.ceil((new Date(task.dueDate!).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                      const urgency = daysLeft < 0 ? 'overdue' : daysLeft === 0 ? 'today' : daysLeft <= 2 ? 'soon' : 'normal';
                      const prevOverdue = idx > 0 && taskIsOverdue(myDeadlines[idx - 1]);
                      const showUpcomingDivider = !taskIsOverdue(task) && (idx === 0 || prevOverdue);
                      return (
                        <React.Fragment key={task.id}>
                          {showUpcomingDivider && idx > 0 && (
                            <div className="pt-1 text-[9px] font-black uppercase tracking-widest text-gray-400">Upcoming</div>
                          )}
                          <div className="flex items-start justify-between gap-2 py-1.5 border-b border-gray-50 dark:border-gray-900 last:border-0">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <InteractiveLink type="task" id={task.id} className="text-[13px] font-semibold text-gray-700 dark:text-gray-300 hover:text-indigo-600 truncate">
                                  {task.title}
                                </InteractiveLink>
                                {task.isBlocked && <ShieldAlert size={11} className="text-red-500 shrink-0" />}
                              </div>
                              {assignee && (
                                <InteractiveLink type="user" id={assignee.id} className="flex items-center gap-1 mt-0.5 w-fit hover:opacity-80 transition-opacity">
                                  <img
                                    src={assignee.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(assignee.name)}&background=random&size=20`}
                                    alt={assignee.name}
                                    className="h-3.5 w-3.5 rounded-full object-cover border border-indigo-200 dark:border-indigo-800"
                                  />
                                  <span className="text-[10px] font-semibold text-indigo-500 dark:text-indigo-400 truncate max-w-[80px]">{assignee.name}</span>
                                </InteractiveLink>
                              )}
                            </div>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold whitespace-nowrap shrink-0 mt-0.5 ${
                              urgency === 'overdue' ? 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400' :
                              urgency === 'today'   ? 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400' :
                              urgency === 'soon'    ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400' :
                                                      'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                            }`}>
                              {urgency === 'overdue' ? `${Math.abs(daysLeft)}d overdue` : urgency === 'today' ? 'Today' : `In ${daysLeft}d`}
                            </span>
                          </div>
                        </React.Fragment>
                      );
                    })
                  )}
                </CardContent>
              </Card>
            </div>
          );

          return (
            <div className="space-y-4">
              {/* Assigned to Me | Overdue & Upcoming Deadlines */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
                {simpleBox('Assigned to Me', UserCheck, assignedToMe, 'No tasks assigned to you', '/tasks?mine=1')}
                {deadlinesBox}
              </div>
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

                    const daysLeft = Math.ceil((new Date(task.dueDate).getTime() - Date.now()) / 86400000);
                    const isOverdue = daysLeft < 0 && task.status !== 'completed';

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

                          {/* Due date */}
                          <span className={`text-[10px] font-mono font-semibold flex items-center gap-1 ${
                            isOverdue ? 'text-red-500' :
                            daysLeft === 0 ? 'text-amber-500' :
                            daysLeft <= 2 ? 'text-amber-400' :
                            'text-gray-400'
                          }`}>
                            <Calendar size={9} className="opacity-60" />
                            {isOverdue
                              ? `${Math.abs(daysLeft)}d overdue`
                              : daysLeft === 0 ? 'Due today'
                              : formatDate(task.dueDate)}
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
              } catch {
                showError('Failed to reassign task');
              }
              setReassigningTaskId(null);
            }}
          />
        )}
      </div>
    </PageTransition>
  );
}
