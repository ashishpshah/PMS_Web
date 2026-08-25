using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using TaskManagement.Data;
using TaskManagement.DTOs;
using AutoMapper;

namespace TaskManagement.Services
{
    public interface IRoleService
    {
        Task<ApiResponse<List<RoleDto>>> GetAllRolesAsync();
        Task<ApiResponse<RoleDto>> GetRoleByIdAsync(int id);
        Task<ApiResponse<RoleDto>> SaveRoleAsync(RoleDto roleDto);
        Task<ApiResponse<bool>> DeleteRoleAsync(int id);
    }

    public class RoleService : IRoleService
    {
        private readonly PMSDbContext _context;
        private readonly IMapper _mapper;

        public RoleService(PMSDbContext context, IMapper mapper)
        {
            _context = context;
            _mapper = mapper;
        }

        public async Task<ApiResponse<List<RoleDto>>> GetAllRolesAsync()
        {
            var roles = await _context.Roles.Where(r => r.Id > 1).ToListAsync();
            return new ApiResponse<List<RoleDto>> { Success = true, Data = _mapper.Map<List<RoleDto>>(roles) };
        }

        public async Task<ApiResponse<RoleDto>> GetRoleByIdAsync(int id)
        {
            var role = await _context.Roles.Where(r => r.Id > 1).FirstOrDefaultAsync(r => r.Id == id);
            if (role == null) return new ApiResponse<RoleDto> { Success = false, Message = "Role not found" };
            return new ApiResponse<RoleDto> { Success = true, Data = _mapper.Map<RoleDto>(role) };
        }

        public async Task<ApiResponse<RoleDto>> SaveRoleAsync(RoleDto roleDto)
        {
            var code = string.IsNullOrWhiteSpace(roleDto.Code) ? null : roleDto.Code.Trim();

            // Code must be unique (case-insensitive) across all roles, excluding self
            if (code != null)
            {
                var clash = await _context.Roles
                    .AnyAsync(r => r.Code != null && r.Code.ToLower() == code.ToLower() && r.Id != roleDto.Id);
                if (clash)
                    return new ApiResponse<RoleDto> { Success = false, Message = $"Role code '{code}' is already in use" };
            }

            if (roleDto.Id > 0)
            {
                var role = await _context.Roles.Where(r => r.Id > 1).FirstOrDefaultAsync(r => r.Id == roleDto.Id);
                if (role == null) return new ApiResponse<RoleDto> { Success = false, Message = "Role not found" };
                role.Name = roleDto.Name;
                role.Code = code;
                role.Level = roleDto.Level;
                role.Description = roleDto.Description;
                role.IsAdmin = roleDto.IsAdmin;
                role.IsActive = roleDto.IsActive;
                await _context.SaveChangesAsync();
                return new ApiResponse<RoleDto> { Success = true, Data = _mapper.Map<RoleDto>(role) };
            }
            else
            {
                var role = _mapper.Map<Role>(roleDto);
                role.Code = code;
                _context.Roles.Add(role);
                await _context.SaveChangesAsync();
                return new ApiResponse<RoleDto> { Success = true, Data = _mapper.Map<RoleDto>(role) };
            }
        }

        public async Task<ApiResponse<bool>> DeleteRoleAsync(int id)
        {
            var role = await _context.Roles.Where(r => r.Id > 1).FirstOrDefaultAsync(r => r.Id == id);
            if (role == null) return new ApiResponse<bool> { Success = false, Message = "Role not found" };

            _context.Roles.Remove(role);
            await _context.SaveChangesAsync();
            return new ApiResponse<bool> { Success = true, Data = true };
        }
    }
}
