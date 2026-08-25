import React from 'react';
import { cn } from '../../lib/utils';

export function Badge({ 
  children, 
  variant = 'default',
  className,
  ...props
}: { 
  children: React.ReactNode; 
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  className?: string;
} & React.HTMLAttributes<HTMLSpanElement>) {
  const styles = {
    default: 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700',
    success: 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/30',
    warning: 'bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-900/30',
    danger: 'bg-rose-50 text-rose-700 border-rose-100 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-900/30',
    info: 'bg-sky-50 text-sky-700 border-sky-100 dark:bg-sky-900/30 dark:text-sky-400 dark:border-sky-900/30',
  };

  return (
    <span 
      className={cn('px-1.5 py-0.5 rounded border text-[9px] font-bold uppercase tracking-widest', styles[variant], className)}
      {...props}
    >
      {children}
    </span>
  );
}
