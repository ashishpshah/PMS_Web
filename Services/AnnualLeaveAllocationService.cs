using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using TaskManagement.Data;
using TaskManagement.DTOs;

namespace TaskManagement.Services
{
    /// <summary>
    /// One global row per calendar year: how many leave days every employee gets that year,
    /// pooled across all leave types (not per-type — see LeaveType, which is now a pure label).
    /// Only the current year's row is ever editable; past years are a locked historical record.
    /// </summary>
    public interface IAnnualLeaveAllocationService
    {
        Task<List<AnnualLeaveAllocationDto>> GetAllAsync();
        Task<ApiResponse<AnnualLeaveAllocationDto>> UpdateCurrentYearAsync(UpdateAnnualLeaveAllocationDto dto);

        /// <summary>Get-or-create (default 12 days) the allocation for a given year — used by
        /// LeaveService's balance math so a request against any year always resolves cleanly.</summary>
        Task<decimal> GetLeaveDaysForYearAsync(int year);
    }

    public class AnnualLeaveAllocationService : IAnnualLeaveAllocationService
    {
        private const decimal DefaultLeaveDays = 12;

        private readonly PMSDbContext _context;

        public AnnualLeaveAllocationService(PMSDbContext context)
        {
            _context = context;
        }

        private async Task<AnnualLeaveAllocation> GetOrCreateAsync(int year)
        {
            var row = await _context.AnnualLeaveAllocations.FirstOrDefaultAsync(a => a.Year == year);
            if (row != null) return row;

            row = new AnnualLeaveAllocation { Year = year, LeaveDays = DefaultLeaveDays };
            _context.AnnualLeaveAllocations.Add(row);
            await _context.SaveChangesAsync();
            return row;
        }

        public async Task<List<AnnualLeaveAllocationDto>> GetAllAsync()
        {
            // Ensure the current year always has a row before listing, so the table never shows
            // a gap for "this year".
            await GetOrCreateAsync(AppClock.Today.Year);

            var rows = await _context.AnnualLeaveAllocations.OrderByDescending(a => a.Year).ToListAsync();
            return rows.Select(ToDto).ToList();
        }

        public async Task<ApiResponse<AnnualLeaveAllocationDto>> UpdateCurrentYearAsync(UpdateAnnualLeaveAllocationDto dto)
        {
            var row = await GetOrCreateAsync(AppClock.Today.Year);
            row.LeaveDays = dto.LeaveDays;
            await _context.SaveChangesAsync();

            return new ApiResponse<AnnualLeaveAllocationDto> { Success = true, Data = ToDto(row) };
        }

        public async Task<decimal> GetLeaveDaysForYearAsync(int year)
        {
            var row = await GetOrCreateAsync(year);
            return row.LeaveDays;
        }

        private static AnnualLeaveAllocationDto ToDto(AnnualLeaveAllocation a) => new()
        {
            Year = a.Year,
            LeaveDays = a.LeaveDays,
        };
    }
}
