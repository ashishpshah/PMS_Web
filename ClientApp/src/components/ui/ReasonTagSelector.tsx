import React from 'react';
import { REASON_TAGS, ReasonTag } from '../../types';
import { VSelect, SelectOption } from '../forms/VSelect';

interface ReasonTagSelectorProps {
  value: string;
  onChange: (value: ReasonTag) => void;
  required?: boolean;
  label?: string;
  tags?: ReasonTag[];
}

export function ReasonTagSelector({ value, onChange, required, label = 'Reason for Reassignment', tags }: ReasonTagSelectorProps) {
  const options = tags ?? REASON_TAGS;
  const selectOptions: SelectOption[] = options.map(tag => ({ value: tag, label: tag }));

  return (
    <div className="space-y-1">
      {label && (
        <label className="block text-[9px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-400">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <VSelect
        options={selectOptions}
        value={selectOptions.find(o => o.value === value) ?? null}
        onChange={(opt) => { if (opt) onChange(opt.value as ReasonTag); }}
        isSearchable={false}
        placeholder="Select reason..."
      />
    </div>
  );
}
