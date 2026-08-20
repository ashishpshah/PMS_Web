import React from 'react';

interface ProgressBarProps {
  value: number;
  showLabel?: boolean;
  variant?: 'indigo' | 'emerald' | 'amber';
  size?: 'sm' | 'md';
  className?: string;
}

export function ProgressBar({ value, showLabel = true, variant = 'indigo', size = 'md', className = '' }: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, value));

  const barColor =
    variant === 'emerald' ? 'bg-emerald-500' :
    variant === 'amber' ? 'bg-amber-500' :
    'bg-indigo-600';

  const trackColor =
    variant === 'emerald' ? 'bg-emerald-100 dark:bg-emerald-900/20' :
    variant === 'amber' ? 'bg-amber-100 dark:bg-amber-900/20' :
    'bg-indigo-100 dark:bg-indigo-900/20';

  const labelColor =
    variant === 'emerald' ? 'text-emerald-600' :
    variant === 'amber' ? 'text-amber-600' :
    'text-indigo-600';

  const height = size === 'sm' ? 'h-1' : 'h-1.5';

  return (
    <div className={`w-full space-y-1 ${className}`}>
      {showLabel && (
        <div className="flex justify-between items-center">
          <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">Progress</span>
          <span className={`text-[10px] font-black font-mono ${labelColor}`}>{clamped}%</span>
        </div>
      )}
      <div className={`w-full ${height} ${trackColor} rounded-full overflow-hidden`}>
        <div
          className={`${height} ${barColor} rounded-full transition-all duration-700`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
