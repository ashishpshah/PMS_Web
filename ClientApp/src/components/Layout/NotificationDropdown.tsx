import React, { useState, useRef, useEffect } from 'react';
import { Bell, Check, Calendar, AlertCircle, Info } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';
import { motion, AnimatePresence } from 'motion/react';
import { formatDistanceToNow } from 'date-fns';
import { useNavigate } from 'react-router-dom';

export function NotificationDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const { notifications, markNotificationAsRead, clearAllNotifications } = useData();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();

  const unreadCount = notifications.filter(n => !n.read).length;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
        bellRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        ref={bellRef}
        variant="ghost"
        size="icon"
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        aria-haspopup="true"
        aria-expanded={isOpen}
        className="relative h-8 w-8 hover:bg-gray-50 dark:hover:bg-gray-900"
        onClick={() => setIsOpen(!isOpen)}
      >
        <Bell className={cn('h-4 w-4', unreadCount > 0 ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-500')} aria-hidden="true" />
        {unreadCount > 0 && (
          <span
            className="absolute top-1.5 right-1.5 h-1.5 w-1.5 bg-red-500 rounded-full border border-white dark:border-gray-950 animate-pulse"
            aria-hidden="true"
          />
        )}
      </Button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            role="dialog"
            aria-label="Notifications panel"
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute right-0 mt-2 w-80 bg-white dark:bg-gray-950 border border-gray-100 dark:border-gray-900 rounded-xl shadow-2xl z-50 overflow-hidden"
          >
            <div className="p-4 bg-gray-50/50 dark:bg-gray-900/50 border-b border-gray-100 dark:border-gray-900 flex items-center justify-between">
              <div>
                <h3 className="text-[12px] font-black uppercase tracking-widest text-gray-900 dark:text-white">Notifications</h3>
                <p className="text-[9px] text-gray-400 font-bold uppercase tracking-tight">{unreadCount} unread</p>
              </div>
              {unreadCount > 0 && (
                <button
                  onClick={() => clearAllNotifications()}
                  className="text-[9px] font-black uppercase text-indigo-600 hover:text-indigo-700 transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500 outline-none rounded"
                >
                  Mark all as read
                </button>
              )}
            </div>

            <div className="max-h-[350px] overflow-y-auto custom-scrollbar" aria-live="polite">
              {notifications.length === 0 ? (
                <div className="p-10 text-center">
                  <div className="h-10 w-10 bg-gray-50 dark:bg-gray-900 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Info size={16} className="text-gray-300" aria-hidden="true" />
                  </div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-relaxed">No notifications</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-50 dark:divide-gray-900" role="list">
                  {notifications.map((notification) => (
                    <div
                      key={notification.id}
                      role="listitem"
                      onClick={() => {
                        markNotificationAsRead(notification.id);
                        if (notification.link) {
                          navigate(notification.link);
                          setIsOpen(false);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          markNotificationAsRead(notification.id);
                          if (notification.link) {
                            navigate(notification.link);
                            setIsOpen(false);
                          }
                        }
                      }}
                      tabIndex={0}
                      aria-label={`${notification.title}: ${notification.message}`}
                      className={cn(
                        'p-4 hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors relative group cursor-pointer focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 outline-none',
                        !notification.read && 'bg-indigo-50/20 dark:bg-indigo-900/5'
                      )}
                    >
                      <div className="flex gap-3">
                        <div className={cn(
                          'h-8 w-8 rounded-lg flex items-center justify-center shrink-0',
                          notification.type === 'reminder' ? 'bg-amber-100/50 dark:bg-amber-900/20 text-amber-600' :
                          notification.type === 'update' ? 'bg-indigo-100/50 dark:bg-indigo-900/20 text-indigo-600' :
                          'bg-gray-100 dark:bg-gray-800 text-gray-500'
                        )} aria-hidden="true">
                          {notification.type === 'reminder' ? <Calendar size={14} /> :
                           notification.type === 'update' ? <Info size={14} /> :
                           <AlertCircle size={14} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <h4 className={cn(
                              'text-[11px] font-black uppercase tracking-tight truncate',
                              !notification.read ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-900 dark:text-gray-100'
                            )}>
                              {notification.title}
                            </h4>
                            <span className="text-[8px] font-bold text-gray-400 uppercase">
                              {formatDistanceToNow(new Date(notification.timestamp), { addSuffix: true }).replace('about ', '')}
                            </span>
                          </div>
                          <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-normal line-clamp-2">
                            {notification.message}
                          </p>
                        </div>
                        {!notification.read && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              markNotificationAsRead(notification.id);
                            }}
                            aria-label="Mark as read"
                            className="absolute top-2 right-2 p-1 text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity hover:text-indigo-600 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-indigo-500 outline-none rounded"
                          >
                            <Check size={12} aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-3 bg-gray-50/50 dark:bg-gray-900/50 border-t border-gray-100 dark:border-gray-900 text-center">
              <span className="text-[9px] font-black uppercase text-gray-400 tracking-widest">
                {notifications.length} total notifications
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
