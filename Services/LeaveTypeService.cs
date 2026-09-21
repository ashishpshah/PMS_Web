using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using TaskManagement.Data;
using TaskManagement.DTOs;

namespace TaskManagement.Services
{
    public interface ILeaveTypeService
    {
        Task<List<LeaveTypeDto>> GetAllAsync();
        Task<ApiResponse<List<LeaveTypeDto>>> SearchAsync(int page = 1, int pageSize = 25, string? search = null);
        Task<ApiResponse<LeaveTypeDto>> CreateAsync(SaveLeaveTypeDto dto);
        Task<ApiResponse<LeaveTypeDto>> UpdateAsync(int id, SaveLeaveTypeDto dto);
        Task<ApiResponse<bool>> DeleteAsync(int id);
    }

    public class LeaveTypeService : ILeaveTypeService
    {
        private readonly PMSDbContext _context;

        public LeaveTypeService(PMSDbContext context)
        {
            _context = context;
        }

        public async Task<List<LeaveTypeDto>> GetAllAsync()
        {
            var types = await _context.LeaveTypes.OrderBy(t => t.Name).ToListAsync();
            return types.Select(ToDto).ToList();
        }

        public async Task<ApiResponse<LeaveTypeDto>> CreateAsync(SaveLeaveTypeDto dto)
        {
            var nameLower = dto.Name.Trim().ToLower();
            if (await _context.LeaveTypes.AnyAsync(t => t.Name.ToLower() == nameLower))
                return new ApiResponse<LeaveTypeDto> { Success = false, Message = "A leave type with this name already exists." };

            var type = new LeaveType { Name = dto.Name.Trim(), IsActive = dto.IsActive };
            _context.LeaveTypes.Add(type);
            await _context.SaveChangesAsync();

            return new ApiResponse<LeaveTypeDto> { Success = true, Data = ToDto(type) };
        }

        public async Task<ApiResponse<LeaveTypeDto>> UpdateAsync(int id, SaveLeaveTypeDto dto)
        {
            var type = await _context.LeaveTypes.FindAsync(id);
            if (type == null) return ApiResponse<LeaveTypeDto>.NotFound("Leave type not found.");

            var nameLower = dto.Name.Trim().ToLower();
            if (await _context.LeaveTypes.AnyAsync(t => t.Id != id && t.Name.ToLower() == nameLower))
                return new ApiResponse<LeaveTypeDto> { Success = false, Message = "A leave type with this name already exists." };

            type.Name = dto.Name.Trim();
            type.IsActive = dto.IsActive;
            await _context.SaveChangesAsync();

            return new ApiResponse<LeaveTypeDto> { Success = true, Data = ToDto(type) };
        }

        public async Task<ApiResponse<bool>> DeleteAsync(int id)
        {
            var type = await _context.LeaveTypes.FindAsync(id);
            if (type == null) return ApiResponse<bool>.NotFound("Leave type not found.");

            if (await _context.LeaveRequests.AnyAsync(r => r.LeaveTypeId == id))
                return new ApiResponse<bool> { Success = false, Message = "Cannot delete a leave type that has leave requests against it." };

            _context.LeaveTypes.Remove(type);
            await _context.SaveChangesAsync();

            return new ApiResponse<bool> { Success = true, Data = true };
        }

        private static LeaveTypeDto ToDto(LeaveType t) => new()
        {
            Id = t.Id,
            Name = t.Name,
            IsActive = t.IsActive,
        };

        public async Task<ApiResponse<List<LeaveTypeDto>>> SearchAsync(int page = 1, int pageSize = 25, string? search = null)
        {
            pageSize = Math.Clamp(pageSize, 1, 100);
            page = Math.Max(1, page);

            var query = _context.LeaveTypes.Where(t => t.IsActive).AsQueryable();

            if (!string.IsNullOrWhiteSpace(search))
            {
                var term = search.Trim().ToLower();
                query = query.Where(t => t.Name.ToLower().Contains(term));
            }

            var totalCount = await query.CountAsync();
            var totalPages = totalCount == 0 ? 1 : (int)Math.Ceiling((double)totalCount / pageSize);

            var types = await query
                .OrderBy(t => t.Name)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .ToListAsync();

            return new ApiResponse<List<LeaveTypeDto>>
            {
                Success = true,
                Data = types.Select(ToDto).ToList(),
                TotalCount = totalCount,
                Page = page,
                PageSize = pageSize,
                TotalPages = totalPages
            };
        }
    }
}
