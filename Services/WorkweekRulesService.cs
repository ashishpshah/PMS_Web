using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using TaskManagement.Data;
using TaskManagement.DTOs;

namespace TaskManagement.Services
{
    /// <summary>
    /// Editable workweek rules (working hours, break window, alternating-Saturday policy) for
    /// the Leave and Holidays module. Also exposes the shared Nth-Saturday-of-month primitive
    /// (<see cref="GetDayTypeAsync"/>) that <see cref="LeaveService"/> and <see cref="HolidayService"/>
    /// build on. NOTE: this deliberately does NOT replace the existing hardcoded copies in
    /// Services/WorkDiaryService.cs (IsWorkingDay) or ClientApp/src/lib/diaryDateUtils.ts —
    /// wiring those over to this service is explicitly deferred to a later phase.
    /// </summary>
    public interface IWorkweekRulesService
    {
        Task<WorkweekRulesDto> GetRulesAsync();
        Task<ApiResponse<WorkweekRulesDto>> UpdateRulesAsync(int updatedByUserId, UpdateWorkweekRulesDto dto);

        /// <summary>True unless the date resolves to "Holiday" (a full day off).</summary>
        Task<bool> IsWorkingDayAsync(DateTime date);

        /// <summary>"WorkingDay" | "Holiday" for the given date, honoring any manual/auto-generated
        /// Holiday row first, then falling back to the configured Sunday/Saturday-occurrence
        /// rules for dates with no row yet.</summary>
        Task<string> GetDayTypeAsync(DateTime date);
    }

    public class WorkweekRulesService : IWorkweekRulesService
    {
        private readonly PMSDbContext _context;

        public WorkweekRulesService(PMSDbContext context)
        {
            _context = context;
        }

        private async Task<WorkweekRules> GetOrCreateRulesEntityAsync()
        {
            var rules = await _context.WorkweekRules.OrderBy(w => w.Id).FirstOrDefaultAsync();
            if (rules != null) return rules;

            // Defensive fallback — DatabaseInitializer seeds this row on first run, but don't
            // assume it always ran (e.g. a DB restored from before this module existed).
            rules = new WorkweekRules();
            _context.WorkweekRules.Add(rules);
            await _context.SaveChangesAsync();
            return rules;
        }

        public async Task<WorkweekRulesDto> GetRulesAsync()
        {
            var rules = await GetOrCreateRulesEntityAsync();
            return ToDto(rules);
        }

        public async Task<ApiResponse<WorkweekRulesDto>> UpdateRulesAsync(int updatedByUserId, UpdateWorkweekRulesDto dto)
        {
            if (!TryParseTime(dto.WorkStartTime, out var start) || !TryParseTime(dto.WorkEndTime, out var end))
                return new ApiResponse<WorkweekRulesDto> { Success = false, Message = "Invalid working hours." };

            var rules = await GetOrCreateRulesEntityAsync();

            rules.WorkStartTime = start;
            rules.WorkEndTime = end;
            rules.BreakMinMinutes = dto.BreakMinMinutes;
            rules.BreakMaxMinutes = dto.BreakMaxMinutes;
            rules.HolidaySaturdayOccurrences = FormatIntList(dto.HolidaySaturdayOccurrences);
            rules.UpdatedAt = AppClock.Now;
            rules.UpdatedByUserId = updatedByUserId;

            // The Saturday pattern just changed. HolidayService.RegenerateSaturdayHolidaysAsync
            // never overwrites/removes an existing row — it's purely additive — so rows already
            // materialized under the OLD pattern would otherwise linger forever, and viewing ANY
            // month (past or future) would ADD rows for the newly-included occurrences on top of
            // them instead of replacing them, leaving old and new patterns mixed together.
            // Unlike admin-curated manual holidays (real named events, locked once past — see the
            // Holidays page's future-only edit rule), an auto-generated Saturday row is just a
            // cache of the pattern formula's output, not a historical record — so wipe EVERY
            // non-manual Saturday row, past or future, and let regeneration rebuild exactly the
            // current pattern wherever it's next queried.
            var staleAutoRows = await _context.Holidays
                .Where(h => !h.IsManualOverride)
                .ToListAsync();
            if (staleAutoRows.Count > 0) _context.Holidays.RemoveRange(staleAutoRows);

            await _context.SaveChangesAsync();

            return new ApiResponse<WorkweekRulesDto> { Success = true, Data = ToDto(rules) };
        }

        public async Task<bool> IsWorkingDayAsync(DateTime date) =>
            await GetDayTypeAsync(date) != "Holiday";

        public async Task<string> GetDayTypeAsync(DateTime date)
        {
            var d = date.Date;

            // A materialized Holiday row (auto-generated Saturday or admin override) always wins.
            var holiday = await _context.Holidays.FirstOrDefaultAsync(h => h.Date == d);
            if (holiday != null) return holiday.DayType;

            if (d.DayOfWeek == DayOfWeek.Sunday) return "Holiday";
            if (d.DayOfWeek != DayOfWeek.Saturday) return "WorkingDay";

            var rules = await GetOrCreateRulesEntityAsync();
            var occurrence = NthOccurrenceInMonth(d);
            if (ParseIntList(rules.HolidaySaturdayOccurrences).Contains(occurrence)) return "Holiday";
            // An occurrence not listed defaults to a normal full working day.
            return "WorkingDay";
        }

        /// <summary>Which occurrence (1st..5th) of its weekday this date is within its month.</summary>
        internal static int NthOccurrenceInMonth(DateTime date) => (int)Math.Ceiling(date.Day / 7.0);

        internal static List<int> ParseIntList(string? csv) =>
            string.IsNullOrWhiteSpace(csv) ? new()
            : csv.Split(',', StringSplitOptions.RemoveEmptyEntries)
                 .Select(s => int.TryParse(s.Trim(), out var n) ? n : (int?)null)
                 .Where(n => n.HasValue).Select(n => n!.Value).ToList();

        private static string FormatIntList(List<int>? list) =>
            list is null || list.Count == 0 ? string.Empty
            : string.Join(",", list.Distinct().OrderBy(x => x));

        internal static bool TryParseTime(string? s, out TimeSpan value)
        {
            if (TimeSpan.TryParseExact(s, "hh\\:mm", CultureInfo.InvariantCulture, out value)) return true;
            return TimeSpan.TryParse(s, CultureInfo.InvariantCulture, out value);
        }

        private static WorkweekRulesDto ToDto(WorkweekRules w) => new()
        {
            WorkStartTime = w.WorkStartTime.ToString(@"hh\:mm"),
            WorkEndTime = w.WorkEndTime.ToString(@"hh\:mm"),
            BreakMinMinutes = w.BreakMinMinutes,
            BreakMaxMinutes = w.BreakMaxMinutes,
            HolidaySaturdayOccurrences = ParseIntList(w.HolidaySaturdayOccurrences),
            UpdatedAt = w.UpdatedAt,
        };
    }
}
