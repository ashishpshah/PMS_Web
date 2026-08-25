import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, AlertTriangle, X, ExternalLink } from 'lucide-react';
import { useData } from '../context/DataContext';
import { cn, formatDateTime } from '../lib/utils';

// One-time-per-session key so the dialog doesn't reappear on every dashboard visit.
const SESSION_KEY = 'pms_blockissue_dialog_shown';

/**
 * On dashboard load, automatically surface the current tasks that are blocked or have
 * open issues in a modal dialog. Shows once per browser session; the same list is always
 * reachable again via the "Attention" section. Purely derived from live task data.
 */
export function BlockIssueDialog() {
  const { tasks } = useData();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const flagged = useMemo(
    () =>
      tasks
        .filter(t => (t.isBlocked || t.status === 'blocked' || t.status === 'issues') && t.status !== 'completed')
        .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime()),
    [tasks]
  );

  useEffect(() => {
    if (flagged.length === 0) return;
    if (sessionStorage.getItem(SESSION_KEY)) return;
    setOpen(true);
    sessionStorage.setItem(SESSION_KEY, '1');
  }, [flagged.length]);

  if (!open || flagged.length === 0) return null;

  const go = (taskId: number) => {
    setOpen(false);
    navigate(`/tasks?id=${taskId}`);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-lg bg-white dark:bg-gray-950 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-4 border-b border-gray-100 dark:border-gray-800 bg-amber-50/60 dark:bg-amber-900/10">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-amber-100 dark:bg-amber-900/30 text-amber-600 flex items-center justify-center shrink-0">
              <ShieldAlert size={18} />
            </div>
            <div>
              <h3 className="text-sm font-black text-gray-900 dark:text-white">Tasks needing attention</h3>
              <p className="text-[11px] text-gray-500">{flagged.length} task{flagged.length !== 1 ? 's' : ''} blocked or with open issues</p>
            </div>
          </div>
          <button onClick={() => setOpen(false)} className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {/* List */}
        <div className="max-h-[55vh] overflow-y-auto custom-scrollbar divide-y divide-gray-50 dark:divide-gray-900">
          {flagged.map(t => (
            <button
              key={t.id}
              onClick={() => go(t.id)}
              className="w-full text-left p-4 hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors group flex items-start gap-3"
            >
              <div className={cn(
                'h-7 w-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5',
                t.isBlocked ? 'bg-red-100/60 dark:bg-red-900/20 text-red-500' : 'bg-amber-100/60 dark:bg-amber-900/20 text-amber-500'
              )}>
                {t.isBlocked ? <ShieldAlert size={14} /> : <AlertTriangle size={14} />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-bold text-gray-900 dark:text-white truncate">{t.title}</span>
                  <span className={cn(
                    'text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded shrink-0',
                    t.isBlocked ? 'bg-red-50 text-red-600 dark:bg-red-900/20' : 'bg-amber-50 text-amber-600 dark:bg-amber-900/20'
                  )}>
                    {t.isBlocked ? 'Blocked' : 'Issue'}
                  </span>
                </div>
                {t.code && <span className="text-[10px] font-mono text-gray-400">{t.code}</span>}
                <p className="text-[11px] text-gray-500 mt-0.5">
                  Updated {formatDateTime(t.updatedAt || t.createdAt)}
                </p>
              </div>
              <ExternalLink size={13} className="text-gray-300 group-hover:text-indigo-500 transition-colors shrink-0 mt-1" />
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-gray-100 dark:border-gray-800 flex justify-end bg-gray-50/50 dark:bg-gray-900/30">
          <button
            onClick={() => setOpen(false)}
            className="text-[11px] font-black uppercase tracking-widest text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 px-3 py-1.5 transition-colors"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
