using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TaskManagement.DTOs;
using TaskManagement.Services;
using TaskManagement.Data;
using Microsoft.EntityFrameworkCore;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using IAuthorizationService = TaskManagement.Services.IAuthorizationService;

namespace TaskManagement.Controllers
{
    [Authorize]
    [ApiController]
    [Route("api/[controller]")]
    public class UsersController : ControllerBase
    {
        private readonly IUserService _userService;
        private readonly IAuthorizationService _authService;
        private readonly PMSDbContext _context;
        private readonly IEmailService _email;

        public UsersController(IUserService userService, IAuthorizationService authService, PMSDbContext context, IEmailService email)
        {
            _userService = userService;
            _authService = authService;
            _context     = context;
            _email       = email;
        }

        [HttpGet]
        public async Task<ActionResult<ApiResponse<List<UserDto>>>> GetAll()
        {
            if (!await _authService.IsAdminAsync())
                return StatusCode(403, new ApiResponse<string> { Success = false, Message = "You do not have permission to view users" });
            var result = await _userService.GetAllUsersAsync();
            // Exclude SystemAdmin user (Id <= 1) from the management list
            if (result.Data != null)
            {
                result.Data = result.Data.Where(u => u.Id > 1).ToList();
            }
            return Ok(result);
        }

        // Assignable list is available to any authenticated user (needed for task/project dropdowns)
        [HttpGet("assignable")]
        public async Task<ActionResult<ApiResponse<List<UserDto>>>> GetAssignable()
        {
            var result = await _userService.GetAllUsersAsync();
            if (result.Data != null)
                result.Data = result.Data.Where(u => u.RoleId != 1 && u.IsActive && !u.IsDeleted).ToList();
            return Ok(result);
        }

        [HttpGet("{id}")]
        public async Task<ActionResult<ApiResponse<UserDto>>> GetById(int id)
        {
            // Disallow operations on the SystemAdmin user (id <= 1)
            if (id <= 1) return StatusCode(403, new ApiResponse<string> { Success = false, Message = "Operation not allowed on protected user" });
            var currentUserId = _authService.GetCurrentUserId();
            // Allow a user to view their own profile; otherwise require admin
            if (id != currentUserId && !await _authService.IsAdminAsync())
                return StatusCode(403, new ApiResponse<string> { Success = false, Message = "You do not have permission to view users" });
            var result = await _userService.GetUserByIdAsync(id);
            if (!result.Success) return NotFound(result);
            return Ok(result);
        }

        [HttpPost]
        public async Task<ActionResult<ApiResponse<UserDto>>> Create(CreateUserDto createUserDto)
        {
            if (!await _authService.IsAdminAsync())
                return StatusCode(403, new ApiResponse<string> { Success = false, Message = "You do not have permission to create users" });
            var result = await _userService.CreateUserAsync(createUserDto);
            if (!result.Success) return BadRequest(result);
            return CreatedAtAction(nameof(GetById), new { id = result.Data?.Id }, result);
        }

        [HttpPut("{id}")]
        public async Task<ActionResult<ApiResponse<UserDto>>> Update(int id, UpdateUserDto updateUserDto)
        {
            var currentUserId = _authService.GetCurrentUserId();
            // Regular users may only edit their own profile; admins may edit any user
            if (id != currentUserId && !await _authService.IsAdminAsync())
                return StatusCode(403, new ApiResponse<string> { Success = false, Message = "You do not have permission to update users" });
            var result = await _userService.UpdateUserAsync(id, updateUserDto);
            if (!result.Success) return NotFound(result);
            return Ok(result);
        }

        [HttpDelete("{id}")]
        public async Task<ActionResult<ApiResponse<bool>>> Delete(int id)
        {
            if (!await _authService.IsAdminAsync())
                return StatusCode(403, new ApiResponse<string> { Success = false, Message = "You do not have permission to delete users" });
            var result = await _userService.DeleteUserAsync(id);
            if (!result.Success) return NotFound(result);
            return Ok(result);
        }

        [HttpPatch("{id}/status")]
        public async Task<ActionResult<ApiResponse<UserDto>>> SetActive(int id, [FromBody] SetUserActiveDto dto)
        {
            if (id <= 1) return StatusCode(403, new ApiResponse<string> { Success = false, Message = "Operation not allowed on protected user" });
            if (!await _authService.IsAdminAsync())
                return StatusCode(403, new ApiResponse<string> { Success = false, Message = "You do not have permission to update users" });
            var result = await _userService.SetActiveAsync(id, dto.IsActive);
            return result.Success ? Ok(result) : BadRequest(result);
        }

        [HttpPut("{id}/reactivate")]
        public async Task<ActionResult<ApiResponse<UserDto>>> Reactivate(int id)
        {
            if (id <= 1) return StatusCode(403, new ApiResponse<string> { Success = false, Message = "Operation not allowed on protected user" });
            var currentUserId = _authService.GetCurrentUserId();
            var currentUser = await _context.Users.FirstOrDefaultAsync(u => u.Id == currentUserId);
            if (currentUser == null || currentUser.RoleId != 1)
                return StatusCode(403, new ApiResponse<string> { Success = false, Message = "Only System Admin can reactivate deleted users" });
            var result = await _userService.ReactivateAsync(id);
            return result.Success ? Ok(result) : BadRequest(result);
        }

        [HttpPost("{id}/reset-password")]
        public async Task<ActionResult<ApiResponse<string>>> ResetPassword(int id)
        {
            var currentUserId = _authService.GetCurrentUserId();
            var currentUser = await _context.Users
                .Include(u => u.Role)
                .FirstOrDefaultAsync(u => u.Id == currentUserId);

            if (currentUser == null || !(currentUser.RoleId == 1 || (currentUser.Role?.IsAdmin ?? false)))
                return StatusCode(403, new ApiResponse<string> { Success = false, Message = "Only SystemAdmin can reset user passwords" });

            // Cannot reset the SystemAdmin's own password via this endpoint
            if (id <= 1)
                return StatusCode(403, new ApiResponse<string> { Success = false, Message = "Operation not allowed on protected user" });

            var target = await _context.Users.FindAsync(id);
            if (target == null)
                return NotFound(new ApiResponse<string> { Success = false, Message = "User not found" });

            // Fixed reset password — every admin-triggered reset sets the same known value
            // (never returned in the API response).
            const string tempPassword = "Az@12345";

            target.PasswordHash = PasswordHasher.HashPassword(tempPassword);
            target.UpdatedAt    = AppClock.Now;
            await _context.SaveChangesAsync();

            // Deliver the reset password to the user's own email — never include it in the API response.
            try
            {
                var html = $@"<p>Hello {target.FirstName},</p>
<p>An administrator has reset your PMS account password.</p>
<p>Your temporary password is: <strong>{tempPassword}</strong></p>
<p>Please log in and change your password immediately.</p>";
                await _email.SendAsync(target.Email, "Your PMS password has been reset", html);
            }
            catch { /* email failure must not block the reset */ }

            return Ok(new ApiResponse<string> { Success = true, Message = $"Password for {target.FullName} has been reset. A temporary password has been sent to their email address." });
        }
    }
}
