import { useState } from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { TimeInput } from './TimeInput';
import { cn } from '../../lib/utils';
import { MAX_HOURS_PER_ENTRY, isValidHoursEntry, fromHHMM } from '../../lib/utils';

interface SmartTimeInputProps {
  value?: string;
  onChange?: (value: string) => void;
  maxHours?: number;
  required?: boolean;
  presets?: number[];
  className?: string;
  disabled?: boolean;
  error?: string;
  onValidate?: (hours: number) => string | null;
}

const DEFAULT_PRESETS = [1, 2, 4, 8];

export function SmartTimeInput({
  value,
  onChange,
  maxHours = MAX_HOURS_PER_ENTRY,
  required = false,
  presets = DEFAULT_PRESETS,
  className,
  disabled,
  error,
  onValidate,
}: SmartTimeInputProps) {
  const [displayValue, setDisplayValue] = useState(value ?? '');
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  const handlePresetClick = (hours: number) => {
    const formatted = `${String(hours).padStart(2, '0')}:00`;
    setDisplayValue(formatted);
    onChange?.(formatted);
  };

  const handleInputChange = (val: string) => {
    setDisplayValue(val);
    onChange?.(val);

    if (onValidate && val) {
      const hours = fromHHMM(val);
      if (hours != null) {
        const err = onValidate(hours);
        setValidationMessage(err);
      } else {
        setValidationMessage(null);
      }
    } else if (!val) {
      setValidationMessage(null);
    }
  };

  const effectiveError = error ?? validationMessage;
  const hasValue = displayValue && displayValue !== '00:00';

  const isValid = hasValue && !effectiveError;
  const showValidation = (required && !hasValue) || !!effectiveError;

  return (
    <div className={cn('space-y-2', className)}>
      <TimeInput
        value={displayValue}
        onChange={handleInputChange}
        maxHours={maxHours}
        disabled={disabled}
        className={cn(
          'w-full px-3 py-2 text-sm font-mono bg-white dark:bg-gray-700 rounded-lg outline-none focus:ring-2 transition-colors',
          effectiveError
            ? 'border-red-300 dark:border-red-700 focus:ring-red-500/20 focus:border-red-500'
            : isValid
            ? 'border-emerald-300 dark:border-emerald-700 focus:ring-emerald-500/20 focus:border-emerald-500'
            : 'border-gray-300 dark:border-gray-600 focus:ring-indigo-500/20 focus:border-indigo-500'
        )}
      />

      {!disabled && presets.length > 0 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick preset hours">
          {presets.map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => handlePresetClick(h)}
              disabled={disabled}
              className={cn(
                'px-2.5 py-1 text-xs font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
                displayValue === `${String(h).padStart(2, '0')}:00`
                  ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-200 border border-indigo-300 dark:border-indigo-700'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700'
              )}
              aria-pressed={displayValue === `${String(h).padStart(2, '0')}:00`}
            >
              {h}h
            </button>
          ))}
        </div>
      )}

      {showValidation && (
        <p className={cn('text-xs flex items-center gap-1', effectiveError ? 'text-red-500 dark:text-red-400' : 'text-emerald-500 dark:text-emerald-400')}>
          {effectiveError ? (
            <>
              <AlertCircle className="h-3 w-3 flex-shrink-0" />
              {effectiveError}
            </>
          ) : (
            <>
              <CheckCircle2 className="h-3 w-3 flex-shrink-0" />
              Valid entry
            </>
          )}
        </p>
      )}
    </div>
  );
}