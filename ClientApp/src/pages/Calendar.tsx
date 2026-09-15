import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { PageHeader } from '../components/ui/PageHeader';
import { PageTransition } from '../components/Layout/PageTransition';
import { cn } from '../lib/utils';
import { showError } from '../lib/toast';
import { buildMonthGrid, toIso, buildMonthYearOptions } from '../lib/leaveDateUtils';
import { leaveService, LeaveRequest, Holiday } from '../services/leave.service';
import { VSelect, SelectOption } from '../components/forms/VSelect';

// Access: any logged-in user. Combines holidays with only the logged-in user's own leave
// (Pending + Approved — Rejected isn't "on leave") — never other employees' leave.
export default function CalendarPage() {
  const [viewMonth, setViewMonth] = useState(() => new Date());
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [myLeave, setMyLeave] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (month: Date) => {
    setLoading(true);
    try {
      const from = toIso(new Date(month.getFullYear(), month.getMonth(), 1));
      const to = toIso(new Date(month.getFullYear(), month.getMonth() + 1, 0));
      const [h, mine] = await Promise.all([
        leaveService.getHolidays(from, to),
        leaveService.getMyRequests(),
      ]);
      setHolidays(h);
      setMyLeave(mine.filter(r => r.status !== 'Rejected'));
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load calendar data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(viewMonth); }, [viewMonth, load]);

  // Closing the month picker on outside click — react-select's menu portals to document.body,
  // so this only needs to catch clicks on the closed control itself, not inside the open menu.
  useEffect(() => {
    if (!showMonthPicker) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setShowMonthPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMonthPicker]);

  // Past 3 years + all months of the current year, newest first.
  const monthOptions = useMemo<SelectOption[]>(() => buildMonthYearOptions(), []);

  const monthValue = `${viewMonth.getFullYear()}-${String(viewMonth.getMonth() + 1).padStart(2, '0')}`;
  const selectedMonthOption = monthOptions.find(o => o.value === monthValue) ?? null;

  const holidayByDate = new Map(holidays.map(h => [h.date.slice(0, 10), h]));
  const isOnLeave = (iso: string) => myLeave.some(r => iso >= r.startDate.slice(0, 10) && iso <= r.endDate.slice(0, 10));
  const grid = buildMonthGrid(viewMonth);
  const monthLabel = viewMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  return (
    <PageTransition>
      <div className="max-w-3xl mx-auto space-y-4">
        <PageHeader title="Calendar" description="Holidays and your own leave for the month." />

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Button size="sm" variant="outline" onClick={() => setViewMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}>
              ‹ Previous Month
            </Button>

            <div ref={pickerRef} className="relative">
              {showMonthPicker ? (
                <VSelect
                  options={monthOptions}
                  value={selectedMonthOption}
                  onChange={(opt) => {
                    if (opt) {
                      const [y, m] = String(opt.value).split('-').map(Number);
                      setViewMonth(new Date(y, m - 1, 1));
                    }
                    setShowMonthPicker(false);
                  }}
                  placeholder="Jump to month..."
                  size="sm"
                  className="w-52"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setShowMonthPicker(true)}
                  className="flex items-center gap-1 text-sm font-black uppercase tracking-widest text-gray-600 dark:text-gray-300 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors"
                >
                  {monthLabel}
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <Button size="sm" variant="outline" onClick={() => setViewMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}>
              Next Month ›
            </Button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
              <div key={d} className="text-[10px] font-black uppercase tracking-widest text-gray-400 py-1">{d}</div>
            ))}
            {grid.map((d, i) => {
              if (!d) return <div key={i} />;
              const iso = toIso(d);
              const entry = holidayByDate.get(iso);
              // A row in the Holidays table isn't automatically "a holiday" — it also carries
              // the auto-generated alternating-Saturday markers, and admins can override any
              // date to "WorkingDay" (no special meaning). Only dayType "Holiday" (a full day
              // off, whether a named holiday or a 1st/3rd/5th Saturday) is highlighted here.
              const isHoliday = entry?.dayType === 'Holiday';
              const onLeave = isOnLeave(iso);
              return (
                <div
                  key={i}
                  title={[isHoliday ? entry?.name : null, onLeave ? 'On leave' : null].filter(Boolean).join(' · ') || undefined}
                  className={cn(
                    'aspect-square rounded-lg border p-1.5 flex flex-col items-start justify-between text-[12px] font-bold overflow-hidden',
                    'border-gray-100 dark:border-gray-800 text-gray-600 dark:text-gray-300',
                    isHoliday && 'bg-rose-50/80 dark:bg-rose-900/20 border-rose-100 dark:border-rose-900/40',
                    onLeave && !isHoliday && 'bg-sky-50/80 dark:bg-sky-900/20 border-sky-100 dark:border-sky-900/40'
                  )}
                >
                  <span>{d.getDate()}</span>
                  {isHoliday && (
                    <span className="w-full text-[8px] font-bold leading-tight text-rose-600 dark:text-rose-300 truncate">
                      {entry?.name}
                    </span>
                  )}
                  <div className="flex gap-0.5">
                    {isHoliday && <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />}
                    {onLeave && <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-4 text-[10px] font-bold text-gray-500">
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-800" /> Holiday</span>
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-sky-50 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-800" /> Your Leave</span>
          </div>
          {!loading && holidays.length === 0 && myLeave.length === 0 && (
            <p className="text-[11px] text-gray-400 italic text-center py-2">No holidays or leave this month</p>
          )}
        </div>
      </div>
    </PageTransition>
  );
}
