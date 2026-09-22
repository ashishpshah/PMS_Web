import React, { useState, useEffect, useCallback, useRef } from 'react';
import AsyncSelect from 'react-select/async';
import { components, GroupBase, StylesConfig, ThemeConfig } from 'react-select';
import { useTheme } from '../../context/ThemeContext';

export interface SelectOption {
  value: string | number;
  label: string;
}

interface AsyncVSelectProps {
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  isClearable?: boolean;
  className?: string;
  size?: 'sm' | 'md';
  value: SelectOption | null;
  onChange: (opt: SelectOption | null) => void;
  // Async search config
  loadOptions: (search: string) => Promise<SelectOption[]>;
  defaultOptions?: SelectOption[];
  minCharsToSearch?: number;
  debounceMs?: number;
  // Additional fetch for initial load / when value is set but not in options
  loadOption?: (value: string | number) => Promise<SelectOption | null>;
}

function buildStyles(isDark: boolean, size: 'sm' | 'md' = 'md'): StylesConfig<SelectOption, boolean, GroupBase<SelectOption>> {
  const bg = isDark ? '#1f2937' : '#f9fafb';
  const border = isDark ? '#374151' : '#e5e7eb';
  const text = isDark ? '#e5e7eb' : '#111827';
  const placeholder = isDark ? '#6b7280' : '#9ca3af';
  const menuBg = isDark ? '#111827' : '#ffffff';
  const optionHover = isDark ? 'rgba(99,102,241,0.15)' : '#eef2ff';
  const indicator = isDark ? '#6b7280' : '#9ca3af';
  const isSm = size === 'sm';

  return {
    control: (base, state) => ({
      ...base,
      backgroundColor: bg,
      borderColor: state.isFocused ? '#6366f1' : border,
      borderRadius: isSm ? '0.375rem' : '0.5rem',
      boxShadow: state.isFocused ? '0 0 0 1px rgba(99,102,241,0.4)' : 'none',
      minHeight: isSm ? '32px' : '38px',
      fontSize: isSm ? '12px' : '13px',
      '&:hover': { borderColor: isDark ? '#4b5563' : '#d1d5db' },
    }),
    valueContainer: (base) => ({
      ...base,
      padding: isSm ? '0 6px' : '2px 8px',
    }),
    dropdownIndicator: (base) => ({
      ...base,
      padding: isSm ? '0 4px' : '0 8px',
      color: indicator,
      '&:hover': { color: isDark ? '#9ca3af' : '#6b7280' },
    }),
    clearIndicator: (base) => ({
      ...base,
      padding: isSm ? '0 4px' : '0 8px',
      color: indicator,
      '&:hover': { color: '#ef4444' },
    }),
    menuPortal: (base) => ({ ...base, zIndex: 9999 }),
    menu: (base) => ({
      ...base,
      backgroundColor: menuBg,
      borderRadius: '0.5rem',
      border: `1px solid ${border}`,
      boxShadow: '0 10px 15px -3px rgba(0,0,0,0.15)',
    }),
    option: (base, state) => ({
      ...base,
      backgroundColor: state.isSelected
        ? '#6366f1'
        : state.isFocused
          ? optionHover
          : 'transparent',
      color: state.isSelected ? '#ffffff' : text,
      fontSize: isSm ? '12px' : '13px',
      padding: isSm ? '4px 10px' : '8px 12px',
      cursor: 'pointer',
    }),
    singleValue: (base) => ({ ...base, color: text }),
    placeholder: (base) => ({ ...base, color: placeholder, fontSize: isSm ? '12px' : '13px' }),
    input: (base) => ({ ...base, color: text, margin: isSm ? '0' : undefined, padding: isSm ? '0' : undefined }),
    indicatorSeparator: (base) => ({ ...base, backgroundColor: border, marginTop: isSm ? '4px' : '8px', marginBottom: isSm ? '4px' : '8px' }),
    loadingMessage: (base) => ({ ...base, color: placeholder, fontSize: isSm ? '12px' : '13px' }),
    noOptionsMessage: (base) => ({ ...base, color: placeholder, fontSize: isSm ? '12px' : '13px' }),
  };
}

function buildTheme(isDark: boolean): ThemeConfig {
  return (t) => ({
    ...t,
    colors: {
      ...t.colors,
      primary: '#6366f1',
      primary75: '#818cf8',
      primary50: '#a5b4fc',
      primary25: '#eef2ff',
      danger: '#ef4444',
      dangerLight: '#fee2e2',
      neutral0: isDark ? '#111827' : '#ffffff',
      neutral5: isDark ? '#1f2937' : '#f9fafb',
      neutral10: isDark ? '#374151' : '#f3f4f6',
      neutral20: isDark ? '#374151' : '#e5e7eb',
      neutral30: isDark ? '#4b5563' : '#d1d5db',
      neutral40: isDark ? '#6b7280' : '#9ca3af',
      neutral50: isDark ? '#6b7280' : '#9ca3af',
      neutral60: isDark ? '#9ca3af' : '#6b7280',
      neutral70: isDark ? '#d1d5db' : '#4b5563',
      neutral80: isDark ? '#e5e7eb' : '#374151',
      neutral90: isDark ? '#f3f4f6' : '#1f2937',
    },
  });
}

export function AsyncVSelect(props: AsyncVSelectProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const {
    label,
    placeholder = 'Select...',
    disabled = false,
    isClearable = false,
    className,
    size = 'md',
    value,
    onChange,
    loadOptions,
    defaultOptions = [],
    minCharsToSearch = 2,
    debounceMs = 300,
    loadOption,
  } = props;

  const styles = buildStyles(isDark, size);
  const theme = buildTheme(isDark);

  const labelEl = label ? (
    <label className="block text-[11px] font-black uppercase tracking-widest text-gray-400 mb-1">
      {label}
    </label>
  ) : null;

  // Track if we've loaded initial options
  const [hasLoadedInitial, setHasLoadedInitial] = useState(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [inputValue, setInputValue] = useState('');

  // Debounced load options
  const loadOptionsDebounced = useCallback(async (search: string) => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    
    return new Promise<SelectOption[]>((resolve) => {
      debounceTimerRef.current = setTimeout(async () => {
        try {
          const results = await loadOptions(search);
          resolve(results);
        } catch (err) {
          console.error('Failed to load options:', err);
          resolve([]);
        }
      }, debounceMs);
    });
  }, [loadOptions, debounceMs]);

  // Load initial options (top 25) on mount
  useEffect(() => {
    if (!hasLoadedInitial) {
      loadOptions('').then((results) => {
        // We don't set state here, react-select-async will handle it via loadOptions
        setHasLoadedInitial(true);
      });
    }
  }, [loadOptions, hasLoadedInitial]);

  // If value is set but not in defaultOptions, fetch it
  useEffect(() => {
    if (value && defaultOptions.length > 0) {
      const exists = defaultOptions.some(o => o.value === value.value);
      if (!exists && loadOption) {
        loadOption(value.value).then((opt) => {
          if (opt) {
            // The option will be added to options via onChange or we can merge it
            onChange(opt);
          }
        });
      }
    }
  }, [value, defaultOptions, loadOption, onChange]);

  return (
    <div className={className}>
      {labelEl}
      <AsyncSelect<SelectOption, false>
        cacheOptions={false}
        defaultOptions={defaultOptions}
        loadOptions={loadOptionsDebounced}
        getOptionLabel={(opt) => opt.label}
        getOptionValue={(opt) => String(opt.value)}
        value={value}
        onChange={onChange}
        onInputChange={setInputValue}
        placeholder={placeholder}
        isDisabled={disabled}
        isClearable={isClearable}
        isSearchable={true}
        minMenuHeight={200}
        menuIsOpen={false}
        styles={styles as StylesConfig<SelectOption, false, GroupBase<SelectOption>>}
        theme={theme}
        classNamePrefix="vselect"
        menuPortalTarget={document.body}
        menuPosition="fixed"
        components={{
          // Show initial options when no input
          DropdownIndicator: (props) => (
            <components.DropdownIndicator {...props} />
          ),
        }}
      />
    </div>
  );
}

// Re-export the original VSelect for backward compatibility
export type { VSelectProps } from './VSelect';