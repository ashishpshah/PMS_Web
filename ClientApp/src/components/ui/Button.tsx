import { ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '../../lib/utils';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  isLoading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', isLoading, children, disabled, ...props }, ref) => {
    const variants = {
      primary: 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm border-indigo-700',
      secondary: 'bg-white text-gray-900 border-gray-200 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700 dark:hover:bg-gray-700',
      outline: 'bg-transparent border-indigo-600 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950',
      ghost: 'bg-transparent text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800',
      danger: 'bg-red-600 text-white hover:bg-red-700 shadow-sm border-red-700',
    };

    const sizes = {
      sm: 'px-2 py-1 text-[11px] font-bold uppercase tracking-tight rounded',
      md: 'px-3 py-1.5 text-[12px] font-bold uppercase tracking-tight rounded-md',
      lg: 'px-5 py-2.5 text-sm font-bold uppercase tracking-tight rounded-lg',
      icon: 'p-1.5 rounded-md',
    };

    return (
      <button
        ref={ref}
        disabled={isLoading || disabled}
        className={cn(
          'inline-flex items-center justify-center border transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900',
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      >
        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
