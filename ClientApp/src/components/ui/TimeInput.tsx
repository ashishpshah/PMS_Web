import React, { useRef, useState, useEffect } from 'react';
import { Clock } from 'lucide-react';
import { cn } from '../../lib/utils';

interface TimeInputProps {
  name?: string;
  value?: string;          // controlled: "HH:MM"
  defaultValue?: string;   // uncontrolled: "HH:MM"
  onChange?: (value: string) => void;
  className?: string;
  placeholder?: string;
  maxLength?: number;
}

// Apply HH:MM mask to raw digits (max 4 digits)
function applyMask(digits: string): string {
  const d = digits.slice(0, 4);
  let result = '';
  for (let i = 0; i < d.length; i++) {
    if (i === 2) result += ':';
    result += d[i];
  }
  return result;
}

export function TimeInput({
  name,
  value,
  defaultValue,
  onChange,
  className,
  placeholder = '00:00',
}: TimeInputProps) {
  const isControlled = value !== undefined;
  const [display, setDisplay] = useState(isControlled ? (value ?? '') : (defaultValue ?? ''));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isControlled) setDisplay(value ?? '');
  }, [value, isControlled]);

  useEffect(() => {
    if (!isControlled) setDisplay(defaultValue ?? '');
  }, [defaultValue, isControlled]);

  const commit = (masked: string) => {
    setDisplay(masked);
    onChange?.(masked);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '');
    commit(applyMask(raw));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      const el = e.currentTarget;
      const pos = el.selectionStart ?? display.length;
      const skipPos = pos === 3 ? pos - 1 : pos;
      const raw = display.replace(/:/g, '');
      const digitPos = display.slice(0, skipPos).replace(/:/g, '').length;
      const newRaw = raw.slice(0, Math.max(0, digitPos - 1)) + raw.slice(digitPos);
      const newMasked = applyMask(newRaw);
      commit(newMasked);
      requestAnimationFrame(() => {
        el.setSelectionRange(newMasked.length, newMasked.length);
      });
      e.preventDefault();
    }
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        name={name}
        value={display}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        maxLength={5}
        pattern="[0-9]{1,3}:[0-5][0-9]"
        className={cn('w-full pr-8 font-mono', className)}
        autoComplete="off"
      />
      <Clock
        size={13}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
      />
    </div>
  );
}
