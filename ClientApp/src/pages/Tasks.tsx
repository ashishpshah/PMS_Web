import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, Plus, Clock, Edit2, Trash2, User, LayoutGrid, List, ListTodo, MessageCircle, ChevronUp, ChevronDown, Tag, X, Calendar, ArrowRight, Check, ChevronDown as ChevronDownIcon, MoreHorizontal, ShieldAlert, GripVertical, CheckSquare, History, Folder, GitBranch, ChevronLeft, ChevronRight, Activity, Zap, AlertTriangle, Filter, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { taskService, TaskFilters } from '../services/task.service';
import { TaskStatusHistory, TaskEffort } from '../types';
import { formatSeconds } from '../lib/utils';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { Button } from '../components/ui/Button';
import { Card, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Task, Status, Priority, Attachment, STATUS_LABELS, STATUS_BADGE_VARIANT, TASK_STATUSES, ReasonTag, REASON_TAGS, BLOCK_REASON_TAGS, AddBlockItem, BLOCK_CATEGORIES } from '../types';
import { cn, formatDateTime, toInputDate, toHHMM, fromHHMM, MAX_HOURS_PER_ENTRY, isValidHoursEntry, HOURS_EXEMPT_EDGES } from '../lib/utils';
import { TaskAttachmentsPanel } from '../components/ui/TaskAttachmentsPanel';
import { DateInput } from '../components/ui/DateInput';
import { TimeInput } from '../components/ui/TimeInput';
import { InteractiveLink } from '../components/ui/InteractiveLink';
import { ChecklistPanel } from '../components/ui/ChecklistPanel';
import { TaskBlockPanel } from '../components/ui/TaskBlockPanel';
import { ReviewChecklistPanel } from '../components/ui/ReviewChecklistPanel';
import { TaskStatusActions } from '../components/ui/TaskStatusActions';
import { PageHeader } from '../components/ui/PageHeader';
import { EmptyState } from '../components/ui/EmptyState';
import { PageTransition } from '../components/Layout/PageTransition';
import { useSweetAlert } from '../context/SweetAlertContext';
import { showSuccess, showError } from '../lib/toast';
import { VSelect, SelectOption } from '../components/forms/VSelect';
import { useDebounce } from '../hooks';
import { exportTasks } from '../lib/importExport';

const PRIORITY_OPTIONS: SelectOption[] = [
  { value: 'low',      label: 'Low' },
  { value: 'medium',   label: 'Medium' },
  { value: 'high',     label: 'High' },
  { value: 'critical', label: 'Critical' },
];

// Hoisted so the per-row status VSelect in the table doesn't reallocate this array on every render.
const STATUS_OPTIONS: SelectOption[] = TASK_STATUSES.map((s): SelectOption => ({ value: s, label: STATUS_LABELS[s] }));

// ─── highlight helper (from Kanban) ──────────────────────────────────────────
function highlightText(text: string, query: string): React.ReactNode {
  if (!query || !text) return text;
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);
  return (
    <>
      {parts.map((part, i) =>
        regex.test(part)
          ? <mark key={i} className="bg-amber-200 dark:bg-amber-700/60 text-amber-900 dark:text-amber-100 rounded-sm px-0.5">{part}</mark>
          : part
      )}
    </>
  );
}

const COLUMNS: { title: string; status: Status; dot: string }[] = [
  { title: 'New',          status: 'new',          dot: 'bg-gray-400'    },
  { title: 'In Progress',  status: 'in-progress',  dot: 'bg-indigo-500'  },
  { title: 'Paused',       status: 'paused',        dot: 'bg-amber-500'   },
  { title: 'Blocked',      status: 'blocked',       dot: 'bg-red-500'     },
  { title: 'Under Review', status: 'under-review',  dot: 'bg-purple-500'  },
  { title: 'Issues',       status: 'issues',        dot: 'bg-orange-500'  },
  { title: 'Completed',    status: 'completed',     dot: 'bg-emerald-500' },
];

// Next-stage advance for the quick "+" button on each card
const NEXT_STAGE: Record<Status, Status | null> = {
  'new':          'in-progress',
  'in-progress':  'under-review',
  'paused':       'in-progress',
  'blocked':      'in-progress',
  'under-review': 'completed',
  'issues':       'in-progress',
  'completed':    null,
};

// ── Status colour maps ────────────────────────────────────────────────────────
const STATUS_DOT: Record<string, string> = {
  'new':          'bg-gray-400',
  'in-progress':  'bg-indigo-500',
  'paused':       'bg-amber-500',
  'blocked':      'bg-red-500',
  'under-review': 'bg-purple-500',
  'issues':       'bg-orange-500',
  'completed':    'bg-emerald-500',
};
const STATUS_BAR: Record<string, string> = {
  'new':          'bg-gray-300 dark:bg-gray-600',
  'in-progress':  'bg-indigo-500',
  'paused':       'bg-amber-400',
  'blocked':      'bg-red-400',
  'under-review': 'bg-purple-400',
  'issues':       'bg-orange-400',
  'completed':    'bg-emerald-500',
};

// ── Progress ring (SVG) ───────────────────────────────────────────────────────
function ProgressRing({ pct, size = 28 }: { pct: number; size?: number }) {
  const r = (size - 4) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  const color = pct === 100 ? '#10b981' : pct >= 60 ? '#6366f1' : pct >= 30 ? '#f59e0b' : '#94a3b8';
  return (
    <svg width={size} height={size} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={3} className="text-gray-100 dark:text-gray-800" />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={3}
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fontSize={size < 30 ? 7 : 9} fontWeight="900" fill={color}>
        {pct}%
      </text>
    </svg>
  );
}

// ── Task Completion Modal ─────────────────────────────────────────────────────
interface TaskCompletionModalProps {
  task: Task;
  onClose: () => void;
}
function TaskCompletionModal({ task, onClose }: TaskCompletionModalProps) {
  const [tab, setTab] = useState<'history' | 'effort'>('history');
  const [history, setHistory] = useState<TaskStatusHistory[]>([]);
  const [effort, setEffort] = useState<TaskEffort | null>(null);
  const [histLoading, setHistLoading] = useState(false);
  const [effortLoading, setEffortLoading] = useState(false);

  // Fetch both on mount
  useEffect(() => {
    let cancelled = false;
    setHistLoading(true);
    taskService.getStatusHistory(task.id)
      .then(d => { if (!cancelled) setHistory(d); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setHistLoading(false); });
    setEffortLoading(true);
    taskService.getEffort(task.id)
      .then(d => { if (!cancelled) setEffort(d); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setEffortLoading(false); });
    return () => { cancelled = true; };
  }, [task.id]);

  // Escape key
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  const pct = task.progress ?? 0;

  // ── Date-wise effort (derived from timeline) ──────────────────────────────
  const WORK_START = 10, WORK_END = 19;
  function workingSecsForDay(s: Date, e: Date, day: Date) {
    const d0 = new Date(day); d0.setHours(WORK_START, 0, 0, 0);
    const d1 = new Date(day); d1.setHours(WORK_END,   0, 0, 0);
    const ss = s > d0 ? s : d0, ee = e < d1 ? e : d1;
    return ee > ss ? Math.floor((ee.getTime() - ss.getTime()) / 1000) : 0;
  }
  interface DayBucket { date: string; label: string; byStatus: Record<string, number>; total: number; productive: number; }
  const dayBuckets: DayBucket[] = useMemo(() => {
    if (!effort) return [];
    const map = new Map<string, DayBucket>();
    for (const seg of effort.timeline) {
      const s = new Date(seg.startAt), e = new Date(seg.endAt);
      if (e <= s) continue;
      const cur = new Date(s); cur.setHours(0, 0, 0, 0);
      const last = new Date(e); last.setHours(0, 0, 0, 0);
      while (cur <= last) {
        const ov = workingSecsForDay(s, e, cur);
        if (ov > 0) {
          const key = cur.toISOString().slice(0, 10);
          if (!map.has(key)) map.set(key, { date: key, label: cur.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }), byStatus: {}, total: 0, productive: 0 });
          const b = map.get(key)!;
          b.byStatus[seg.status] = (b.byStatus[seg.status] ?? 0) + ov;
          b.total += ov; if (seg.isProductive) b.productive += ov;
        }
        cur.setDate(cur.getDate() + 1);
      }
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [effort]);

  const [dayIdx, setDayIdx] = useState<number | null>(null);
  useEffect(() => { if (dayBuckets.length > 0) setDayIdx(dayBuckets.length - 1); }, [dayBuckets.length]);
  const safeIdx = dayIdx ?? (dayBuckets.length > 0 ? dayBuckets.length - 1 : 0);
  const currentDay = dayBuckets[safeIdx];
  const maxProd = useMemo(() => Math.max(...dayBuckets.map(d => d.productive), 1), [dayBuckets]);

  return (
    <AnimatePresence>
      <>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose} className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />

        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 14 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 14 }}
          transition={{ duration: 0.16 }}
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl z-[60] flex flex-col max-h-[88vh]"
          role="dialog" aria-modal="true"
        >
          {/* Header */}
          <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800 shrink-0 gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <ProgressRing pct={pct} size={36} />
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Task Completion</p>
                <h3 className="text-[14px] font-black text-gray-900 dark:text-white truncate leading-tight">{task.title}</h3>
                {task.code && <p className="text-[9px] font-mono text-gray-400">{task.code}</p>}
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-gray-400 shrink-0 transition-colors">
              <X size={16} />
            </button>
          </div>

          {/* Tab bar */}
          <div className="flex border-b border-gray-100 dark:border-gray-800 px-5 shrink-0">
            {(['history', 'effort'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`py-2.5 px-0.5 mr-5 text-[10px] font-black uppercase tracking-widest border-b-2 transition-colors ${tab === t ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}>
                {t === 'history' ? 'Status History' : 'Effort Timeline'}
              </button>
            ))}
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-3">

            {/* ── Tab 1: Status History ── */}
            {tab === 'history' && (
              histLoading ? (
                <div className="space-y-2 animate-pulse">{[...Array(4)].map((_, i) => <div key={i} className="h-12 bg-gray-100 dark:bg-gray-800 rounded-xl" />)}</div>
              ) : history.length === 0 ? (
                <p className="text-center text-[11px] text-gray-400 italic py-8">No status changes recorded yet.</p>
              ) : (
                <div className="relative pl-5 space-y-0">
                  <div className="absolute left-[9px] top-2 bottom-2 w-0.5 bg-gray-100 dark:bg-gray-800" />
                  {history.map((h, i) => (
                    <div key={h.id} className="relative flex gap-3 pb-3 last:pb-0">
                      {/* Dot */}
                      <span className={`absolute -left-5 top-1.5 h-3 w-3 rounded-full border-2 border-white dark:border-gray-900 shrink-0 ${STATUS_DOT[h.toStatus] ?? 'bg-gray-400'}`} />
                      <div className="flex-1 min-w-0 p-2.5 rounded-xl bg-gray-50/80 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800">
                        {/* Status transition */}
                        <div className="flex items-center gap-1.5 flex-wrap mb-1">
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-widest text-white ${STATUS_DOT[h.fromStatus] ?? 'bg-gray-400'}`}>
                            {STATUS_LABELS[h.fromStatus] ?? h.fromStatus}
                          </span>
                          <ChevronRight size={10} className="text-gray-400 shrink-0" />
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-widest text-white ${STATUS_DOT[h.toStatus] ?? 'bg-gray-400'}`}>
                            {STATUS_LABELS[h.toStatus] ?? h.toStatus}
                          </span>
                          {i === 0 && <span className="ml-auto text-[8px] font-black uppercase tracking-widest text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 px-1.5 py-0.5 rounded">Latest</span>}
                        </div>
                        {/* Meta row */}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[9px] text-gray-400 font-mono">
                          <span className="font-semibold text-gray-600 dark:text-gray-300">{h.changedByName}</span>
                          <span>{formatDateTime(h.changedAt)}</span>
                          {h.actualHours != null && h.actualHours > 0 && (
                            <span className="text-indigo-500 font-black">⏱ {toHHMM(h.actualHours)}</span>
                          )}
                          {h.reason && <span className="italic text-gray-400">"{h.reason}"</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}

            {/* ── Tab 2: Effort Timeline ── */}
            {tab === 'effort' && (
              effortLoading ? (
                <div className="space-y-2 animate-pulse">{[...Array(4)].map((_, i) => <div key={i} className="h-12 bg-gray-100 dark:bg-gray-800 rounded-xl" />)}</div>
              ) : !effort || effort.totalElapsedSeconds === 0 ? (
                <p className="text-center text-[11px] text-gray-400 italic py-8">No effort recorded yet.</p>
              ) : (
                <div className="space-y-3">
                  {/* Totals */}
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'Total', val: formatSeconds(effort.totalElapsedSeconds), cls: 'text-gray-700 dark:text-gray-200' },
                      { label: 'Productive', val: formatSeconds(effort.productiveSeconds), cls: 'text-indigo-600 dark:text-indigo-300' },
                      { label: 'Non-productive', val: formatSeconds(effort.pausedSeconds + effort.blockedSeconds + effort.underReviewSeconds), cls: 'text-amber-600 dark:text-amber-400' },
                    ].map(c => (
                      <div key={c.label} className="p-2 rounded-xl bg-gray-50/60 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800 text-center">
                        <div className="text-[8px] font-black uppercase tracking-widest text-gray-400 mb-0.5">{c.label}</div>
                        <div className={`text-[13px] font-black font-mono ${c.cls}`}>{c.val}</div>
                      </div>
                    ))}
                  </div>

                  {/* Stacked bar */}
                  {effort.totalElapsedSeconds > 0 && (
                    <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                      {effort.byStatus.filter(s => s.seconds > 0).map(s => (
                        <div key={s.status} className={STATUS_BAR[s.status] ?? 'bg-gray-400'} style={{ width: `${(s.seconds / effort.totalElapsedSeconds) * 100}%` }}
                          title={`${STATUS_LABELS[s.status] ?? s.status}: ${formatSeconds(s.seconds)}`} />
                      ))}
                    </div>
                  )}

                  {/* Date navigator */}
                  {dayBuckets.length > 0 && (
                    <div className="space-y-2 pt-1">
                      <div className="flex items-center gap-1.5">
                        <Activity size={10} className="text-indigo-400 shrink-0" />
                        <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">Date-wise Breakdown</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => setDayIdx(i => Math.max(0, (i ?? safeIdx) - 1))} disabled={safeIdx === 0}
                          className="p-1 rounded-md border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors" aria-label="Previous day">
                          <ChevronLeft size={12} />
                        </button>
                        <div className="flex-1 text-center">
                          <span className="text-[11px] font-black text-gray-800 dark:text-gray-100">{currentDay?.label ?? '—'}</span>
                          <span className="ml-1.5 text-[9px] text-gray-400 font-mono">{safeIdx + 1}/{dayBuckets.length}</span>
                        </div>
                        <button onClick={() => setDayIdx(i => Math.min(dayBuckets.length - 1, (i ?? safeIdx) + 1))} disabled={safeIdx === dayBuckets.length - 1}
                          className="p-1 rounded-md border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors" aria-label="Next day">
                          <ChevronRight size={12} />
                        </button>
                      </div>

                      {currentDay && currentDay.total > 0 ? (
                        <div className="space-y-1.5">
                          {Object.entries(currentDay.byStatus).filter(([, v]) => v > 0).map(([status, secs]) => (
                            <div key={status} className="flex items-center gap-2">
                              <span className={`h-2 w-2 rounded-sm shrink-0 ${STATUS_DOT[status] ?? 'bg-gray-400'}`} />
                              <span className="text-[10px] font-semibold text-gray-600 dark:text-gray-300 w-20 shrink-0 truncate">{STATUS_LABELS[status as Status] ?? status}</span>
                              <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${STATUS_BAR[status] ?? 'bg-gray-400'}`} style={{ width: `${Math.round((secs / Math.max(currentDay.total, 1)) * 100)}%` }} />
                              </div>
                              <span className="text-[9px] font-mono font-bold text-gray-500 w-10 text-right shrink-0">{formatSeconds(secs)}</span>
                            </div>
                          ))}
                          <div className="pt-1 border-t border-gray-100 dark:border-gray-800 flex justify-between text-[9px] font-mono text-gray-400">
                            <span>Total (office hrs)</span><span className="font-black text-gray-600 dark:text-gray-300">{formatSeconds(currentDay.total)}</span>
                          </div>
                        </div>
                      ) : (
                        <p className="text-[10px] text-gray-400 italic text-center py-2">No office-hour effort on this day.</p>
                      )}

                      {/* Sparkline */}
                      <div className="flex gap-0.5 flex-wrap pt-1">
                        {dayBuckets.map((d, i) => {
                          const pctBar = maxProd > 0 ? d.productive / maxProd : 0;
                          const isAct = i === safeIdx;
                          return (
                            <button key={d.date} onClick={() => setDayIdx(i)} title={`${d.label}: ${formatSeconds(d.productive)}`}
                              className={`relative h-6 w-4 rounded flex flex-col justify-end overflow-hidden border transition-all ${isAct ? 'border-indigo-500' : 'border-gray-100 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-600'}`}>
                              <div className={`w-full rounded-sm ${isAct ? 'bg-indigo-500' : d.productive > 0 ? 'bg-indigo-300 dark:bg-indigo-700' : 'bg-gray-100 dark:bg-gray-800'}`}
                                style={{ height: `${Math.max(pctBar * 100, d.total > 0 ? 12 : 0)}%` }} />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Per-user effort */}
                  {effort.byUser.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <div className="flex items-center gap-1.5">
                        <User size={10} className="text-indigo-400 shrink-0" />
                        <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">User Effort</span>
                      </div>
                      {effort.byUser.map(u => (
                        <div key={u.userId} className="p-2 rounded-xl bg-gray-50/60 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-[11px] font-bold text-gray-700 dark:text-gray-200 truncate">{u.userName}</span>
                            <span className="text-[10px] font-mono font-black text-indigo-600 dark:text-indigo-300 ml-2 shrink-0">{formatSeconds(u.productiveSeconds)}</span>
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[8px] font-mono text-gray-400">
                            {u.pausedSeconds > 0 && <span>paused {formatSeconds(u.pausedSeconds)}</span>}
                            {u.firstStartedAt && <span>started {formatDateTime(u.firstStartedAt)}</span>}
                            {u.completedAt && <span className="text-emerald-500">done {formatDateTime(u.completedAt)}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            )}
          </div>
        </motion.div>
      </>
    </AnimatePresence>
  );
}

export default function Tasks() {
  const { projects, users, addTask, updateTask, deleteTask, addActivity, addChecklistItem, toggleChecklistItem, updateChecklistItem, deleteChecklistItem, markAllChecklistComplete, startTask, changeTaskStatus, reassignTask, toggleTaskCondition, addTaskIssueEntry, resolveTaskIssueEntry, addTaskReviewIssue, resolveTaskReviewIssue, completeReview } = useData();
  const { user: currentUser, isAdmin } = useAuth();
  const { canCreate: canCreateTask, canUpdate: canUpdateTask, canDelete: canDeleteTask } = usePermissions();
  const { confirmAlert } = useSweetAlert();

  // ── view & modal state ────────────────────────────────────────────────────
  const [isModalOpen, setIsModalOpen]     = useState(false);
  const [editingTask, setEditingTask]     = useState<Task | null>(null);
  const [view, setView]                   = useState<'kanban' | 'list'>('kanban');
  const [attachments, setAttachments]     = useState<Attachment[]>([]);
  const [selectedAssignee, setSelectedAssignee] = useState<string>('');
  const [taskTags, setTaskTags]           = useState<string[]>([]);
  const [tagInput, setTagInput]           = useState('');
  const [newTaskChecklist, setNewTaskChecklist] = useState<string[]>([]);
  const [newChecklistInput, setNewChecklistInput] = useState('');
  const [modalDueDate, setModalDueDate]   = useState('');
  const [modalEstHours, setModalEstHours] = useState('');
  const [modalParentTaskId, setModalParentTaskId] = useState<number | ''>('');
  const [modalProjectId, setModalProjectId] = useState<number | ''>('');
  const [modalQaAssigneeId, setModalQaAssigneeId] = useState<number | ''>('');
  const [modalModule, setModalModule]     = useState('');
  const [modalPriority, setModalPriority] = useState<Priority>('medium');
  const [editTab, setEditTab] = useState<'details' | 'checklist' | 'status' | 'qa' | 'assignment'>('details');
  const [isModalEditMode, setIsModalEditMode] = useState(true);
  const [assignTabNewAssigneeId, setAssignTabNewAssigneeId] = useState<number | ''>('');
  const [assignTabReason, setAssignTabReason] = useState<ReasonTag | ''>('');
  const [statusHistory, setStatusHistory]   = useState<TaskStatusHistory[]>([]);
  const [histLoading, setHistLoading]       = useState(false);
  const [pauseInput, setPauseInput]         = useState('');
  const [showPauseInput, setShowPauseInput] = useState(false);
  const [newIssueDesc, setNewIssueDesc]     = useState('');
  const [reviewIssueRows, setReviewIssueRows] = useState<string[]>(['']);
  const [showReviewIssueForm, setShowReviewIssueForm] = useState(false);
  const [isCompletingReview, setIsCompletingReview] = useState(false);

  // ── sort state (list view) — default: most recently updated/created first ──
  const [sortField, setSortField] = useState<keyof Task | 'assigneeName' | 'recent'>('recent');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // ── kanban mouse-drag pan ─────────────────────────────────────────────────
  const [isPanning, setIsPanning]   = useState(false);
  const [startX, setStartX]         = useState(0);
  const [startY, setStartY]         = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [scrollTop, setScrollTop]   = useState(0);

  // ── kanban drag-and-drop state ────────────────────────────────────────────
  const dragFromHandle = React.useRef(false);
  const [draggedTaskId, setDraggedTaskId]   = useState<number | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<Status | null>(null);

  // ── filter state ──────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery]           = useState('');
  const debouncedSearch = useDebounce(searchQuery, 350);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [selectedUserIds, setSelectedUserIds]   = useState<number[]>([]);
  const [selectedOwnerIds, setSelectedOwnerIds] = useState<number[]>([]);
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);
  const [projectDropdownPos, setProjectDropdownPos] = useState<{ top: number; left: number } | null>(null);
  const projectFilterBtnRef = React.useRef<HTMLButtonElement>(null);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [userDropdownPos, setUserDropdownPos] = useState<{ top: number; left: number } | null>(null);
  const userFilterBtnRef = React.useRef<HTMLButtonElement>(null);
  const [ownerDropdownOpen, setOwnerDropdownOpen] = useState(false);
  const [ownerDropdownPos, setOwnerDropdownPos] = useState<{ top: number; left: number } | null>(null);
  const ownerFilterBtnRef = React.useRef<HTMLButtonElement>(null);
  const [dueDropdownOpen, setDueDropdownOpen]   = useState(false);
  const [dueDropdownPos, setDueDropdownPos]     = useState<{ top: number; left: number } | null>(null);
  const dueFilterBtnRef = React.useRef<HTMLButtonElement>(null);
  const [showBlockedOnly, setShowBlockedOnly]   = useState(false);
  const [showHasIssues, setShowHasIssues]       = useState(false);
  const [showCreatedByMe, setShowCreatedByMe]   = useState(false);
  const [dueFilter, setDueFilter]               = useState<'all' | 'has-due' | 'overdue' | 'upcoming'>('all');

  // ── local pagination ──────────────────────────────────────────────────────
  const [localPage, setLocalPage]       = useState(1);
  const [localPageSize, setLocalPageSize] = useState(25);

  // ── task completion modal ─────────────────────────────────────────────────
  const [completionTask, setCompletionTask] = useState<Task | null>(null);

  // ── pending block modal (drag-drop to blocked column) ─────────────────────
  const [pendingBlockTask, setPendingBlockTask] = useState<Task | null>(null);

  // ── pending hours-spent modal (drag-drop to an hours-required column) ─────
  const [pendingHoursMove, setPendingHoursMove] = useState<{ task: Task; status: Status } | null>(null);

  // ── server-side task fetch (replaces DataContext.tasks pre-load) ──────────
  const [pagedTasks, setPagedTasks]         = useState<Task[]>([]);
  const [tasksTotalCount, setTasksTotalCount] = useState(0);
  const [tasksPage, setTasksPage]           = useState(1);
  const [tasksLoading, setTasksLoading]     = useState(false);
  const [refreshKey, setRefreshKey]         = useState(0);
  const refreshTasks = useCallback(() => setRefreshKey(k => k + 1), []);
  const TASKS_PAGE_SIZE = 100;

  // ── reassign modal state (from Kanban page) ───────────────────────────────
  const [reassigningTask, setReassigningTask] = useState<Task | null>(null);
  const [newAssigneeId, setNewAssigneeId]     = useState<number>(0);
  const [assigneeHistoryTaskId, setAssigneeHistoryTaskId] = useState<number | null>(null);
  const [reassignmentReason, setReassignmentReason] = useState<ReasonTag | ''>('');

  // ── deep-link: ?newLinkedFrom=<parentTaskId> opens create modal pre-filled ─
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const linkedFromRaw = searchParams.get('newLinkedFrom');
    if (!linkedFromRaw) return;
    const parentId = Number(linkedFromRaw);
    // Fetch parent task directly — context no longer pre-loads all tasks.
    taskService.getById(parentId).then(parent => {
      setEditingTask(null);
      setModalParentTaskId(parentId);
      setModalProjectId(parent.projectId);
      setModalDueDate(new Date().toISOString().split('T')[0]);
      setModalEstHours('01:00');
      setIsModalOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete('newLinkedFrom');
      setSearchParams(next, { replace: true });
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // ── deep-link filters from Dashboard "View all" links ─────────────────────
  // ?mine=1 (assigned to me) · ?createdByMe=1 · ?due=overdue|upcoming · ?blocked=1
  useEffect(() => {
    const mine = searchParams.get('mine');
    const createdByMe = searchParams.get('createdByMe');
    const due = searchParams.get('due');
    const blocked = searchParams.get('blocked');
    if (!mine && !createdByMe && !due && !blocked) return;

    if (mine === '1' && currentUser) setSelectedUserIds([currentUser.id]);
    if (createdByMe === '1') setShowCreatedByMe(true);
    if (due === 'overdue' || due === 'upcoming') setDueFilter(due);
    if (blocked === '1') setShowBlockedOnly(true);

    // Clean the filter params from the URL (state now drives the UI)
    const next = new URLSearchParams(searchParams);
    ['mine', 'createdByMe', 'due', 'blocked'].forEach(k => next.delete(k));
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // ── server-side task fetch ────────────────────────────────────────────────
  // Fires on mount, server-filterable filter changes, page changes, or after mutations.
  useEffect(() => {
    let cancelled = false;
    setTasksLoading(true);
    const filters: TaskFilters = {};
    if (selectedProjectId !== null) filters.projectId = selectedProjectId;
    if (selectedUserIds.length === 1) filters.assigneeId = selectedUserIds[0];
    if (debouncedSearch.trim()) filters.search = debouncedSearch.trim();
    taskService.getAll(filters, tasksPage, TASKS_PAGE_SIZE)
      .then(result => {
        if (!cancelled) {
          setPagedTasks(result.tasks);
          setTasksTotalCount(result.totalCount);
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setTasksLoading(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProjectId, selectedUserIds, debouncedSearch, tasksPage, refreshKey]);

  // Reset server page 1 when server-side filters change.
  useEffect(() => {
    setTasksPage(1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProjectId, selectedUserIds, debouncedSearch]);

  // Reset local page when client-side filters or data change.
  useEffect(() => {
    setLocalPage(1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, showBlockedOnly, showHasIssues, showCreatedByMe, dueFilter, selectedOwnerIds, pagedTasks]);

  // ── helpers ───────────────────────────────────────────────────────────────
  const getProjectName  = (id: number) => projects.find(p => p.id === id)?.name || 'Project';
  const getAssigneeName = (id: number) => users.find(u => u.id === id)?.name || 'Unassigned';
  const getAssignee     = (id: number) => users.find(u => u.id === id);

  // Per-task permission: admin role perm OR task creator OR project owner/creator
  const canEditTask = (task: Task) => {
    if (canUpdateTask('/tasks') || currentUser?.id === task.createdById) return true;
    const proj = projects.find(p => p.id === task.projectId);
    return proj ? (currentUser?.id === proj.ownerId || currentUser?.id === proj.createdById) : false;
  };

  const canDeleteTaskItem = (task: Task) => {
    if (canDeleteTask('/tasks') || currentUser?.id === task.createdById) return true;
    const proj = projects.find(p => p.id === task.projectId);
    return proj ? (currentUser?.id === proj.ownerId || currentUser?.id === proj.createdById) : false;
  };

  // Can create tasks: role perm OR is owner/creator of any visible project
  const canCreateAnyTask = canCreateTask('/tasks') || projects.some(p =>
    currentUser?.id === p.ownerId || currentUser?.id === p.createdById
  );

  // ── filter helpers ────────────────────────────────────────────────────────
  const toggleUser = (id: number) => {
    setSelectedUserIds(prev => prev.includes(id) ? prev.filter(u => u !== id) : [...prev, id]);
    setUserDropdownOpen(false);
  };

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedProjectId(null);
    setSelectedUserIds([]);
    setSelectedOwnerIds([]);
    setShowBlockedOnly(false);
    setShowHasIssues(false);
    setShowCreatedByMe(false);
    setDueFilter('all');
    setProjectDropdownOpen(false);
    setUserDropdownOpen(false);
    setOwnerDropdownOpen(false);
    setDueDropdownOpen(false);
    setLocalPage(1);
  };

  const hasActiveFilters = !!(searchQuery || selectedProjectId !== null || selectedUserIds.length > 0 || selectedOwnerIds.length > 0 || showBlockedOnly || showHasIssues || showCreatedByMe || dueFilter !== 'all');

  const selectedProjectLabel = selectedProjectId === null
    ? 'All Projects'
    : projects.find(p => p.id === selectedProjectId)?.name || 'Project';

  const selectedUsersLabel =
    selectedUserIds.length === 0     ? 'All Users' :
    selectedUserIds.length === 1     ? users.find(u => u.id === selectedUserIds[0])?.name || 'User' :
                                       `${selectedUserIds.length} Users`;

  // ── mouse drag pan (board scroll) ────────────────────────────────────────
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-task-card]')) return;
    setIsPanning(true);
    setStartX(e.clientX);
    setStartY(e.clientY);
    const el = e.currentTarget as HTMLElement;
    setScrollLeft(el.scrollLeft);
    setScrollTop(el.scrollTop);
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning) return;
    const el = e.currentTarget as HTMLElement;
    el.scrollLeft = scrollLeft + (startX - e.clientX);
    el.scrollTop  = scrollTop  + (startY - e.clientY);
  };
  const handleMouseUp = () => setIsPanning(false);

  // ── drag-and-drop handlers ────────────────────────────────────────────────
  const handleDragStart = (e: React.DragEvent, taskId: number) => {
    setDraggedTaskId(taskId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('taskId', String(taskId));
  };

  const handleDragEnd = () => {
    setDraggedTaskId(null);
    setDragOverColumn(null);
  };

  const handleDragOver = (e: React.DragEvent, status: Status) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverColumn(status);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
      setDragOverColumn(null);
    }
  };

  const handleDrop = async (e: React.DragEvent, targetStatus: Status) => {
    e.preventDefault();
    setDragOverColumn(null);
    const taskId = Number(e.dataTransfer.getData('taskId'));
    const task = pagedTasks.find(t => t.id === taskId);
    if (!task || task.status === targetStatus) return;
    await moveTask(task, targetStatus);
  };

  // ── modal open/close ──────────────────────────────────────────────────────
  const handleOpenModal = (task?: Task, editMode = true) => {
    setIsModalEditMode(editMode || !task);
    if (task) {
      setEditingTask(task);
      setAttachments(task.attachments || []);
      setSelectedAssignee(String(task.assigneeId));
      setTaskTags(task.tags || []);
      setModalDueDate(toInputDate(task.dueDate) || new Date().toISOString().split('T')[0]);
      setModalEstHours(toHHMM(task.estimatedHours));
      setModalQaAssigneeId(task.qaAssigneeId ?? '');
      setModalProjectId(task.projectId);
      setModalModule(task.module ?? '');
      setModalPriority(task.priority || 'medium');
    } else {
      setEditingTask(null);
      setAttachments([]);
      setSelectedAssignee('');
      setTaskTags([]);
      setModalDueDate(new Date().toISOString().split('T')[0]);
      setModalEstHours('');
      setModalQaAssigneeId('');
      setModalModule('');
      setModalPriority('medium');
    }
    setTagInput('');
    setNewTaskChecklist([]);
    setNewChecklistInput('');
    setEditTab('details');
    setPauseInput('');
    setShowPauseInput(false);
    setNewIssueDesc('');
    setReviewIssueRows(['']);
    setShowReviewIssueForm(false);
    setIsCompletingReview(false);
    setStatusHistory([]);
    setHistLoading(false);
    setAssignTabNewAssigneeId('');
    setAssignTabReason('');
    setIsModalOpen(true);
  };

  // ── fetch status history when modal opens for an existing task ───────────
  useEffect(() => {
    if (!editingTask?.id || !isModalOpen) return;
    let cancelled = false;
    setHistLoading(true);
    taskService.getStatusHistory(editingTask.id)
      .then(d => { if (!cancelled) setStatusHistory(d); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setHistLoading(false); });
    return () => { cancelled = true; };
  }, [editingTask?.id, isModalOpen]);

  // ── tag helpers ───────────────────────────────────────────────────────────
  const handleAddTag = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const tag = tagInput.trim().replace(/,/g, '');
      if (tag && !taskTags.includes(tag)) setTaskTags([...taskTags, tag]);
      setTagInput('');
    }
  };
  const removeTag = (tagToRemove: string, shouldEdit = false) => {
    setTaskTags(taskTags.filter(t => t !== tagToRemove));
    if (shouldEdit) setTagInput(tagToRemove);
  };

  // ── submit (create / update) ──────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const newAssigneeIdNum = Number(formData.get('assigneeId'));

    const liveTask = editingTask ? pagedTasks.find(t => t.id === editingTask.id) : null;
    const checklist = liveTask?.checklistItems ?? [];
    const dynamicProgress = checklist.length > 0
      ? Math.round((checklist.filter(i => i.isCompleted).length / checklist.length) * 100)
      : (editingTask?.progress ?? 0);

    const parentIdRaw = formData.get('parentTaskId');
    const parentTaskId = parentIdRaw && parentIdRaw !== '' ? Number(parentIdRaw) : undefined;

    const qaAssigneeId = modalQaAssigneeId !== '' ? Number(modalQaAssigneeId) : undefined;
    const requiresQA = qaAssigneeId != null;

    // Estimated hours are compulsory for every task. This is a total-effort figure for the
    // whole task (not a single day's work), so unlike hours-spent entries it is NOT capped at
    // 24h — it mirrors the backend's own bound (DTOs/GeneralDtos.cs: [Range(0.01, 100000)]).
    const estimatedHours = fromHHMM(formData.get('estimatedHours') as string);
    if (estimatedHours == null || estimatedHours <= 0) {
      showError('Estimated hours are required (HH:MM, greater than zero).');
      return;
    }

    // New tasks must have at least one checklist item.
    if (!editingTask && newTaskChecklist.length === 0) {
      showError('Add at least one checklist item before creating a task.');
      setEditTab('checklist');
      return;
    }

    const taskData: Task = {
      id:             editingTask?.id ?? 0,
      projectId:      Number(formData.get('projectId')),
      title:          formData.get('title') as string,
      description:    formData.get('description') as string,
      status:         editingTask?.status || 'new',
      // Defaults when null/empty: Priority→medium, Due Date→today, Est→1h, Act→0h
      priority:       (formData.get('priority') as Priority) || 'medium',
      dueDate:        (formData.get('dueDate') as string) || new Date().toISOString().split('T')[0],
      assigneeId:     newAssigneeIdNum,
      createdAt:      editingTask?.createdAt || new Date().toISOString().split('T')[0],
      attachments,
      module:         (formData.get('module') as string) || undefined,
      estimatedHours,
      actualHours:    fromHHMM(formData.get('actualHours') as string) ?? 0,
      progress:       dynamicProgress,
      tags:           taskTags,
      parentTaskId,
      requiresQA,
      qaAssigneeId,
    };

    try {
      if (editingTask) {
        await updateTask(taskData);
        await addActivity({ userId: currentUser?.id || 1, userName: currentUser?.name || 'Admin', action: editingTask.assigneeId !== newAssigneeIdNum ? 'reassigned task' : 'updated task', targetType: 'task', targetId: taskData.id, targetName: taskData.title });
      } else {
        const newTask = await addTask(taskData, newTaskChecklist);
        await addActivity({ userId: currentUser?.id || 1, userName: currentUser?.name || 'Admin', action: 'created task', targetType: 'task', targetId: newTask.id, targetName: newTask.title });
      }
      showSuccess(editingTask ? 'Task updated successfully' : 'Task created successfully');
      refreshTasks();
      setIsModalOpen(false);
      setEditingTask(null);
      setModalParentTaskId('');
      setModalProjectId('');
    } catch {
      showError('Failed to save task');
    }
  };


  // ── move task to next stage (from Kanban) ─────────────────────────────────
  // HOURS_EXEMPT_EDGES (shared with TaskStatusActions.tsx) mirrors backend AllowedEdges' per-edge
  // ActualHoursExempt (Services/TaskService.cs). 'blocked' is intentionally absent — that
  // transition is never exempt and is handled via its own modal below, which also collects hours.
  // Returns whether the move succeeded, so callers (e.g. the pending-hours modal) know
  // whether it's safe to close/reset their own state, instead of always doing so.
  const commitMove = async (task: Task, newStatus: Status, actualHours?: number): Promise<boolean> => {
    try {
      await changeTaskStatus(task.id, newStatus, undefined, actualHours);
      await addActivity({ userId: currentUser?.id || 1, userName: currentUser?.name || 'Admin', action: 'moved', targetType: 'task', targetId: task.id, targetName: task.title });
      refreshTasks();
      const liveTask = pagedTasks.find(t => t.id === task.id);
      const reviewer = newStatus === 'under-review' && liveTask?.qaAssigneeId
        ? users.find(u => u.id === liveTask.qaAssigneeId)
        : null;
      showSuccess(reviewer ? `Submitted for review — assigned to ${reviewer.name}` : 'Task moved');
      return true;
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to move task');
      return false;
    }
  };
  const moveTask = async (task: Task, newStatus: Status) => {
    // Blocked needs structured block items — open modal instead
    if (newStatus === 'blocked') {
      setPendingBlockTask(task);
      return;
    }
    // Hours-required transitions — open masked hours-spent modal instead of window.prompt
    const exempt = HOURS_EXEMPT_EDGES[task.status]?.includes(newStatus) ?? false;
    if (!exempt) {
      setPendingHoursMove({ task, status: newStatus });
      return;
    }
    await commitMove(task, newStatus);
  };

  // ── reassign submit (from Kanban) ─────────────────────────────────────────
  const handleReassign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reassigningTask || !newAssigneeId || !reassignmentReason) return;
    try {
      // Proper reassign: records assignment history + reason tag, auto-resolves blocks
      await reassignTask(reassigningTask.id, newAssigneeId, reassignmentReason);
      showSuccess('Task reassigned');
      refreshTasks();
      setReassigningTask(null);
      setNewAssigneeId(0);
      setReassignmentReason('');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to reassign task');
    }
  };

  // ── filtered + sorted task list ───────────────────────────────────────────
  const filteredTasks = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const now = Date.now();
    return pagedTasks.filter(task => {
      if (selectedProjectId !== null && task.projectId !== selectedProjectId) return false;
      if (selectedUserIds.length > 0 && !selectedUserIds.includes(task.assigneeId)) return false;
      if (selectedOwnerIds.length > 0) {
        const proj = projects.find(p => p.id === task.projectId);
        if (!proj || !selectedOwnerIds.includes(proj.ownerId)) return false;
      }
      if (showBlockedOnly && !task.isBlocked) return false;
      if (showHasIssues && !task.hasIssues) return false;
      if (showCreatedByMe && task.createdById !== currentUser?.id) return false;
      if (dueFilter !== 'all') {
        const hasDue   = !!task.dueDate;
        const overdue  = hasDue && new Date(task.dueDate!).getTime() < now && task.status !== 'completed';
        const upcoming = hasDue && new Date(task.dueDate!).getTime() >= now && task.status !== 'completed';
        if (dueFilter === 'has-due'  && !hasDue)   return false;
        if (dueFilter === 'overdue'  && !overdue)  return false;
        if (dueFilter === 'upcoming' && !upcoming) return false;
      }
      if (q) {
        const assigneeName = getAssigneeName(task.assigneeId).toLowerCase();
        const projectName  = getProjectName(task.projectId).toLowerCase();
        return (
          task.code?.toLowerCase().includes(q) ||
          task.projectCode?.toLowerCase().includes(q) ||
          task.title?.toLowerCase().includes(q) ||
          task.description?.toLowerCase().includes(q) ||
          task.module?.toLowerCase().includes(q) ||
          task.priority?.toLowerCase().includes(q) ||
          task.status?.toLowerCase().includes(q) ||
          assigneeName.includes(q) ||
          projectName.includes(q) ||
          (task.tags?.some(t => t.toLowerCase().includes(q)) ?? false) ||
          (task.comments?.some(c => c.text?.toLowerCase().includes(q)) ?? false)
        );
      }
      return true;
    });
  }, [pagedTasks, searchQuery, selectedProjectId, selectedUserIds, selectedOwnerIds, showBlockedOnly, showHasIssues, showCreatedByMe, dueFilter, currentUser?.id, projects]);

  // Recency = last updated, falling back to created time
  const recency = (t: Task) => new Date(t.updatedAt || t.createdAt || 0).getTime();

  const processedTasks = useMemo(() => [...filteredTasks].sort((a, b) => {
    let cmp = 0;
    if (sortField === 'recent') {
      cmp = recency(a) - recency(b);
    } else if (sortField === 'assigneeName') {
      cmp = getAssigneeName(a.assigneeId).toLowerCase().localeCompare(getAssigneeName(b.assigneeId).toLowerCase());
    } else if (sortField === 'priority') {
      const order: Record<Priority, number> = { critical: 4, high: 3, medium: 2, low: 1 };
      cmp = order[a.priority] - order[b.priority];
    } else if (sortField === 'createdAt') {
      cmp = new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
    } else if (sortField === 'dueDate' || sortField === 'title') {
      cmp = ((a[sortField] as string) || '').toLowerCase().localeCompare(((b[sortField] as string) || '').toLowerCase());
    }
    return sortOrder === 'asc' ? cmp : -cmp;
  }), [filteredTasks, sortField, sortOrder]);

  // Client-side pagination on the filtered+sorted result
  const totalLocalPages   = Math.max(1, Math.ceil(processedTasks.length / localPageSize));
  const displayTasks      = processedTasks.slice((localPage - 1) * localPageSize, localPage * localPageSize);

  const TaskPaginationBar = () => (
    <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-50 dark:border-gray-900 bg-gray-50/30 dark:bg-gray-900/30">
      <div className="flex items-center gap-2 text-[11px] text-gray-500">
        <span className="whitespace-nowrap">Rows per page:</span>
        <VSelect
          options={[10, 25, 50, 100].map((n): SelectOption => ({ value: n, label: String(n) }))}
          value={{ value: localPageSize, label: String(localPageSize) }}
          onChange={opt => { if (opt) { setLocalPageSize(Number(opt.value)); setLocalPage(1); } }}
          isSearchable={false}
          size="sm"
          className="w-20"
        />
        {tasksTotalCount > TASKS_PAGE_SIZE && (
          <span className="text-gray-400 italic whitespace-nowrap">· {tasksTotalCount} total on server</span>
        )}
      </div>
      <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
        <span className="whitespace-nowrap">
          {processedTasks.length === 0 ? '0' : `${(localPage - 1) * localPageSize + 1}–${Math.min(localPage * localPageSize, processedTasks.length)}`} of {processedTasks.length}
        </span>
        <div className="flex items-center gap-0.5">
          <button onClick={() => setLocalPage(1)} disabled={localPage === 1}
            className="p-1 rounded border border-gray-200 dark:border-gray-700 disabled:opacity-30 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" title="First">
            <ChevronLeft size={11} />
          </button>
          <button onClick={() => setLocalPage(p => Math.max(1, p - 1))} disabled={localPage === 1}
            className="p-1 rounded border border-gray-200 dark:border-gray-700 disabled:opacity-30 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <ChevronLeft size={13} />
          </button>
          <span className="px-2 py-0.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-[11px] font-bold min-w-[60px] text-center">
            {localPage} / {totalLocalPages}
          </span>
          <button onClick={() => setLocalPage(p => Math.min(totalLocalPages, p + 1))} disabled={localPage === totalLocalPages}
            className="p-1 rounded border border-gray-200 dark:border-gray-700 disabled:opacity-30 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <ChevronRight size={13} />
          </button>
          <button onClick={() => setLocalPage(totalLocalPages)} disabled={localPage === totalLocalPages}
            className="p-1 rounded border border-gray-200 dark:border-gray-700 disabled:opacity-30 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" title="Last">
            <ChevronRight size={11} />
          </button>
        </div>
      </div>
    </div>
  );

  const toggleSort = (field: keyof Task | 'assigneeName') => {
    if (sortField === field) setSortOrder(o => o === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortOrder('asc'); }
    setLocalPage(1);
  };

  const SortIcon = ({ field }: { field: keyof Task | 'assigneeName' }) => {
    if (sortField !== field) return null;
    return sortOrder === 'asc' ? <ChevronUp size={12} className="ml-1 inline" /> : <ChevronDown size={12} className="ml-1 inline" />;
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <PageTransition>
      <div className="space-y-4 max-w-7xl mx-auto">
        <PageHeader
          title="Tasks"
          description="Review and manage individual task items across all projects."
        >
          {/* Team avatars (from Kanban) */}
          <div className="flex -space-x-2 mr-2">
            {users.slice(0, 3).map(u => (
              <InteractiveLink key={u.id} type="user" id={u.id}>
                <img src={u.avatar} className="h-7 w-7 rounded-full border-2 border-white dark:border-gray-900 object-cover hover:z-10 relative" alt={u.name} />
              </InteractiveLink>
            ))}
            {users.length > 3 && (
              <div className="h-7 w-7 rounded-full border-2 border-white dark:border-gray-900 bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-[10px] font-bold text-gray-500">
                +{users.length - 3}
              </div>
            )}
          </div>
          {canCreateAnyTask && (
            <Button onClick={() => handleOpenModal()}>
              <Plus className="mr-2 h-4 w-4" /> Add Task
            </Button>
          )}
        </PageHeader>

        {/* ── Filter Toolbar ─────────────────────────────────────────────── */}
        <Card className="p-0 border-none shadow-sm ring-1 ring-black/5 dark:ring-white/5">
          <CardContent className="p-3">
            <div className="flex flex-wrap items-center gap-2">

              {/* Search */}
              <div className="relative flex-1 min-w-[180px] group">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 group-focus-within:text-indigo-500 transition-colors" />
                <input type="text" placeholder="Search code, title, tags, assignee…" value={searchQuery}
                  onChange={e => { setSearchQuery(e.target.value); setLocalPage(1); }}
                  className="w-full pl-9 pr-7 py-1.5 bg-gray-50 dark:bg-gray-900 border border-transparent focus:border-indigo-500/30 focus:bg-white dark:focus:bg-gray-800 transition-all rounded-md text-[13px] outline-none" />
                {searchQuery && (
                  <button onClick={() => { setSearchQuery(''); setLocalPage(1); }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={12} /></button>
                )}
              </div>

              {/* Project filter */}
              <div className="relative">
                <button type="button" ref={projectFilterBtnRef}
                  onClick={() => {
                    const r = projectFilterBtnRef.current?.getBoundingClientRect();
                    if (r) setProjectDropdownPos({ top: r.bottom + 4, left: r.left });
                    setProjectDropdownOpen(o => !o);
                    setUserDropdownOpen(false); setOwnerDropdownOpen(false); setDueDropdownOpen(false);
                  }}
                  className={cn("flex items-center gap-1.5 py-1.5 pl-3 pr-2.5 rounded-md text-[12px] font-medium border transition-all select-none",
                    selectedProjectId !== null ? "bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-700/50 text-indigo-700 dark:text-indigo-300" : "bg-gray-50 dark:bg-gray-900 border-transparent text-gray-600 dark:text-gray-400 hover:bg-gray-100"
                  )}>
                  <Folder size={13} />
                  <span>{selectedProjectId === null ? 'All Projects' : projects.find(p => p.id === selectedProjectId)?.name || 'Project'}</span>
                  <ChevronDownIcon size={12} className={cn("transition-transform", projectDropdownOpen && "rotate-180")} />
                </button>
                {projectDropdownOpen && projectDropdownPos && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setProjectDropdownOpen(false)} />
                    <div className="fixed z-50 w-56 bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-100 dark:border-gray-800" style={{ top: projectDropdownPos.top, left: projectDropdownPos.left }}>
                      <div className="p-1 max-h-72 overflow-y-auto custom-scrollbar">
                        <button onClick={() => { setSelectedProjectId(null); setProjectDropdownOpen(false); setLocalPage(1); }}
                          className={cn("w-full flex items-center justify-between px-3 py-2 rounded-lg text-[12px] font-medium transition-colors", selectedProjectId === null ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300" : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800")}>
                          <span>All Projects</span>{selectedProjectId === null && <Check size={12} />}
                        </button>
                        <div className="my-1 border-t border-gray-50 dark:border-gray-800" />
                        {projects.map(p => (
                          <button key={p.id} onClick={() => { setSelectedProjectId(p.id); setProjectDropdownOpen(false); setLocalPage(1); }}
                            className={cn("w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] transition-colors", selectedProjectId === p.id ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300" : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800")}>
                            <span className="h-2 w-2 rounded-full shrink-0 bg-indigo-400" /><span className="flex-1 text-left truncate">{p.name}</span>
                            {selectedProjectId === p.id && <Check size={12} />}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Assignee filter */}
              <div className="relative">
                <button type="button" ref={userFilterBtnRef}
                  onClick={() => {
                    const r = userFilterBtnRef.current?.getBoundingClientRect();
                    if (r) setUserDropdownPos({ top: r.bottom + 4, left: r.left });
                    setUserDropdownOpen(o => !o);
                    setProjectDropdownOpen(false); setOwnerDropdownOpen(false); setDueDropdownOpen(false);
                  }}
                  className={cn("flex items-center gap-1.5 py-1.5 pl-3 pr-2.5 rounded-md text-[12px] font-medium border transition-all select-none",
                    selectedUserIds.length > 0 ? "bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-700/50 text-indigo-700 dark:text-indigo-300" : "bg-gray-50 dark:bg-gray-900 border-transparent text-gray-600 dark:text-gray-400 hover:bg-gray-100"
                  )}>
                  <User size={13} />
                  <span>{selectedUserIds.length === 0 ? 'All Assignees' : selectedUserIds.length === 1 ? users.find(u => u.id === selectedUserIds[0])?.name || 'User' : `${selectedUserIds.length} Assignees`}</span>
                  <ChevronDownIcon size={12} className={cn("transition-transform", userDropdownOpen && "rotate-180")} />
                </button>
                {userDropdownOpen && userDropdownPos && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setUserDropdownOpen(false)} />
                    <div className="fixed z-50 w-52 bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-100 dark:border-gray-800" style={{ top: userDropdownPos.top, left: userDropdownPos.left }}>
                      <div className="p-1 max-h-72 overflow-y-auto custom-scrollbar">
                        <button onClick={() => { setSelectedUserIds([]); setUserDropdownOpen(false); setLocalPage(1); }}
                          className={cn("w-full flex items-center justify-between px-3 py-2 rounded-lg text-[12px] font-medium transition-colors", selectedUserIds.length === 0 ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300" : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800")}>
                          <span>All Assignees</span>{selectedUserIds.length === 0 && <Check size={12} />}
                        </button>
                        <div className="my-1 border-t border-gray-50 dark:border-gray-800" />
                        {users.map(u => (
                          <button key={u.id} onClick={() => { toggleUser(u.id); setLocalPage(1); }}
                            className={cn("w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] transition-colors", selectedUserIds.includes(u.id) ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300" : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800")}>
                            <img src={u.avatar} alt="" className="h-5 w-5 rounded-full object-cover shrink-0" />
                            <span className="flex-1 text-left truncate">{u.name}</span>
                            {selectedUserIds.includes(u.id) && <Check size={12} />}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Owner (project owner) filter */}
              <div className="relative">
                <button type="button" ref={ownerFilterBtnRef}
                  onClick={() => {
                    const r = ownerFilterBtnRef.current?.getBoundingClientRect();
                    if (r) setOwnerDropdownPos({ top: r.bottom + 4, left: r.left });
                    setOwnerDropdownOpen(o => !o);
                    setProjectDropdownOpen(false); setUserDropdownOpen(false); setDueDropdownOpen(false);
                  }}
                  className={cn("flex items-center gap-1.5 py-1.5 pl-3 pr-2.5 rounded-md text-[12px] font-medium border transition-all select-none",
                    selectedOwnerIds.length > 0 ? "bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-700/50 text-indigo-700 dark:text-indigo-300" : "bg-gray-50 dark:bg-gray-900 border-transparent text-gray-600 dark:text-gray-400 hover:bg-gray-100"
                  )}>
                  <Filter size={13} />
                  <span>{selectedOwnerIds.length === 0 ? 'All Owners' : `${selectedOwnerIds.length} Owner${selectedOwnerIds.length > 1 ? 's' : ''}`}</span>
                  <ChevronDownIcon size={12} className={cn("transition-transform", ownerDropdownOpen && "rotate-180")} />
                </button>
                {ownerDropdownOpen && ownerDropdownPos && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setOwnerDropdownOpen(false)} />
                    <div className="fixed z-50 w-52 bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-100 dark:border-gray-800" style={{ top: ownerDropdownPos.top, left: ownerDropdownPos.left }}>
                      <div className="p-1 max-h-72 overflow-y-auto custom-scrollbar">
                        <button onClick={() => { setSelectedOwnerIds([]); setOwnerDropdownOpen(false); setLocalPage(1); }}
                          className={cn("w-full flex items-center justify-between px-3 py-2 rounded-lg text-[12px] font-medium transition-colors", selectedOwnerIds.length === 0 ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300" : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800")}>
                          <span>All Owners</span>{selectedOwnerIds.length === 0 && <Check size={12} />}
                        </button>
                        <div className="my-1 border-t border-gray-50 dark:border-gray-800" />
                        {users.filter(u => projects.some(p => p.ownerId === u.id)).map(u => (
                          <button key={u.id} onClick={() => { setSelectedOwnerIds(prev => prev.includes(u.id) ? prev.filter(id => id !== u.id) : [...prev, u.id]); setLocalPage(1); }}
                            className={cn("w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] transition-colors", selectedOwnerIds.includes(u.id) ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300" : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800")}>
                            <img src={u.avatar} alt="" className="h-5 w-5 rounded-full object-cover shrink-0" />
                            <span className="flex-1 text-left truncate">{u.name}</span>
                            {selectedOwnerIds.includes(u.id) && <Check size={12} />}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Due date filter dropdown */}
              <div className="relative">
                <button type="button" ref={dueFilterBtnRef}
                  onClick={() => {
                    const r = dueFilterBtnRef.current?.getBoundingClientRect();
                    if (r) setDueDropdownPos({ top: r.bottom + 4, left: r.left });
                    setDueDropdownOpen(o => !o);
                    setProjectDropdownOpen(false); setUserDropdownOpen(false); setOwnerDropdownOpen(false);
                  }}
                  className={cn("flex items-center gap-1.5 py-1.5 pl-3 pr-2.5 rounded-md text-[12px] font-medium border transition-all select-none",
                    dueFilter === 'overdue'  ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/50 text-red-600 dark:text-red-400" :
                    dueFilter === 'upcoming' ? "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/50 text-amber-600 dark:text-amber-400" :
                    dueFilter === 'has-due'  ? "bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-700/50 text-indigo-700 dark:text-indigo-300" :
                    "bg-gray-50 dark:bg-gray-900 border-transparent text-gray-600 dark:text-gray-400 hover:bg-gray-100"
                  )}>
                  <Calendar size={13} />
                  <span>{dueFilter === 'overdue' ? 'Overdue' : dueFilter === 'upcoming' ? 'Upcoming' : dueFilter === 'has-due' ? 'Has Due Date' : 'Due Date'}</span>
                  <ChevronDownIcon size={12} className={cn("transition-transform", dueDropdownOpen && "rotate-180")} />
                </button>
                {dueDropdownOpen && dueDropdownPos && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setDueDropdownOpen(false)} />
                    <div className="fixed z-50 w-44 bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-100 dark:border-gray-800 p-1" style={{ top: dueDropdownPos.top, left: dueDropdownPos.left }}>
                      {([
                        ['all', 'All', 'text-gray-600'],
                        ['has-due', 'Has Due Date', 'text-indigo-600'],
                        ['overdue', 'Overdue', 'text-red-600'],
                        ['upcoming', 'Upcoming', 'text-amber-600'],
                      ] as const).map(([val, label, cls]) => (
                        <button key={val} onClick={() => { setDueFilter(val); setDueDropdownOpen(false); setLocalPage(1); }}
                          className={cn("w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] transition-colors",
                            dueFilter === val ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300" : `${cls} dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800`
                          )}>
                          <span className="flex-1 text-left">{label}</span>
                          {dueFilter === val && <Check size={12} />}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Blocked toggle */}
              <button onClick={() => { setShowBlockedOnly(v => !v); setLocalPage(1); }}
                className={cn("flex items-center gap-1.5 py-1.5 px-2.5 rounded-md text-[12px] font-medium border transition-all",
                  showBlockedOnly ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/50 text-red-600 dark:text-red-400" : "bg-gray-50 dark:bg-gray-900 border-transparent text-gray-500 dark:text-gray-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500 hover:border-red-100"
                )}>
                <ShieldAlert size={13} />
                <span>Blocked</span>
                {showBlockedOnly && filteredTasks.length > 0 && (
                  <span className="text-[10px] font-black bg-red-100 dark:bg-red-900/40 rounded px-1">{filteredTasks.length}</span>
                )}
              </button>

              {/* Has Issues toggle */}
              <button onClick={() => { setShowHasIssues(v => !v); setLocalPage(1); }}
                className={cn("flex items-center gap-1.5 py-1.5 px-2.5 rounded-md text-[12px] font-medium border transition-all",
                  showHasIssues ? "bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800/50 text-orange-600 dark:text-orange-400" : "bg-gray-50 dark:bg-gray-900 border-transparent text-gray-500 dark:text-gray-400 hover:bg-orange-50 dark:hover:bg-orange-900/20 hover:text-orange-500 hover:border-orange-100"
                )}>
                <AlertTriangle size={13} />
                <span>Has Issues</span>
              </button>

              {/* Clear */}
              {hasActiveFilters && (
                <button onClick={clearFilters} className="flex items-center gap-1 py-1.5 px-2.5 rounded-md text-[12px] font-medium text-gray-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors border border-transparent hover:border-red-100">
                  <X size={12} /> Clear
                </button>
              )}

              {/* Count badge */}
              <span className="text-[11px] font-bold text-gray-400">
                {processedTasks.length} task{processedTasks.length !== 1 ? 's' : ''}
              </span>

              {/* Export */}
              <button
                onClick={() => { if (processedTasks.length > 0) exportTasks(processedTasks); else showError('No tasks to export.'); }}
                title="Export visible tasks to CSV"
                className="flex items-center gap-1.5 py-1.5 px-2.5 rounded-md text-[12px] font-medium border border-transparent bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 hover:text-indigo-600 hover:border-indigo-100 transition-all"
              >
                <Download size={13} />
                <span>Export</span>
              </button>

              {/* View toggle */}
              <div className="flex bg-gray-50 dark:bg-gray-900 rounded-md p-1 border border-gray-100 dark:border-gray-800 ml-auto">
                <button onClick={() => setView('kanban')} className={cn("p-1 rounded transition-all", view === 'kanban' ? "bg-white dark:bg-gray-800 text-indigo-600 shadow-sm" : "text-gray-400 hover:text-gray-600")} title="Board view"><LayoutGrid size={14} /></button>
                <button onClick={() => setView('list')} className={cn("p-1 rounded transition-all", view === 'list' ? "bg-white dark:bg-gray-800 text-indigo-600 shadow-sm" : "text-gray-400 hover:text-gray-600")} title="List view"><List size={14} /></button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Empty state ────────────────────────────────────────────────── */}
        {filteredTasks.length === 0 ? (
          <EmptyState
            icon={ListTodo}
            title="No tasks found"
            description={hasActiveFilters ? 'No tasks match the current filters.' : "You don't have any tasks at the moment."}
            actionLabel={hasActiveFilters ? 'Clear Filters' : (canCreateAnyTask ? 'Add Task' : undefined)}
            onAction={hasActiveFilters ? clearFilters : (canCreateAnyTask ? handleOpenModal : undefined)}
          />

        /* ── Kanban board view ─────────────────────────────────────────── */
        ) : view === 'kanban' ? (
          <>
          <div
            className="flex gap-4 overflow-x-auto pb-4 px-1 custom-scrollbar cursor-grab active:cursor-grabbing"
            style={{ minHeight: 'calc(100vh - 240px)' }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            {COLUMNS.map(col => {
              const colTasks  = displayTasks.filter(t => t.status === col.status);
              const totalInCol = pagedTasks.filter(t => t.status === col.status).length;
              return (
                <div key={col.status} className="flex-shrink-0 w-72 flex flex-col space-y-2">
                  {/* Column header */}
                  <div className="flex items-center justify-between px-1">
                    <div className="flex items-center space-x-1.5">
                      <h3 className="font-bold text-[11px] uppercase tracking-widest text-gray-400 font-display flex items-center gap-1.5">
                        <span className={cn("h-2 w-2 rounded-full", col.dot)} />
                        {col.title}
                      </h3>
                      <span className={cn(
                        "text-[10px] font-black px-1.5 py-0.5 rounded-md min-w-[18px] text-center",
                        hasActiveFilters && colTasks.length !== totalInCol
                          ? "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600"
                          : "bg-gray-100 dark:bg-gray-800 text-gray-500"
                      )}>
                        {colTasks.length}
                        {hasActiveFilters && colTasks.length !== totalInCol && (
                          <span className="text-gray-400 font-medium">/{totalInCol}</span>
                        )}
                      </span>
                    </div>
                    <button className="text-gray-400 hover:text-gray-600 p-1">
                      <MoreHorizontal size={14} />
                    </button>
                  </div>

                  {/* Column body — drop target */}
                  <div
                    onDragOver={e => handleDragOver(e, col.status)}
                    onDragLeave={handleDragLeave}
                    onDrop={e => handleDrop(e, col.status)}
                    className={cn(
                      "flex-1 p-1.5 rounded-lg border min-h-[400px] bg-gray-50/50 dark:bg-gray-900/10 transition-colors",
                      col.status === 'new'          && "border-gray-100/50 dark:border-white/5 bg-gray-50/50",
                      col.status === 'in-progress'  && "border-indigo-100/50 dark:border-indigo-900/30 bg-indigo-50/20 dark:bg-indigo-900/10",
                      col.status === 'paused'       && "border-amber-100/50 dark:border-amber-900/30 bg-amber-50/20 dark:bg-amber-900/10",
                      col.status === 'blocked'      && "border-red-100/50 dark:border-red-900/30 bg-red-50/20 dark:bg-red-900/10",
                      col.status === 'under-review' && "border-purple-100/50 dark:border-purple-900/30 bg-purple-50/20 dark:bg-purple-900/10",
                      col.status === 'issues'       && "border-orange-100/50 dark:border-orange-900/30 bg-orange-50/20 dark:bg-orange-900/10",
                      col.status === 'completed'    && "border-emerald-100/50 dark:border-emerald-900/30 bg-emerald-50/20 dark:bg-emerald-900/10",
                      dragOverColumn === col.status && draggedTaskId !== null && "ring-2 ring-indigo-400/50 border-indigo-300 dark:border-indigo-600 bg-indigo-50/40 dark:bg-indigo-900/20",
                    )}>
                    <div className="space-y-2">
                      {colTasks.map(task => {
                        // A blocked task can't be dragged (status change) unless the user is an admin.
                        const canDrag = (isAdmin || !task.isBlocked)
                          && (currentUser?.id === task.createdById
                            || currentUser?.id === task.assigneeId);
                        const isOverdue = !!task.dueDate && new Date(task.dueDate).getTime() < Date.now()
                          && task.status !== 'completed';
                        const flagRed = task.isBlocked || isOverdue;
                        return (
                        <Card
                          key={task.id}
                          data-task-card
                          draggable={canDrag}
                          onDragStart={canDrag ? e => {
                            if (!dragFromHandle.current) { e.preventDefault(); return; }
                            handleDragStart(e, task.id);
                          } : undefined}
                          onDragEnd={canDrag ? () => { dragFromHandle.current = false; handleDragEnd(); } : undefined}
                          className={cn(
                            "border-gray-100/50 hover:border-indigo-300/50 dark:hover:border-indigo-700/50 transition-all p-0 overflow-hidden group shadow-sm cursor-default",
                            canDrag ? "hover:shadow-md" : "hover:shadow-sm",
                            flagRed && "bg-red-50 border-red-100 dark:bg-red-900/10 dark:border-red-900/30",
                            draggedTaskId === task.id && "opacity-40 scale-[0.97] shadow-none ring-2 ring-indigo-300 dark:ring-indigo-600",
                          )}
                        >
                          <CardContent className="p-3">
                            {/* Drag handle + priority + actions row */}
                            <div className="flex justify-between items-start mb-1.5">
                              <div className="flex items-center gap-1.5">
                                {canDrag && (
                                  <span
                                    onMouseDown={() => { dragFromHandle.current = true; }}
                                    className="text-gray-300 dark:text-gray-600 transition-opacity cursor-grab active:cursor-grabbing shrink-0"
                                    title="Drag to move"
                                  >
                                    <GripVertical size={13} />
                                  </span>
                                )}
                                <Badge variant={task.priority === 'critical' || task.priority === 'high' ? 'danger' : task.priority === 'medium' ? 'warning' : 'success'} className="uppercase text-[8px] tracking-tight">
                                  {task.priority}
                                </Badge>
                              </div>
                              {(canEditTask(task) || canDeleteTaskItem(task)) && (
                                <div className="flex transition-opacity gap-0.5">
                                  {canEditTask(task) && <button onClick={() => handleOpenModal(task)} className="p-0.5 text-gray-400 hover:text-indigo-600 transition-colors" title="Edit"><Edit2 size={11} /></button>}
                                  {canDeleteTaskItem(task) && <button onClick={() => confirmAlert('Delete this task?', async () => { try { await deleteTask(task.id); showSuccess('Task deleted'); refreshTasks(); } catch { showError('Failed to delete task'); } })} className="p-0.5 text-gray-400 hover:text-red-500 transition-colors" title="Delete"><Trash2 size={11} /></button>}
                                </div>
                              )}
                            </div>

                            {/* Project label + Owner chip */}
                            {selectedProjectId === null && (() => {
                              const taskProject = projects.find(p => p.id === task.projectId);
                              const projectOwner = users.find(u => u.id === taskProject?.ownerId);
                              return (
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-[9px] font-black uppercase tracking-wider text-gray-400/70">
                                    {getProjectName(task.projectId)}
                                  </span>
                                  {projectOwner && (
                                    <div className="flex items-center gap-1">
                                      <img
                                        src={projectOwner.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(projectOwner.name)}&background=random&size=24`}
                                        alt={projectOwner.name}
                                        title={`Owner: ${projectOwner.name}`}
                                        className="h-4 w-4 rounded-full border border-indigo-200 dark:border-indigo-800 object-cover"
                                      />
                                      <span className="text-[8px] font-black text-indigo-500 uppercase tracking-widest hidden sm:block">{projectOwner.name.split(' ')[0]}</span>
                                    </div>
                                  )}
                                </div>
                              );
                            })()}


                            {/* Status condition badges */}
                            {(task.isOverdue ?? (!!task.dueDate && new Date(task.dueDate).getTime() < Date.now() && task.status !== 'completed')) && (
                              <div className="flex flex-wrap gap-1 mb-1.5">
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800/50 rounded text-[8px] font-black uppercase tracking-widest text-rose-600 dark:text-rose-400">
                                  ⚠ Overdue
                                </span>
                              </div>
                            )}

                            {/* Code + Title with search highlight */}
                            {task.code && (
                              <span className="inline-block mb-1 px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-[8px] font-black tracking-widest font-mono">
                                {searchQuery ? highlightText(task.code, searchQuery) : task.code}
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => handleOpenModal(task, false)}
                              className="text-left w-full"
                            >
                              <h4 className="font-bold text-gray-900 dark:text-gray-100 text-[12px] mb-1 leading-tight hover:text-indigo-600 transition-colors tracking-tight font-display">
                                {searchQuery ? highlightText(task.title, searchQuery) : task.title}
                              </h4>
                            </button>

                            {/* Description with search highlight */}
                            <p className="text-gray-500 text-[10px] line-clamp-2 mb-2 leading-snug">
                              {searchQuery ? highlightText(task.description || '', searchQuery) : task.description}
                            </p>

                            {/* Matching comment snippet (from Kanban) */}
                            {searchQuery && task.comments?.some(c => c.text?.toLowerCase().includes(searchQuery.toLowerCase())) && (
                              <div className="mb-2 px-2 py-1.5 bg-amber-50/60 dark:bg-amber-900/10 border border-amber-100/60 rounded-md">
                                {task.comments.filter(c => c.text?.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 1).map(c => (
                                  <p key={c.id} className="text-[9px] text-amber-700 dark:text-amber-400 line-clamp-2 leading-snug">
                                    <span className="font-black uppercase tracking-wider mr-1">{c.userName}:</span>
                                    {highlightText(c.text, searchQuery)}
                                  </p>
                                ))}
                              </div>
                            )}

                            {/* Checklist progress mini-bar */}
                            {task.checklistItems && task.checklistItems.length > 0 && (() => {
                              const total = task.checklistItems.length;
                              const done  = task.checklistItems.filter(c => c.isCompleted).length;
                              const pct   = Math.round((done / total) * 100);
                              return (
                                <div className="mb-2 space-y-0.5">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[8px] font-black uppercase tracking-widest text-gray-400 flex items-center gap-1">
                                      <ListTodo size={8} /> {done}/{total}
                                    </span>
                                    <span className="text-[8px] font-black font-mono text-indigo-500">{pct}%</span>
                                  </div>
                                  <div className="h-1 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full transition-all duration-500 ${pct === 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                </div>
                              );
                            })()}

                            {/* Footer: date rows + actions */}
                            <div className="pt-2 border-t border-gray-50 dark:border-gray-800">
                              {/* Row 1: Due Date & Time */}
                              <div className="flex items-center justify-between mb-1">
                                <div
                                  className={cn(
                                    "flex items-center gap-1 font-mono",
                                    isOverdue
                                      ? "text-red-800 dark:text-red-400"
                                      : "text-blue-900 dark:text-blue-300"
                                  )}
                                  title={task.dueDate ? `Due ${formatDateTime(task.dueDate)}` : 'No due date'}
                                >
                                  <Calendar size={10} className="shrink-0" />
                                  <span className="text-[9px] font-bold whitespace-nowrap">
                                    {formatDateTime(task.dueDate) || '—'}
                                  </span>
                                </div>
                                {/* Comments + subtasks inline with due row */}
                                <div className="flex items-center gap-1.5">
                                  {task.comments && task.comments.length > 0 && (
                                    <div className="flex items-center gap-0.5 text-indigo-400">
                                      <MessageCircle size={10} />
                                      <span className="text-[9px] font-bold">{task.comments.length}</span>
                                    </div>
                                  )}
                                  {(task.childTaskCount ?? 0) > 0 && (
                                    <div className="flex items-center gap-0.5 text-purple-400" title={`${task.childTaskCount} subtask${task.childTaskCount! > 1 ? 's' : ''}`}>
                                      <GitBranch size={10} />
                                      <span className="text-[9px] font-bold">{task.childTaskCount}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                              {/* Row 2: Created Date & Time + actions */}
                              <div className="flex items-center justify-between">
                                {task.createdAt ? (
                                  <div
                                    className="flex items-center gap-1 font-mono text-green-800 dark:text-green-400"
                                    title={`Created ${formatDateTime(task.createdAt)}`}
                                  >
                                    <Clock size={10} className="shrink-0" />
                                    <span className="text-[9px] font-bold">{formatDateTime(task.createdAt)}</span>
                                  </div>
                                ) : <span />}
                                <div className="flex items-center gap-1.5">
                                  {/* Move to next stage */}
                                  {NEXT_STAGE[col.status] && (
                                    <button
                                      onClick={() => {
                                        const next = NEXT_STAGE[col.status];
                                        if (next) moveTask(task, next);
                                      }}
                                      className="h-5 w-5 rounded-md bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 flex items-center justify-center text-gray-400 hover:text-indigo-600 transition-all opacity-0 group-hover:opacity-100"
                                      title="Move to next stage"
                                    >
                                      <Plus size={10} />
                                    </button>
                                  )}
                                  {/* Reassign */}
                                  <button
                                    onClick={() => { setReassigningTask(task); setNewAssigneeId(task.assigneeId ?? 0); }}
                                    className="h-5 w-5 rounded-md bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 flex items-center justify-center text-gray-400 hover:text-indigo-600 transition-all opacity-0 group-hover:opacity-100"
                                    title="Reassign"
                                  >
                                    <User size={10} />
                                  </button>
                                  {/* Assignee avatar */}
                                  <InteractiveLink type="user" id={task.assigneeId} className="h-5 w-5 rounded overflow-hidden border border-gray-100 dark:border-gray-800">
                                    <img src={getAssignee(task.assigneeId)?.avatar} alt="" className="h-full w-full object-cover" />
                                  </InteractiveLink>
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                        );
                      })}

                      {colTasks.length === 0 && (
                        <div className="h-20 border-2 border-dashed border-gray-100 dark:border-gray-800 rounded-lg flex items-center justify-center">
                          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wide">
                            {hasActiveFilters ? 'No matches' : 'No tasks'}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Per-column add button */}
                    {canCreateAnyTask && (
                      <button
                        onClick={() => handleOpenModal()}
                        className="mt-2 w-full py-2 border-2 border-dashed border-gray-100 dark:border-gray-800 rounded-lg text-gray-400 text-[11px] font-black uppercase flex items-center justify-center hover:border-indigo-400 hover:text-indigo-400 transition-all tracking-widest bg-gray-50/30"
                      >
                        <Plus size={12} className="mr-1.5" /> Add Task
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {/* Pagination below kanban board */}
          <div className="mt-2">
            <TaskPaginationBar />
          </div>
          </>

        ) : (
          <Card className="border-gray-100/50">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-50 dark:border-gray-900 bg-gray-50/30 dark:bg-gray-900/30">
                    <th className="px-4 py-2 text-[10px] uppercase font-black text-gray-400 tracking-widest">Code</th>
                    <th className="px-4 py-2 text-[10px] uppercase font-black text-gray-400 tracking-widest cursor-pointer hover:text-indigo-600 transition-colors" onClick={() => toggleSort('title')}>
                      <div className="flex items-center">Task <SortIcon field="title" /></div>
                    </th>
                    <th className="px-4 py-2 text-[10px] uppercase font-black text-gray-400 tracking-widest">Project / Module</th>
                    <th className="px-4 py-2 text-[10px] uppercase font-black text-gray-400 tracking-widest cursor-pointer hover:text-indigo-600 transition-colors" onClick={() => toggleSort('assigneeName')}>
                      <div className="flex items-center">Assignee <SortIcon field="assigneeName" /></div>
                    </th>
                    <th className="px-4 py-2 text-[10px] uppercase font-black text-gray-400 tracking-widest">Status</th>
                    <th className="px-4 py-2 text-[10px] uppercase font-black text-gray-400 tracking-widest cursor-pointer hover:text-indigo-600 transition-colors" onClick={() => toggleSort('priority')}>
                      <div className="flex items-center">Priority <SortIcon field="priority" /></div>
                    </th>
                    <th className="px-4 py-2 text-[10px] uppercase font-black text-gray-400 tracking-widest cursor-pointer hover:text-indigo-600 transition-colors" onClick={() => toggleSort('dueDate')}>
                      <div className="flex items-center">Due Date <SortIcon field="dueDate" /></div>
                    </th>
                    <th className="px-4 py-2 text-[10px] uppercase font-black text-gray-400 tracking-widest cursor-pointer hover:text-indigo-600 transition-colors" onClick={() => toggleSort('createdAt')}>
                      <div className="flex items-center">Created <SortIcon field="createdAt" /></div>
                    </th>
                    <th className="px-4 py-2 text-[10px] uppercase font-black text-gray-400 tracking-widest text-right">Est Hrs</th>
                    <th className="px-4 py-2 text-[10px] uppercase font-black text-gray-400 tracking-widest text-right">Act Hrs</th>
                    <th className="px-4 py-2 text-[10px] uppercase font-black text-gray-400 tracking-widest text-center">Completion</th>
                    <th className="px-4 py-2 text-right text-[10px] uppercase font-black text-gray-400 tracking-widest">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-900">
                  {displayTasks.map(task => {
                    const isOverdue = !!task.dueDate && new Date(task.dueDate).getTime() < Date.now() && task.status !== 'completed';
                    const flagRed = task.isBlocked || isOverdue;
                    return (
                    <tr key={task.id} className={cn(
                      "transition-colors group",
                      flagRed
                        ? "bg-red-50 dark:bg-red-900/10 hover:bg-red-100/60 dark:hover:bg-red-900/20"
                        : "hover:bg-gray-50/50 dark:hover:bg-gray-900/50"
                    )}>
                      <td className="px-4 py-2 whitespace-nowrap">
                        {task.code
                          ? <span className="text-[11px] font-semibold text-gray-600 dark:text-gray-300 tracking-tight">{searchQuery ? highlightText(task.code, searchQuery) : task.code}</span>
                          : <span className="text-gray-200 text-[10px]">—</span>}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleOpenModal(task, false)}
                            className="text-[13px] font-bold text-gray-900 dark:text-gray-100 group-hover:text-indigo-600 transition-colors leading-tight font-display text-left hover:text-indigo-600"
                          >
                            {searchQuery ? highlightText(task.title, searchQuery) : task.title}
                          </button>
                          {(task.childTaskCount ?? 0) > 0 && (
                            <span
                              className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 text-[9px] font-black shrink-0"
                              title={`${task.childTaskCount} subtask${task.childTaskCount! > 1 ? 's' : ''}`}
                            >
                              <GitBranch size={9} />
                              {task.childTaskCount}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[11px] font-bold text-gray-700 dark:text-gray-200">
                            {task.module || 'No module'}
                          </span>
                          <InteractiveLink type="project" id={task.projectId} className="text-[10px] text-gray-400 hover:text-indigo-600">
                            {getProjectName(task.projectId)}
                          </InteractiveLink>
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <div className="relative flex items-center gap-1.5">
                          <button
                            onClick={() => setAssigneeHistoryTaskId(assigneeHistoryTaskId === task.id ? null : task.id)}
                            className="flex items-center gap-1.5 px-2 py-1 rounded-full border border-indigo-100 dark:border-indigo-900/40 bg-indigo-50/50 dark:bg-indigo-900/10 hover:border-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-all group/assignee"
                            title="Click to view assignment history"
                          >
                            <img src={getAssignee(task.assigneeId)?.avatar || `https://ui-avatars.com/api/?name=${getAssigneeName(task.assigneeId)}&background=random`} alt="" className="h-4 w-4 rounded-full object-cover border border-white dark:border-gray-800" />
                            <span className="text-[10px] font-black text-indigo-700 dark:text-indigo-400 uppercase tracking-tight">{getAssigneeName(task.assigneeId)}</span>
                            <History size={9} className="text-indigo-400 opacity-60 group-hover/assignee:opacity-100 transition-opacity" />
                          </button>
                          <button
                            onClick={() => { setReassigningTask(task); setNewAssigneeId(task.assigneeId ?? 0); }}
                            className="opacity-0 group-hover:opacity-100 h-5 w-5 rounded border border-gray-100 dark:border-gray-700 flex items-center justify-center text-gray-400 hover:text-indigo-600 hover:border-indigo-300 transition-all"
                            title="Transfer Responsibility"
                          >
                            <ArrowRight size={10} />
                          </button>

                          {assigneeHistoryTaskId === task.id && (
                            <div className="absolute z-30 top-full left-0 mt-1 w-72 bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
                              <div className="flex items-center justify-between px-3 py-2 border-b border-gray-50 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900">
                                <span className="text-[9px] font-black uppercase tracking-widest text-gray-500 flex items-center gap-1">
                                  <History size={9} className="text-amber-500" /> Assignment History
                                </span>
                                <button onClick={() => setAssigneeHistoryTaskId(null)} className="text-gray-400 hover:text-gray-600"><X size={12} /></button>
                              </div>
                              <div className="max-h-52 overflow-y-auto custom-scrollbar p-1.5 space-y-1">
                                {task.assignmentHistory && task.assignmentHistory.length > 0 ? (
                                  task.assignmentHistory.map(h => (
                                    <div key={h.id} className="px-2.5 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700">
                                      <div className="flex items-center justify-between mb-0.5">
                                        <span className="text-[8px] font-black uppercase px-1.5 py-0.5 bg-amber-50 dark:bg-amber-900/20 text-amber-600 rounded tracking-widest">{h.reasonTag}</span>
                                        <span className="text-[8px] text-gray-400 font-mono">{formatDateTime(h.changedAt)}</span>
                                      </div>
                                      <div className="flex items-center gap-1 text-[10px] font-bold text-gray-600 dark:text-gray-400">
                                        <span className="opacity-60">{h.previousAssigneeName || 'Unassigned'}</span>
                                        <span className="opacity-30 mx-0.5">→</span>
                                        <span className="text-indigo-600">{h.newAssigneeName || 'Unassigned'}</span>
                                      </div>
                                      <div className="text-[9px] text-gray-400 mt-0.5">by {h.changedByName}</div>
                                    </div>
                                  ))
                                ) : (
                                  <p className="text-center text-[10px] text-gray-400 font-bold py-3">No history yet</p>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex flex-wrap items-center gap-1">
                          <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                            <div className={cn("h-1.5 w-1.5 rounded-full shrink-0", STATUS_DOT[task.status])} />
                            <VSelect
                              options={STATUS_OPTIONS}
                              value={{ value: task.status, label: STATUS_LABELS[task.status] }}
                              onChange={opt => opt && moveTask(task, opt.value as Status)}
                              isSearchable={false}
                              size="sm"
                              className="w-32" />
                          </div>
                          {task.isBlocked && (
                            <span className="inline-flex items-center gap-0.5 px-1 py-0.5 bg-red-50 text-red-600 border border-red-200 rounded text-[8px] font-black uppercase tracking-widest">
                              <ShieldAlert size={8} /> Blocked
                            </span>
                          )}
                          {task.assignmentHistory && task.assignmentHistory.length > 0 && (
                            <Badge variant="warning" className="bg-amber-50 text-amber-600 border-amber-100 uppercase text-[8px] font-black h-4 px-1">Reassigned</Badge>
                          )}
                          {task.comments && task.comments.length > 0 && (
                            <span className="inline-flex items-center gap-1 text-[8px] font-black text-gray-400 bg-gray-50 px-1 py-0.5 rounded border border-gray-100">
                              <MessageCircle size={8} className="text-indigo-400" />{task.comments.length}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center space-x-1.5">
                          <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${task.priority === 'critical' ? 'bg-rose-600' : task.priority === 'high' ? 'bg-red-500' : task.priority === 'medium' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                          <VSelect
                            options={PRIORITY_OPTIONS}
                            value={PRIORITY_OPTIONS.find(o => o.value === task.priority) ?? null}
                            onChange={async opt => {
                              if (!opt) return;
                              try { await updateTask({ ...task, priority: opt.value as Priority }); refreshTasks(); } catch { showError('Failed to update priority'); }
                            }}
                            isSearchable={false}
                            size="sm"
                            className="w-28" />
                        </div>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <div className="flex items-center text-[11px] font-mono font-medium text-gray-500" title={task.dueDate ? formatDateTime(task.dueDate) : undefined}>
                          <Clock size={11} className="mr-1" />{formatDateTime(task.dueDate) || '—'}
                        </div>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <div className="flex items-center text-[11px] font-mono font-medium text-gray-500" title={task.createdAt ? formatDateTime(task.createdAt) : undefined}>
                          <Calendar size={11} className="mr-1" />{task.createdAt ? formatDateTime(task.createdAt) : <span className="text-gray-200">—</span>}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <span className="text-[11px] font-mono font-bold text-gray-500">
                          {task.estimatedHours != null ? task.estimatedHours : <span className="text-gray-200">—</span>}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right">
                        {task.estimatedHours != null && task.actualHours != null ? (
                          <span className={`text-[11px] font-mono font-bold ${task.actualHours > task.estimatedHours ? 'text-red-500' : 'text-emerald-600'}`}>
                            {task.actualHours}
                          </span>
                        ) : (
                          <span className="text-[11px] font-mono font-bold text-gray-500">
                            {task.actualHours != null ? task.actualHours : <span className="text-gray-200">—</span>}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-center">
                        <button
                          onClick={() => setCompletionTask(task)}
                          title="View completion details"
                          className="inline-flex items-center justify-center hover:scale-110 transition-transform active:scale-95"
                        >
                          <ProgressRing pct={task.progress ?? 0} size={30} />
                        </button>
                      </td>
                      <td className="px-4 py-2 text-right">
                        {(canEditTask(task) || canDeleteTaskItem(task)) && (
                          <div className="inline-flex space-x-0.5 transition-opacity">
                            {canEditTask(task) && <button onClick={() => handleOpenModal(task)} className="p-1 text-gray-400 hover:text-indigo-600 hover:bg-white dark:hover:bg-gray-800 rounded border border-transparent hover:border-gray-100 transition-all"><Edit2 size={13} /></button>}
                            {canDeleteTaskItem(task) && <button onClick={() => confirmAlert('Delete this task?', async () => { try { await deleteTask(task.id); showSuccess('Task deleted'); refreshTasks(); } catch { showError('Failed to delete task'); } })} className="p-1 text-gray-400 hover:text-red-600 hover:bg-white dark:hover:bg-gray-800 rounded border border-transparent hover:border-gray-100 transition-all"><Trash2 size={13} /></button>}
                          </div>
                        )}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <TaskPaginationBar />
          </Card>
        )}

        {/* ── Combined Task Modal (view + edit + create) ─────────────────── */}
        {isModalOpen && (
          <AnimatePresence>
            <>
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => { setIsModalOpen(false); setEditingTask(null); setModalParentTaskId(''); setModalProjectId(''); }}
                className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 14 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 14 }}
                transition={{ duration: 0.16 }}
                className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl z-[60] flex flex-col max-h-[88vh]"
                role="dialog" aria-modal="true"
              >
                {/* ── Header ── */}
                {(() => {
                  const liveHead = editingTask ? (pagedTasks.find(t => t.id === editingTask.id) ?? editingTask) : null;
                  const headCl = liveHead?.checklistItems ?? [];
                  const headPct = headCl.length > 0
                    ? Math.round((headCl.filter(c => c.isCompleted).length / headCl.length) * 100)
                    : (liveHead?.progress ?? 0);
                  const isViewOnly = liveHead !== null && !isModalEditMode;
                  const HPRI: Record<string, string> = {
                    critical: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
                    high:     'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
                    medium:   'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
                    low:      'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
                  };
                  return (
                    <div className="flex items-start gap-3 px-6 py-4 border-b border-gray-100 dark:border-gray-800 shrink-0">
                      {liveHead ? (
                        <>
                          <ProgressRing pct={headPct} size={40} />
                          <div className="flex-1 min-w-0">
                            {liveHead.code && (
                              <span className="inline-block mb-0.5 px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 text-[8px] font-black tracking-widest font-mono">{liveHead.code}</span>
                            )}
                            <h2 className="text-[15px] font-black text-gray-900 dark:text-white leading-tight mb-1.5 truncate">{liveHead.title}</h2>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest text-white ${STATUS_DOT[liveHead.status] ?? 'bg-gray-400'}`}>
                                {STATUS_LABELS[liveHead.status] ?? liveHead.status}
                              </span>
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest ${HPRI[liveHead.priority] ?? ''}`}>
                                {liveHead.priority}
                              </span>
                              {liveHead.isBlocked && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded text-[8px] font-black uppercase tracking-widest text-red-600 dark:text-red-400">
                                  <ShieldAlert size={9} /> Blocked
                                </span>
                              )}
                              {liveHead.isPaused && (
                                <span className="inline-flex items-center px-1.5 py-0.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded text-[8px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400">
                                  ⏸ Paused
                                </span>
                              )}
                              {liveHead.hasIssues && (
                                <span className="inline-flex items-center px-1.5 py-0.5 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800/50 rounded text-[8px] font-black uppercase tracking-widest text-orange-600 dark:text-orange-400">
                                  ⚠ Issues
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {isViewOnly && canEditTask(liveHead) && (
                              <button type="button" onClick={() => setIsModalEditMode(true)}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest text-white bg-indigo-600 hover:bg-indigo-700 transition-colors">
                                <Edit2 size={11} /> Edit
                              </button>
                            )}
                            {!isViewOnly && liveHead && (
                              <button type="button" onClick={() => setIsModalEditMode(false)}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest text-gray-500 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                                <ChevronLeft size={11} /> Back
                              </button>
                            )}
                            <button type="button"
                              onClick={() => { setIsModalOpen(false); setEditingTask(null); setModalParentTaskId(''); setModalProjectId(''); }}
                              className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-gray-400 transition-colors">
                              <X size={16} />
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-0.5">
                              {modalParentTaskId !== '' ? 'New Subtask' : 'New Task'}
                            </p>
                            <h2 className="text-[15px] font-black text-gray-500 dark:text-gray-400 leading-tight">Fill in the details below</h2>
                          </div>
                          <button type="button"
                            onClick={() => { setIsModalOpen(false); setEditingTask(null); setModalParentTaskId(''); setModalProjectId(''); }}
                            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-gray-400 transition-colors shrink-0">
                            <X size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  );
                })()}

                {/* ── Tab bar ── */}
                {(() => {
                  const liveForTab = editingTask ? (pagedTasks.find(t => t.id === editingTask.id) ?? editingTask) : null;
                  const clItems = liveForTab?.checklistItems ?? [];
                  const clDoneTab = clItems.filter(c => c.isCompleted).length;
                  const showQaTab = !!editingTask && !!liveForTab?.qaAssigneeId;
                  type CombinedTab = 'details' | 'checklist' | 'status' | 'qa' | 'assignment';
                  const tabs: { id: CombinedTab; label: string }[] = [
                    { id: 'details',    label: 'Details' },
                    { id: 'checklist',  label: clItems.length > 0 ? `Checklist (${clDoneTab}/${clItems.length})` : 'Checklist' },
                    ...(editingTask ? [{ id: 'status'     as CombinedTab, label: 'Status & Blocks' }]        : []),
                    ...(editingTask ? [{ id: 'assignment' as CombinedTab, label: 'Assignment' }]             : []),
                    ...(showQaTab   ? [{ id: 'qa'         as CombinedTab, label: 'Issues & Review Notes' }]  : []),
                  ];
                  return (
                    <div className="flex border-b border-gray-100 dark:border-gray-800 px-6 shrink-0">
                      {tabs.map(t => (
                        <button key={t.id} type="button" onClick={() => setEditTab(t.id as any)}
                          className={`py-2.5 px-0.5 mr-5 text-[10px] font-black uppercase tracking-widest border-b-2 transition-colors ${editTab === t.id ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}>
                          {t.label}
                        </button>
                      ))}
                    </div>
                  );
                })()}

                {/* ── View-only body ── */}
                {editingTask !== null && !isModalEditMode && (
                  <div className="flex-1 overflow-y-auto p-5 custom-scrollbar space-y-4">

                    {/* Details — read-only overview */}
                    {editTab === 'details' && (() => {
                      const live = pagedTasks.find(t => t.id === editingTask.id) ?? editingTask;
                      const project   = projects.find(p => p.id === live.projectId);
                      const assignee  = users.find(u => u.id === live.assigneeId);
                      const qaUser    = live.qaAssigneeId ? users.find(u => u.id === live.qaAssigneeId) : null;
                      const parentTask = live.parentTaskId ? pagedTasks.find(t => t.id === live.parentTaskId) : null;
                      const checklist = live.checklistItems ?? [];
                      const clDone = checklist.filter(c => c.isCompleted).length;
                      const clPct = checklist.length > 0 ? Math.round((clDone / checklist.length) * 100) : (live.progress ?? 0);
                      return (
                        <div className="space-y-4">
                          {live.description && (
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5">Description</p>
                              <p className="text-[13px] text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-line">{live.description}</p>
                            </div>
                          )}
                          <div className="grid grid-cols-2 gap-3">
                            {[
                              { label: 'Project',     value: project?.name ?? '—' },
                              { label: 'Module',      value: live.module ?? '—' },
                              { label: 'Assignee',    value: assignee ? `${assignee.name} · ${assignee.role}` : '—' },
                              { label: 'QA Reviewer', value: qaUser ? `${qaUser.name} · ${qaUser.role}` : 'None' },
                              { label: 'Due Date',    value: live.dueDate ? formatDateTime(live.dueDate) : '—' },
                              { label: 'Est. Hours',  value: live.estimatedHours ? toHHMM(live.estimatedHours) : '—' },
                              { label: 'Act. Hours',  value: live.actualHours ? toHHMM(live.actualHours) : '—' },
                              { label: 'Created',     value: live.createdAt ? formatDateTime(live.createdAt) : '—' },
                            ].map(({ label, value }) => (
                              <div key={label} className="p-2.5 rounded-xl bg-gray-50/60 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800">
                                <p className="text-[8px] font-black uppercase tracking-widest text-gray-400 mb-0.5">{label}</p>
                                <p className="text-[12px] font-bold text-gray-700 dark:text-gray-200 truncate">{value}</p>
                              </div>
                            ))}
                          </div>
                          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-50/60 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800">
                            <span className="text-[9px] font-black uppercase tracking-widest text-gray-400 shrink-0">Progress</span>
                            <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                              <div className="h-full bg-indigo-600 transition-all duration-500 rounded-full" style={{ width: `${clPct}%` }} />
                            </div>
                            <span className="text-[11px] font-black font-mono text-indigo-600 shrink-0">{clPct}%</span>
                            {checklist.length > 0 && <span className="text-[9px] text-gray-400 font-bold shrink-0">{clDone}/{checklist.length}</span>}
                          </div>
                          {(live.tags ?? []).length > 0 && (
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5">Tags</p>
                              <div className="flex flex-wrap gap-1.5">
                                {(live.tags ?? []).map(tag => (
                                  <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 text-[9px] font-black uppercase tracking-widest border border-indigo-100 dark:border-indigo-900/40">
                                    <Tag size={8} /> {tag}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          {parentTask && (
                            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-purple-50/60 dark:bg-purple-900/10 border border-purple-100 dark:border-purple-900/30">
                              <GitBranch size={12} className="text-purple-500 shrink-0" />
                              <span className="text-[9px] font-black uppercase tracking-widest text-purple-500 shrink-0">Parent</span>
                              <span className="text-[11px] font-bold text-purple-700 dark:text-purple-300 truncate">{parentTask.code ? `${parentTask.code} · ` : ''}{parentTask.title}</span>
                            </div>
                          )}
                          {live.isBlocked && (live.blockEntries ?? []).filter(e => e.isActive).length > 0 && (
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-widest text-red-500 mb-1.5 flex items-center gap-1.5"><ShieldAlert size={10} /> Block Entries</p>
                              <div className="space-y-1.5">
                                {(live.blockEntries ?? []).filter(e => e.isActive).map((e, i) => (
                                  <div key={i} className="px-3 py-2 rounded-xl bg-red-50/60 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30">
                                    <p className="text-[11px] font-bold text-red-700 dark:text-red-400 italic">"{e.reason}"</p>
                                    <p className="text-[9px] text-red-400 font-mono mt-0.5">{formatDateTime(e.blockedAt)}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {live.isPaused && live.pauseReason && (
                            <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-amber-50/60 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30">
                              <span className="text-[9px] font-black uppercase tracking-widest text-amber-600 shrink-0 mt-0.5">⏸ Pause</span>
                              <p className="text-[11px] font-bold text-amber-700 dark:text-amber-400 italic">"{live.pauseReason}"</p>
                            </div>
                          )}
                          {(live.attachments ?? []).length > 0 && (
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5">Attachments</p>
                              <div className="space-y-1.5">
                                {(live.attachments ?? []).map(a => (
                                  <a key={a.id} href={a.url} target="_blank" rel="noreferrer"
                                    className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800 hover:border-indigo-200 transition-colors group">
                                    <span className="text-[11px] font-bold text-indigo-600 group-hover:underline truncate">{a.name}</span>
                                    <span className="ml-auto text-[9px] text-gray-400 font-mono shrink-0">{a.size}</span>
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* Checklist — read-only */}
                    {editTab === 'checklist' && (() => {
                      const live = pagedTasks.find(t => t.id === editingTask.id) ?? editingTask;
                      const checklist = live.checklistItems ?? [];
                      const clDone = checklist.filter(c => c.isCompleted).length;
                      const clPct = checklist.length > 0 ? Math.round((clDone / checklist.length) * 100) : 0;
                      return checklist.length === 0 ? (
                        <p className="text-center text-[11px] text-gray-400 italic py-8">No checklist items.</p>
                      ) : (
                        <div className="space-y-2">
                          <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-indigo-50/60 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-900/30">
                            <CheckSquare size={13} className="text-indigo-500 shrink-0" />
                            <span className="text-[10px] font-black uppercase tracking-widest text-indigo-500">{clDone} of {checklist.length} complete</span>
                            <div className="flex-1 h-1.5 bg-indigo-100 dark:bg-indigo-900/40 rounded-full overflow-hidden ml-1">
                              <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${clPct}%` }} />
                            </div>
                            <span className="text-[10px] font-black font-mono text-indigo-600 shrink-0">{clPct}%</span>
                          </div>
                          {checklist.map((item, i) => (
                            <div key={item.id ?? i} className={cn("flex items-start gap-2.5 px-3 py-2.5 rounded-xl border", item.isCompleted ? "bg-emerald-50/60 dark:bg-emerald-900/10 border-emerald-100 dark:border-emerald-900/30" : "bg-gray-50/60 dark:bg-gray-800/40 border-gray-100 dark:border-gray-800")}>
                              <div className={cn("mt-0.5 h-4 w-4 shrink-0 rounded border-2 flex items-center justify-center", item.isCompleted ? "bg-emerald-500 border-emerald-500" : "border-gray-300 dark:border-gray-600")}>
                                {item.isCompleted && <Check size={9} className="text-white" strokeWidth={3} />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className={cn("text-[12px] font-bold leading-snug", item.isCompleted ? "text-gray-400" : "text-gray-700 dark:text-gray-200")}>{item.title}</p>
                                {item.completedByName && <p className="text-[9px] text-emerald-600 dark:text-emerald-400 font-bold mt-0.5">✓ {item.completedByName}</p>}
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}

                    {/* Status History — view-only */}
                    {editTab === 'status' && (
                      histLoading ? (
                        <div className="flex gap-2 animate-pulse">{[...Array(3)].map((_, i) => <div key={i} className="h-14 w-32 bg-gray-100 dark:bg-gray-800 rounded-xl shrink-0" />)}</div>
                      ) : statusHistory.length === 0 ? (
                        <p className="text-center text-[11px] text-gray-400 italic py-8">No status changes recorded yet.</p>
                      ) : (
                        <div className="flex flex-wrap gap-y-2">
                          {statusHistory.map((h, i) => (
                            <div key={h.id} className="flex items-center">
                              <div className="px-2.5 py-2 rounded-xl bg-gray-50/80 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800 min-w-[120px]">
                                <div className="flex items-center gap-1 mb-1">
                                  <span className={`h-2 w-2 rounded-full shrink-0 ${STATUS_DOT[h.toStatus] ?? 'bg-gray-400'}`} />
                                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-black uppercase text-white ${STATUS_DOT[h.toStatus] ?? 'bg-gray-400'}`}>{STATUS_LABELS[h.toStatus] ?? h.toStatus}</span>
                                  {i === 0 && <span className="ml-1 text-[7px] font-black uppercase text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 px-1 py-0.5 rounded shrink-0">Latest</span>}
                                </div>
                                <p className="text-[9px] font-semibold text-gray-600 dark:text-gray-300 truncate">{h.changedByName}</p>
                                <p className="text-[8px] text-gray-400 font-mono">{formatDateTime(h.changedAt)}</p>
                                {h.actualHours != null && h.actualHours > 0 && (
                                  <p className="text-[8px] text-indigo-500 font-black mt-0.5">⏱ {toHHMM(h.actualHours)}</p>
                                )}
                                {h.reason && <p className="text-[8px] text-gray-400 italic mt-0.5 truncate">"{h.reason}"</p>}
                              </div>
                              <ChevronRight size={12} className="text-gray-300 dark:text-gray-600 mx-1" />
                            </div>
                          ))}
                          {/* Original status card */}
                          <div className="px-2.5 py-2 rounded-xl bg-gray-50/80 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800 min-w-[120px]">
                            <div className="flex items-center gap-1 mb-1">
                              <span className={`h-2 w-2 rounded-full shrink-0 ${STATUS_DOT[statusHistory[statusHistory.length - 1].fromStatus] ?? 'bg-gray-400'}`} />
                              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-black uppercase text-white ${STATUS_DOT[statusHistory[statusHistory.length - 1].fromStatus] ?? 'bg-gray-400'}`}>{STATUS_LABELS[statusHistory[statusHistory.length - 1].fromStatus] ?? statusHistory[statusHistory.length - 1].fromStatus}</span>
                              <span className="ml-1 text-[7px] font-black uppercase text-gray-400 bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded shrink-0">First</span>
                            </div>
                            <p className="text-[8px] text-gray-400 italic">Initial status</p>
                          </div>
                        </div>
                      )
                    )}

                    {/* QA tab — view-only */}
                    {editTab === 'qa' && (() => {
                      const live = pagedTasks.find(t => t.id === editingTask.id) ?? editingTask;
                      const proj2 = projects.find(p => p.id === live.projectId);
                      const isManagerV = isAdmin || currentUser?.id === live.createdById
                        || (proj2 ? (currentUser?.id === proj2.ownerId || currentUser?.id === proj2.createdById) : false);
                      const isQaV = live.qaAssigneeId != null && currentUser?.id === live.qaAssigneeId;
                      const isAssigneeV = currentUser?.id === live.assigneeId;
                      const allIssues = [...(live.issueEntries ?? []), ...(live.reviewIssues ?? [])];
                      return (
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <p className="text-[9px] font-black uppercase tracking-widest text-purple-500">✓ Review Checklist</p>
                            <ReviewChecklistPanel
                              taskId={live.id}
                              items={live.reviewChecklistItems ?? []}
                              taskStatus={live.status}
                              isManager={isManagerV}
                              isQa={isQaV}
                              isAssignee={isAssigneeV}
                              onRefresh={refreshTasks}
                            />
                          </div>
                          {allIssues.length > 0 && (
                            <div className="space-y-2 border-t border-gray-100 dark:border-gray-800 pt-3">
                              <p className="text-[9px] font-black uppercase tracking-widest text-orange-500">⚠ Issues & Notes</p>
                              <div className="space-y-2">
                                {allIssues.map((issue, i) => (
                                  <div key={i} className={cn("flex items-start gap-2.5 px-3 py-2.5 rounded-xl border", issue.isResolved ? "bg-gray-50 dark:bg-gray-800/40 border-gray-100 opacity-60" : "bg-orange-50 dark:bg-orange-900/10 border-orange-100 dark:border-orange-900/30")}>
                                    <div className={cn("mt-0.5 h-4 w-4 shrink-0 rounded border-2 flex items-center justify-center", issue.isResolved ? "bg-emerald-500 border-emerald-500" : "border-orange-300")}>
                                      {issue.isResolved && <Check size={9} className="text-white" strokeWidth={3} />}
                                    </div>
                                    <p className={cn("text-[12px] font-bold leading-snug flex-1", issue.isResolved ? "text-gray-400" : "text-orange-700 dark:text-orange-300")}>{issue.description}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* Assignment tab — view-only */}
                    {editTab === 'assignment' && (() => {
                      const live = pagedTasks.find(t => t.id === editingTask.id) ?? editingTask;
                      const proj = projects.find(p => p.id === live.projectId);
                      const isManager = isAdmin || currentUser?.id === live.createdById
                        || (proj ? (currentUser?.id === proj.ownerId || currentUser?.id === proj.createdById) : false);
                      const memberIds = proj?.memberIds ?? [];
                      const pool = memberIds.length > 0 ? users.filter(u => memberIds.includes(u.id)) : users;
                      const currentAssignee = users.find(u => u.id === live.assigneeId);
                      const history = [...(live.assignmentHistory ?? [])].sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime());
                      return (
                        <div className="space-y-5">
                          {/* Current assignee + reassign */}
                          <div className="space-y-2">
                            <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">Current Assignee</p>
                            <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-indigo-50/60 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-900/30">
                              <div className="h-8 w-8 rounded-lg bg-indigo-200 dark:bg-indigo-800 flex items-center justify-center shrink-0">
                                <span className="text-[11px] font-black text-indigo-700 dark:text-indigo-300">{currentAssignee?.name?.charAt(0) ?? '?'}</span>
                              </div>
                              <div className="min-w-0">
                                <p className="text-[12px] font-black text-gray-800 dark:text-gray-100 truncate">{currentAssignee?.name ?? '—'}</p>
                                <p className="text-[9px] text-indigo-500 font-bold uppercase tracking-widest">{currentAssignee?.role ?? ''}</p>
                              </div>
                            </div>
                            {isManager && (
                              <div className="space-y-2 pt-1">
                                <VSelect options={pool.map(u => ({ value: u.id, label: `${u.name} — ${u.role}` }))}
                                  value={assignTabNewAssigneeId !== '' ? { value: assignTabNewAssigneeId, label: pool.find(u => u.id === assignTabNewAssigneeId) ? `${pool.find(u => u.id === assignTabNewAssigneeId)!.name} — ${pool.find(u => u.id === assignTabNewAssigneeId)!.role}` : '' } : null}
                                  onChange={opt => setAssignTabNewAssigneeId(opt ? Number(opt.value) : '')}
                                  isSearchable isClearable placeholder="Select new assignee…" />
                                {assignTabNewAssigneeId !== '' && assignTabNewAssigneeId !== live.assigneeId && (
                                  <VSelect
                                    options={(live.isBlocked ? BLOCK_REASON_TAGS : REASON_TAGS).map((r): SelectOption => ({ value: r, label: r }))}
                                    value={assignTabReason ? { value: assignTabReason, label: assignTabReason } : null}
                                    onChange={opt => setAssignTabReason((opt?.value as ReasonTag) ?? '')}
                                    isSearchable={false} isClearable placeholder="— Select reason —" />
                                )}
                                {assignTabNewAssigneeId !== '' && assignTabNewAssigneeId !== live.assigneeId && assignTabReason && (
                                  <button type="button"
                                    onClick={async () => {
                                      try {
                                        await reassignTask(live.id, Number(assignTabNewAssigneeId), assignTabReason);
                                        setAssignTabNewAssigneeId(''); setAssignTabReason('');
                                        refreshTasks();
                                        showSuccess('Task reassigned');
                                      } catch (e) { showError(e instanceof Error ? e.message : 'Failed'); }
                                    }}
                                    className="w-full py-2 text-[10px] font-black uppercase tracking-widest bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors">
                                    Reassign Task
                                  </button>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Assignment History */}
                          {history.length > 0 && (
                            <div className="space-y-2 pt-1 border-t border-gray-100 dark:border-gray-800">
                              <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 flex items-center gap-1.5"><History size={10} /> Assignment History</p>
                              <div className="flex flex-wrap gap-y-2">
                                {history.map((h, i) => (
                                  <div key={h.id} className="flex items-center">
                                    <div className="px-2.5 py-2 rounded-xl bg-gray-50/80 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800 min-w-[130px]">
                                      <div className="flex items-center gap-1 mb-1">
                                        <span className="text-[10px] font-black text-gray-700 dark:text-gray-200 truncate">{h.newAssigneeName || 'Unassigned'}</span>
                                        {i === 0 && <span className="ml-1 text-[7px] font-black uppercase text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 px-1 py-0.5 rounded shrink-0">Latest</span>}
                                      </div>
                                      <p className="text-[8px] text-amber-600 font-black uppercase tracking-widest truncate">{h.reasonTag}</p>
                                      <p className="text-[8px] text-gray-400 font-mono">{formatDateTime(h.changedAt)}</p>
                                    </div>
                                    {i < history.length - 1 && <ChevronRight size={12} className="text-gray-300 dark:text-gray-600 mx-1" />}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* ── Edit / Create body ── */}
                {(editingTask === null || isModalEditMode) && (
                  <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
                    <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">

                      {/* ── Tab: Details ── */}
                      <div className={cn(editTab !== 'details' && 'hidden', 'space-y-4')}>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-[11px] font-black uppercase tracking-widest text-gray-400 mb-1">Project</label>
                            {editingTask ? (
                              <div className="w-full px-4 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded-lg text-[13px] text-gray-500 dark:text-gray-400 cursor-not-allowed">
                                {projects.find(p => p.id === editingTask.projectId)?.name ?? '—'}
                                <input type="hidden" name="projectId" value={editingTask.projectId} />
                              </div>
                            ) : (() => {
                              const projectOptions: SelectOption[] = projects.map(p => ({ value: p.id, label: p.name }));
                              const activeId = modalProjectId !== '' ? modalProjectId : (projects[0]?.id ?? '');
                              return (
                                <>
                                  <VSelect options={projectOptions}
                                    value={projectOptions.find(o => o.value === activeId) ?? null}
                                    onChange={(opt) => {
                                      const v = opt ? Number(opt.value) : '';
                                      setModalProjectId(v); setSelectedAssignee(''); setModalModule('');
                                      if (modalParentTaskId !== '') {
                                        const parent = pagedTasks.find(t => t.id === modalParentTaskId);
                                        if (!parent || parent.projectId !== v) setModalParentTaskId('');
                                      }
                                    }}
                                    isSearchable placeholder="Select project" />
                                  <input type="hidden" name="projectId" value={activeId} />
                                </>
                              );
                            })()}
                          </div>
                          <div>
                            <label className="block text-[11px] font-black uppercase tracking-widest text-gray-400 mb-1">Parent Task (optional)</label>
                            {(() => {
                              const activeProjectId = modalProjectId !== '' ? modalProjectId : (editingTask?.projectId ?? projects[0]?.id);
                              const candidates = pagedTasks.filter(t => t.projectId === activeProjectId && t.id !== editingTask?.id);
                              const parentOptions: SelectOption[] = candidates.map(t => ({ value: t.id, label: t.title }));
                              const currentParentId = modalParentTaskId !== '' ? modalParentTaskId : (editingTask?.parentTaskId ?? '');
                              return (
                                <>
                                  <VSelect options={parentOptions}
                                    value={currentParentId !== '' ? (parentOptions.find(o => o.value === currentParentId) ?? null) : null}
                                    onChange={opt => setModalParentTaskId(opt ? Number(opt.value) : '')}
                                    isClearable isSearchable placeholder="None — top-level task" />
                                  <input type="hidden" name="parentTaskId" value={currentParentId} />
                                </>
                              );
                            })()}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-[11px] font-black uppercase tracking-widest text-gray-400 mb-1">Module</label>
                            {(() => {
                              const activeProjectId = modalProjectId !== '' ? modalProjectId : (editingTask?.projectId ?? projects[0]?.id);
                              const projModules = projects.find(p => p.id === activeProjectId)?.modules ?? [];
                              const options = editingTask?.module && !projModules.includes(editingTask.module) ? [editingTask.module, ...projModules] : projModules;
                              const moduleOptions: SelectOption[] = options.map(m => ({ value: m, label: m }));
                              return (
                                <>
                                  <VSelect options={moduleOptions}
                                    value={moduleOptions.find(o => o.value === modalModule) ?? null}
                                    onChange={opt => setModalModule(opt ? String(opt.value) : '')}
                                    isClearable isSearchable placeholder="-- Select --" />
                                  <input type="hidden" name="module" value={modalModule} />
                                </>
                              );
                            })()}
                          </div>
                          <div>
                            <label className="block text-[11px] font-black uppercase tracking-widest text-gray-400 mb-1">Assignee</label>
                            {(() => {
                              const activeProjectId = modalProjectId !== '' ? Number(modalProjectId) : (editingTask?.projectId ?? projects[0]?.id);
                              const activeProject = projects.find(p => p.id === activeProjectId);
                              const memberIds = activeProject?.memberIds ?? [];
                              const assigneePool = memberIds.length > 0 ? users.filter(u => memberIds.includes(u.id)) : users;
                              const assigneeOptions: SelectOption[] = assigneePool.map(u => ({ value: u.id, label: `${u.name} - ${u.role}` }));
                              return (
                                <VSelect options={assigneeOptions}
                                  value={assigneeOptions.find(o => o.value === Number(selectedAssignee)) ?? null}
                                  onChange={(opt) => setSelectedAssignee(opt ? String(opt.value) : '')}
                                  isSearchable placeholder="Select assignee" />
                              );
                            })()}
                            <input type="hidden" name="assigneeId" value={selectedAssignee} />
                          </div>
                        </div>
                        <div>
                          <label className="block text-[11px] font-black uppercase tracking-widest text-gray-400 mb-1">Task Title</label>
                          <input name="title" required defaultValue={editingTask?.title} className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 text-[13px]" />
                        </div>
                        <div>
                          <label className="block text-[11px] font-black uppercase tracking-widest text-gray-400 mb-1">Description</label>
                          <textarea name="description" rows={3} required defaultValue={editingTask?.description} className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 text-[13px]" />
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <label className="block text-[11px] font-black uppercase tracking-widest text-gray-400 mb-1">Due Date</label>
                            <DateInput name="dueDate" value={modalDueDate} onChange={setModalDueDate} className="px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-800 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 text-[13px] font-bold" />
                          </div>
                          <div>
                            <label className="block text-[11px] font-black uppercase tracking-widest text-gray-400 mb-1">Est. Hrs <span className="text-red-500">*</span></label>
                            <TimeInput name="estimatedHours" value={modalEstHours} onChange={setModalEstHours} className="px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-800 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 text-[13px] font-bold" />
                          </div>
                          <div>
                            <label className="block text-[11px] font-black uppercase tracking-widest text-gray-400 mb-1">Deadline</label>
                            {(() => {
                              if (!modalDueDate || !modalEstHours) return (
                                <input disabled value="" placeholder="—" className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-800 rounded-lg text-[13px] font-bold text-gray-400 cursor-not-allowed" />
                              );
                              const createdAt = editingTask?.createdAt ? new Date(editingTask.createdAt) : new Date();
                              const createHHMM = `${String(createdAt.getHours()).padStart(2,'0')}:${String(createdAt.getMinutes()).padStart(2,'0')}`;
                              const m = modalEstHours.match(/^(\d{1,3}):([0-5]\d)$/);
                              const estMinutes = m ? parseInt(m[1]) * 60 + parseInt(m[2]) : 0;
                              const base = new Date(`${modalDueDate}T${createHHMM}:00`);
                              const dl = new Date(base.getTime() + estMinutes * 60000);
                              const pad = (n: number) => String(n).padStart(2, '0');
                              const isNext = dl.toDateString() !== base.toDateString();
                              const formatted = `${pad(dl.getDate())}-${pad(dl.getMonth()+1)}-${dl.getFullYear()} ${pad(dl.getHours())}:${pad(dl.getMinutes())}`;
                              return (
                                <div className="relative">
                                  <input disabled value={formatted} className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-800 rounded-lg text-[13px] font-bold text-indigo-600 dark:text-indigo-400 cursor-not-allowed" />
                                  {isNext && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[8px] font-black uppercase tracking-widest text-amber-500">+1d</span>}
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <label className="block text-[11px] font-black uppercase tracking-widest text-gray-400 mb-1">Priority</label>
                            <VSelect options={PRIORITY_OPTIONS}
                              value={PRIORITY_OPTIONS.find(o => o.value === modalPriority) ?? null}
                              onChange={opt => setModalPriority((opt?.value as Priority) || 'medium')}
                              isSearchable={false} />
                            <input type="hidden" name="priority" value={modalPriority} />
                          </div>
                          <div className="col-span-2">
                            <label className="block text-[11px] font-black uppercase tracking-widest text-gray-400 mb-1">QA Reviewer</label>
                            {(() => {
                              const qaOptions: SelectOption[] = users.map(u => ({ value: u.id, label: `${u.name} - ${u.role}` }));
                              return (
                                <VSelect options={qaOptions}
                                  value={qaOptions.find(o => o.value === Number(modalQaAssigneeId)) ?? null}
                                  onChange={(opt) => setModalQaAssigneeId(opt ? Number(opt.value) : '')}
                                  isSearchable isClearable placeholder="Unassigned — any manager can pass" />
                              );
                            })()}
                          </div>
                        </div>
                        <div>
                          <label className="block text-[11px] font-black uppercase tracking-widest text-gray-400 mb-1.5 px-0.5">Tags</label>
                          <div className="flex flex-wrap gap-1.5 p-2 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-800 rounded-lg focus-within:ring-2 focus-within:ring-indigo-500 transition-all">
                            {taskTags.map(tag => (
                              <Badge key={tag} variant="default" className="pl-2 pr-1 h-5 flex items-center gap-1 bg-white dark:bg-gray-700 text-indigo-600 border-indigo-100 dark:border-indigo-900/50 uppercase text-[9px] font-black tracking-tight cursor-pointer hover:bg-indigo-50 transition-colors" onClick={() => removeTag(tag, true)}>
                                {tag}
                                <button type="button" onClick={e => { e.stopPropagation(); removeTag(tag); }} className="hover:text-red-500 transition-colors p-0.5 rounded-full hover:bg-red-50"><X size={10} /></button>
                              </Badge>
                            ))}
                            <div className="flex-1 flex items-center min-w-[120px]">
                              <Tag size={12} className="text-gray-300 mr-2" />
                              <input value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={handleAddTag} placeholder={taskTags.length === 0 ? 'Add tags…' : 'Add tag…'} className="w-full bg-transparent border-none outline-none text-[12px] placeholder:text-gray-400" />
                            </div>
                          </div>
                        </div>
                        {/* Attachments + Links */}
                        <div className="pt-1">
                          <TaskAttachmentsPanel
                            taskId={editingTask?.id}
                            attachments={attachments}
                            onChange={setAttachments}
                          />
                        </div>
                      </div>

                      {/* ── Tab: Checklist ── */}
                      <div className={cn(editTab !== 'checklist' && 'hidden', 'space-y-3')}>
                        {!editingTask ? (
                          <div className="space-y-2">
                            {newTaskChecklist.length > 0 && (
                              <ul className="space-y-1">
                                {newTaskChecklist.map((item, idx) => (
                                  <li key={idx} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-800/60 group">
                                    <span className="h-4 w-4 shrink-0 rounded border border-gray-300 dark:border-gray-600" />
                                    <span className="flex-1 text-[12px] font-bold text-gray-700 dark:text-gray-300">{item}</span>
                                    <button type="button" onClick={() => setNewTaskChecklist(prev => prev.filter((_, i) => i !== idx))} className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 hover:text-red-500 transition-all"><X size={12} /></button>
                                  </li>
                                ))}
                              </ul>
                            )}
                            <div className="flex items-center gap-1.5">
                              <input type="text" value={newChecklistInput} onChange={e => setNewChecklistInput(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); const t = newChecklistInput.trim(); if (t) { setNewTaskChecklist(prev => [...prev, t]); setNewChecklistInput(''); } } }}
                                placeholder="Add checklist item…"
                                className="flex-1 px-2.5 py-1.5 text-[12px] font-bold bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg outline-none focus:ring-1 focus:ring-indigo-500 placeholder:text-gray-400 placeholder:font-normal" />
                              <button type="button" disabled={!newChecklistInput.trim()}
                                onClick={() => { const t = newChecklistInput.trim(); if (t) { setNewTaskChecklist(prev => [...prev, t]); setNewChecklistInput(''); } }}
                                className="shrink-0 p-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors disabled:opacity-50"><Plus size={13} /></button>
                            </div>
                          </div>
                        ) : (() => {
                          const liveTask = pagedTasks.find(t => t.id === editingTask.id) ?? editingTask;
                          const liveChecklist = liveTask.checklistItems ?? [];
                          const pct = liveChecklist.length > 0
                            ? Math.round((liveChecklist.filter(i => i.isCompleted).length / liveChecklist.length) * 100)
                            : (editingTask.progress ?? 0);
                          const canManageChecklist = liveTask.status === 'new' && (() => {
                            if (currentUser?.id === editingTask.qaAssigneeId) return false;
                            if (currentUser?.id === editingTask.createdById) return true;
                            const proj = projects.find(p => p.id === editingTask.projectId);
                            return proj ? (currentUser?.id === proj.ownerId || currentUser?.id === proj.createdById) : false;
                          })();
                          return (
                            <div className="space-y-3">
                              {liveChecklist.length > 0 && (
                                <div className="flex items-center gap-3 px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-800">
                                  <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Progress</span>
                                  <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                    <div className="h-full bg-indigo-600 transition-all duration-500" style={{ width: `${pct}%` }} />
                                  </div>
                                  <span className="text-[11px] font-black font-mono text-indigo-600">{pct}%</span>
                                  <span className="text-[9px] text-gray-400 font-bold">{liveChecklist.filter(i => i.isCompleted).length}/{liveChecklist.length} done</span>
                                </div>
                              )}
                              <ChecklistPanel taskId={editingTask.id} items={liveChecklist}
                                currentUserId={currentUser?.id ?? 0}
                                isAssignee={currentUser?.id === editingTask.assigneeId && currentUser?.id !== editingTask.qaAssigneeId}
                                canManage={canManageChecklist}
                                isStarted={liveTask.startedAt != null}
                                onStartTask={async () => { await startTask(editingTask.id); refreshTasks(); showSuccess('Task started'); }}
                                onItemAdded={async (title) => { await addChecklistItem(editingTask.id, title, liveChecklist.length); }}
                                onItemToggled={async (itemId, isCompleted) => { await toggleChecklistItem(editingTask.id, itemId, isCompleted); }}
                                onItemUpdated={async (itemId, title, orderIndex) => { await updateChecklistItem(editingTask.id, itemId, title, orderIndex); }}
                                onItemDeleted={async (itemId) => { await deleteChecklistItem(editingTask.id, itemId); }}
                                onMarkAllComplete={async () => { await markAllChecklistComplete(editingTask.id); }} />
                            </div>
                          );
                        })()}
                      </div>

                      {/* ── Tab: Status & Blocks ── */}
                      {editingTask && (() => {
                        const live = pagedTasks.find(t => t.id === editingTask.id) ?? editingTask;
                        const proj = projects.find(p => p.id === live.projectId);
                        const isAssignee = currentUser?.id === live.assigneeId;
                        const isManager = isAdmin || currentUser?.id === live.createdById
                          || (proj ? (currentUser?.id === proj.ownerId || currentUser?.id === proj.createdById) : false);
                        const isQa = live.qaAssigneeId != null && currentUser?.id === live.qaAssigneeId;
                        const checklistDone = !live.checklistItems?.length || live.checklistItems.every(c => c.isCompleted);
                        return (
                          <div className={cn(editTab !== 'status' && 'hidden', 'space-y-5')}>
                            <TaskStatusActions
                              currentStatus={live.status} isManager={isManager} isAssignee={isAssignee}
                              isQa={isQa} checklistComplete={checklistDone}
                              isAdmin={isAdmin}
                              activeBlockItemCount={(live.blockChecklistItems ?? []).filter(i => i.status === 'active').length}
                              onChange={async (to, reason, actualHours, blockItems) => {
                                try {
                                  await changeTaskStatus(live.id, to, reason, actualHours, blockItems);
                                  refreshTasks();
                                  const reviewer = to === 'under-review' && live.qaAssigneeId ? users.find(u => u.id === live.qaAssigneeId) : null;
                                  showSuccess(reviewer ? `Submitted for review — ${reviewer.name}` : `Moved to ${STATUS_LABELS[to] ?? to}`);
                                } catch (e) { showError(e instanceof Error ? e.message : 'Failed'); }
                              }} />

                            {/* Block */}
                            <div className="space-y-1.5 pt-1 border-t border-gray-100 dark:border-gray-800">
                              <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 flex items-center gap-1.5">
                                <ShieldAlert size={10} className="text-red-400" /> Block Status
                              </p>
                              <TaskBlockPanel taskId={editingTask.id} isBlocked={live.isBlocked} blockEntries={live.blockEntries ?? []}
                                blockChecklistItems={live.blockChecklistItems}
                                currentUserId={currentUser?.id ?? 0} isAssignee={isAssignee} isAdmin={isAdmin}
                                canUnblock={isManager || canEditTask(editingTask)}
                                onBlock={async (items, hours, reason) => {
                                  try {
                                    // Route through the same state-machine-validated endpoint as Kanban
                                    // drag / TaskStatusActions, so ActualHours + AllowedEdges are enforced
                                    // consistently regardless of which UI blocks the task.
                                    await changeTaskStatus(live.id, 'blocked', reason, hours, items);
                                    await addActivity({ userId: currentUser?.id || 1, userName: currentUser?.name || 'Admin', action: 'blocked', targetType: 'task', targetId: live.id, targetName: live.title });
                                    refreshTasks();
                                    showSuccess('Task blocked');
                                  } catch (err) {
                                    showError(err instanceof Error ? err.message : 'Failed to block task');
                                    // Rethrow so TaskBlockPanel's handleBlock doesn't clear the form/hours
                                    // entered and collapse back to the button state on a failed block.
                                    throw err;
                                  }
                                }}
                                onUnblock={async (hours) => {
                                  try {
                                    await changeTaskStatus(live.id, 'in-progress', undefined, hours);
                                    await addActivity({ userId: currentUser?.id || 1, userName: currentUser?.name || 'Admin', action: 'unblocked', targetType: 'task', targetId: live.id, targetName: live.title });
                                    refreshTasks();
                                    showSuccess('Task unblocked');
                                  } catch (err) {
                                    showError(err instanceof Error ? err.message : 'Failed to unblock task');
                                    // Rethrow so TaskBlockPanel's handleUnblock doesn't clear the hours
                                    // entered and collapse back to the button state on a failed unblock.
                                    throw err;
                                  }
                                }}
                                onResolveItem={async (itemId, comment) => { await taskService.resolveBlockItem(live.id, itemId, comment); refreshTasks(); }}
                                onRemoveItem={async (itemId) => { await taskService.removeBlockItem(live.id, itemId); refreshTasks(); }}
                                onItemUpdated={refreshTasks} />
                            </div>

                            {/* Status History */}
                            <div className="space-y-2 pt-1 border-t border-gray-100 dark:border-gray-800">
                              <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 flex items-center gap-1.5"><Activity size={10} /> Status History</p>
                              {histLoading ? (
                                <div className="flex gap-2 animate-pulse">{[...Array(3)].map((_, i) => <div key={i} className="h-14 w-36 bg-gray-100 dark:bg-gray-800 rounded-xl shrink-0" />)}</div>
                              ) : statusHistory.length === 0 ? (
                                <p className="text-[11px] text-gray-400 italic">No status changes yet.</p>
                              ) : (
                                <div className="flex flex-wrap gap-y-2">
                                  {statusHistory.map((h, i) => (
                                    <div key={h.id} className="flex items-center">
                                      {/* Card */}
                                      <div className="px-2.5 py-2 rounded-xl bg-gray-50/80 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800 min-w-[120px]">
                                        <div className="flex items-center gap-1 mb-1">
                                          <span className={`h-2 w-2 rounded-full shrink-0 ${STATUS_DOT[h.toStatus] ?? 'bg-gray-400'}`} />
                                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-black uppercase text-white ${STATUS_DOT[h.toStatus] ?? 'bg-gray-400'}`}>{STATUS_LABELS[h.toStatus] ?? h.toStatus}</span>
                                          {i === 0 && <span className="ml-1 text-[7px] font-black uppercase text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 px-1 py-0.5 rounded shrink-0">Latest</span>}
                                        </div>
                                        <p className="text-[9px] font-semibold text-gray-600 dark:text-gray-300 truncate">{h.changedByName}</p>
                                        <p className="text-[8px] text-gray-400 font-mono">{formatDateTime(h.changedAt)}</p>
                                        {h.actualHours != null && h.actualHours > 0 && (
                                          <p className="text-[8px] text-indigo-500 font-black mt-0.5">⏱ {toHHMM(h.actualHours)}</p>
                                        )}
                                      </div>
                                      {/* Arrow connector (always — original card follows) */}
                                      <ChevronRight size={12} className="text-gray-300 dark:text-gray-600 mx-1" />
                                    </div>
                                  ))}
                                  {/* Original status card */}
                                  <div className="px-2.5 py-2 rounded-xl bg-gray-50/80 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800 min-w-[120px]">
                                    <div className="flex items-center gap-1 mb-1">
                                      <span className={`h-2 w-2 rounded-full shrink-0 ${STATUS_DOT[statusHistory[statusHistory.length - 1].fromStatus] ?? 'bg-gray-400'}`} />
                                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-black uppercase text-white ${STATUS_DOT[statusHistory[statusHistory.length - 1].fromStatus] ?? 'bg-gray-400'}`}>{STATUS_LABELS[statusHistory[statusHistory.length - 1].fromStatus] ?? statusHistory[statusHistory.length - 1].fromStatus}</span>
                                      <span className="ml-1 text-[7px] font-black uppercase text-gray-400 bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded shrink-0">First</span>
                                    </div>
                                    <p className="text-[8px] text-gray-400 italic">Initial status</p>
                                  </div>
                                </div>
                              )}
                            </div>

                          </div>
                        );
                      })()}

                      {/* ── Tab: QA Reviewer ── */}
                      {editingTask && (() => {
                        const live = pagedTasks.find(t => t.id === editingTask.id) ?? editingTask;
                        const proj = projects.find(p => p.id === live.projectId);
                        const isAssigneeForQa = currentUser?.id === live.assigneeId;
                        const isManagerForQa = isAdmin || currentUser?.id === live.createdById
                          || (proj ? (currentUser?.id === proj.ownerId || currentUser?.id === proj.createdById) : false);
                        const isQaReviewer = live.qaAssigneeId != null && currentUser?.id === live.qaAssigneeId;
                        const canManageReview = isQaReviewer || isManagerForQa;
                        const canAddReviewIssue = isQaReviewer || isManagerForQa || isAssigneeForQa;
                        const reviewIssues = live.reviewIssues ?? [];
                        const issueEntriesQa = live.issueEntries ?? [];
                        const totalOpen = issueEntriesQa.filter(e => !e.isResolved).length + reviewIssues.filter(r => !r.isResolved).length;
                        return (
                          <div className={cn(editTab !== 'qa' && 'hidden', 'space-y-4')}>
                            {/* Review checklist */}
                            <div className="space-y-2">
                              <p className="text-[9px] font-black uppercase tracking-widest text-purple-500 flex items-center gap-1.5">
                                ✓ Review Checklist
                              </p>
                              <ReviewChecklistPanel
                                taskId={live.id}
                                items={live.reviewChecklistItems ?? []}
                                taskStatus={live.status}
                                isManager={isManagerForQa}
                                isQa={isQaReviewer}
                                isAssignee={isAssigneeForQa}
                                onRefresh={refreshTasks}
                              />
                            </div>
                            <div className="space-y-2 border-t border-gray-100 dark:border-gray-800 pt-3">
                              <p className="text-[9px] font-black uppercase tracking-widest text-orange-500 flex items-center gap-1.5">
                                ⚠ Issues & Review Notes
                                {totalOpen > 0 && <span className="px-1.5 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 rounded text-[8px] font-black">{totalOpen} open</span>}
                              </p>
                              {(issueEntriesQa.length > 0 || reviewIssues.length > 0) && (
                                <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1 custom-scrollbar">
                                  {issueEntriesQa.map(entry => (
                                    <div key={`ie-${entry.id}`} className={cn("flex items-start gap-2 px-3 py-2 rounded-xl border", entry.isResolved ? "bg-gray-50 dark:bg-gray-800/40 border-gray-100 opacity-60" : "bg-orange-50 dark:bg-orange-900/10 border-orange-100 dark:border-orange-900/30")}>
                                      <input type="checkbox" checked={entry.isResolved} disabled={!canAddReviewIssue}
                                        onChange={async () => { try { await resolveTaskIssueEntry(live.id, entry.id, !entry.isResolved); refreshTasks(); } catch (e) { showError(e instanceof Error ? e.message : 'Failed'); } }}
                                        className="mt-0.5 cursor-pointer accent-orange-500 disabled:cursor-default" />
                                      <div className="flex-1 min-w-0">
                                        <p className={cn("text-[11px] font-bold", entry.isResolved ? "text-gray-400" : "text-gray-700 dark:text-gray-300")}>{entry.description}</p>
                                        <p className="text-[8px] text-gray-400 font-mono mt-0.5">{entry.createdByName} · {formatDateTime(entry.createdAt)}</p>
                                      </div>
                                    </div>
                                  ))}
                                  {reviewIssues.map(issue => (
                                    <div key={`ri-${issue.id}`} className={cn("flex items-start gap-2 px-3 py-2 rounded-xl border", issue.isResolved ? "bg-gray-50 dark:bg-gray-800/40 border-gray-100 opacity-60" : "bg-purple-50 dark:bg-purple-900/10 border-purple-100 dark:border-purple-900/30")}>
                                      <input type="checkbox" checked={issue.isResolved} disabled={!canAddReviewIssue}
                                        onChange={async () => { try { await resolveTaskReviewIssue(live.id, issue.id, !issue.isResolved); refreshTasks(); } catch (e) { showError(e instanceof Error ? e.message : 'Failed'); } }}
                                        className="mt-0.5 cursor-pointer accent-purple-500 disabled:cursor-default" />
                                      <div className="flex-1 min-w-0">
                                        <span className="text-[7px] font-black uppercase tracking-widest text-purple-500 mr-1">QA</span>
                                        <p className={cn("text-[11px] font-bold inline", issue.isResolved ? "text-gray-400" : "text-gray-700 dark:text-gray-300")}>{issue.description}</p>
                                        <p className="text-[8px] text-gray-400 font-mono mt-0.5">{issue.createdByName} · {formatDateTime(issue.createdAt)}</p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {canAddReviewIssue && (
                                !showReviewIssueForm ? (
                                  <button type="button" onClick={() => { setReviewIssueRows(['']); setShowReviewIssueForm(true); }}
                                    className="w-full py-1.5 text-[10px] font-black uppercase tracking-widest border border-orange-200 dark:border-orange-800 text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-lg transition-colors">
                                    + Add Issue / Note
                                  </button>
                                ) : (
                                  <div className="space-y-2 p-3 rounded-xl border border-orange-200 dark:border-orange-800 bg-orange-50/40 dark:bg-orange-900/10">
                                    <div className="space-y-1.5">
                                      {reviewIssueRows.map((row, i) => (
                                        <div key={i} className="flex gap-1.5 items-center">
                                          <input type="text" value={row}
                                            onChange={e => setReviewIssueRows(prev => prev.map((r, idx) => idx === i ? e.target.value : r))}
                                            placeholder={`Issue ${i + 1}…`}
                                            className="flex-1 px-2.5 py-1 text-[12px] border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 outline-none focus:border-orange-400 placeholder:text-gray-300" />
                                          {reviewIssueRows.length > 1 && (
                                            <button type="button" onClick={() => setReviewIssueRows(prev => prev.filter((_, idx) => idx !== i))}
                                              className="text-gray-300 hover:text-red-400 text-[16px] leading-none shrink-0">×</button>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                    <button type="button" onClick={() => setReviewIssueRows(prev => [...prev, ''])}
                                      className="text-[10px] font-black uppercase tracking-widest text-orange-500 hover:text-orange-600">+ Add Row</button>
                                    <div className="flex gap-1.5 pt-1">
                                      <button type="button"
                                        onClick={async () => {
                                          const valid = reviewIssueRows.map(r => r.trim()).filter(Boolean);
                                          if (!valid.length) return;
                                          try {
                                            for (const desc of valid) await addTaskReviewIssue(live.id, desc);
                                            setShowReviewIssueForm(false); setReviewIssueRows(['']);
                                            showSuccess(`${valid.length} issue(s) added`);
                                          } catch (err) { showError(err instanceof Error ? err.message : 'Failed'); }
                                        }}
                                        disabled={!reviewIssueRows.some(r => r.trim())}
                                        className="flex-1 py-1 text-[10px] font-black uppercase tracking-widest bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-40 transition-colors">
                                        Confirm ({reviewIssueRows.filter(r => r.trim()).length})
                                      </button>
                                      <button type="button" onClick={() => { setShowReviewIssueForm(false); setReviewIssueRows(['']); }}
                                        className="px-3 py-1 text-[10px] font-black uppercase tracking-widest border border-gray-200 dark:border-gray-700 text-gray-500 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">Cancel</button>
                                    </div>
                                  </div>
                                )
                              )}
                            </div>
                            {canManageReview && live.status === 'under-review' && (
                              <button type="button" disabled={isCompletingReview}
                                onClick={async () => {
                                  setIsCompletingReview(true);
                                  try {
                                    const updated = await completeReview(live.id);
                                    refreshTasks();
                                    showSuccess(updated.status === 'completed' ? 'Review passed — task completed' : `Review returned — ${totalOpen} issue(s) flagged`);
                                  } catch (e) { showError(e instanceof Error ? e.message : 'Failed'); }
                                  finally { setIsCompletingReview(false); }
                                }}
                                className="w-full py-2.5 text-[10px] font-black uppercase tracking-widest bg-purple-600 text-white rounded-xl hover:bg-purple-700 disabled:opacity-40 transition-colors">
                                {isCompletingReview ? 'Completing…' : totalOpen > 0 ? `Complete Review — Return ${totalOpen} Issue(s)` : 'Complete Review — Pass ✓'}
                              </button>
                            )}
                          </div>
                        );
                      })()}

                      {/* ── Tab: Assignment ── */}
                      {editingTask && (() => {
                        const live = pagedTasks.find(t => t.id === editingTask.id) ?? editingTask;
                        const proj = projects.find(p => p.id === live.projectId);
                        const isManager = isAdmin || currentUser?.id === live.createdById
                          || (proj ? (currentUser?.id === proj.ownerId || currentUser?.id === proj.createdById) : false);
                        const memberIds = proj?.memberIds ?? [];
                        const pool = memberIds.length > 0 ? users.filter(u => memberIds.includes(u.id)) : users;
                        const currentAssignee = users.find(u => u.id === live.assigneeId);
                        const history = [...(live.assignmentHistory ?? [])].sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime());
                        return (
                          <div className={cn(editTab !== 'assignment' && 'hidden', 'space-y-5')}>
                            {/* Current assignee */}
                            <div className="space-y-2">
                              <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">Current Assignee</p>
                              <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-indigo-50/60 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-900/30">
                                <div className="h-8 w-8 rounded-lg bg-indigo-200 dark:bg-indigo-800 flex items-center justify-center shrink-0">
                                  <span className="text-[11px] font-black text-indigo-700 dark:text-indigo-300">{currentAssignee?.name?.charAt(0) ?? '?'}</span>
                                </div>
                                <div className="min-w-0">
                                  <p className="text-[12px] font-black text-gray-800 dark:text-gray-100 truncate">{currentAssignee?.name ?? '—'}</p>
                                  <p className="text-[9px] text-indigo-500 font-bold uppercase tracking-widest">{currentAssignee?.role ?? ''}</p>
                                </div>
                              </div>
                              {isManager && (
                                <div className="space-y-2">
                                  <VSelect options={pool.map(u => ({ value: u.id, label: `${u.name} — ${u.role}` }))}
                                    value={assignTabNewAssigneeId !== '' ? { value: assignTabNewAssigneeId, label: pool.find(u => u.id === assignTabNewAssigneeId) ? `${pool.find(u => u.id === assignTabNewAssigneeId)!.name} — ${pool.find(u => u.id === assignTabNewAssigneeId)!.role}` : '' } : null}
                                    onChange={opt => setAssignTabNewAssigneeId(opt ? Number(opt.value) : '')}
                                    isSearchable isClearable placeholder="Select new assignee…" />
                                  {assignTabNewAssigneeId !== '' && assignTabNewAssigneeId !== live.assigneeId && (
                                    <VSelect
                                      options={(live.isBlocked ? BLOCK_REASON_TAGS : REASON_TAGS).map((r): SelectOption => ({ value: r, label: r }))}
                                      value={assignTabReason ? { value: assignTabReason, label: assignTabReason } : null}
                                      onChange={opt => setAssignTabReason((opt?.value as ReasonTag) ?? '')}
                                      isSearchable={false} isClearable placeholder="— Select reason —" />
                                  )}
                                  {assignTabNewAssigneeId !== '' && assignTabNewAssigneeId !== live.assigneeId && assignTabReason && (
                                    <button type="button"
                                      onClick={async () => {
                                        try {
                                          await reassignTask(live.id, Number(assignTabNewAssigneeId), assignTabReason);
                                          setAssignTabNewAssigneeId(''); setAssignTabReason('');
                                          refreshTasks();
                                          showSuccess('Task reassigned');
                                        } catch (e) { showError(e instanceof Error ? e.message : 'Failed'); }
                                      }}
                                      className="w-full py-2 text-[10px] font-black uppercase tracking-widest bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors">
                                      Reassign Task
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Assignment History */}
                            {history.length > 0 && (
                              <div className="space-y-2 pt-1 border-t border-gray-100 dark:border-gray-800">
                                <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 flex items-center gap-1.5"><History size={10} /> Assignment History</p>
                                <div className="flex flex-wrap gap-y-2">
                                  {history.map((h, i) => (
                                    <div key={h.id} className="flex items-center">
                                      <div className="px-2.5 py-2 rounded-xl bg-gray-50/80 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800 min-w-[130px]">
                                        <div className="flex items-center gap-1 mb-1">
                                          <span className="text-[10px] font-black text-gray-700 dark:text-gray-200 truncate">{h.newAssigneeName || 'Unassigned'}</span>
                                          {i === 0 && <span className="ml-1 text-[7px] font-black uppercase text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 px-1 py-0.5 rounded shrink-0">Latest</span>}
                                        </div>
                                        <p className="text-[8px] text-amber-600 font-black uppercase tracking-widest truncate">{h.reasonTag}</p>
                                        <p className="text-[8px] text-gray-400 font-mono">{formatDateTime(h.changedAt)}</p>
                                      </div>
                                      {i < history.length - 1 && <ChevronRight size={12} className="text-gray-300 dark:text-gray-600 mx-1" />}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()}

                    </div>

                    {/* Footer */}
                    <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex gap-3 shrink-0">
                      <Button type="button" variant="secondary" className="flex-1"
                        onClick={() => { setIsModalOpen(false); setEditingTask(null); setModalParentTaskId(''); setModalProjectId(''); }}>
                        Cancel
                      </Button>
                      <Button type="submit" className="flex-1">
                        {editingTask ? 'Update Task' : 'Create Task'}
                      </Button>
                    </div>
                  </form>
                )}

                {/* Footer for view-only */}
                {editingTask !== null && !isModalEditMode && (
                  <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex gap-3 shrink-0">
                    <Button type="button" variant="secondary" className="flex-1"
                      onClick={() => { setIsModalOpen(false); setEditingTask(null); setModalParentTaskId(''); setModalProjectId(''); }}>
                      Close
                    </Button>
                    {canEditTask(editingTask) && (
                      <Button type="button" className="flex-1" onClick={() => setIsModalEditMode(true)}>
                        <Edit2 size={13} className="mr-1.5" /> Edit Task
                      </Button>
                    )}
                  </div>
                )}
              </motion.div>
            </>
          </AnimatePresence>
        )}


        {/* ── Reassign Modal (from Kanban) ──────────────────────────────── */}
        {reassigningTask && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-300">
            <Card className="w-full max-w-md border-none shadow-2xl bg-white dark:bg-gray-900 overflow-hidden ring-1 ring-white/10">
              <div className="bg-indigo-600 p-4 flex items-center justify-between">
                <h3 className="text-white font-black uppercase tracking-widest text-[11px]">Reassign Task</h3>
                <button onClick={() => setReassigningTask(null)} className="text-white/80 hover:text-white transition-colors">
                  <X size={16} />
                </button>
              </div>
              <CardContent className="p-6">
                <form onSubmit={handleReassign} className="space-y-6">
                  <div>
                    <h4 className="text-[14px] font-black text-gray-900 dark:text-white uppercase italic tracking-tight mb-1">{reassigningTask.title}</h4>
                    <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Transferring Responsibility</p>
                  </div>

                  <div className="flex items-center justify-between gap-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-100 dark:border-gray-800">
                    <div className="text-center">
                      <img src={getAssignee(reassigningTask.assigneeId)?.avatar} className="h-10 w-10 rounded-xl mx-auto mb-1 border-2 border-white dark:border-gray-700" alt="" />
                      <p className="text-[9px] font-black uppercase text-gray-400 truncate w-16">{getAssignee(reassigningTask.assigneeId)?.name.split(' ')[0]}</p>
                    </div>
                    <ArrowRight className="text-indigo-600 animate-pulse" />
                    <div className="flex-1">
                      <VSelect
                        options={users.map((u): SelectOption => ({ value: u.id, label: `${u.name} - ${u.role}` }))}
                        value={{ value: newAssigneeId, label: `${getAssignee(newAssigneeId)?.name ?? ''} - ${getAssignee(newAssigneeId)?.role ?? ''}` }}
                        onChange={opt => opt && setNewAssigneeId(Number(opt.value))}
                        isSearchable />
                    </div>
                  </div>

                  {newAssigneeId !== reassigningTask.assigneeId ? (
                    <div className="space-y-2 animate-in slide-in-from-top-2 duration-300">
                      <label className="block text-[10px] font-black uppercase text-amber-600 tracking-widest ml-1">Reason for Reassignment</label>
                      <VSelect
                        options={(reassigningTask.isBlocked ? BLOCK_REASON_TAGS : REASON_TAGS).map((tag): SelectOption => ({ value: tag, label: tag }))}
                        value={reassignmentReason ? { value: reassignmentReason, label: reassignmentReason } : null}
                        onChange={opt => setReassignmentReason((opt?.value as ReasonTag) ?? '')}
                        isSearchable={false}
                        placeholder="Select a reason..." />
                    </div>
                  ) : (
                    <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/50 text-center">
                      <p className="text-[11px] font-bold text-gray-400 italic">Select a new operative to initiate relay</p>
                    </div>
                  )}

                  {/* Assignment History */}
                  {reassigningTask.assignmentHistory && reassigningTask.assignmentHistory.length > 0 && (
                    <div className="space-y-2">
                      <h5 className="text-[9px] font-black uppercase tracking-widest text-gray-400 flex items-center gap-1.5">
                        <span className="h-px flex-1 bg-gray-100 dark:bg-gray-800" />
                        Assignee History
                        <span className="h-px flex-1 bg-gray-100 dark:bg-gray-800" />
                      </h5>
                      <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1 custom-scrollbar">
                        {[...reassigningTask.assignmentHistory]
                          .sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime())
                          .map(h => (
                            <div key={h.id} className="flex items-start gap-3 p-2.5 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800">
                              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 truncate opacity-60">{h.previousAssigneeName || 'Unassigned'}</span>
                                <ArrowRight size={9} className="text-indigo-400 shrink-0" />
                                <span className="text-[10px] font-bold text-indigo-600 truncate">{h.newAssigneeName || 'Unassigned'}</span>
                              </div>
                              <div className="text-right shrink-0">
                                <span className="text-[8px] font-black uppercase px-1.5 py-0.5 bg-amber-50 dark:bg-amber-900/20 text-amber-600 rounded tracking-widest block mb-0.5">{h.reasonTag}</span>
                                <span className="text-[8px] font-mono text-gray-400">{formatDateTime(h.changedAt)}</span>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button type="button" variant="ghost" onClick={() => setReassigningTask(null)} className="flex-1 uppercase text-[11px] font-black">Cancel</Button>
                    <Button
                      type="submit"
                      disabled={newAssigneeId === reassigningTask.assigneeId || !reassignmentReason}
                      className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white uppercase text-[11px] font-black shadow-lg shadow-indigo-600/20"
                    >
                      Confirm Relay
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Pagination — list view only, only when there are multiple pages */}
      {view === 'list' && tasksTotalCount > TASKS_PAGE_SIZE && (
        <div className="flex items-center justify-between px-1 py-2">
          <span className="text-[11px] text-gray-400 font-mono">
            {((tasksPage - 1) * TASKS_PAGE_SIZE) + 1}–{Math.min(tasksPage * TASKS_PAGE_SIZE, tasksTotalCount)} of {tasksTotalCount}
          </span>
          <div className="flex items-center gap-1">
            <button onClick={() => setTasksPage(p => Math.max(1, p - 1))} disabled={tasksPage === 1 || tasksLoading}
              className="px-2.5 py-1 text-[11px] font-black border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              <ChevronLeft size={12} />
            </button>
            <span className="px-2 text-[11px] font-mono font-bold text-gray-500">
              {tasksPage} / {Math.ceil(tasksTotalCount / TASKS_PAGE_SIZE)}
            </span>
            <button onClick={() => setTasksPage(p => Math.min(Math.ceil(tasksTotalCount / TASKS_PAGE_SIZE), p + 1))}
              disabled={tasksPage >= Math.ceil(tasksTotalCount / TASKS_PAGE_SIZE) || tasksLoading}
              className="px-2.5 py-1 text-[11px] font-black border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              <ChevronRight size={12} />
            </button>
          </div>
        </div>
      )}

      {/* Task Completion Modal */}
      {completionTask && (
        <TaskCompletionModal task={completionTask} onClose={() => setCompletionTask(null)} />
      )}

      {/* Drag-to-blocked: block items modal */}
      {pendingBlockTask && (
        <BlockItemsModal
          taskTitle={pendingBlockTask.title}
          onConfirm={async (items, hours) => {
            try {
              await changeTaskStatus(pendingBlockTask.id, 'blocked', undefined, hours, items);
              await addActivity({ userId: currentUser?.id || 1, userName: currentUser?.name || 'Admin', action: 'blocked', targetType: 'task', targetId: pendingBlockTask.id, targetName: pendingBlockTask.title });
              refreshTasks();
              showSuccess('Task blocked');
              // Only close on success — a failed block should leave the modal open (with the
              // entered items/hours intact) so the user can see the error and retry.
              setPendingBlockTask(null);
            } catch (err) { showError(err instanceof Error ? err.message : 'Failed to block task'); }
          }}
          onClose={() => setPendingBlockTask(null)}
        />
      )}

      {/* Drag-to-hours-required-column: hours-spent modal */}
      {pendingHoursMove && (
        <HoursPromptModal
          taskTitle={pendingHoursMove.task.title}
          statusLabel={STATUS_LABELS[pendingHoursMove.status] ?? pendingHoursMove.status}
          onConfirm={async (hours) => {
            const ok = await commitMove(pendingHoursMove.task, pendingHoursMove.status, hours);
            // Only close on success — a failed move should leave the modal open (with the
            // entered hours intact) so the user can see the error and retry, not lose their input.
            if (ok) setPendingHoursMove(null);
          }}
          onClose={() => setPendingHoursMove(null)}
        />
      )}
    </PageTransition>
  );
}

// ── Inline block-items modal (drag-to-blocked) ────────────────────────────────
function BlockItemsModal({ taskTitle, onConfirm, onClose }: {
  taskTitle: string;
  onConfirm: (items: AddBlockItem[], hours: number) => Promise<void>;
  onClose: () => void;
}) {
  const [items, setItems] = useState<AddBlockItem[]>([{ category: '', description: '' }]);
  const [hoursInput, setHoursInput] = useState('');
  const [saving, setSaving] = useState(false);

  const hours = fromHHMM(hoursInput);
  const hoursValid = isValidHoursEntry(hours);
  const showHoursError = hoursInput.length === 5 && !hoursValid;

  const updateItem = (idx: number, field: keyof AddBlockItem, val: string) =>
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: val } : it));

  const handleConfirm = async () => {
    const valid = items.filter(i => i.category && i.description.trim());
    if (!valid.length || !hoursValid || hours == null) return;
    setSaving(true);
    try { await onConfirm(valid, hours); } finally { setSaving(false); }
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  return (
    <AnimatePresence>
      <>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose} className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 14 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 14 }}
          transition={{ duration: 0.16 }}
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl z-[60] flex flex-col max-h-[80vh]"
          role="dialog" aria-modal="true"
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800 shrink-0">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-red-500">Block Task</p>
              <h3 className="text-[14px] font-black text-gray-900 dark:text-white truncate">{taskTitle}</h3>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-gray-400"><X size={16} /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-5 space-y-3">
            <p className="text-[11px] text-gray-500">Add at least one block reason item.</p>
            {items.map((item, idx) => (
              <div key={idx} className="space-y-1.5 p-3 bg-red-50/60 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-xl">
                <div className="flex items-center gap-2">
                  <VSelect
                    options={BLOCK_CATEGORIES.map((c): SelectOption => ({ value: c, label: c }))}
                    value={item.category ? { value: item.category, label: item.category } : null}
                    onChange={opt => updateItem(idx, 'category', opt ? String(opt.value) : '')}
                    isSearchable={false}
                    isClearable
                    size="sm"
                    placeholder="— Category —"
                    className="flex-1" />
                  {items.length > 1 && (
                    <button type="button" onClick={() => setItems(prev => prev.filter((_, i) => i !== idx))}
                      className="p-1 text-red-400 hover:text-red-600"><X size={13} /></button>
                  )}
                </div>
                <input type="text" value={item.description} onChange={e => updateItem(idx, 'description', e.target.value)}
                  placeholder="Description (required)"
                  className="w-full px-3 py-1.5 text-[12px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg outline-none focus:ring-1 ring-red-400/40 placeholder-gray-400" />
                <input type="text" value={item.expectedResolution ?? ''} onChange={e => updateItem(idx, 'expectedResolution', e.target.value)}
                  placeholder="Expected resolution (optional)"
                  className="w-full px-3 py-1.5 text-[12px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg outline-none focus:ring-1 ring-red-400/40 placeholder-gray-400" />
              </div>
            ))}
            <button type="button" onClick={() => setItems(prev => [...prev, { category: '', description: '' }])}
              className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-red-500 hover:text-red-700">
              <Plus size={11} /> Add item
            </button>
            <div className="pt-1 space-y-1.5">
              <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400">Hours Spent (before blocking)</label>
              <TimeInput
                value={hoursInput}
                onChange={setHoursInput}
                maxHours={MAX_HOURS_PER_ENTRY}
                className={cn(
                  'px-3 py-2 bg-white dark:bg-gray-800 border rounded-lg outline-none focus:ring-1 text-[12px] font-bold',
                  showHoursError
                    ? 'border-red-400 dark:border-red-600 ring-red-400/40'
                    : 'border-gray-200 dark:border-gray-700 ring-red-400/40'
                )}
              />
              <p className={cn('text-[9px]', showHoursError ? 'text-red-500 font-bold' : 'text-gray-400')}>
                {showHoursError ? `Enter between 00:01 and ${MAX_HOURS_PER_ENTRY}:00.` : `Required · max ${MAX_HOURS_PER_ENTRY}:00 per entry.`}
              </p>
            </div>
          </div>
          <div className="flex gap-2 px-5 py-4 border-t border-gray-100 dark:border-gray-800 shrink-0">
            <button onClick={onClose}
              className="flex-1 py-2 text-[11px] font-black uppercase tracking-widest border border-gray-200 dark:border-gray-700 text-gray-500 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              Cancel
            </button>
            <button onClick={handleConfirm} disabled={saving || !items.some(i => i.category && i.description.trim()) || !hoursValid}
              className="flex-1 py-2 text-[11px] font-black uppercase tracking-widest bg-red-500 text-white rounded-xl hover:bg-red-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              {saving ? 'Blocking...' : 'Confirm Block'}
            </button>
          </div>
        </motion.div>
      </>
    </AnimatePresence>
  );
}

// ── Inline hours-spent modal (drag-to-hours-required-column) ──────────────────
function HoursPromptModal({ taskTitle, statusLabel, onConfirm, onClose }: {
  taskTitle: string;
  statusLabel: string;
  onConfirm: (hours: number) => Promise<void>;
  onClose: () => void;
}) {
  const [hoursInput, setHoursInput] = useState('');
  const [saving, setSaving]         = useState(false);

  const hours = fromHHMM(hoursInput);
  const isValid = isValidHoursEntry(hours);
  const showRangeError = hoursInput.length === 5 && !isValid;

  const handleConfirm = async () => {
    if (!isValid || hours == null || saving) return;
    setSaving(true);
    try { await onConfirm(hours); } finally { setSaving(false); }
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Enter' && isValid && !saving) handleConfirm();
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, isValid, hoursInput, saving]);

  return (
    <AnimatePresence>
      <>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose} className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 14 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 14 }}
          transition={{ duration: 0.16 }}
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-white dark:bg-gray-900 rounded-2xl shadow-2xl z-[60] flex flex-col"
          role="dialog" aria-modal="true"
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800 shrink-0">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500">Hours Spent — {statusLabel}</p>
              <h3 className="text-[14px] font-black text-gray-900 dark:text-white truncate">{taskTitle}</h3>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-gray-400"><X size={16} /></button>
          </div>
          <div className="p-5 space-y-2">
            <label className="block text-[11px] font-black uppercase tracking-widest text-gray-400">Hours (HH:MM)</label>
            <TimeInput
              value={hoursInput}
              onChange={setHoursInput}
              maxHours={MAX_HOURS_PER_ENTRY}
              className={cn(
                'px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border rounded-lg outline-none focus:ring-2 text-[14px] font-bold',
                showRangeError
                  ? 'border-red-400 dark:border-red-600 focus:ring-red-400/50'
                  : 'border-gray-100 dark:border-gray-800 focus:ring-indigo-500'
              )}
            />
            <p className={cn('text-[10px]', showRangeError ? 'text-red-500 font-bold' : 'text-gray-400')}>
              {showRangeError
                ? `Enter between 00:01 and ${MAX_HOURS_PER_ENTRY}:00.`
                : `Required to move this task to ${statusLabel} · max ${MAX_HOURS_PER_ENTRY}:00 per entry.`}
            </p>
          </div>
          <div className="flex gap-2 px-5 py-4 border-t border-gray-100 dark:border-gray-800 shrink-0">
            <button onClick={onClose}
              className="flex-1 py-2 text-[11px] font-black uppercase tracking-widest border border-gray-200 dark:border-gray-700 text-gray-500 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              Cancel
            </button>
            <button onClick={handleConfirm} disabled={saving || !isValid}
              className="flex-1 py-2 text-[11px] font-black uppercase tracking-widest bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              {saving ? 'Saving...' : 'Confirm'}
            </button>
          </div>
        </motion.div>
      </>
    </AnimatePresence>
  );
}
