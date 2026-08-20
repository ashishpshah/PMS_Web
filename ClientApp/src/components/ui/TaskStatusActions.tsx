import { useState } from 'react';
import { Plus, Trash2, ShieldAlert } from 'lucide-react';
import { Status, STATUS_LABELS, AddBlockItem, BLOCK_CATEGORIES } from '../../types';
import { TimeInput } from './TimeInput';
import { fromHHMM } from '../../lib/utils';

// Matches backend ActualHoursExemptStatuses
const HOURS_EXEMPT: Status[] = ['new', 'paused', 'blocked', 'issues'];

// Matches backend AllowedEdges
const ALLOWED_EDGES: Record<Status, Status[]> = {
  'new':          ['in-progress'],
  'in-progress':  ['paused', 'blocked', 'under-review'],
  'paused':       ['in-progress'],
  'blocked':      ['in-progress'],
  'under-review': ['completed', 'issues'],
  'issues':       ['in-progress'],
  'completed':    ['in-progress'],
};

const STATUS_STYLE: Record<Status, { dot: string; active: string; idle: string }> = {
  'new':          { dot: 'bg-gray-400',    active: 'bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200',               idle: 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800' },
  'in-progress':  { dot: 'bg-indigo-500',  active: 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-400 dark:border-indigo-500 text-indigo-700 dark:text-indigo-200',   idle: 'border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/20' },
  'paused':       { dot: 'bg-amber-500',   active: 'bg-amber-50 dark:bg-amber-900/30 border-amber-400 dark:border-amber-500 text-amber-700 dark:text-amber-200',         idle: 'border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20' },
  'blocked':      { dot: 'bg-red-500',     active: 'bg-red-50 dark:bg-red-900/30 border-red-400 dark:border-red-500 text-red-700 dark:text-red-200',                     idle: 'border-red-200 dark:border-red-800 text-red-600 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20' },
  'under-review': { dot: 'bg-purple-500',  active: 'bg-purple-50 dark:bg-purple-900/30 border-purple-400 dark:border-purple-500 text-purple-700 dark:text-purple-200',   idle: 'border-purple-200 dark:border-purple-800 text-purple-600 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/20' },
  'issues':       { dot: 'bg-orange-500',  active: 'bg-orange-50 dark:bg-orange-900/30 border-orange-400 dark:border-orange-500 text-orange-700 dark:text-orange-200',   idle: 'border-orange-200 dark:border-orange-800 text-orange-600 dark:text-orange-300 hover:bg-orange-50 dark:hover:bg-orange-900/20' },
  'completed':    { dot: 'bg-emerald-500', active: 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-400 dark:border-emerald-500 text-emerald-700 dark:text-emerald-200', idle: 'border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/20' },
};

function isAllowedForUser(from: Status, to: Status, p: { isManager: boolean; isAssignee: boolean; isQa: boolean }): boolean {
  const { isManager, isAssignee, isQa } = p;
  switch (to) {
    case 'completed':   return isManager || isQa;
    case 'issues':      return isManager || isQa;
    case 'under-review': return isAssignee || isManager;
    case 'in-progress':
      if (from === 'completed') return isManager;
      return isAssignee || isManager;
    default: // paused, blocked
      return isAssignee || isManager;
  }
}

function getDisableReason(
  to: Status,
  current: Status,
  p: { isManager: boolean; isAssignee: boolean; isQa: boolean; checklistComplete: boolean; activeBlockItemCount: number }
): string | null {
  if (!(ALLOWED_EDGES[current] ?? []).includes(to)) return 'Invalid transition';
  if (!isAllowedForUser(current, to, p)) return 'No permission';
  if ((to === 'under-review' || to === 'completed') && !p.checklistComplete) return 'Complete checklist first';
  if (current === 'blocked' && to === 'in-progress' && p.activeBlockItemCount > 0)
    return `Resolve ${p.activeBlockItemCount} block item(s) first`;
  return null;
}

const emptyItem = (): AddBlockItem => ({ category: '', description: '' });

interface TaskStatusActionsProps {
  currentStatus: Status;
  isManager: boolean;
  isAssignee: boolean;
  isQa: boolean;
  checklistComplete: boolean;
  isAdmin?: boolean;
  activeBlockItemCount?: number;
  onChange: (to: Status, reason?: string, actualHours?: number, blockItems?: AddBlockItem[]) => Promise<void> | void;
}

export function TaskStatusActions({
  currentStatus,
  isManager,
  isAssignee,
  isQa,
  checklistComplete,
  isAdmin,
  activeBlockItemCount = 0,
  onChange,
}: TaskStatusActionsProps) {
  const [pendingTo, setPendingTo]     = useState<Status | null>(null);
  const [hoursInput, setHoursInput]   = useState('');
  const [blockOpen, setBlockOpen]     = useState(false);
  const [blockItems, setBlockItems]   = useState<AddBlockItem[]>([emptyItem()]);
  const [saving, setSaving]           = useState(false);

  const effAssignee = isAdmin || isAssignee;
  const ctx = { isManager, isAssignee: effAssignee, isQa, checklistComplete, activeBlockItemCount };
  const targets = ALLOWED_EDGES[currentStatus] ?? [];

  const handle = async (to: Status) => {
    if (to === 'blocked') { setBlockOpen(true); return; }
    if (HOURS_EXEMPT.includes(to)) {
      setSaving(true);
      try { await onChange(to); } finally { setSaving(false); }
    } else {
      setHoursInput('');
      setPendingTo(to);
    }
  };

  const confirmHours = async () => {
    if (!pendingTo) return;
    const hours = fromHHMM(hoursInput);
    if (!hours || hours <= 0) return;
    setSaving(true);
    try {
      await onChange(pendingTo, undefined, hours);
      setPendingTo(null);
      setHoursInput('');
    } finally { setSaving(false); }
  };

  const confirmBlock = async () => {
    const valid = blockItems.filter(i => i.category && i.description.trim());
    if (valid.length === 0) return;
    setSaving(true);
    try {
      await onChange('blocked', undefined, undefined, valid);
      setBlockOpen(false);
      setBlockItems([emptyItem()]);
    } finally { setSaving(false); }
  };

  const cancelBlock = () => { setBlockOpen(false); setBlockItems([emptyItem()]); };

  const updateItem = (idx: number, field: keyof AddBlockItem, val: string) =>
    setBlockItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: val } : it));

  const style = STATUS_STYLE[currentStatus];

  return (
    <div className="space-y-3">
      {/* Current status */}
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-black uppercase tracking-widest text-gray-400 shrink-0">Current</span>
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-black uppercase tracking-widest ${style.active}`}>
          <span className={`h-2 w-2 rounded-full shrink-0 ${style.dot}`} />
          {STATUS_LABELS[currentStatus] ?? currentStatus}
        </span>
      </div>

      {/* Target buttons */}
      {!blockOpen && !pendingTo && (
        <div className="space-y-1">
          <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">Change To</p>
          <div className="flex flex-wrap gap-1.5">
            {targets.map(to => {
              const reason = getDisableReason(to, currentStatus, ctx);
              const disabled = reason !== null;
              const st = STATUS_STYLE[to];
              return (
                <button
                  key={to}
                  type="button"
                  disabled={disabled || saving}
                  onClick={() => handle(to)}
                  title={reason ?? `Move to ${STATUS_LABELS[to]}`}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-black uppercase tracking-widest transition-colors
                    ${disabled
                      ? 'border-gray-100 dark:border-gray-800 text-gray-400 dark:text-gray-600 cursor-not-allowed opacity-50'
                      : st.idle}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${disabled ? 'bg-gray-300 dark:bg-gray-600' : st.dot}`} />
                  {STATUS_LABELS[to] ?? to}
                  {disabled && reason && (
                    <span className="text-[8px] font-bold normal-case tracking-normal opacity-70 ml-0.5">— {reason}</span>
                  )}
                  {to === 'blocked' && !disabled && <ShieldAlert size={9} className="ml-0.5 opacity-70" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Block items form */}
      {blockOpen && (
        <div className="p-3 bg-red-50/60 dark:bg-red-900/10 border border-red-200 dark:border-red-800/50 rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-black uppercase tracking-widest text-red-600 dark:text-red-400 flex items-center gap-1.5">
              <ShieldAlert size={11} /> Block Reason Items
            </p>
            <button type="button" onClick={cancelBlock} className="text-gray-400 hover:text-gray-600 text-[10px]">✕</button>
          </div>
          <div className="space-y-2">
            {blockItems.map((item, idx) => (
              <div key={idx} className="space-y-1.5 p-2.5 bg-white dark:bg-gray-800 rounded-lg border border-red-100 dark:border-red-900/30">
                <div className="flex items-center gap-2">
                  <select
                    value={item.category}
                    onChange={e => updateItem(idx, 'category', e.target.value)}
                    className="flex-1 px-2 py-1 text-[11px] bg-transparent border border-gray-200 dark:border-gray-700 rounded outline-none focus:ring-1 ring-red-400/40"
                  >
                    <option value="">— Category —</option>
                    {BLOCK_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  {blockItems.length > 1 && (
                    <button type="button" onClick={() => setBlockItems(prev => prev.filter((_, i) => i !== idx))}
                      className="text-red-400 hover:text-red-600 shrink-0">
                      <Trash2 size={11} />
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  value={item.description}
                  onChange={e => updateItem(idx, 'description', e.target.value)}
                  placeholder="Description (required)"
                  className="w-full px-2 py-1 text-[11px] bg-transparent border border-gray-200 dark:border-gray-700 rounded outline-none focus:ring-1 ring-red-400/40 placeholder-gray-400"
                />
                <input
                  type="text"
                  value={item.expectedResolution ?? ''}
                  onChange={e => updateItem(idx, 'expectedResolution', e.target.value)}
                  placeholder="Expected resolution (optional)"
                  className="w-full px-2 py-1 text-[11px] bg-transparent border border-gray-200 dark:border-gray-700 rounded outline-none focus:ring-1 ring-red-400/40 placeholder-gray-400"
                />
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setBlockItems(prev => [...prev, emptyItem()])}
            className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-red-500 hover:text-red-700">
            <Plus size={11} /> Add item
          </button>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={cancelBlock}
              className="flex-1 py-1.5 text-[10px] font-black uppercase tracking-widest border border-gray-200 dark:border-gray-700 text-gray-500 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              Cancel
            </button>
            <button type="button" onClick={confirmBlock}
              disabled={saving || !blockItems.some(i => i.category && i.description.trim())}
              className="flex-1 py-1.5 text-[10px] font-black uppercase tracking-widest bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              {saving ? '…' : 'Confirm Block'}
            </button>
          </div>
        </div>
      )}

      {/* Hours prompt */}
      {pendingTo && !blockOpen && (
        <div className="p-2.5 bg-indigo-50/50 dark:bg-indigo-900/10 border border-indigo-200 dark:border-indigo-800/50 rounded-xl space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-300">
            Hours spent — {STATUS_LABELS[pendingTo]}
          </p>
          <div className="flex items-center gap-2">
            <TimeInput
              value={hoursInput}
              onChange={setHoursInput}
              className="flex-1 px-2.5 py-1.5 bg-white dark:bg-gray-800 border border-indigo-200 dark:border-indigo-700 rounded-lg outline-none focus:ring-1 ring-indigo-400/40 text-[12px] font-mono"
            />
            <button type="button" onClick={confirmHours}
              disabled={saving || !fromHHMM(hoursInput) || (fromHHMM(hoursInput) ?? 0) <= 0}
              className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              {saving ? '…' : 'Confirm'}
            </button>
            <button type="button" onClick={() => { setPendingTo(null); setHoursInput(''); }}
              className="px-2.5 py-1.5 text-[10px] font-black uppercase tracking-widest border border-gray-200 dark:border-gray-700 text-gray-500 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              Cancel
            </button>
          </div>
          <p className="text-[9px] text-gray-400 normal-case tracking-normal">Format HH:MM · required to move to {STATUS_LABELS[pendingTo]}.</p>
        </div>
      )}
    </div>
  );
}
