import { useEffect, useRef, useCallback } from 'react';
import { format, isToday, isYesterday, parseISO } from 'date-fns';
import { Loader2 } from 'lucide-react';
import { ChatMessage } from '../../types';
import { MessageBubble } from './MessageBubble';

interface Props {
  messages: ChatMessage[];
  currentUserId: number;
  hasMore: boolean;
  isLoading: boolean;
  onLoadMore: () => void;
  onReply: (message: ChatMessage) => void;
}

function DateSeparator({ date }: { date: string }) {
  const d = parseISO(date);
  const label = isToday(d) ? 'Today' : isYesterday(d) ? 'Yesterday' : format(d, 'MMMM d, yyyy');
  return (
    <div className="flex items-center gap-3 my-3 px-4">
      <div className="flex-1 h-px bg-gray-100 dark:bg-gray-800" />
      <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 px-2">
        {label}
      </span>
      <div className="flex-1 h-px bg-gray-100 dark:bg-gray-800" />
    </div>
  );
}

export function MessageList({ messages, currentUserId, hasMore, isLoading, onLoadMore, onReply }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevScrollHeight = useRef(0);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Preserve scroll position when loading older messages
  useEffect(() => {
    if (isLoading && containerRef.current) {
      prevScrollHeight.current = containerRef.current.scrollHeight;
    } else if (!isLoading && containerRef.current && prevScrollHeight.current) {
      const diff = containerRef.current.scrollHeight - prevScrollHeight.current;
      containerRef.current.scrollTop = diff;
      prevScrollHeight.current = 0;
    }
  }, [isLoading]);

  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    if (containerRef.current.scrollTop < 60 && hasMore && !isLoading) {
      onLoadMore();
    }
  }, [hasMore, isLoading, onLoadMore]);

  // Group messages by date
  const grouped: { date: string; msgs: ChatMessage[] }[] = [];
  for (const msg of messages) {
    const day = msg.sentAt.slice(0, 10);
    const last = grouped[grouped.length - 1];
    if (last && last.date === day) {
      last.msgs.push(msg);
    } else {
      grouped.push({ date: day, msgs: [msg] });
    }
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto py-2 custom-scrollbar"
    >
      {/* Load more spinner */}
      {hasMore && (
        <div className="flex justify-center py-3">
          {isLoading ? (
            <Loader2 size={18} className="text-indigo-400 animate-spin" />
          ) : (
            <button
              onClick={onLoadMore}
              className="text-xs text-indigo-500 hover:text-indigo-700 font-medium"
            >
              Load earlier messages
            </button>
          )}
        </div>
      )}

      {grouped.map(group => (
        <div key={group.date}>
          <DateSeparator date={group.date + 'T00:00:00'} />
          {group.msgs.map(msg => (
            <MessageBubble
              key={msg.id}
              message={msg}
              isOwn={msg.senderId === currentUserId}
              onReply={onReply}
            />
          ))}
        </div>
      ))}

      <div ref={bottomRef} />
    </div>
  );
}
