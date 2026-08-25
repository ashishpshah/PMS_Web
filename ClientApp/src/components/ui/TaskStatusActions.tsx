import { useState, useMemo } from 'react';
import { Plus, Trash2, ShieldAlert, ChevronDown, X } from 'lucide-react';
import { Status, STATUS_LABELS, AddBlockItem, BLOCK_CATEGORIES } from '../../types';
import { TimeInput } from './TimeInput';
import { fromHHMM, MAX_HOURS_PER_ENTRY, isValidHoursEntry, getAllowedNextStatuses, isActualHoursExempt } from '../../lib/utils';
import { VSelect } from '../forms/VSelect';
import { cn } from '../../lib/utils';

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
  to: Status,
  current: Status,
  p: { isManager: boolean; isAssignee: boolean; isQa: boolean; checklistComplete: boolean; activeBlockItemCount: number }
): string | null {
  if (!getAllowedNextStatuses(current).includes(to)) return 'Invalid transition';
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

  const effAssignee = isAdmin || isAssignee;
  const ctx = { isManager, isAssignee: effAssignee, isQa, checklistComplete, activeBlockItemCount };
  const targets = getAllowedNextStatuses(currentStatus);

  const nextStatusOptions = useMemo(() =>
    targets.map(to => ({ value: to, label: STATUS_LABELS[to] ?? to })),
    [targets]
  );

  const requiresHours = selectedNextStatus ? !isActualHoursExempt(currentStatus, selectedNextStatus) : false;
  const exempt = selectedNextStatus ? isActualHoursExempt(currentStatus, selectedNextStatus) : false;
  const disableReason = selectedNextStatus ? getDisableReason(selectedNextStatus, currentStatus, ctx) : null;

  const blockHours = fromHHMM(blockHoursInput);
  const blockHoursValid = isValidHoursEntry(blockHours);

  const handleStatusSelect = (to: Status | null) => {
    setSelectedNextStatus(to);
    if (to) {
      const exempt = isActualHoursExempt(currentStatus, to);
      setHoursInput(exempt ? '00:00' : '');
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
    const disableReason = getDisableReason(selectedNextStatus, currentStatus, ctx);
    if (disableReason) return;
    const hours = requiresHours ? fromHHMM(hoursInput) : undefined;
    if (requiresHours && !isValidHoursEntry(hours)) return;
    await executeTransition(selectedNextStatus, hours);
  };

  const handleExemptQuickAction = async (to: Status) => {
    if (to === 'blocked') { setBlockOpen(true); return; }
    await executeTransition(to);
  };

  const confirmBlock = async () => {
    const valid = blockItems.filter(i => i.category && i.description.trim());
    if (valid.length === 0 || !blockHoursValid || blockHours == null) return;
    setSaving(true);
    try {
      await onChange('blocked', undefined, blockHours, valid);
      setBlockOpen(false);
      setBlockItems([emptyItem()]);
      setBlockHoursInput('');
    } finally { setSaving(false); }
  };

  const cancelBlock = () => { setBlockOpen(false); setBlockItems([emptyItem()]); setBlockHoursInput(''); };

  const updateItem = (idx: number, field: keyof AddBlockItem, val: string) =>
    setBlockItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: val } : it));

  const style = STATUS_STYLE[currentStatus];

  return (
    <div className="space-y-3">
      {blockOpen ? (
        <BlockForm
          blockItems={blockItems}
          blockHoursInput={blockHoursInput}
          setBlockHoursInput={setBlockHoursInput}
          blockHoursValid={blockHoursValid}
          saving={saving}
          onUpdateItem={updateItem}
          onAddItem={() => setBlockItems(prev => [...prev, emptyItem()])}
          onCancel={cancelBlock}
          onConfirm={confirmBlock}
        />
      ) : (
        <>
          <div className="grid grid-cols-[auto_1fr] gap-3 items-center">
            <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 whitespace-nowrap">Current Status</label>
            <div className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[10px] font-black uppercase tracking-widest ${style.active}`}>
              <span className={`h-2 w-2 rounded-full shrink-0 ${style.dot}`} />
              {STATUS_LABELS[currentStatus] ?? currentStatus}
            </div>
          </div>

          <div className="grid grid-cols-[auto_1fr] gap-3 items-center">
            <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 whitespace-nowrap">Next Status</label>
            <VSelect
              options={nextStatusOptions}
              value={selectedNextStatus ? nextStatusOptions.find(o => o.value === selectedNextStatus) ?? null : null}
              onChange={opt => handleStatusSelect(opt ? opt.value as Status : null)}
              placeholder="Select next status"
              isSearchable={false}
              disabled={saving}
              className="w-full"
            />
          </div>

          <div className="grid grid-cols-[auto_1fr] gap-3 items-center">
            <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 whitespace-nowrap">Spent Hours</label>
            <div className="flex items-center gap-2">
              <TimeInput
                value={hoursInput}
                onChange={setHoursInput}
                maxHours={MAX_HOURS_PER_ENTRY}
                disabled={!selectedNextStatus || exempt || saving}
                className="flex-1 px-2.5 py-1.5 bg-white dark:bg-gray-800 border border-indigo-200 dark:border-indigo-700 rounded-lg outline-none focus:ring-1 ring-indigo-400/40 text-[12px] font-mono"
              />
              {selectedNextStatus && exempt && (
                <span className="text-[9px] font-medium text-emerald-600 dark:text-emerald-400">Hours not required</span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-[auto_1fr] gap-2 items-center pt-1">
            <span className="text-[9px] font-black uppercase tracking-widest text-gray-400 whitespace-nowrap">&nbsp;</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleConfirm}
                disabled={saving}
                className="flex-1 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {saving ? '…' : selectedNextStatus ? (requiresHours ? 'Confirm' : 'Move') : 'Select status'}
              </button>
              <button
                type="button"
                onClick={() => handleStatusSelect(null)}
                disabled={saving}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-40"
                title="Clear selection"
              >
                Clear <X size={14} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function BlockForm({
  blockItems,
  blockHoursInput,
  setBlockHoursInput,
  blockHoursValid,
  saving,
  onUpdateItem,
  onAddItem,
  onCancel,
  onConfirm,
}: {
  blockItems: AddBlockItem[];
  blockHoursInput: string;
  setBlockHoursInput: (val: string) => void;
  blockHoursValid: boolean;
  saving: boolean;
  onUpdateItem: (idx: number, field: keyof AddBlockItem, val: string) => void;
  onAddItem: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="p-3 bg-red-50/60 dark:bg-red-900/10 border border-red-200 dark:border-red-800/50 rounded-xl space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-black uppercase tracking-widest text-red-600 dark:text-red-400 flex items-center gap-1.5">
          <ShieldAlert size={11} /> Block Reason Items
        </p>
        <button type="button" onClick={onCancel} className="text-gray-400 hover:text-gray-600 text-[10px]">✕</button>
      </div>
      <div className="space-y-2">
        {blockItems.map((item, idx) => (
          <div key={idx} className="space-y-1.5 p-2.5 bg-white dark:bg-gray-800 rounded-lg border border-red-100 dark:border-red-900/30">
            <div className="flex items-center gap-2">
              <select
                value={item.category}
                onChange={e => onUpdateItem(idx, 'category', e.target.value)}
                className="flex-1 px-2 py-1 text-[11px] bg-transparent border border-gray-200 dark:border-gray-700 rounded outline-none focus:ring-1 ring-red-400/40"
              >
                <option value="">— Category —</option>
                {BLOCK_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              {blockItems.length > 1 && (
                <button type="button" onClick={() => onUpdateItem(idx, 'category', '')} className="text-red-400 hover:text-red-600 shrink-0">
                  <Trash2 size={11} />
                </button>
              )}
            </div>
            <input
              type="text"
              value={item.description}
              onChange={e => onUpdateItem(idx, 'description', e.target.value)}
              placeholder="Description (required)"
              className="w-full px-2 py-1 text-[11px] bg-transparent border border-gray-200 dark:border-gray-700 rounded outline-none focus:ring-1 ring-red-400/40 placeholder-gray-400"
            />
            <input
              type="text"
              value={item.expectedResolution ?? ''}
              onChange={e => onUpdateItem(idx, 'expectedResolution', e.target.value)}
              placeholder="Expected resolution (optional)"
              className="w-full px-2 py-1 text-[11px] bg-transparent border border-gray-200 dark:border-gray-700 rounded outline-none focus:ring-1 ring-red-400/40 placeholder-gray-400"
            />
          </div>
        ))}
      </div>
      <button type="button" onClick={onAddItem} className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-red-500 hover:text-red-700">
        <Plus size={11} /> Add item
      </button>
      <div className="space-y-1">
        <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400">Hours Spent (before blocking)</label>
        <TimeInput
          value={blockHoursInput}
          onChange={setBlockHoursInput}
          maxHours={MAX_HOURS_PER_ENTRY}
          className="px-2.5 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg outline-none focus:ring-1 ring-red-400/40 text-[12px] font-mono"
        />
      </div>
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onCancel} className="flex-1 py-1.5 text-[10px] font-black uppercase tracking-widest border border-gray-200 dark:border-gray-700 text-gray-500 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
          Cancel
        </button>
        <button type="button" onClick={onConfirm} disabled={saving || !blockItems.some(i => i.category && i.description.trim()) || !blockHoursValid} className="flex-1 py-1.5 text-[10px] font-black uppercase tracking-widest bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
          {saving ? '…' : 'Confirm Block'}
        </button>
      </div>
    </div>
  );
}