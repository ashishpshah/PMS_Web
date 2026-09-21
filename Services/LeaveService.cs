using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using TaskManagement.Data;
using TaskManagement.DTOs;

namespace TaskManagement.Services
{
    public interface ILeaveService
    {
        // Lets the "New Leave Request" form show the day count live as the user picks dates,
        // without duplicating the Holiday/WorkingDay day-type math on the frontend —
        // reuses the exact same ComputeDayCountAsync that RequestAsync/UpdateAsync save with,
        // so the preview can never drift from what actually gets persisted.
        Task<ApiResponse<decimal>> PreviewDayCountAsync(DateTime start, DateTime end);
        Task<ApiResponse<LeaveRequestDto>> RequestAsync(int userId, CreateLeaveRequestDto dto);
        Task<ApiResponse<LeaveRequestDto>> UpdateAsync(int userId, int requestId, UpdateLeaveRequestDto dto);
        Task<ApiResponse<List<LeaveRequestDto>>> GetMyRequestsAsync(int userId, int page = 1, int pageSize = 25);
        Task<ApiResponse<List<LeaveRequestDto>>> GetAllRequestsAsync(int? filterUserId, string? filterStatus, int page = 1, int pageSize = 25);
        Task<ApiResponse<LeaveRequestDto>> DecideAsync(int approverId, int requestId, DecideLeaveRequestDto dto);
        Task<ApiResponse<bool>> DeleteAsync(int userId, int requestId);
        Task<ApiResponse<LeaveRequestDto>> SetPermissionsAsync(int requestId, SetLeaveRequestPermissionsDto dto);
        Task<ApiResponse<LeaveBalanceDto>> GetMyBalanceAsync(int userId);
    }

    public class LeaveService : ILeaveService
    {
        // Sane cap on a single request's span so a fat-fingered range doesn't silently succeed.
        private const int MaxRequestSpanDays = 90;

        private readonly PMSDbContext _context;
        private readonly IWorkweekRulesService _rules;
        private readonly IAnnualLeaveAllocationService _allocations;

        public LeaveService(PMSDbContext context, IWorkweekRulesService rules, IAnnualLeaveAllocationService allocations)
        {
            _context = context;
            _rules = rules;
            _allocations = allocations;
        }

        // Sum of "day contribution" (0 / 1) for each date in [start, end] inclusive, driven by
        // IWorkweekRulesService.GetDayTypeAsync so an off Saturday and any Holiday-table row
        // (including admin-added named holidays) are both accounted for.
        private async Task<decimal> ComputeDayCountAsync(DateTime start, DateTime end)
        {
            decimal total = 0;
            for (var d = start.Date; d <= end.Date; d = d.AddDays(1))
            {
                var dayType = await _rules.GetDayTypeAsync(d);
                total += dayType == "Holiday" ? 0m : 1m;
            }
            return total;
        }

        // Shared by RequestAsync (create) and UpdateAsync (edit) — excludeRequestId lets an edit's
        // overlap check ignore the very request being edited.
        private async Task<(bool Ok, string? Error, decimal DayCount, LeaveType? LeaveType)> ValidateAndComputeAsync(
            int userId, int leaveTypeId, DateTime start, DateTime end, int? excludeRequestId)
        {
            if ((end - start).TotalDays > MaxRequestSpanDays)
                return (false, $"Leave range cannot exceed {MaxRequestSpanDays} days.", 0, null);

            var today = AppClock.Today;
            if (start < today)
                return (false, "Leave cannot be requested for a past date — only today or a future date is allowed.", 0, null);

            var leaveType = await _context.LeaveTypes.FindAsync(leaveTypeId);
            if (leaveType == null)
                return (false, "Invalid leave type.", 0, null);

            var overlapQuery = _context.LeaveRequests.Where(r =>
                r.UserId == userId &&
                (r.Status == "Pending" || r.Status == "Approved") &&
                r.StartDate <= end && r.EndDate >= start);
            if (excludeRequestId.HasValue) overlapQuery = overlapQuery.Where(r => r.Id != excludeRequestId.Value);
            if (await overlapQuery.AnyAsync())
                return (false, "This range overlaps an existing pending or approved leave request.", 0, null);

            var dayCount = await ComputeDayCountAsync(start, end);
            if (dayCount <= 0)
                return (false, "The selected range contains no working days.", 0, null);

            // No balance gate here by design — a user may still submit a request after their
            // annual allocation is fully used (or already exceeded); the balance is informational
            // (surfaced via GetMyBalanceAsync) and it's the approver's call whether to approve a
            // request that runs over.
            return (true, null, dayCount, leaveType);
        }

        public async Task<ApiResponse<decimal>> PreviewDayCountAsync(DateTime start, DateTime end)
        {
            var s = start.Date;
            var e = end.Date;

            if (e < s)
                return new ApiResponse<decimal> { Success = false, Message = "End date must be on or after the start date." };
            if ((e - s).TotalDays > MaxRequestSpanDays)
                return new ApiResponse<decimal> { Success = false, Message = $"Leave range cannot exceed {MaxRequestSpanDays} days." };

            return new ApiResponse<decimal> { Success = true, Data = await ComputeDayCountAsync(s, e) };
        }

        public async Task<ApiResponse<LeaveRequestDto>> RequestAsync(int userId, CreateLeaveRequestDto dto)
        {
            // ValidationFilter/CreateLeaveRequestDtoValidator already guarantee StartDate/EndDate
            // are non-null and EndDate >= StartDate by the time this runs.
            var start = dto.StartDate!.Value.Date;
            var end = dto.EndDate!.Value.Date;

            var (ok, error, dayCount, leaveType) = await ValidateAndComputeAsync(userId, dto.LeaveTypeId, start, end, excludeRequestId: null);
            if (!ok) return new ApiResponse<LeaveRequestDto> { Success = false, Message = error };

            var request = new LeaveRequest
            {
                UserId = userId,
                LeaveTypeId = leaveType!.Id,
                StartDate = start,
                EndDate = end,
                DayCount = dayCount,
                Reason = dto.Reason.Trim(),
                Status = "Pending",
                CreatedAt = AppClock.Now,
            };
            _context.LeaveRequests.Add(request);
            await _context.SaveChangesAsync();

            await _context.Entry(request).Reference(r => r.User).LoadAsync();
            request.LeaveType = leaveType;

            return new ApiResponse<LeaveRequestDto> { Success = true, Data = ToDto(request) };
        }

        public async Task<ApiResponse<LeaveRequestDto>> UpdateAsync(int userId, int requestId, UpdateLeaveRequestDto dto)
        {
            var request = await _context.LeaveRequests
                .Include(r => r.User).Include(r => r.LeaveType)
                .FirstOrDefaultAsync(r => r.Id == requestId && r.UserId == userId);
            if (request == null) return ApiResponse<LeaveRequestDto>.NotFound("Leave request not found.");

            if (request.Status != "Pending")
                return new ApiResponse<LeaveRequestDto> { Success = false, Message = "Only pending requests can be edited." };
            if (!request.AllowEdit)
                return new ApiResponse<LeaveRequestDto> { Success = false, Message = "Editing has been disabled for this request by an admin." };

            var start = dto.StartDate!.Value.Date;
            var end = dto.EndDate!.Value.Date;

            var (ok, error, dayCount, leaveType) = await ValidateAndComputeAsync(userId, dto.LeaveTypeId, start, end, excludeRequestId: requestId);
            if (!ok) return new ApiResponse<LeaveRequestDto> { Success = false, Message = error };

            request.LeaveTypeId = leaveType!.Id;
            request.LeaveType = leaveType;
            request.StartDate = start;
            request.EndDate = end;
            request.DayCount = dayCount;
            request.Reason = dto.Reason.Trim();
            await _context.SaveChangesAsync();

            return new ApiResponse<LeaveRequestDto> { Success = true, Data = ToDto(request) };
        }

        public async Task<ApiResponse<List<LeaveRequestDto>>> GetMyRequestsAsync(int userId, int page = 1, int pageSize = 25)
        {
            pageSize = Math.Clamp(pageSize, 1, 100);
            page = Math.Max(1, page);

            var query = _context.LeaveRequests
                .Include(r => r.User).Include(r => r.LeaveType).Include(r => r.Approver)
                .Where(r => r.UserId == userId)
                .OrderByDescending(r => r.CreatedAt);

            var totalCount = await query.CountAsync();
            var totalPages = totalCount == 0 ? 1 : (int)Math.Ceiling((double)totalCount / pageSize);

            var list = await query
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .ToListAsync();

            return new ApiResponse<List<LeaveRequestDto>>
            {
                Success = true,
                Data = list.Select(ToDto).ToList(),
                TotalCount = totalCount,
                Page = page,
                PageSize = pageSize,
                TotalPages = totalPages
            };
        }

        public async Task<ApiResponse<List<LeaveRequestDto>>> GetAllRequestsAsync(int? filterUserId, string? filterStatus, int page = 1, int pageSize = 25)
        {
            pageSize = Math.Clamp(pageSize, 1, 100);
            page = Math.Max(1, page);

            var query = _context.LeaveRequests
                .Include(r => r.User).Include(r => r.LeaveType).Include(r => r.Approver)
                .AsQueryable();

            if (filterUserId.HasValue) query = query.Where(r => r.UserId == filterUserId.Value);
            if (!string.IsNullOrWhiteSpace(filterStatus)) query = query.Where(r => r.Status == filterStatus);

            var totalCount = await query.CountAsync();
            var totalPages = totalCount == 0 ? 1 : (int)Math.Ceiling((double)totalCount / pageSize);

            var list = await query
                .OrderByDescending(r => r.CreatedAt)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .ToListAsync();

            return new ApiResponse<List<LeaveRequestDto>>
            {
                Success = true,
                Data = list.Select(ToDto).ToList(),
                TotalCount = totalCount,
                Page = page,
                PageSize = pageSize,
                TotalPages = totalPages
            };
        }

        public async Task<ApiResponse<LeaveRequestDto>> DecideAsync(int approverId, int requestId, DecideLeaveRequestDto dto)
        {
            var request = await _context.LeaveRequests
                .Include(r => r.User).Include(r => r.LeaveType)
                .FirstOrDefaultAsync(r => r.Id == requestId);
            if (request == null) return ApiResponse<LeaveRequestDto>.NotFound("Leave request not found.");

            if (request.Status != "Pending")
                return new ApiResponse<LeaveRequestDto> { Success = false, Message = $"This request has already been {request.Status.ToLower()}." };

            request.Status = dto.Approve ? "Approved" : "Rejected";
            request.ApproverId = approverId;
            request.DecisionAt = AppClock.Now;
            request.DecisionNote = dto.DecisionNote?.Trim();
            await _context.SaveChangesAsync();

            await _context.Entry(request).Reference(r => r.Approver).LoadAsync();

            return new ApiResponse<LeaveRequestDto> { Success = true, Data = ToDto(request) };
        }

        public async Task<ApiResponse<bool>> DeleteAsync(int userId, int requestId)
        {
            var request = await _context.LeaveRequests.FirstOrDefaultAsync(r => r.Id == requestId && r.UserId == userId);
            if (request == null) return ApiResponse<bool>.NotFound("Leave request not found.");

            if (request.Status != "Pending")
                return new ApiResponse<bool> { Success = false, Message = "Only pending requests can be deleted." };
            if (!request.AllowDelete)
                return new ApiResponse<bool> { Success = false, Message = "Deleting has been disabled for this request by an admin." };

            _context.LeaveRequests.Remove(request);
            await _context.SaveChangesAsync();

            return new ApiResponse<bool> { Success = true, Data = true };
        }

        public async Task<ApiResponse<LeaveRequestDto>> SetPermissionsAsync(int requestId, SetLeaveRequestPermissionsDto dto)
        {
            var request = await _context.LeaveRequests
                .Include(r => r.User).Include(r => r.LeaveType).Include(r => r.Approver)
                .FirstOrDefaultAsync(r => r.Id == requestId);
            if (request == null) return ApiResponse<LeaveRequestDto>.NotFound("Leave request not found.");

            if (request.Status != "Pending")
                return new ApiResponse<LeaveRequestDto> { Success = false, Message = "Edit/delete permissions can only be changed while a request is pending." };

            request.AllowEdit = dto.AllowEdit;
            request.AllowDelete = dto.AllowDelete;
            await _context.SaveChangesAsync();

            return new ApiResponse<LeaveRequestDto> { Success = true, Data = ToDto(request) };
        }

        public async Task<ApiResponse<LeaveBalanceDto>> GetMyBalanceAsync(int userId)
        {
            var year = AppClock.Today.Year;
            var allocated = await _allocations.GetLeaveDaysForYearAsync(year);
            var used = await GetUsedDaysAsync(userId, year);

            return new ApiResponse<LeaveBalanceDto>
            {
                Success = true,
                Data = new LeaveBalanceDto
                {
                    Year = year,
                    AllocatedDays = allocated,
                    UsedDays = used,
                    AvailableDays = allocated - used,
                }
            };
        }

        // Sum of Approved requests' DayCount for a user in a given year, across every leave type
        // (the pooled allocation doesn't distinguish by type).
        private async Task<decimal> GetUsedDaysAsync(int userId, int year, int? excludeRequestId = null)
        {
            var query = _context.LeaveRequests
                .Where(r => r.UserId == userId && r.Status == "Approved" && r.StartDate.Year == year);
            if (excludeRequestId.HasValue) query = query.Where(r => r.Id != excludeRequestId.Value);
            return await query.SumAsync(r => (decimal?)r.DayCount) ?? 0m;
        }

        private static LeaveRequestDto ToDto(LeaveRequest r) => new()
        {
            Id = r.Id,
            UserId = r.UserId,
            UserFullName = r.User?.FullName ?? string.Empty,
            UserAvatarUrl = r.User?.AvatarUrl,
            LeaveTypeId = r.LeaveTypeId,
            LeaveTypeName = r.LeaveType?.Name ?? string.Empty,
            StartDate = r.StartDate,
            EndDate = r.EndDate,
            DayCount = r.DayCount,
            Reason = r.Reason,
            Status = r.Status,
            ApproverId = r.ApproverId,
            ApproverName = r.Approver?.FullName,
            DecisionAt = r.DecisionAt,
            DecisionNote = r.DecisionNote,
            AllowEdit = r.AllowEdit,
            AllowDelete = r.AllowDelete,
            CreatedAt = r.CreatedAt,
        };
    }
}
