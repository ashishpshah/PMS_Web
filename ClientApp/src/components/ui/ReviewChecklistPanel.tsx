import { useState } from 'react';
import { CheckCircle2, XCircle, MinusCircle, Clock, Plus, Edit2, Trash2, Save, X, AlertTriangle } from 'lucide-react';
import { ReviewChecklistItem, Status } from '../../types';
import { taskService } from '../../services/task.service';
import { showError } from '../../lib/toast';
import { cn } from '../../lib/utils';

type ItemResult = 'pending' | 'passed' | 'failed' | 'na';

const RESULT_CONFIG: Record<ItemResult, { label: string; icon: React.ReactNode; badge: string; bg: string }> = {
  pending:  { label: 'Pending',  icon: <Clock size={11} />,       badge: 'bg-gray-100 dark:bg-gray-800 text-gray-500',                                              bg: '' },
  passed:   { label: 'Passed',   icon: <CheckCircle2 size={11} />, badge: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400',             bg: 'bg-emerald-50/40 dark:bg-emerald-900/10' },
  failed:   { label: 'Failed',   icon: <XCircle size={11} />,      badge: 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400',                            bg: 'bg-red-50/40 dark:bg-red-900/10' },
  na:       { label: 'N/A',      icon: <MinusCircle size={11} />,  badge: 'bg-blue-50 dark:bg-blue-900/20 text-blue-500 dark:text-blue-400',                        bg: 'bg-blue-50/20 dark:bg-blue-900/10' },
};

interface ReviewChecklistPanelProps {
  taskId: number;
  items: ReviewChecklistItem[];
  taskStatus: Status;
  isManager: boolean;
  isQa: boolean;
  isAssignee: boolean;
  onRefresh: () => void;
}

export function ReviewChecklistPanel({
  taskId,
  items,
  taskStatus,
  isManager,
  isQa,
  isAssignee,
  onRefresh,
}: ReviewChecklistPanelProps) {
  const [saving, setSaving] = useState(false);
  const [addTitle, setAddTitle] = useState('');
  const [addDesc, setAddDesc] = useState('');
  const [addRequired, setAddRequired] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editRequired, setEditRequired] = useState(true);
  const [commentInputs, setCommentInputs] = useState<Record<number, string>>({});
  const [resolutionInputs, setResolutionInputs] = useState<Record<number, string>>({});
  const [showCommentFor, setShowCommentFor] = useState<number | null>(null);
  const [showResolutionFor, setShowResolutionFor] = useState<number | null>(null);

  const isUnderReview = taskStatus === 'under-review';
  const isIssues = taskStatus === 'issues';

  const pending = items.filter(i => i.status === 'pending');
  const passed  = items.filter(i => i.status === 'passed');
  const failed  = items.filter(i => i.status === 'failed');
  const na      = items.filter(i => i.status === 'na');

  const wrap = async (fn: () => Promise<void>) => {
    setSaving(true);
    try { await fn(); onRefresh(); }
    catch (e) { showError(e instanceof Error ? e.message : 'Operation failed'); }
    finally { setSaving(false); }
  };

  const handleAdd = () => wrap(async () => {
    if (!addTitle.trim()) return;
    await taskService.addReviewChecklistItem(taskId, addTitle.trim(), addDesc.trim() || undefined, addRequired);
    setAddTitle(''); setAddDesc(''); setAddRequired(true); setShowAddForm(false);
  });

  const handleUpdate = (id: number) => wrap(async () => {
    if (!editTitle.trim()) return;
    await taskService.updateReviewChecklistItem(taskId, id, editTitle.trim(), editDesc.trim() || undefined, editRequired);
    setEditingId(null);
  });

  const handleDelete = (id: number) => wrap(async () => {
    await taskService.deleteReviewChecklistItem(taskId, id);
  });

  const handleResult = (id: number, result: ItemResult) => wrap(async () => {
    const comment = commentInputs[id]?.trim() || undefined;
    await taskService.setReviewChecklistItemResult(taskId, id, result, comment);
    setCommentInputs(prev => { const n = { ...prev }; delete n[id]; return n; });
    setShowCommentFor(null);
  });

  const handleResolution = (id: number) => wrap(async () => {
    const comment = resolutionInputs[id]?.trim();
    if (!comment) return;
    await taskService.setReviewChecklistItemResolution(taskId, id, comment);
    setResolutionInputs(prev => { const n = { ...prev }; delete n[id]; return n; });
    setShowResolutionFor(null);
  });

  const startEdit = (item: ReviewChecklistItem) => {
    setEditingId(item.id);
    setEditTitle(item.title);
    setEditDesc(item.description || '');
    setEditRequired(item.isRequired);
  };

  if (items.length === 0 && !isManager) {
    return (
      <p className="text-center text-[11px] text-gray-400 italic py-6">No review checklist defined for this task.</p>
    );
  }

  return (
    <div className="space-y-3">
      {/* Summary bar */}
      {items.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          {[
            { label: 'Pending', count: pending.length, cls: 'text-gray-500' },
            { label: 'Passed',  count: passed.length,  cls: 'text-emerald-600' },
            { label: 'Failed',  count: failed.length,  cls: 'text-red-600' },
            { label: 'N/A',     count: na.length,      cls: 'text-blue-500' },
          ].filter(s => s.count > 0).map(s => (
            <span key={s.label} className={`text-[10px] font-black uppercase tracking-widest ${s.cls}`}>
              {s.count} {s.label}
            </span>
          ))}
          {failed.filter(i => i.isRequired).length > 0 && (
            <span className="text-[9px] font-black uppercase tracking-widest text-red-500 bg-red-50 dark:bg-red-900/20 px-1.5 py-0.5 rounded border border-red-100 dark:border-red-900/30 flex items-center gap-1">
              <AlertTriangle size={9} /> {failed.filter(i => i.isRequired).length} Required Failed
            </span>
          )}
        </div>
      )}

      {/* Checklist items */}
      <div className="space-y-2">
        {[...items].sort((a, b) => a.sequence - b.sequence).map(item => {
          const cfg = RESULT_CONFIG[item.status];
          const isEditing = editingId === item.id;

          return (
            <div key={item.id} className={cn(
              'p-2.5 border rounded-xl transition-colors',
              cfg.bg || 'bg-gray-50/40 dark:bg-gray-800/30',
              item.status === 'failed' ? 'border-red-100 dark:border-red-900/30' :
              item.status === 'passed' ? 'border-emerald-100 dark:border-emerald-900/30' :
              item.status === 'na'     ? 'border-blue-100 dark:border-blue-900/30' :
                                        'border-gray-100 dark:border-gray-800'
            )}>
              {isEditing ? (
                /* Edit form */
                <div className="space-y-2">
                  <input type="text" value={editTitle} onChange={e => setEditTitle(e.target.value)}
                    placeholder="Item title"
                    className="w-full px-2 py-1 text-[11px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded outline-none focus:ring-1 ring-indigo-400/40" />
                  <input type="text" value={editDesc} onChange={e => setEditDesc(e.target.value)}
                    placeholder="Description (optional)"
                    className="w-full px-2 py-1 text-[11px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded outline-none focus:ring-1 ring-indigo-400/40 text-gray-500" />
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={editRequired} onChange={e => setEditRequired(e.target.checked)}
                      className="accent-indigo-500" />
                    <span className="text-[10px] font-bold text-gray-600 dark:text-gray-300">Required</span>
                  </label>
                  <div className="flex gap-2">
                    <button onClick={() => setEditingId(null)}
                      className="flex-1 py-1 text-[9px] font-black uppercase tracking-widest border border-gray-200 dark:border-gray-700 text-gray-500 rounded hover:bg-gray-50">Cancel</button>
                    <button onClick={() => handleUpdate(item.id)} disabled={saving || !editTitle.trim()}
                      className="flex-1 py-1 text-[9px] font-black uppercase tracking-widest bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50">
                      <Save size={9} className="inline mr-1" />Save
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {/* Header row */}
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-widest ${cfg.badge}`}>
                          {cfg.icon} {cfg.label}
                        </span>
                        {item.isRequired && (
                          <span className="text-[8px] font-black uppercase tracking-widest text-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 px-1 py-0.5 rounded">Required</span>
                        )}
                        <span className="text-[9px] text-gray-400 font-mono">#{item.sequence}</span>
                      </div>
                      <p className="text-[12px] font-bold text-gray-800 dark:text-gray-200 mt-1 leading-snug">{item.title}</p>
                      {item.description && (
                        <p className="text-[10px] text-gray-500 mt-0.5 leading-snug">{item.description}</p>
                      )}
                    </div>
                    {isManager && taskStatus !== 'under-review' && (
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => startEdit(item)} className="p-1 text-gray-400 hover:text-indigo-500"><Edit2 size={11} /></button>
                        <button onClick={() => handleDelete(item.id)} disabled={saving} className="p-1 text-gray-400 hover:text-red-500"><Trash2 size={11} /></button>
                      </div>
                    )}
                  </div>

                  {/* Reviewer comment */}
                  {item.reviewerComment && (
                    <div className="flex items-start gap-1.5 px-2 py-1.5 bg-white/60 dark:bg-gray-900/30 border border-gray-100 dark:border-gray-800 rounded-lg">
                      <span className="text-[9px] font-black uppercase tracking-widest text-purple-500 shrink-0 mt-0.5">QA</span>
                      <p className="text-[10px] text-gray-600 dark:text-gray-400 italic">"{item.reviewerComment}"</p>
                    </div>
                  )}

                  {/* Developer resolution */}
                  {item.developerResolutionComment && (
                    <div className="flex items-start gap-1.5 px-2 py-1.5 bg-white/60 dark:bg-gray-900/30 border border-emerald-100 dark:border-emerald-900/30 rounded-lg">
                      <span className="text-[9px] font-black uppercase tracking-widest text-emerald-500 shrink-0 mt-0.5">Dev</span>
                      <p className="text-[10px] text-gray-600 dark:text-gray-400 italic">"{item.developerResolutionComment}"</p>
                    </div>
                  )}

                  {/* QA result actions (under-review only) */}
                  {isUnderReview && isQa && (
                    <div className="pt-1 border-t border-gray-100 dark:border-gray-800 space-y-1.5">
                      {showCommentFor === item.id ? (
                        <div className="space-y-1.5">
                          <input type="text" value={commentInputs[item.id] || ''}
                            onChange={e => setCommentInputs(prev => ({ ...prev, [item.id]: e.target.value }))}
                            placeholder="Reviewer comment (optional)"
                            className="w-full px-2 py-1 text-[10px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded outline-none focus:ring-1 ring-purple-400/40" />
                          <div className="flex gap-1.5 flex-wrap">
                            {(['passed', 'failed', 'na'] as ItemResult[]).map(r => (
                              <button key={r} onClick={() => handleResult(item.id, r)} disabled={saving}
                                className={cn(
                                  'px-2.5 py-1 text-[9px] font-black uppercase tracking-widest rounded-lg transition-colors disabled:opacity-50',
                                  r === 'passed' ? 'bg-emerald-500 text-white hover:bg-emerald-600' :
                                  r === 'failed' ? 'bg-red-500 text-white hover:bg-red-600' :
                                                   'bg-blue-500 text-white hover:bg-blue-600'
                                )}>
                                {RESULT_CONFIG[r].label}
                              </button>
                            ))}
                            <button onClick={() => { setShowCommentFor(null); setCommentInputs(prev => { const n = { ...prev }; delete n[item.id]; return n; }); }}
                              className="p-1 text-gray-400 hover:text-gray-600"><X size={11} /></button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-1.5 flex-wrap">
                          <button onClick={() => setShowCommentFor(item.id)}
                            className="flex items-center gap-1 px-2 py-1 text-[9px] font-black uppercase tracking-widest border border-gray-200 dark:border-gray-700 text-gray-500 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">
                            <Edit2 size={9} /> Set Result
                          </button>
                          <button onClick={() => handleResult(item.id, 'passed')} disabled={saving}
                            className="px-2 py-1 text-[9px] font-black uppercase tracking-widest bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 disabled:opacity-50">
                            <CheckCircle2 size={9} className="inline mr-0.5" /> Pass
                          </button>
                          <button onClick={() => handleResult(item.id, 'failed')} disabled={saving}
                            className="px-2 py-1 text-[9px] font-black uppercase tracking-widest bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50">
                            <XCircle size={9} className="inline mr-0.5" /> Fail
                          </button>
                          <button onClick={() => handleResult(item.id, 'na')} disabled={saving}
                            className="px-2 py-1 text-[9px] font-black uppercase tracking-widest bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50">
                            N/A
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Developer resolution input (issues status, failed items) */}
                  {isIssues && isAssignee && item.status === 'failed' && !item.developerResolutionComment && (
                    <div className="pt-1 border-t border-red-100 dark:border-red-900/30">
                      {showResolutionFor === item.id ? (
                        <div className="space-y-1.5">
                          <input type="text" value={resolutionInputs[item.id] || ''}
                            onChange={e => setResolutionInputs(prev => ({ ...prev, [item.id]: e.target.value }))}
                            placeholder="Describe how you fixed this issue…"
                            className="w-full px-2 py-1 text-[10px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded outline-none focus:ring-1 ring-emerald-400/40" />
                          <div className="flex gap-1.5">
                            <button onClick={() => { setShowResolutionFor(null); setResolutionInputs(prev => { const n = { ...prev }; delete n[item.id]; return n; }); }}
                              className="flex-1 py-1 text-[9px] font-black uppercase tracking-widest border border-gray-200 dark:border-gray-700 text-gray-500 rounded hover:bg-gray-50">Cancel</button>
                            <button onClick={() => handleResolution(item.id)} disabled={saving || !resolutionInputs[item.id]?.trim()}
                              className="flex-1 py-1 text-[9px] font-black uppercase tracking-widest bg-emerald-500 text-white rounded hover:bg-emerald-600 disabled:opacity-50">Save Fix</button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => setShowResolutionFor(item.id)}
                          className="flex items-center gap-1 px-2 py-1 text-[9px] font-black uppercase tracking-widest border border-emerald-200 dark:border-emerald-800 text-emerald-600 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/20">
                          <Plus size={9} /> Add Resolution
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Manager: Add new item */}
      {isManager && (
        <div className="pt-1 border-t border-gray-100 dark:border-gray-800">
          {showAddForm ? (
            <div className="space-y-2 p-2.5 bg-indigo-50/40 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-900/30 rounded-xl">
              <p className="text-[9px] font-black uppercase tracking-widest text-indigo-600">New Review Item</p>
              <input type="text" value={addTitle} onChange={e => setAddTitle(e.target.value)}
                placeholder="Item title (required)"
                className="w-full px-2 py-1.5 text-[11px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg outline-none focus:ring-1 ring-indigo-400/40 placeholder-gray-400" />
              <input type="text" value={addDesc} onChange={e => setAddDesc(e.target.value)}
                placeholder="Description (optional)"
                className="w-full px-2 py-1.5 text-[11px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg outline-none focus:ring-1 ring-indigo-400/40 placeholder-gray-400 text-gray-500" />
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={addRequired} onChange={e => setAddRequired(e.target.checked)} className="accent-indigo-500" />
                <span className="text-[10px] font-bold text-gray-600 dark:text-gray-300">Required for completion</span>
              </label>
              <div className="flex gap-2">
                <button onClick={() => { setShowAddForm(false); setAddTitle(''); setAddDesc(''); setAddRequired(true); }}
                  className="flex-1 py-1.5 text-[9px] font-black uppercase tracking-widest border border-gray-200 dark:border-gray-700 text-gray-500 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">Cancel</button>
                <button onClick={handleAdd} disabled={saving || !addTitle.trim()}
                  className="flex-1 py-1.5 text-[9px] font-black uppercase tracking-widest bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                  <Plus size={9} className="inline mr-1" />Add Item
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowAddForm(true)}
              className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-indigo-500 hover:text-indigo-700 py-1">
              <Plus size={11} /> Add Review Item
            </button>
          )}
        </div>
      )}
    </div>
  );
}
