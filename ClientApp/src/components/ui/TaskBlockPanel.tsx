import { useState } from 'react';
import { ShieldAlert, ShieldCheck, AlertTriangle, Plus, Trash2, CheckCircle2, X } from 'lucide-react';
import { TaskBlockEntry, BlockChecklistItem, AddBlockItem, BLOCK_CATEGORIES } from '../../types';
import { formatDateTime, fromHHMM, MAX_HOURS_PER_ENTRY, isValidHoursEntry } from '../../lib/utils';
import { TimeInput } from './TimeInput';

// Both blocking and unblocking are non-exempt transitions (Services/TaskService.cs
// AllowedEdges), so ActualHours is required here too.

interface TaskBlockPanelProps {
  taskId: number;
  isBlocked: boolean;
  blockEntries: TaskBlockEntry[];
  blockChecklistItems?: BlockChecklistItem[];
  currentUserId: number;
  isAssignee: boolean;
  isAdmin: boolean;
  canUnblock: boolean;
  onBlock: (items: AddBlockItem[], hours: number, reason?: string) => Promise<void>;
  onUnblock: (hours: number) => Promise<void>;
  onResolveItem?: (itemId: number, comment?: string) => Promise<void>;
  onRemoveItem?: (itemId: number) => Promise<void>;
  onItemUpdated?: () => void;
}

const emptyItem = (): AddBlockItem => ({ category: '', description: '' });

export function TaskBlockPanel({
  isBlocked,
  blockEntries,
  blockChecklistItems = [],
  isAssignee,
  isAdmin,
  canUnblock,
  onBlock,
  onUnblock,
  onResolveItem,
  onRemoveItem,
  onItemUpdated,
}: TaskBlockPanelProps) {
  const [showForm, setShowForm]   = useState(false);
  const [blockItems, setBlockItems] = useState<AddBlockItem[]>([emptyItem()]);
  const [hoursInput, setHoursInput] = useState('');
  const [showUnblockForm, setShowUnblockForm] = useState(false);
  const [unblockHoursInput, setUnblockHoursInput] = useState('');
  const [saving, setSaving]       = useState(false);
  const [resolvingId, setResolvingId] = useState<number | null>(null);
  const [resolveComment, setResolveComment] = useState('');

  const canBlock = isAssignee || isAdmin;
  const canAct   = canBlock || canUnblock;
  if (!canAct) return null;

  const activeItems   = blockChecklistItems.filter(i => i.status === 'active');
  const resolvedItems = blockChecklistItems.filter(i => i.status === 'resolved');
  const activeBlocks  = blockEntries.filter(b => b.isActive);

  const hours = fromHHMM(hoursInput);
  const hoursValid = isValidHoursEntry(hours);
  const unblockHours = fromHHMM(unblockHoursInput);
  const unblockHoursValid = isValidHoursEntry(unblockHours);

  const updateItem = (idx: number, field: keyof AddBlockItem, val: string) =>
    setBlockItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: val } : it));

  const handleBlock = async () => {
    const valid = blockItems.filter(i => i.category && i.description.trim());
    if (!valid.length || !hoursValid || hours == null) return;
    setSaving(true);
    try {
      await onBlock(valid, hours);
      setBlockItems([emptyItem()]);
      setHoursInput('');
      setShowForm(false);
    } finally { setSaving(false); }
  };

  const handleUnblock = async () => {
    if (!unblockHoursValid || unblockHours == null) return;
    setSaving(true);
    try {
      await onUnblock(unblockHours);
      setUnblockHoursInput('');
      setShowUnblockForm(false);
    } finally { setSaving(false); }
  };

  const handleResolve = async (itemId: number) => {
    setSaving(true);
    try {
      await onResolveItem?.(itemId, resolveComment.trim() || undefined);
      setResolvingId(null);
      setResolveComment('');
      onItemUpdated?.();
    } finally { setSaving(false); }
  };

  const handleRemove = async (itemId: number) => {
    setSaving(true);
    try {
      await onRemoveItem?.(itemId);
      onItemUpdated?.();
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-3">
      {/* Active block banner */}
      {isBlocked && activeBlocks.length > 0 && (
        <div className="flex items-start gap-2 p-2.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-lg">
          <AlertTriangle size={14} className="text-red-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-red-600 dark:text-red-400 mb-1">Task Blocked</p>
            {activeBlocks.map(entry => (
              <div key={entry.id} className="text-[11px] text-red-700 dark:text-red-300">
                <span className="font-bold">{entry.blockedByName}</span>
                {entry.reason && <><span className="text-red-400 mx-1">—</span><span className="italic">"{entry.reason}"</span></>}
                <span className="ml-1.5 text-[9px] text-red-400 font-mono">{formatDateTime(entry.blockedAt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active block checklist items */}
      {activeItems.length > 0 && (
        <div className="space-y-2">
          <p className="text-[9px] font-black uppercase tracking-widest text-red-500 flex items-center gap-1.5">
            <ShieldAlert size={10} /> {activeItems.length} Active Block Item{activeItems.length !== 1 ? 's' : ''}
          </p>
          {activeItems.map(item => (
            <div key={item.id} className="p-2.5 bg-red-50/60 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-lg space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <span className="text-[9px] font-black uppercase tracking-widest text-red-500 bg-red-100 dark:bg-red-900/30 px-1.5 py-0.5 rounded">
                    {item.category}
                  </span>
                  <p className="text-[11px] font-bold text-red-700 dark:text-red-300 mt-1">{item.description}</p>
                  {item.expectedResolution && (
                    <p className="text-[10px] text-gray-500 mt-0.5">Expected: {item.expectedResolution}</p>
                  )}
                </div>
                {(onResolveItem || onRemoveItem) && (
                  <div className="flex gap-1 shrink-0">
                    {onResolveItem && (
                      <button type="button" onClick={() => setResolvingId(item.id)}
                        title="Resolve" className="p-1 text-emerald-500 hover:text-emerald-700">
                        <CheckCircle2 size={13} />
                      </button>
                    )}
                    {onRemoveItem && (
                      <button type="button" onClick={() => handleRemove(item.id)} disabled={saving}
                        title="Remove" className="p-1 text-gray-400 hover:text-red-500">
                        <X size={13} />
                      </button>
                    )}
                  </div>
                )}
              </div>
              {resolvingId === item.id && (
                <div className="space-y-1.5 pt-1 border-t border-red-100 dark:border-red-900/30">
                  <input
                    type="text"
                    value={resolveComment}
                    onChange={e => setResolveComment(e.target.value)}
                    placeholder="Resolution comment (optional)"
                    className="w-full px-2 py-1 text-[11px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded outline-none focus:ring-1 ring-emerald-400/40 placeholder-gray-400"
                  />
                  <div className="flex gap-2">
                    <button type="button" onClick={() => { setResolvingId(null); setResolveComment(''); }}
                      className="flex-1 py-1 text-[9px] font-black uppercase tracking-widest border border-gray-200 dark:border-gray-700 text-gray-500 rounded hover:bg-gray-50 dark:hover:bg-gray-800">
                      Cancel
                    </button>
                    <button type="button" onClick={() => handleResolve(item.id)} disabled={saving}
                      className="flex-1 py-1 text-[9px] font-black uppercase tracking-widest bg-emerald-500 text-white rounded hover:bg-emerald-600 disabled:opacity-50">
                      {saving ? '…' : 'Mark Resolved'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Resolved items (collapsed) */}
      {resolvedItems.length > 0 && (
        <div className="space-y-1">
          <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">{resolvedItems.length} Resolved</p>
          {resolvedItems.map(item => (
            <div key={item.id} className="flex items-center gap-2 px-2.5 py-1.5 bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800 rounded opacity-70">
              <CheckCircle2 size={11} className="text-emerald-500 shrink-0" />
              <span className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">{item.category}</span>
              <span className="text-[10px] text-gray-500 truncate flex-1">{item.description}</span>
            </div>
          ))}
        </div>
      )}

      {/* Unblock / Block buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        {canUnblock && isBlocked && !showUnblockForm && (
          <button onClick={() => setShowUnblockForm(true)} disabled={saving || activeItems.length > 0}
            title={activeItems.length > 0 ? `Resolve ${activeItems.length} item(s) first` : 'Unblock task'}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest border border-emerald-200 dark:border-emerald-800 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            <ShieldCheck size={12} />
            {activeItems.length > 0 ? `Resolve ${activeItems.length} item(s) first` : 'Unblock Task'}
          </button>
        )}
        {canBlock && !isBlocked && !showForm && (
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest border border-red-200 dark:border-red-800 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
            <ShieldAlert size={12} /> Block Task
          </button>
        )}
      </div>

      {/* Unblock hours form */}
      {showUnblockForm && canUnblock && (
        <div className="p-3 bg-emerald-50/60 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800/50 rounded-lg space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Hours Spent (while blocked)</p>
          <TimeInput
            value={unblockHoursInput}
            onChange={setUnblockHoursInput}
            maxHours={MAX_HOURS_PER_ENTRY}
            className="px-2.5 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg outline-none focus:ring-1 ring-emerald-400/40 text-[12px] font-mono"
          />
          <div className="flex gap-2">
            <button onClick={() => { setShowUnblockForm(false); setUnblockHoursInput(''); }}
              className="flex-1 py-1.5 text-[10px] font-black uppercase tracking-widest border border-gray-200 dark:border-gray-700 text-gray-500 rounded hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              Cancel
            </button>
            <button onClick={handleUnblock} disabled={saving || !unblockHoursValid}
              className="flex-1 py-1.5 text-[10px] font-black uppercase tracking-widest bg-emerald-500 text-white rounded hover:bg-emerald-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-1">
              <ShieldCheck size={11} />
              {saving ? 'Saving...' : 'Confirm Unblock'}
            </button>
          </div>
        </div>
      )}

      {/* Block items form */}
      {showForm && canBlock && (
        <div className="p-3 bg-red-50/60 dark:bg-red-900/10 border border-red-200 dark:border-red-800/50 rounded-lg space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-black uppercase tracking-widest text-red-600">Block Reason Items</p>
            <button onClick={() => { setShowForm(false); setBlockItems([emptyItem()]); }} className="text-gray-400 hover:text-gray-600"><X size={13} /></button>
          </div>
          <div className="space-y-2">
            {blockItems.map((item, idx) => (
              <div key={idx} className="space-y-1.5 p-2.5 bg-white dark:bg-gray-800 rounded border border-red-100 dark:border-red-900/30">
                <div className="flex items-center gap-2">
                  <select value={item.category} onChange={e => updateItem(idx, 'category', e.target.value)}
                    className="flex-1 px-2 py-1 text-[11px] bg-transparent border border-gray-200 dark:border-gray-700 rounded outline-none focus:ring-1 ring-red-400/40">
                    <option value="">— Category —</option>
                    {BLOCK_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  {blockItems.length > 1 && (
                    <button type="button" onClick={() => setBlockItems(prev => prev.filter((_, i) => i !== idx))}
                      className="text-red-400 hover:text-red-600"><Trash2 size={11} /></button>
                  )}
                </div>
                <input type="text" value={item.description} onChange={e => updateItem(idx, 'description', e.target.value)}
                  placeholder="Description (required)"
                  className="w-full px-2 py-1 text-[11px] bg-transparent border border-gray-200 dark:border-gray-700 rounded outline-none focus:ring-1 ring-red-400/40 placeholder-gray-400" />
                <input type="text" value={item.expectedResolution ?? ''} onChange={e => updateItem(idx, 'expectedResolution', e.target.value)}
                  placeholder="Expected resolution (optional)"
                  className="w-full px-2 py-1 text-[11px] bg-transparent border border-gray-200 dark:border-gray-700 rounded outline-none focus:ring-1 ring-red-400/40 placeholder-gray-400" />
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setBlockItems(prev => [...prev, emptyItem()])}
            className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-red-500 hover:text-red-700">
            <Plus size={11} /> Add item
          </button>
          <div className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Hours Spent (before blocking)</p>
            <TimeInput
              value={hoursInput}
              onChange={setHoursInput}
              maxHours={MAX_HOURS_PER_ENTRY}
              className="px-2.5 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded outline-none focus:ring-1 ring-red-400/40 text-[12px] font-mono"
            />
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setShowForm(false); setBlockItems([emptyItem()]); setHoursInput(''); }}
              className="flex-1 py-1.5 text-[10px] font-black uppercase tracking-widest border border-gray-200 dark:border-gray-700 text-gray-500 rounded hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              Cancel
            </button>
            <button onClick={handleBlock} disabled={saving || !blockItems.some(i => i.category && i.description.trim()) || !hoursValid}
              className="flex-1 py-1.5 text-[10px] font-black uppercase tracking-widest bg-red-500 text-white rounded hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-1">
              <ShieldAlert size={11} />
              {saving ? 'Blocking...' : 'Confirm Block'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
