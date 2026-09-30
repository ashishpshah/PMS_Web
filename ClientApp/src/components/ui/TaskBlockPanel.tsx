import { useState, useMemo } from 'react';
import { ShieldAlert, ShieldCheck, AlertTriangle, Plus, Trash2, X } from 'lucide-react';
import { TaskBlockEntry, BlockChecklistItem, AddBlockItem, BLOCK_CATEGORIES } from '../../types';
import { formatDateTime, fromHHMM, MAX_HOURS_PER_ENTRY, isValidHoursEntry } from '../../lib/utils';
import { TimeInput } from './TimeInput';

// Both blocking and unblocking are non-exempt transitions (Services/TaskService.cs
// AllowedEdges), so ActualHours is required here too.

interface TaskBlockPanelProps {
  taskId: number;
  isBlocked?: boolean;
  blockEntries: TaskBlockEntry[];
  blockChecklistItems?: BlockChecklistItem[];
  currentUserId: number;
  isAssignee: boolean;
  isAdmin: boolean;
  canUnblock: boolean;
  onBlock: (items: AddBlockItem[], hours: number, reason?: string) => Promise<void>;
  onUnblock: (hours: number) => Promise<void>;
  onRemoveItem?: (itemId: number) => Promise<void>;
  onItemUpdated?: () => void;
  showBlockControls?: boolean;
}

const emptyItem = (): AddBlockItem => ({ category: '', description: '' });

// Helper to group items by blockEntryId
const groupItemsByBlockEntry = (items: BlockChecklistItem[], blockEntries: TaskBlockEntry[]) => {
  const groups: Map<number | 'no-entry', { blockEntry: TaskBlockEntry | null; items: BlockChecklistItem[] }> = new Map();
  
  // First, create entries for each block entry
  blockEntries.forEach(entry => {
    groups.set(entry.id, { blockEntry: entry, items: [] });
  });
  
  // Group items by blockEntryId
  items.forEach(item => {
    const key = item.blockEntryId ?? 'no-entry';
    if (!groups.has(key)) {
      groups.set(key, { blockEntry: blockEntries.find(e => e.id === item.blockEntryId) || null, items: [] });
    }
    groups.get(key)!.items.push(item);
  });
  
  // Convert to array and sort by blockEntry blockedAt (newest first for active blocks)
  return Array.from(groups.entries())
    .filter(([, group]) => group.items.length > 0)
    .sort((a, b) => {
      // Sort by blockEntry blockedAt descending (newest first)
      const dateA = a[1].blockEntry?.blockedAt ? new Date(a[1].blockEntry.blockedAt).getTime() : 0;
      const dateB = b[1].blockEntry?.blockedAt ? new Date(b[1].blockEntry.blockedAt).getTime() : 0;
      return dateB - dateA;
    });
};

export function TaskBlockPanel({
  isBlocked = false,
  blockEntries,
  blockChecklistItems = [],
  isAssignee,
  isAdmin,
  canUnblock,
  onBlock,
  onUnblock,
  onRemoveItem,
  onItemUpdated,
  showBlockControls = true,
}: TaskBlockPanelProps) {
  const [showForm, setShowForm]   = useState(false);
  const [blockItems, setBlockItems] = useState<AddBlockItem[]>([emptyItem()]);
  const [hoursInput, setHoursInput] = useState('');
  const [showUnblockForm, setShowUnblockForm] = useState(false);
  const [unblockHoursInput, setUnblockHoursInput] = useState('');
  const [saving, setSaving]       = useState(false);

  const canBlock = isAssignee || isAdmin;
  const canAct   = canBlock || canUnblock;
  if (!canAct) return null;

  // All items are now just "active" (no status field)
  const allItems = blockChecklistItems;
  const activeBlocks  = blockEntries.filter(b => b.isActive);

  // Group items by block entry for display
  const groupedItems = useMemo(() => groupItemsByBlockEntry(blockChecklistItems, blockEntries), [blockChecklistItems, blockEntries]);

  const hours = fromHHMM(hoursInput);
  const hoursValid = isValidHoursEntry(hours);
  const unblockHours = fromHHMM(unblockHoursInput);
  const unblockHoursValid = isValidHoursEntry(unblockHours);
  // blocked → in-progress / blocked → issues never require hours per config
  const unblockRequiresHours = false;

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
        <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-lg">
          <AlertTriangle size={14} className="text-red-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-red-800 dark:text-red-200 mb-1">Task Blocked</p>
            {activeBlocks.map(entry => (
              <div key={entry.id} className="text-sm text-red-700 dark:text-red-300">
                <span className="font-semibold">{entry.blockedByName}</span>
                {entry.reason && <><span className="text-red-400 mx-1">—</span><span className="italic">"{entry.reason}"</span></>}
                <span className="ml-1.5 text-xs text-red-400 font-mono">{formatDateTime(entry.blockedAt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Block checklist items grouped by block entry */}
      {groupedItems.length > 0 && (
        <div className="space-y-3">
          {groupedItems.map((group, groupIndex) => {
            const { blockEntry, items } = group;
            
            // Only show groups that have items
            if (items.length === 0) return null;
            
            const isActiveBlock = blockEntry?.isActive === true;
            const blockNumber = groupIndex + 1;
            const blockLabel = blockEntry 
              ? `${blockEntry.blockedByName} — ${formatDateTime(blockEntry.blockedAt)}`
              : 'Previous blocks';
            
            return (
              <div key={blockEntry?.id || `no-entry-${groupIndex}`} className="space-y-2">
                {/* Block entry header */}
                <div className="flex items-center gap-2 px-3 py-2 bg-red-50/40 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-lg">
                  <ShieldAlert size={14} className="text-red-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-red-700 dark:text-red-300">
                      Block #{blockNumber} {isActiveBlock ? (
                        <span className="ml-2 text-xs px-1.5 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded">Active</span>
                      ) : (
                        <span className="ml-2 text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 rounded">Resolved</span>
                      )}
                    </p>
                    <p className="text-xs text-red-600 dark:text-red-400 truncate">{blockLabel}</p>
                    {blockEntry?.reason && (
                      <p className="text-xs text-gray-500 italic">"{blockEntry.reason}"</p>
                    )}
                  </div>
                  <span className="text-xs text-gray-400 font-mono">
                    {items.length} item{items.length !== 1 ? 's' : ''}
                  </span>
                </div>

                {/* Items for this block */}
                <div className="space-y-2 ml-6 border-l-2 border-red-200 dark:border-red-800/50 pl-3">
                  {items.map(item => (
                    <div key={item.id} className="p-3 bg-red-50/60 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-lg space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-semibold uppercase tracking-wider text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30 px-2 py-0.5 rounded">
                            {item.category}
                          </span>
                          <p className="text-sm font-semibold text-red-800 dark:text-red-200 mt-1">{item.description}</p>
                          {item.expectedResolution && (
                            <p className="text-xs text-gray-500 mt-0.5">Expected: {item.expectedResolution}</p>
                          )}
                        </div>
                        {onRemoveItem && (
                          <button type="button" onClick={() => handleRemove(item.id)} disabled={saving}
                            title="Remove" className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20">
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Unblock / Block buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        {canUnblock && isBlocked && !showUnblockForm && (
          <button onClick={() => setShowUnblockForm(true)} disabled={saving || allItems.length > 0}
            title={allItems.length > 0 ? `Remove ${allItems.length} item(s) first` : 'Unblock task'}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold border border-emerald-200 dark:border-emerald-800 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            <ShieldCheck size={14} />
            {allItems.length > 0 ? `Remove ${allItems.length} item(s) first` : 'Unblock Task'}
          </button>
        )}
        {showBlockControls && canBlock && !isBlocked && !showForm && (
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold border border-red-200 dark:border-red-800 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
            <ShieldAlert size={14} /> Block Task
          </button>
        )}
      </div>

      {/* Unblock hours form */}
      {showUnblockForm && canUnblock && (
        <div className="p-4 bg-emerald-50/60 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800/50 rounded-lg space-y-3">
          {unblockRequiresHours && (
            <>
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600">Hours Spent (while blocked) <span className="text-red-500">*</span></p>
              <TimeInput
                value={unblockHoursInput}
                onChange={setUnblockHoursInput}
                maxHours={MAX_HOURS_PER_ENTRY}
                className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
            </>
          )}
          {!unblockRequiresHours && (
            <p className="text-xs text-gray-500 dark:text-gray-400">No hours required to unblock.</p>
          )}
          <div className="flex gap-3">
            <button type="button" onClick={() => { setShowUnblockForm(false); setUnblockHoursInput(''); }}
              className="flex-1 py-2 text-sm font-medium border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              Cancel
            </button>
            <button onClick={handleUnblock} disabled={saving || (unblockRequiresHours && !unblockHoursValid)}
              className="flex-1 py-2 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              <ShieldCheck size={14} />
              {saving ? 'Saving...' : 'Confirm Unblock'}
            </button>
          </div>
        </div>
      )}

      {/* Block items form - only shown when showBlockControls is true */}
      {showBlockControls && showForm && canBlock && (
        <div className="p-4 bg-red-50/60 dark:bg-red-900/10 border border-red-200 dark:border-red-800/50 rounded-lg space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-red-800 dark:text-red-200 flex items-center gap-2">
              <ShieldAlert size={16} /> Block Reason Items
            </h3>
            <button type="button" onClick={() => { setShowForm(false); setBlockItems([emptyItem()]); setHoursInput(''); }} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
              <X size={18} />
            </button>
          </div>
          <div className="space-y-3">
            {blockItems.map((item, idx) => (
              <div key={idx} className="space-y-2 p-3 bg-white dark:bg-gray-800 rounded-lg border border-red-100 dark:border-red-900/30">
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
                    <button type="button" onClick={() => setBlockItems(prev => prev.filter((_, i) => i !== idx))}
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
          <button type="button" onClick={() => setBlockItems(prev => [...prev, emptyItem()])}
            className="flex items-center gap-2 text-sm font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300">
            <Plus size={16} /> Add block reason
          </button>
          <div className="space-y-2 pt-2 border-t border-red-100 dark:border-red-900/30">
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Hours Spent (before blocking) <span className="text-red-500">*</span>
            </label>
            <TimeInput
              value={hoursInput}
              onChange={setHoursInput}
              maxHours={MAX_HOURS_PER_ENTRY}
              className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
            />
          </div>
          <div className="flex gap-3 pt-2 border-t border-red-100 dark:border-red-900/30">
            <button type="button" onClick={() => { setShowForm(false); setBlockItems([emptyItem()]); setHoursInput(''); }}
              className="flex-1 py-2 text-sm font-medium border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              Cancel
            </button>
            <button onClick={handleBlock} disabled={saving || !blockItems.some(i => i.category && i.description.trim()) || !hoursValid}
              className="flex-1 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              <ShieldAlert size={14} />
              {saving ? 'Blocking...' : 'Confirm Block'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
