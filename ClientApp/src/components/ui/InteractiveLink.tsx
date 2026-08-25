import React from 'react';
import { useQuickView } from '../../context/QuickViewContext';
import { cn } from '../../lib/utils';

interface InteractiveLinkProps {
  type: 'project' | 'task' | 'user';
  id: number;
  children: React.ReactNode;
  className?: string;
  showIcon?: boolean;
}

export function InteractiveLink({ type, id, children, className }: InteractiveLinkProps) {
  const { openQuickView } = useQuickView();

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    openQuickView(type, id);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openQuickView(type, id);
    }
  };

  return (
    <button
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-label={`View ${type} details`}
      className={cn(
        'text-left hover:text-indigo-600 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 rounded',
        className
      )}
    >
      {children}
    </button>
  );
}
