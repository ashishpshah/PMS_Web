using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using TaskManagement.Data;
using TaskManagement.DTOs;

namespace TaskManagement.Services
{
    public interface IHolidayService
    {
        Task<List<HolidayDto>> GetHolidaysAsync(DateTime from, DateTime to);

        /// <summary>Add/edit a holiday. Past dates are historical records — only today or a
        /// future date may be added or edited.</summary>
        Task<ApiResponse<HolidayDto>> SetOverrideAsync(int createdByUserId, SetHolidayOverrideDto dto);

        /// <summary>Only a holiday dated today or in the future may be deleted.</summary>
        Task<ApiResponse<bool>> DeleteAsync(int id);

        /// <summary>(Re)materializes Holiday rows for every Saturday in the range per the current
        /// WorkweekRules, skipping any date that already has a row (manual or previously
        /// generated) — regeneration must never clobber an existing row.</summary>
        Task RegenerateSaturdayHolidaysAsync(DateTime rangeStart, DateTime rangeEnd);
    }

    public class HolidayService : IHolidayService
    {
        private readonly PMSDbContext _context;
        private readonly IWorkweekRulesService _rules;

        public HolidayService(PMSDbContext context, IWorkweekRulesService rules)
        {
            _context = context;
            _rules = rules;
        }

        public async Task<List<HolidayDto>> GetHolidaysAsync(DateTime from, DateTime to)
        {
            await RegenerateSaturdayHolidaysAsync(from, to);

            var list = await _context.Holidays
                .Where(h => h.Date >= from.Date && h.Date <= to.Date)
                .OrderBy(h => h.Date)
                .ToListAsync();

            return list.Select(ToDto).ToList();
        }

        public async Task<ApiResponse<HolidayDto>> SetOverrideAsync(int createdByUserId, SetHolidayOverrideDto dto)
        {
            var date = dto.Date.Date;
            if (date < AppClock.Today)
                return new ApiResponse<HolidayDto> { Success = false, Message = "Past holidays are historical records and can no longer be added or edited — only future dates can be changed." };

            var entry = await _context.Holidays.FirstOrDefaultAsync(h => h.Date == date);

            if (entry == null)
            {
                entry = new Holiday { Date = date };
                _context.Holidays.Add(entry);
            }

            entry.Name = dto.Name;
            entry.DayType = dto.DayType;
            entry.IsManualOverride = true;
            entry.CreatedById = createdByUserId;
            entry.CreatedAt = AppClock.Now;

            await _context.SaveChangesAsync();

            return new ApiResponse<HolidayDto> { Success = true, Data = ToDto(entry) };
        }

        public async Task<ApiResponse<bool>> DeleteAsync(int id)
        {
            var entry = await _context.Holidays.FindAsync(id);
            if (entry == null) return ApiResponse<bool>.NotFound("Holiday not found.");
            if (entry.Date < AppClock.Today)
                return new ApiResponse<bool> { Success = false, Message = "Past holidays are historical records and can no longer be deleted — only future dates can be changed." };

            _context.Holidays.Remove(entry);
            await _context.SaveChangesAsync();

            return new ApiResponse<bool> { Success = true, Data = true };
        }

        public async Task RegenerateSaturdayHolidaysAsync(DateTime rangeStart, DateTime rangeEnd)
        {
            var start = rangeStart.Date;
            var end = rangeEnd.Date;
            if (end < start) return;

            var rules = await _rules.GetRulesAsync();
            var holidayOccurrences = rules.HolidaySaturdayOccurrences;

            var existingDates = (await _context.Holidays
                .Where(h => h.Date >= start && h.Date <= end)
                .Select(h => h.Date)
                .ToListAsync())
                .ToHashSet();

            var toAdd = new List<Holiday>();
            for (var d = start; d <= end; d = d.AddDays(1))
            {
                if (d.DayOfWeek != DayOfWeek.Saturday) continue;
                if (existingDates.Contains(d)) continue; // never overwrite an existing row

                var occurrence = WorkweekRulesService.NthOccurrenceInMonth(d);
                // An occurrence not in the Holiday list is a plain working day — nothing to materialize.
                if (!holidayOccurrences.Contains(occurrence)) continue;

                toAdd.Add(new Holiday
                {
                    Date = d,
                    Name = $"{Ordinal(occurrence)} Saturday",
                    DayType = "Holiday",
                    IsManualOverride = false,
                    CreatedById = null, // system-generated, no specific author
                    CreatedAt = AppClock.Now,
                });
            }

            if (toAdd.Count > 0)
            {
                _context.Holidays.AddRange(toAdd);
                await _context.SaveChangesAsync();
            }
        }

        private static string Ordinal(int n) => n switch
        {
            1 => "1st", 2 => "2nd", 3 => "3rd", 4 => "4th", 5 => "5th", _ => $"{n}th"
        };

        private static HolidayDto ToDto(Holiday h) => new()
        {
            Id = h.Id,
            Date = h.Date,
            Name = h.Name,
            DayType = h.DayType,
            IsManualOverride = h.IsManualOverride,
        };
    }
}
