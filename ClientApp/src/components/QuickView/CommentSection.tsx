import React, { useState, useRef, useEffect } from 'react';
import { Send } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { TaskComment } from '../../types';
import { formatDistanceToNow } from 'date-fns';
import { showError } from '../../lib/toast';
import { taskService } from '../../services/task.service';
import { DateInput } from '../ui/DateInput';

interface CommentSectionProps {
  taskId: number;
  comments: TaskComment[];
  canComment?: boolean;
}

// Stable per-user color palette for border accents
const USER_COLORS = [
  'border-indigo-400',
  'border-emerald-400',
  'border-amber-400',
  'border-rose-400',
  'border-violet-400',
  'border-cyan-400',
  'border-orange-400',
  'border-teal-400',
];

const USER_BG_COLORS = [
  'bg-indigo-50 dark:bg-indigo-900/20',
  'bg-emerald-50 dark:bg-emerald-900/20',
  'bg-amber-50 dark:bg-amber-900/20',
  'bg-rose-50 dark:bg-rose-900/20',
  'bg-violet-50 dark:bg-violet-900/20',
  'bg-cyan-50 dark:bg-cyan-900/20',
  'bg-orange-50 dark:bg-orange-900/20',
  'bg-teal-50 dark:bg-teal-900/20',
];

const USER_AVATAR_COLORS = [
  'bg-indigo-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-violet-500',
  'bg-cyan-500',
  'bg-orange-500',
  'bg-teal-500',
];

function getUserColorIndex(userId: number): number {
  return userId % USER_COLORS.length;
}

function UserAvatar({ userId, userName }: { userId: number; userName: string }) {
  const idx = getUserColorIndex(userId);
  const initials = userName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div className={`h-6 w-6 rounded-full flex items-center justify-center text-white text-[9px] font-black shrink-0 ${USER_AVATAR_COLORS[idx]}`}>
      {initials}
    </div>
  );
}

type FilterMode = 'all' | 'assignee' | 'date';

export function CommentSection({ taskId, comments, canComment = true }: CommentSectionProps) {
  const [newComment, setNewComment] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [filteredComments, setFilteredComments] = useState<TaskComment[]>(comments);
  const [isFiltering, setIsFiltering] = useState(false);
  const { user } = useAuth();
  const { addTaskComment, tasks } = useData();
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const task = tasks.find(t => t.id === taskId);

  // Scroll to bottom when comments change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filteredComments]);

  // Apply filters when mode or dates change
  useEffect(() => {
    const applyFilter = async () => {
      if (filterMode === 'all') {
        setFilteredComments(comments);
        return;
      }
      setIsFiltering(true);
      try {
        const filters: { userId?: number; from?: string; to?: string } = {};
        if (filterMode === 'assignee' && task?.assigneeId) {
          filters.userId = task.assigneeId;
        }
        if (filterMode === 'date') {
          if (fromDate) filters.from = fromDate;
          if (toDate) filters.to = toDate;
        }
        const result = await taskService.getComments(taskId, filters);
        setFilteredComments(result);
      } catch {
        setFilteredComments(comments);
      } finally {
        setIsFiltering(false);
      }
    };
    applyFilter();
  }, [filterMode, fromDate, toDate, taskId, comments]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!newComment.trim() || !user || isSending) return;

    setIsSending(true);
    try {
      await addTaskComment(taskId, { text: newComment.trim() });
      setNewComment('');
      textareaRef.current?.focus();
    } catch {
      showError('Failed to send comment');
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const sortedComments = [...filteredComments].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const filterTabs: { key: FilterMode; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'assignee', label: 'Assignee' },
    { key: 'date', label: 'By Date' },
  ];

  return (
    <div className="space-y-2 pt-4 border-t border-gray-100 dark:border-gray-800 mt-4">
      <div className="flex items-center justify-between px-0.5">
        <h3 className="text-[9px] font-black uppercase tracking-widest text-gray-400">Comments</h3>
        <div className="flex items-center gap-0.5 bg-gray-100 dark:bg-gray-800 rounded-md p-0.5">
          {filterTabs.map(tab => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setFilterMode(tab.key)}
              className={`px-2 py-0.5 text-[8px] font-black uppercase tracking-widest rounded transition-all ${
                filterMode === tab.key
                  ? 'bg-white dark:bg-gray-700 text-indigo-600 shadow-sm'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {filterMode === 'date' && (
        <div className="flex items-center gap-2 px-0.5">
          <DateInput
            value={fromDate}
            onChange={v => setFromDate(v)}
            className="px-2 py-1 text-[10px] bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <span className="text-[9px] text-gray-400 font-bold">to</span>
          <DateInput
            value={toDate}
            onChange={v => setToDate(v)}
            className="px-2 py-1 text-[10px] bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      )}

      {/* Chat window */}
      <div
        ref={scrollRef}
        className="flex flex-col gap-3 max-h-[260px] min-h-[80px] overflow-y-auto px-1 py-2 bg-gray-50/50 dark:bg-gray-900/30 rounded-xl border border-gray-100 dark:border-gray-800 custom-scrollbar"
      >
        {isFiltering ? (
          <div className="flex items-center justify-center h-16">
            <p className="text-[10px] uppercase font-black tracking-widest text-gray-300">Loading...</p>
          </div>
        ) : sortedComments.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-16 text-center">
            <p className="text-[10px] uppercase font-black tracking-widest text-gray-300">No comments yet</p>
            {canComment && <p className="text-[9px] text-gray-300 mt-0.5">Be the first to comment</p>}
          </div>
        ) : (
          sortedComments.map((comment) => {
            const isOwn = comment.userId === user?.id;
            const colorIdx = getUserColorIndex(comment.userId);
            return (
              <div
                key={comment.id}
                className={`flex gap-2 items-end ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}
              >
                <UserAvatar userId={comment.userId} userName={comment.userName} />
                <div className={`flex flex-col max-w-[75%] ${isOwn ? 'items-end' : 'items-start'}`}>
                  <div className={`flex items-center gap-1.5 mb-0.5 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                    <span className="text-[9px] font-black uppercase tracking-tight text-gray-600 dark:text-gray-400">
                      {isOwn ? 'You' : comment.userName}
                    </span>
                    <span className="text-[8px] font-mono text-gray-400">
                      {formatDistanceToNow(new Date(comment.timestamp), { addSuffix: true })}
                    </span>
                  </div>
                  <div
                    className={`px-3 py-2 rounded-2xl text-[11px] leading-relaxed border-2 ${
                      isOwn
                        ? `bg-indigo-600 text-white border-indigo-600 rounded-br-sm`
                        : `${USER_BG_COLORS[colorIdx]} text-gray-800 dark:text-gray-200 ${USER_COLORS[colorIdx]} rounded-bl-sm`
                    }`}
                  >
                    {comment.text}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Input area — only for admin or assignee */}
      {canComment ? (
        <>
          <form onSubmit={handleSubmit} className="flex items-end gap-2">
            {user && <UserAvatar userId={user.id} userName={user.name} />}
            <div className="relative flex-1">
              <textarea
                ref={textareaRef}
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Write a comment… (Enter to send)"
                className="w-full px-3 py-2 pr-10 bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-700 rounded-xl text-[11px] focus:ring-2 focus:ring-indigo-500 outline-none transition-all resize-none font-medium placeholder:text-gray-400 leading-relaxed"
                rows={2}
                disabled={isSending}
              />
              <button
                type="submit"
                disabled={!newComment.trim() || isSending}
                className="absolute right-2 bottom-2 p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                <Send size={11} />
              </button>
            </div>
          </form>
          <p className="text-[8px] text-gray-400 pl-8">Shift+Enter for new line</p>
        </>
      ) : (
        <p className="text-[9px] text-gray-400 italic px-1">Only the assignee can add comments</p>
      )}
    </div>
  );
}
