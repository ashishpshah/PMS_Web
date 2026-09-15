// Shared date helpers for the Calendar/Holidays pages — small enough to not warrant per-page
// duplication, mirrors the existing lib/diaryDateUtils.ts convention for this kind of helper.

/** Builds a 6-row x 7-col month grid (Date | null, null = padding cell) for the given month. */
export function buildMonthGrid(viewMonth: Date): (Date | null)[] {
  const first = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
  const startWeekday = first.getDay();
  const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(viewMonth.getFullYear(), viewMonth.getMonth(), d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/** Local (not UTC) YYYY-MM-DD so date-only comparisons match the user's calendar day. */
export function toIso(d: Date): string {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Parse "YYYY-MM-DD" into a local midnight Date — NOT `new Date(iso)`, which JS reads as UTC
 * and can land on the previous local calendar day in a positive-offset timezone (e.g. IST).
 * Matches DateInput's own grid-cell construction so minDate comparisons stay correct. */
export function fromIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/** Local midnight for "today" — same rationale as fromIso. */
export function todayMidnight(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** "01-Jan-2026" — the Holiday List's display format. */
export function formatDMY(iso: string): string {
  const d = new Date(iso.slice(0, 10));
  const day = String(d.getDate()).padStart(2, '0');
  const month = d.toLocaleDateString('en-US', { month: 'short' });
  return `${day}-${month}-${d.getFullYear()}`;
}

/** "YYYY-MM" → Month options spanning the past 3 years plus every month of the current year,
 * newest first — shared by Calendar's month-jump picker and the Leaves table's month-year
 * filters so both offer the same range. */
export function buildMonthYearOptions(): { value: string; label: string }[] {
  const currentYear = new Date().getFullYear();
  const opts: { value: string; label: string }[] = [];
  for (let y = currentYear; y >= currentYear - 3; y--) {
    for (let m = 11; m >= 0; m--) {
      const d = new Date(y, m, 1);
      opts.push({
        value: `${y}-${String(m + 1).padStart(2, '0')}`,
        label: d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
      });
    }
  }
  return opts;
}
