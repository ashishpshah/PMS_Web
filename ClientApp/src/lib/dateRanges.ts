// Named dashboard periods → concrete [from, to) instants (ISO strings, sent to the API).
// All ranges are computed in the browser's local time; the server treats the bounds as UTC-ish
// instants for clipping. Weeks start on Monday.

export type PeriodKey =
  | 'all'
  | 'today'
  | 'yesterday'
  | 'last7'
  | 'thisWeek'
  | 'prevWeek'
  | 'thisMonth'
  | 'prevMonth'
  | 'custom';

export const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: 'all', label: 'All time' },
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'last7', label: 'Last 7 days' },
  { key: 'thisWeek', label: 'This week' },
  { key: 'prevWeek', label: 'Previous week' },
  { key: 'thisMonth', label: 'This month' },
  { key: 'prevMonth', label: 'Previous month' },
  { key: 'custom', label: 'Date range' },
];

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
// Monday-based start of week.
const startOfWeek = (d: Date) => {
  const s = startOfDay(d);
  const dow = (s.getDay() + 6) % 7; // 0 = Monday
  return addDays(s, -dow);
};
const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);

export interface DateRange { from?: string; to?: string; }

// Returns {from, to} ISO strings for a named period. 'all' → empty (no bounds).
// 'custom' is resolved by the caller from explicit date inputs.
export function resolvePeriod(key: PeriodKey, now: Date = new Date()): DateRange {
  const today = startOfDay(now);
  switch (key) {
    case 'today':
      return { from: today.toISOString(), to: addDays(today, 1).toISOString() };
    case 'yesterday':
      return { from: addDays(today, -1).toISOString(), to: today.toISOString() };
    case 'last7':
      return { from: addDays(today, -6).toISOString(), to: addDays(today, 1).toISOString() };
    case 'thisWeek': {
      const s = startOfWeek(now);
      return { from: s.toISOString(), to: addDays(s, 7).toISOString() };
    }
    case 'prevWeek': {
      const s = addDays(startOfWeek(now), -7);
      return { from: s.toISOString(), to: addDays(s, 7).toISOString() };
    }
    case 'thisMonth': {
      const s = startOfMonth(now);
      return { from: s.toISOString(), to: new Date(s.getFullYear(), s.getMonth() + 1, 1).toISOString() };
    }
    case 'prevMonth': {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return { from: s.toISOString(), to: new Date(now.getFullYear(), now.getMonth(), 1).toISOString() };
    }
    case 'all':
    case 'custom':
    default:
      return {};
  }
}

// Build the range for a custom from/to (YYYY-MM-DD). `to` is made inclusive (end of that day).
export function resolveCustom(fromDate?: string, toDate?: string): DateRange {
  const range: DateRange = {};
  if (fromDate) range.from = new Date(`${fromDate}T00:00:00`).toISOString();
  if (toDate) {
    const t = new Date(`${toDate}T00:00:00`);
    t.setDate(t.getDate() + 1); // inclusive end-of-day
    range.to = t.toISOString();
  }
  return range;
}
