import React from 'react';
import { cn } from '../../lib/utils';
import { motion } from 'motion/react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  animate?: boolean;
  key?: React.Key;
}

export function Card({ children, className, animate = true, ...props }: CardProps) {
  const cardClass = cn(
    'bg-white dark:bg-gray-950 border border-gray-100 dark:border-gray-900 rounded-lg overflow-hidden shadow-sm transition-all',
    className
  );

  if (animate) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={cardClass}
        onClick={props.onClick}
        onMouseEnter={props.onMouseEnter}
        onMouseLeave={props.onMouseLeave}
        style={props.style}
        id={props.id}
        role={props.role}
        aria-label={props['aria-label']}
      >
        {children}
      </motion.div>
    );
  }

  return (
    <div {...props} className={cardClass}>
      {children}
    </div>
  );
}

export function CardHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('px-4 py-3 border-b border-gray-50 dark:border-gray-900', className)}>{children}</div>;
}

export function CardContent({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('p-4', className)}>{children}</div>;
}

export function CardFooter({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('px-4 py-2.5 border-t border-gray-50 dark:border-gray-900 bg-gray-50/30 dark:bg-gray-900/30', className)}>{children}</div>;
}
