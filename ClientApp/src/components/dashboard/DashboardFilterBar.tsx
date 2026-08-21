import React from 'react';
import { Filter } from 'lucide-react';
import { Card, CardContent } from '../ui/Card';
import { VSelect } from '../forms/VSelect';
import { DateInput } from '../ui/DateInput';
import { User } from '../../types';
import { PeriodKey, PERIOD_OPTIONS } from '../../lib/dateRanges';

interface Props {
  isAdminView: boolean;
  users: User[];
  selectedUserId: number | null;
  onSelectedUserIdChange: (id: number | null) => void;
  period: PeriodKey;
  onPeriodChange: (p: PeriodKey) => void;
  customFrom: string;
  onCustomFromChange: (v: string) => void;
  customTo: string;
  onCustomToChange: (v: string) => void;
}

// Shared "All Users" + date-range filter bar sitting above every dashboard
// section. The user dropdown mirrors Diary.tsx's proven isAdminView pattern;
// the date range reuses the same PeriodKey/VSelect/DateInput combo already
// used elsewhere in the app instead of inventing a new date-range control.
export function DashboardFilterBar({
  isAdminView, users, selectedUserId, onSelectedUserIdChange,
  period, onPeriodChange, customFrom, onCustomFromChange, customTo, onCustomToChange,
}: Props) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className={`grid grid-cols-1 gap-3 items-center ${isAdminView ? 'md:[grid-template-columns:auto_1fr_1fr_1fr]' : 'md:[grid-template-columns:auto_1fr_1fr]'}`}>
          <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-gray-400">
            <Filter size={13} className="text-indigo-500" /> Filters
          </div>

          {isAdminView && (
            <VSelect
              className="min-w-0"
              options={[
                { value: '', label: 'All Users' },
                ...users.map(u => ({ value: u.id, label: u.name })),
              ]}
              value={selectedUserId
                ? { value: selectedUserId, label: users.find(u => u.id === selectedUserId)?.name ?? '' }
                : { value: '', label: 'All Users' }
              }
              onChange={opt => onSelectedUserIdChange(opt && opt.value !== '' ? Number(opt.value) : null)}
              isSearchable
              isClearable={false}
              size="sm"
            />
          )}

          <VSelect
            className="min-w-0"
            options={PERIOD_OPTIONS.map(o => ({ value: o.key, label: o.label }))}
            value={{ value: period, label: PERIOD_OPTIONS.find(o => o.key === period)?.label ?? period }}
            onChange={opt => opt && onPeriodChange(opt.value as PeriodKey)}
            isSearchable={false}
            isClearable={false}
            size="sm"
          />

          {period === 'custom' && (
            <div className="flex items-center gap-2">
              <DateInput value={customFrom} onChange={onCustomFromChange} placeholder="From" />
              <DateInput value={customTo} onChange={onCustomToChange} placeholder="To" />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
