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
    }
}
