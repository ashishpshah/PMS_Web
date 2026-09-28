import { useState, useMemo } from 'react';
import { Plus, Trash2, ShieldAlert, ChevronDown, X, AlertCircle, Info } from 'lucide-react';
import { Status, STATUS_LABELS, AddBlockItem, BLOCK_CATEGORIES, StatusTransitionGraph } from '../../types';
import { TimeInput } from './TimeInput';
import { fromHHMM, MAX_HOURS_PER_ENTRY, isValidHoursEntry, getAllowedNextStatuses, requiresActualHours } from '../../lib/utils';
import { VSelect } from '../forms/VSelect';
import { cn } from '../../lib/utils';
import { useData } from '../../context/DataContext';
import { showError, showSuccess } from '../../lib/toast';

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
    default:
      return isAssignee || isManager;
  }
}

function getDisableReason(
  graph: StatusTransitionGraph,
  to: Status,
  current: Status,
  p: { isManager: boolean; isAssignee: boolean; isQa: boolean; checklistComplete: boolean; activeBlockItemCount: number }
): string | null {
  if (!getAllowedNextStatuses(graph, current).includes(to)) return 'Invalid transition';
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
  const [blockOpen, setBlockOpen] = useState(false);
  const [blockItems, setBlockItems] = useState<AddBlockItem[]>([emptyItem()]);
  const [blockHoursInput, setBlockHoursInput] = useState('');
  const [saving, setSaving] = useState(false);

  const [selectedNextStatus, setSelectedNextStatus] = useState<Status | null>(null);
  const [hoursInput, setHoursInput] = useState('');
  const [hoursError, setHoursError] = useState<string | null>(null);

  const { statusTransitions } = useData();

  const effAssignee = isAdmin || isAssignee;
  const ctx = { isManager, isAssignee: effAssignee, isQa, checklistComplete, activeBlockItemCount };
  const targets = getAllowedNextStatuses(statusTransitions, currentStatus);

  const nextStatusOptions = useMemo(() =>
    targets.map(to => ({ value: to, label: STATUS_LABELS[to] ?? to })),
    [targets]
  );

  const requiresHours = selectedNextStatus ? requiresActualHours(statusTransitions, currentStatus, selectedNextStatus) : false;
  const blockRequiresHours = requiresActualHours(statusTransitions, currentStatus, 'blocked');
  const disableReason = selectedNextStatus ? getDisableReason(statusTransitions, selectedNextStatus, currentStatus, ctx) : null;

  const blockHours = fromHHMM(blockHoursInput);
  const blockHoursValid = isValidHoursEntry(blockHours);

  const validateHours = (hours: number): string | null => {
    if (hours <= 5/60) return 'Spent hours must be greater than 00:05';
    if (hours >= 10) return 'Spent hours must be less than 10:00';
    return null;
  };

  const handleStatusSelect = (to: Status | null) => {
    setSelectedNextStatus(to);
    setHoursError(null);
    if (to) {
      const needsHours = requiresActualHours(statusTransitions, currentStatus, to);
      setHoursInput(needsHours ? '' : '00:00');
    } else {
      setHoursInput('');
    }
  };

  const executeTransition = async (to: Status, hours?: number, items?: AddBlockItem[]) => {
    setSaving(true);
    try {
      await onChange(to, undefined, hours, items);
      setSelectedNextStatus(null);
      setHoursInput('');
      setHoursError(null);
    } finally {
      setSaving(false);
    }
  };

  const handleConfirm = async () => {
    if (!selectedNextStatus) return;
    if (selectedNextStatus === 'blocked') {
      setBlockOpen(true);
      return;
    }
    const disableReason = getDisableReason(statusTransitions, selectedNextStatus, currentStatus, ctx);
    if (disableReason) return;
    const hours = requiresHours ? fromHHMM(hoursInput) : undefined;
    if (requiresHours) {
      if (!isValidHoursEntry(hours)) {
        setHoursError('Enter valid spent hours (hh:mm)');
        return;
      }
      const err = validateHours(hours!);
      if (err) {
        setHoursError(err);
        return;
      }
    }
    setHoursError(null);
    await executeTransition(selectedNextStatus, hours);
  };

  const handleExemptQuickAction = async (to: Status) => {
    if (to === 'blocked') { setBlockOpen(true); return; }
    await executeTransition(to);
  };

  const confirmBlock = async () => {
    const valid = blockItems.filter(i => i.category && i.description.trim());
    if (valid.length === 0) {
      showError('Add at least one block reason with category and description');
      return;
    }
    if (blockRequiresHours && (!blockHoursValid || blockHours == null)) {
      showError('Enter valid hours spent (hh:mm) before blocking');
      return;
    }
    setSaving(true);
    try {
      await onChange('blocked', undefined, blockRequiresHours ? blockHours : undefined, valid);
      showSuccess('Task blocked successfully');
      setBlockOpen(false);
      setBlockItems([emptyItem()]);
      setBlockHoursInput('');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to block task');
    } finally {
      setSaving(false);
    }
  };

  const cancelBlock = () => { setBlockOpen(false); setBlockItems([emptyItem()]); setBlockHoursInput(''); };

  const updateItem = (idx: number, field: keyof AddBlockItem, val: string) =>
    setBlockItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: val } : it));

  const style = STATUS_STYLE[currentStatus];
  const isCurrentlyBlocked = currentStatus === 'blocked';

  if (blockOpen) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-red-500" />
            Block Task
          </h3>
          <button
            type="button"
            onClick={cancelBlock}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <p className="text-sm text-gray-500 dark:text-gray-400">
          Mark this task as blocked if there is an impediment preventing further progress.
        </p>

        <div className="space-y-3">
          {blockItems.map((item, idx) => (
            <div key={idx} className="space-y-2 p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <select
                  value={item.category}
                  onChange={e => updateItem(idx, 'category', e.target.value)}
                  className="flex-1 px-3 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                >
                  <option value="">— Category —</option>
                  {BLOCK_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                {blockItems.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setBlockItems(prev => prev.filter((_, i) => i !== idx))}
                    className="p-1.5 text-red-400 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
                    aria-label="Remove item"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
              <input
                type="text"
                value={item.description}
                onChange={e => updateItem(idx, 'description', e.target.value)}
                placeholder="Description (required)"
                className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 placeholder-gray-400"
              />
              <input
                type="text"
                value={item.expectedResolution ?? ''}
                onChange={e => updateItem(idx, 'expectedResolution', e.target.value)}
                placeholder="Expected resolution (optional)"
                className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 placeholder-gray-400"
              />
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setBlockItems(prev => [...prev, emptyItem()])}
          className="flex items-center gap-2 text-sm font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
        >
          <Plus size={16} /> Add block reason
        </button>

        {blockRequiresHours && (
          <div className="pt-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Hours Spent (before blocking) <span className="text-red-500">*</span>
            </label>
            <TimeInput
              value={blockHoursInput}
              onChange={setBlockHoursInput}
              maxHours={MAX_HOURS_PER_ENTRY}
              className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
            />
          </div>
        )}

        <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={cancelBlock}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirmBlock}
            disabled={saving || !blockItems.some(i => i.category && i.description.trim()) || (blockRequiresHours && (!blockHoursValid || blockHours == null))}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <ShieldAlert size={16} />
            {saving ? 'Blocking...' : 'Confirm Block'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Current Status (1/2) | Block Task (1/2) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Current Status Card */}
        <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-xl p-4 h-full">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                <span className={`h-3 w-3 rounded-full ${style.dot}`} />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">Current Status</p>
                <p className="text-lg font-bold text-indigo-900 dark:text-indigo-100 capitalize">{STATUS_LABELS[currentStatus] ?? currentStatus}</p>
              </div>
            </div>
            {isCurrentlyBlocked && (
              <span className="px-2.5 py-1 text-xs font-semibold text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/30 rounded-full">
                Blocked
              </span>
            )}
          </div>
        </div>

        {/* Block Task Section */}
        <div className="bg-red-50/50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/30 rounded-xl p-4 h-full">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-red-800 dark:text-red-200">Block Task</h3>
              <p className="text-sm text-red-600 dark:text-red-400 mt-0.5">
                Mark this task as blocked if there is an impediment preventing further progress.
              </p>
            </div>
          </div>
          {!isCurrentlyBlocked && (
            <button
              type="button"
              onClick={() => setBlockOpen(true)}
              disabled={saving || currentStatus === 'completed'}
              className="mt-3 w-full px-4 py-2.5 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <ShieldAlert size={16} />
              Block Task
            </button>
          )}
          {isCurrentlyBlocked && (
            <div className="mt-3 p-3 bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-800/50 rounded-lg">
              <p className="text-sm font-medium text-red-800 dark:text-red-200">Task is currently blocked</p>
              <p className="text-sm text-red-600 dark:text-red-400 mt-0.5">Resolve active block items to unblock this task.</p>
            </div>
          )}
        </div>
      </div>

      {/* Next Status Dropdown */}
      <div className="space-y-2">
        <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Next Status <span className="text-red-500">*</span>
        </label>
        <VSelect
          options={nextStatusOptions}
          value={selectedNextStatus ? nextStatusOptions.find(o => o.value === selectedNextStatus) ?? null : null}
          onChange={opt => handleStatusSelect(opt ? opt.value as Status : null)}
          placeholder="Select next status"
          isSearchable={false}
          disabled={saving}
          className="w-full"
        />
        {selectedNextStatus && (
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <Info className="h-3.5 w-3.5 flex-shrink-0" />
            <span>Selected: <strong className="text-gray-700 dark:text-gray-300 capitalize">{STATUS_LABELS[selectedNextStatus] ?? selectedNextStatus}</strong></span>
          </div>
        )}
      </div>

      {/* Spent Hours (conditional) */}
      {selectedNextStatus && requiresHours && (
        <div className="space-y-2">
          <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Spent Hours <span className="text-red-500">*</span>
          </label>
          <TimeInput
            value={hoursInput}
            onChange={setHoursInput}
            maxHours={MAX_HOURS_PER_ENTRY}
            disabled={saving}
            className={`w-full px-3 py-2 text-sm font-mono bg-white dark:bg-gray-700 rounded-lg outline-none focus:ring-2 transition-colors ${
              hoursError
                ? 'border-red-300 dark:border-red-700 focus:ring-red-500/20 focus:border-red-500'
                : 'border-gray-300 dark:border-gray-600 focus:ring-indigo-500/20 focus:border-indigo-500'
            }`}
          />
          {hoursError && (
            <p className="text-xs text-red-500 dark:text-red-400 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              {hoursError}
            </p>
          )}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={saving || !selectedNextStatus || !!disableReason}
          className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {saving ? (
            <>
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
              Saving...
            </>
          ) : selectedNextStatus ? (
            requiresHours ? 'Confirm' : 'Move'
          ) : (
            'Select status first'
          )}
        </button>
        {selectedNextStatus && (
          <button
            type="button"
            onClick={() => handleStatusSelect(null)}
            disabled={saving}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-40"
            aria-label="Clear selection"
          >
            <X size={18} />
          </button>
        )}
        {disableReason && (
          <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1 flex-1">
            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
            {disableReason}
          </p>
        )}
      </div>
    </div>
  );
}