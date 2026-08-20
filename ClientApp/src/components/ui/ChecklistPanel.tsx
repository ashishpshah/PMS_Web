import React, { useState, useRef, useCallback } from 'react';
import { Plus, Trash2, Check, CheckSquare, GripVertical, Pencil, X, Play } from 'lucide-react';
import { ChecklistItem } from '../../types';
import { ProgressBar } from './ProgressBar';

interface ChecklistPanelProps {
  taskId: number;
  items: ChecklistItem[];
  currentUserId: number;
  isAssignee: boolean;
  canManage: boolean;
  isStarted?: boolean;
  onStartTask?: () => Promise<void>;
  onItemAdded: (title: string) => Promise<void>;
  onItemToggled: (itemId: number, isCompleted: boolean) => Promise<void>;
  onItemUpdated: (itemId: number, title: string, orderIndex: number) => Promise<void>;
  onItemDeleted: (itemId: number) => Promise<void>;
  onMarkAllComplete: () => Promise<void>;
}

export function ChecklistPanel({
  items,
  isAssignee,
  canManage,
  isStarted = true,
  onStartTask,
  onItemAdded,
  onItemToggled,
  onItemUpdated,
  onItemDeleted,
  onMarkAllComplete,
}: ChecklistPanelProps) {
  const [starting, setStarting] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [adding, setAdding] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [savingEditId, setSavingEditId] = useState<number | null>(null);

  // Drag-to-reorder state
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);
  const [orderedItems, setOrderedItems] = useState<ChecklistItem[]>([]);
  const reorderPending = useRef(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  // Keep a locally-ordered copy so reorder feels instant
  const displayItems = orderedItems.length > 0 ? orderedItems : [...items].sort((a, b) => a.orderIndex - b.orderIndex);

  const completedCount = items.filter(i => i.isCompleted).length;
  const progress = items.length > 0 ? Math.round((completedCount / items.length) * 100) : 0;
  const allDone = items.length > 0 && completedCount === items.length;

  // ── Add ──────────────────────────────────────────────────────────────────
  const handleAdd = async () => {
    const title = newTitle.trim();
    if (!title) return;
    setAdding(true);
    try {
      await onItemAdded(title);
      setNewTitle('');
      setOrderedItems([]);
      inputRef.current?.focus();
    } finally {
      setAdding(false);
    }
  };

  const handleAddKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); handleAdd(); }
    if (e.key === 'Escape') setNewTitle('');
  };

  // ── Toggle ───────────────────────────────────────────────────────────────
  const handleToggle = async (item: ChecklistItem) => {
    if (!isAssignee && !canManage) return;
    if (!isStarted) return;
    setTogglingId(item.id);
    try {
      await onItemToggled(item.id, !item.isCompleted);
      setOrderedItems([]);
    } finally {
      setTogglingId(null);
    }
  };

  // ── Mark all ─────────────────────────────────────────────────────────────
  const handleMarkAll = async () => {
    if (allDone) return;
    if (!isStarted) return;
    setMarkingAll(true);
    try {
      await onMarkAllComplete();
      setOrderedItems([]);
    } finally {
      setMarkingAll(false);
    }
  };

  // ── Start ────────────────────────────────────────────────────────────────
  const handleStart = async () => {
    if (!onStartTask) return;
    setStarting(true);
    try {
      await onStartTask();
    } finally {
      setStarting(false);
    }
  };

  // ── Inline edit ──────────────────────────────────────────────────────────
  const startEdit = (item: ChecklistItem) => {
    setEditingId(item.id);
    setEditTitle(item.title);
    setTimeout(() => editInputRef.current?.focus(), 0);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditTitle('');
  };

  const saveEdit = async (item: ChecklistItem) => {
    const title = editTitle.trim();
    if (!title || title === item.title) { cancelEdit(); return; }
    setSavingEditId(item.id);
    try {
      await onItemUpdated(item.id, title, item.orderIndex);
      setOrderedItems([]);
      setEditingId(null);
    } finally {
      setSavingEditId(null);
    }
  };

  const handleEditKeyDown = (e: React.KeyboardEvent, item: ChecklistItem) => {
    if (e.key === 'Enter') { e.preventDefault(); saveEdit(item); }
    if (e.key === 'Escape') cancelEdit();
  };

  // ── Delete ───────────────────────────────────────────────────────────────
  const handleDelete = async (itemId: number) => {
    setDeletingId(itemId);
    try {
      await onItemDeleted(itemId);
      setOrderedItems([]);
    } finally {
      setDeletingId(null);
    }
  };

  // ── Drag-to-reorder ──────────────────────────────────────────────────────
  const handleDragStart = useCallback((e: React.DragEvent, id: number) => {
    if (!canManage) { e.preventDefault(); return; }
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
  }, [canManage]);

  const handleDragOver = useCallback((e: React.DragEvent, id: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverId(id);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent, targetId: number) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) { setDraggedId(null); setDragOverId(null); return; }

    const current = [...displayItems];
    const fromIdx = current.findIndex(i => i.id === draggedId);
    const toIdx   = current.findIndex(i => i.id === targetId);
    if (fromIdx === -1 || toIdx === -1) { setDraggedId(null); setDragOverId(null); return; }

    const reordered = [...current];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    const reassigned = reordered.map((item, idx) => ({ ...item, orderIndex: idx }));
    setOrderedItems(reassigned);
    setDraggedId(null);
    setDragOverId(null);

    if (!reorderPending.current) {
      reorderPending.current = true;
      try {
        await Promise.all(
          reassigned
            .filter((item, idx) => item.orderIndex !== current[idx]?.orderIndex)
            .map(item => onItemUpdated(item.id, item.title, item.orderIndex))
        );
      } finally {
        reorderPending.current = false;
        setOrderedItems([]);
      }
    }
  }, [draggedId, displayItems, onItemUpdated]);

  const handleDragEnd = useCallback(() => {
    setDraggedId(null);
    setDragOverId(null);
  }, []);

  const canToggle = isAssignee && isStarted;
  const showStartCTA = isAssignee && !isStarted && !!onStartTask;

  return (
    <div className="space-y-2">
      {/* Start Task CTA */}
      {showStartCTA && (
        <button
          type="button"
          onClick={handleStart}
          disabled={starting}
          className="w-full flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-black uppercase tracking-widest transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Play size={12} strokeWidth={3} />
          {starting ? 'Starting…' : 'Start Task'}
        </button>
      )}
      {isAssignee && !isStarted && !onStartTask && items.length > 0 && (
        <p className="text-[10px] text-amber-500 font-bold">Press Start Task to begin</p>
      )}

      {/* Progress header */}
      {items.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">
              Checklist — {completedCount}/{items.length}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-black font-mono text-indigo-600">{progress}%</span>
              {canManage && !allDone && (
                <button
                  type="button"
                  onClick={handleMarkAll}
                  disabled={markingAll || !isStarted}
                  title={isStarted ? 'Mark all complete' : 'Start task to enable'}
                  className="flex items-center gap-1 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest text-emerald-600 border border-emerald-200 dark:border-emerald-800 rounded hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <CheckSquare size={9} />
                  All Done
                </button>
              )}
            </div>
          </div>
          <ProgressBar value={progress} showLabel={false} variant={progress === 100 ? 'emerald' : 'indigo'} size="sm" />
        </div>
      )}

      {/* Items list */}
      {displayItems.length > 0 && (
        <ul className="space-y-1">
          {displayItems.map(item => {
            const isDragging  = draggedId === item.id;
            const isDragOver  = dragOverId === item.id;
            const isEditing   = editingId === item.id;
            const isSaving    = savingEditId === item.id;
            const isToggling  = togglingId === item.id;
            const isDeleting  = deletingId === item.id;

            return (
              <li
                key={item.id}
                draggable={canManage}
                onDragStart={e => handleDragStart(e, item.id)}
                onDragOver={e => handleDragOver(e, item.id)}
                onDrop={e => handleDrop(e, item.id)}
                onDragEnd={handleDragEnd}
                className={`group flex items-start gap-2 px-2 py-1.5 rounded-lg transition-all
                  ${isDragging  ? 'opacity-40 scale-95'                                       : ''}
                  ${isDragOver  ? 'bg-indigo-50 dark:bg-indigo-900/20 ring-1 ring-indigo-300' : 'hover:bg-gray-50 dark:hover:bg-gray-800/60'}
                `}
              >
                {/* Drag handle */}
                {canManage && (
                  <span className="mt-0.5 shrink-0 text-gray-300 dark:text-gray-600 cursor-grab opacity-0 group-hover:opacity-100 transition-opacity">
                    <GripVertical size={12} />
                  </span>
                )}

                {/* Checkbox */}
                <button
                  type="button"
                  onClick={() => handleToggle(item)}
                  disabled={isToggling || (!canToggle)}
                  className={`mt-0.5 h-4 w-4 shrink-0 rounded border transition-all flex items-center justify-center
                    ${item.isCompleted
                      ? 'bg-emerald-500 border-emerald-500 text-white'
                      : 'border-gray-300 dark:border-gray-600 hover:border-indigo-400'}
                    disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {item.isCompleted && <Check size={10} strokeWidth={3} />}
                </button>

                {/* Title / Edit input */}
                <div className="flex-1 min-w-0">
                  {isEditing ? (
                    <div className="flex items-center gap-1">
                      <input
                        ref={editInputRef}
                        type="text"
                        value={editTitle}
                        onChange={e => setEditTitle(e.target.value)}
                        onKeyDown={e => handleEditKeyDown(e, item)}
                        disabled={isSaving}
                        className="flex-1 px-1.5 py-0.5 text-[12px] font-bold bg-white dark:bg-gray-800 border border-indigo-400 rounded outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                      <button
                        type="button"
                        onClick={() => saveEdit(item)}
                        disabled={isSaving}
                        className="p-0.5 text-emerald-500 hover:text-emerald-600 transition-colors disabled:opacity-50"
                      >
                        <Check size={12} strokeWidth={3} />
                      </button>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="p-0.5 text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <span
                        className={`text-[12px] font-bold leading-tight block ${
                          item.isCompleted
                            ? 'text-gray-400'
                            : 'text-gray-800 dark:text-gray-200'
                        }`}
                      >
                        {item.title}
                      </span>
                      {item.isCompleted && item.completedByName && (
                        <p className="text-[9px] text-gray-400 font-bold mt-0.5">
                          by {item.completedByName}
                        </p>
                      )}
                    </>
                  )}
                </div>

                {/* Action buttons (edit + delete) — only for managers */}
                {canManage && !isEditing && (
                  <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={() => startEdit(item)}
                      className="p-0.5 text-gray-400 hover:text-indigo-500 transition-colors"
                      title="Edit"
                    >
                      <Pencil size={11} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(item.id)}
                      disabled={isDeleting}
                      className="p-0.5 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                      title="Delete"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Add new item */}
      {canManage && !isStarted && (
        <div className="flex items-center gap-1.5 mt-1">
          <input
            ref={inputRef}
            type="text"
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={handleAddKeyDown}
            placeholder="Add checklist item..."
            className="flex-1 px-2.5 py-1.5 text-[12px] font-bold bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg outline-none focus:ring-1 focus:ring-indigo-500 placeholder:text-gray-400 placeholder:font-normal"
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={adding || !newTitle.trim()}
            className="shrink-0 p-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus size={13} />
          </button>
        </div>
      )}

      {items.length === 0 && !canManage && (
        <p className="text-[11px] text-gray-400 italic">No checklist items</p>
      )}
    </div>
  );
}
