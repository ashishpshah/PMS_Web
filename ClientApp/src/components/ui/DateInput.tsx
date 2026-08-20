import React, { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';

interface DateInputProps {
  name?: string;
  value?: string;          // controlled: YYYY-MM-DD
  defaultValue?: string;   // uncontrolled: YYYY-MM-DD
  onChange?: (value: string) => void; // emits YYYY-MM-DD or ''
  className?: string;
  required?: boolean;
  placeholder?: string;
  disabledDate?: (date: Date) => boolean; // return true to disable a day
  minDate?: Date; // earliest selectable date; disables prev-month nav at boundary
}

// Convert YYYY-MM-DD → DD-MM-YYYY for display
function toDisplay(iso: string): string {
  if (!iso || iso.length < 10) return '';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return '';
  return `${d}-${m}-${y}`;
}

// Convert DD-MM-YYYY → YYYY-MM-DD for storage
function toISO(display: string): string {
  const clean = display.replace(/\D/g, '');
  if (clean.length < 8) return '';
  const d = clean.slice(0, 2);
  const m = clean.slice(2, 4);
  const y = clean.slice(4, 8);
  if (!d || !m || !y) return '';
  return `${y}-${m}-${d}`;
}

// Apply DD-MM-YYYY mask to raw digit string
function applyMask(digits: string): string {
  const d = digits.slice(0, 8);
  let result = '';
  for (let i = 0; i < d.length; i++) {
    if (i === 2 || i === 4) result += '-';
    result += d[i];
  }
  return result;
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Parse YYYY-MM-DD into a local Date, or null if invalid
function parseISO(iso: string): Date | null {
  if (!iso || iso.length < 10) return null;
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d);
  return isNaN(dt.getTime()) ? null : dt;
}

// Format a local Date as YYYY-MM-DD
function formatISO(dt: Date): string {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isSameDay(a: Date | null, b: Date | null): boolean {
  return !!a && !!b
    && a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

export function DateInput({
  name,
  value,
  defaultValue,
  onChange,
  className,
  required,
  placeholder = 'DD-MM-YYYY',
  disabledDate,
  minDate,
}: DateInputProps) {
  const isControlled = value !== undefined;
  const [display, setDisplay] = useState(() =>
    toDisplay(isControlled ? (value ?? '') : (defaultValue ?? ''))
  );
  const [open, setOpen] = useState(false);
  // Month currently shown in the calendar grid
  const [viewMonth, setViewMonth] = useState<Date>(() => {
    const initialIso = isControlled ? (value ?? '') : (defaultValue ?? '');
    return parseISO(initialIso) ?? new Date();
  });
  const hiddenRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  // Fixed-position coords for the portaled calendar popup
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  // Measure the input and position the popup below it (portal escapes overflow-hidden ancestors)
  const updateCoords = () => {
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (rect) setCoords({ top: rect.bottom + 4, left: rect.left });
  };

  // Sync controlled value → display
  useEffect(() => {
    if (isControlled) setDisplay(toDisplay(value ?? ''));
  }, [value, isControlled]);

  // Close popup on outside click, reposition on scroll/resize
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        wrapperRef.current && !wrapperRef.current.contains(target) &&
        popupRef.current && !popupRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onReposition = () => updateCoords();
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    window.addEventListener('scroll', onReposition, true);
    window.addEventListener('resize', onReposition);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
      window.removeEventListener('scroll', onReposition, true);
      window.removeEventListener('resize', onReposition);
    };
  }, [open]);

  const commit = (masked: string) => {
    setDisplay(masked);
    const iso = toISO(masked.replace(/-/g, ''));
    if (hiddenRef.current) hiddenRef.current.value = iso;
    onChange?.(iso);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '');
    commit(applyMask(raw));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      const el = e.currentTarget;
      const pos = el.selectionStart ?? display.length;
      // Skip over separators when deleting
      const stripPos = pos === 3 || pos === 6 ? pos - 1 : pos;
      const raw = display.replace(/-/g, '');
      const digitPos = display.slice(0, stripPos).replace(/-/g, '').length;
      const newRaw = raw.slice(0, Math.max(0, digitPos - 1)) + raw.slice(digitPos);
      const newMasked = applyMask(newRaw);
      commit(newMasked);
      // Restore cursor
      requestAnimationFrame(() => {
        const newCursor = Math.max(0, newMasked.length);
        el.setSelectionRange(newCursor, newCursor);
      });
      e.preventDefault();
    }
  };

  const isoValue = toISO(display.replace(/-/g, ''));
  const selected = parseISO(isoValue);

  const toggleCalendar = () => {
    setOpen(prev => {
      const next = !prev;
      // When opening, jump the view to the selected month (or today) and position the popup
      if (next) {
        setViewMonth(selected ?? new Date());
        updateCoords();
      }
      return next;
    });
  };

  const pickDate = (dt: Date) => {
    commit(toDisplay(formatISO(dt)));
    setOpen(false);
    inputRef.current?.focus();
  };

  // Build the 6-row × 7-col grid for the current view month
  const buildGrid = (): (Date | null)[] => {
    const firstOfMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
    const startWeekday = firstOfMonth.getDay();
    const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < startWeekday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(new Date(viewMonth.getFullYear(), viewMonth.getMonth(), d));
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  };

  const today = new Date();

  return (
    <div className="relative w-full" ref={wrapperRef}>
      {/* Visible masked input */}
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        value={display}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        maxLength={10}
        className={cn(
          'w-full pr-8 font-mono',
          className
        )}
        autoComplete="off"
      />
      <button
        type="button"
        onClick={toggleCalendar}
        tabIndex={-1}
        aria-label="Open calendar"
        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-indigo-500 transition-colors"
      >
        <Calendar size={13} />
      </button>

      {/* Calendar popup — portaled to body with fixed positioning so it escapes overflow-hidden ancestors */}
      {open && createPortal(
        <div
          ref={popupRef}
          style={{ position: 'fixed', top: coords.top, left: coords.left }}
          className="z-[100] w-60 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-xl p-3"
        >
          {/* Header: month navigation */}
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              disabled={
                !!minDate &&
                viewMonth.getFullYear() === minDate.getFullYear() &&
                viewMonth.getMonth() === minDate.getMonth()
              }
              onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))}
              className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Previous month"
            >
              <ChevronLeft size={15} />
            </button>
            <span className="text-[12px] font-semibold text-gray-700 dark:text-gray-200">
              {MONTHS[viewMonth.getMonth()]} {viewMonth.getFullYear()}
            </span>
            <button
              type="button"
              onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))}
              className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300"
              aria-label="Next month"
            >
              <ChevronRight size={15} />
            </button>
          </div>

          {/* Weekday labels */}
          <div className="grid grid-cols-7 gap-0.5 mb-1">
            {WEEKDAYS.map(w => (
              <div key={w} className="text-center text-[9px] font-bold text-gray-400 py-1">
                {w}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-0.5">
            {buildGrid().map((dt, i) => {
              if (!dt) return <div key={`e${i}`} />;
              const isSelected = isSameDay(dt, selected);
              const isToday = isSameDay(dt, today);
              const isBeforeMin = !!minDate && dt < minDate;
              const isDisabled = isBeforeMin || (disabledDate ? disabledDate(dt) : false);
              return (
                <button
                  key={formatISO(dt)}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => !isDisabled && pickDate(dt)}
                  className={cn(
                    'h-7 w-7 mx-auto flex items-center justify-center rounded-md text-[11px] transition-colors',
                    isDisabled
                      ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                      : isSelected
                        ? 'bg-indigo-600 text-white font-semibold'
                        : 'text-gray-700 dark:text-gray-200 hover:bg-indigo-50 dark:hover:bg-gray-800',
                    !isSelected && !isDisabled && isToday && 'ring-1 ring-indigo-400'
                  )}
                >
                  {dt.getDate()}
                </button>
              );
            })}
          </div>

          {/* Footer: Today / Clear */}
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100 dark:border-gray-800">
            <button
              type="button"
              disabled={disabledDate ? disabledDate(new Date()) : false}
              onClick={() => !(disabledDate?.(new Date())) && pickDate(new Date())}
              className={cn(
                'text-[10px] font-semibold',
                disabledDate?.(new Date())
                  ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                  : 'text-indigo-600 hover:text-indigo-700'
              )}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => { commit(''); setOpen(false); }}
              className="text-[10px] font-semibold text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              Clear
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* Hidden real input carries YYYY-MM-DD for form submission */}
      <input
        ref={hiddenRef}
        type="hidden"
        name={name}
        value={isoValue}
        required={required}
      />
    </div>
  );
}
