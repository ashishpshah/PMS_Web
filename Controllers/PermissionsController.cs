using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TaskManagement.Data;
using TaskManagement.DTOs;
using TaskManagement.Services;
using IAuthorizationService = TaskManagement.Services.IAuthorizationService;

namespace TaskManagement.Controllers
{
    [Authorize]
    [ApiController]
    [Route("api/[controller]")]
    public class PermissionsController : ControllerBase
    {
        private readonly PMSDbContext _context;
        private readonly IAuthorizationService _authService;

        public PermissionsController(PMSDbContext context, IAuthorizationService authService)
        {
            _context = context;
            _authService = authService;
        }

        // Returns the current user's effective permissions for all pages
        // (role bitmap merged with user-level overrides). No SystemAdmin required.
        [HttpGet("my")]
        public async Task<IActionResult> GetMyPermissions()
        {
            var userId = _authService.GetCurrentUserId();
            if (userId <= 0)
                return Unauthorized();

            var user = await _context.Users.Include(u => u.Role).FirstOrDefaultAsync(u => u.Id == userId);
            if (user == null)
                return Unauthorized();

            var pages = await _context.PageModules.ToListAsync();

            // SystemAdmin (RoleId=1) or any IsAdmin role gets full access on all pages
            bool fullAccess = user.RoleId == 1 || (user.Role?.IsAdmin ?? false);

            if (fullAccess)
            {
                var fullResult = pages.Select(page =>
                    new { pageModuleId = page.Id, route = page.Route, permissions = 15 }
                ).ToList();
                return Ok(fullResult);
            }

            // Load all relevant permission rows up front — avoids concurrent DbContext queries inside Select
            var userPerms = await _context.UserPagePermissions
                .Where(up => up.UserId == userId)
                .ToListAsync();
            var rolePerms = await _context.RolePagePermissions
                .Where(rp => rp.RoleId == user.RoleId)
                .ToListAsync();

            var result = pages.Select(page =>
            {
                var userPerm = userPerms.FirstOrDefault(up => up.PageModuleId == page.Id);
                if (userPerm != null)
                    return new { pageModuleId = page.Id, route = page.Route, permissions = userPerm.Permissions };

                var rolePerm = rolePerms.FirstOrDefault(rp => rp.PageModuleId == page.Id);
                return new { pageModuleId = page.Id, route = page.Route, permissions = rolePerm?.Permissions ?? 0 };
            }).ToList();

            return Ok(result);
        }

        [HttpGet("pages")]
        public async Task<IActionResult> GetPageModules()
        {
            if (!await _authService.IsSystemAdminAsync())
                return StatusCode(403, new ApiResponse<string> { Success = false, Message = "You do not have permission to view page modules" });

            var pages = await _context.PageModules.ToListAsync();
            return Ok(pages);
        }

        [HttpGet("roles")]
        public async Task<IActionResult> GetRoles()
        {
            if (!await _authService.IsSystemAdminAsync())
                return StatusCode(403, new ApiResponse<string> { Success = false, Message = "You do not have permission to view roles" });

            var roles = await _context.Roles.ToListAsync();
            return Ok(roles);
        }

        [HttpGet("role/{roleId}")]
        public async Task<IActionResult> GetRolePermissions(int roleId)
        {
            if (!await _authService.IsSystemAdminAsync())
                return StatusCode(403, new ApiResponse<string> { Success = false, Message = "You do not have permission to view role permissions" });

            var permissions = await _context.RolePagePermissions
                .Include(rp => rp.PageModule)
                .Where(rp => rp.RoleId == roleId)
                .ToListAsync();

            return Ok(permissions);
        }

        [HttpPut("role/{roleId}")]
        public async Task<IActionResult> UpdateRolePermissions(int roleId, [FromBody] List<PermissionUpdateDto> updates)
        {
            if (!await _authService.IsSystemAdminAsync())
                return StatusCode(403, new ApiResponse<string> { Success = false, Message = "You do not have permission to update role permissions" });

            foreach (var update in updates)
            {
                var existing = await _context.RolePagePermissions
                    .FirstOrDefaultAsync(rp => rp.RoleId == roleId && rp.PageModuleId == update.PageModuleId);

                if (existing != null)
                {
                    existing.Permissions = update.Permissions;
                }
                else
                {
                    _context.RolePagePermissions.Add(new RolePagePermission
                    {
                        RoleId = roleId,
                        PageModuleId = update.PageModuleId,
                        Permissions = update.Permissions
                    });
                }
            }

            await _context.SaveChangesAsync();
            return Ok(new { message = "Permissions updated successfully" });
        }

        [HttpGet("user/{userId}")]
        public async Task<IActionResult> GetUserPermissions(int userId)
        {
            if (!await _authService.IsSystemAdminAsync())
                return StatusCode(403, new ApiResponse<string> { Success = false, Message = "You do not have permission to view user permissions" });

            var userPermissions = await _context.UserPagePermissions
                .Include(up => up.PageModule)
                .Where(up => up.UserId == userId)
                .ToListAsync();

            return Ok(userPermissions);
        }

        [HttpPut("user/{userId}")]
        public async Task<IActionResult> UpdateUserPermissions(int userId, [FromBody] List<PermissionUpdateDto> updates)
        {
            if (!await _authService.IsSystemAdminAsync())
                return StatusCode(403, new ApiResponse<string> { Success = false, Message = "You do not have permission to update user permissions" });

            // Remove existing user-specific permissions for this user
            var existingUserPerms = await _context.UserPagePermissions
                .Where(up => up.UserId == userId)
                .ToListAsync();
            _context.UserPagePermissions.RemoveRange(existingUserPerms);

            // Add new user-specific permissions (only non-zero ones)
            foreach (var update in updates.Where(u => u.Permissions > 0))
            {
                _context.UserPagePermissions.Add(new UserPagePermission
                {
                    UserId = userId,
                    PageModuleId = update.PageModuleId,
                    Permissions = update.Permissions
                });
            }

            await _context.SaveChangesAsync();
            return Ok(new { message = "User permissions updated successfully" });
        }

        [HttpDelete("user/{userId}")]
        public async Task<IActionResult> ClearUserPermissions(int userId)
        {
            if (!await _authService.IsSystemAdminAsync())
                return StatusCode(403, new ApiResponse<string> { Success = false, Message = "You do not have permission to clear user permissions" });

            var userPermissions = await _context.UserPagePermissions
                .Where(up => up.UserId == userId)
                .ToListAsync();

            _context.UserPagePermissions.RemoveRange(userPermissions);
            await _context.SaveChangesAsync();

            return Ok(new { message = "User permissions cleared" });
        }
    }

    public class PermissionUpdateDto
    {
        public int PageModuleId { get; set; }
        public int Permissions { get; set; }
    }
}
