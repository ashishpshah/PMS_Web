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
    public interface IUserService
    {
        Task<ApiResponse<List<UserDto>>> GetAllUsersAsync();
        Task<ApiResponse<UserDto>> GetUserByIdAsync(int id);
        Task<ApiResponse<UserDto>> CreateUserAsync(CreateUserDto createUserDto);
        Task<ApiResponse<UserDto>> UpdateUserAsync(int id, UpdateUserDto updateUserDto);
        Task<ApiResponse<bool>> DeleteUserAsync(int id);
        Task<ApiResponse<UserDto>> SetActiveAsync(int id, bool isActive);
        Task<ApiResponse<UserDto>> ReactivateAsync(int id);
    }

    public class UserService : IUserService
    {
        private readonly PMSDbContext _context;
        private readonly IMapper _mapper;

        public UserService(PMSDbContext context, IMapper mapper)
        {
            _context = context;
            _mapper = mapper;
        }

        // The single System Admin (RoleId 1) is the seeded account; no one else may hold it.
        private const int SystemAdminRoleId = 1;

        public async Task<ApiResponse<List<UserDto>>> GetAllUsersAsync()
        {
            var users = await _context.Users.Include(u => u.Role).ToListAsync();
            return new ApiResponse<List<UserDto>> { Success = true, Data = _mapper.Map<List<UserDto>>(users) };
        }

        public async Task<ApiResponse<UserDto>> GetUserByIdAsync(int id)
        {
            var user = await _context.Users.Include(u => u.Role).FirstOrDefaultAsync(u => u.Id == id);
            if (user == null) return new ApiResponse<UserDto> { Success = false, Message = "User not found" };
            return new ApiResponse<UserDto> { Success = true, Data = _mapper.Map<UserDto>(user) };
        }

        public async Task<ApiResponse<UserDto>> CreateUserAsync(CreateUserDto createUserDto)
        {
            var firstName = (createUserDto.FirstName ?? string.Empty).Trim();
            var lastName = (createUserDto.LastName ?? string.Empty).Trim();
            var email = (createUserDto.Email ?? string.Empty).Trim();

            if (string.IsNullOrWhiteSpace(firstName) || string.IsNullOrWhiteSpace(lastName))
                return new ApiResponse<UserDto> { Success = false, Message = "First name and last name are required." };
            if (string.IsNullOrWhiteSpace(email))
                return new ApiResponse<UserDto> { Success = false, Message = "Email is required." };
            if (string.IsNullOrWhiteSpace(createUserDto.Password) || createUserDto.Password.Length < 6)
                return new ApiResponse<UserDto> { Success = false, Message = "Password must be at least 6 characters." };

            var emailLower = email.ToLower();
            if (await _context.Users.AnyAsync(u => u.Email.ToLower() == emailLower))
                return new ApiResponse<UserDto> { Success = false, Message = "Email already exists." };

            // Auto-generate a unique username from the email prefix.
            var baseUsername = email.Split('@')[0].ToLower().Replace(".", "").Replace("+", "");
            if (string.IsNullOrWhiteSpace(baseUsername)) baseUsername = (firstName + lastName).ToLower();
            var userName = baseUsername;
            var unameLower = userName.ToLower();
            if (await _context.Users.AnyAsync(u => u.UserName.ToLower() == unameLower))
            {
                int suffix = 1;
                while (await _context.Users.AnyAsync(u => u.UserName.ToLower() == unameLower + suffix))
                    suffix++;
                userName = baseUsername + suffix;
            }

            // Guard: System Admin is a single, seeded account — cannot be assigned to others.
            if (createUserDto.RoleId == SystemAdminRoleId)
                return new ApiResponse<UserDto> { Success = false, Message = "The System Admin role cannot be assigned to additional users." };

            var user = _mapper.Map<User>(createUserDto);
            user.FirstName = firstName;
            user.LastName = lastName;
            user.UserName = userName;
            user.Email = email;
            user.FullName = $"{firstName} {lastName}".Trim();
            user.PasswordHash = PasswordHasher.HashPassword(createUserDto.Password);
            user.IsActive = createUserDto.IsActive;
            user.CreatedAt = AppClock.Now;

            _context.Users.Add(user);
            await _context.SaveChangesAsync();

            return await GetUserByIdAsync(user.Id);
        }

        public async Task<ApiResponse<UserDto>> UpdateUserAsync(int id, UpdateUserDto updateUserDto)
        {
            var user = await _context.Users.FindAsync(id);
            if (user == null) return new ApiResponse<UserDto> { Success = false, Message = "User not found" };

            // Guard: can't promote another user into System Admin (only the seeded admin keeps RoleId 1)
            if (updateUserDto.RoleId == SystemAdminRoleId && user.RoleId != SystemAdminRoleId)
                return new ApiResponse<UserDto> { Success = false, Message = "The System Admin role cannot be assigned to additional users." };

            var firstName = (updateUserDto.FirstName ?? string.Empty).Trim();
            var lastName = (updateUserDto.LastName ?? string.Empty).Trim();
            // Preserve existing username if not provided (username is no longer a user-facing field).
            var userName = string.IsNullOrWhiteSpace(updateUserDto.UserName) ? user.UserName : updateUserDto.UserName.Trim();
            var email = (updateUserDto.Email ?? string.Empty).Trim();

            if (string.IsNullOrWhiteSpace(firstName) || string.IsNullOrWhiteSpace(lastName))
                return new ApiResponse<UserDto> { Success = false, Message = "First name and last name are required." };
            if (string.IsNullOrWhiteSpace(email))
                return new ApiResponse<UserDto> { Success = false, Message = "Email is required." };

            var emailLower = email.ToLower();
            if (await _context.Users.AnyAsync(u => u.Id != id && u.Email.ToLower() == emailLower))
                return new ApiResponse<UserDto> { Success = false, Message = "Email already exists." };

            user.FirstName = firstName;
            user.LastName = lastName;
            user.UserName = userName;
            user.FullName = $"{firstName} {lastName}".Trim();
            user.Email = email;
            user.ContactNo = updateUserDto.ContactNo;
            user.ContactNoNormalized = string.IsNullOrWhiteSpace(updateUserDto.ContactNo)
                ? null
                : new string(updateUserDto.ContactNo.Where(char.IsDigit).ToArray());
            if (!string.IsNullOrEmpty(updateUserDto.AvatarUrl))
                user.AvatarUrl = updateUserDto.AvatarUrl;
            // Never move the seeded System Admin off RoleId 1; for others honor the requested role.
            if (user.RoleId != SystemAdminRoleId && updateUserDto.RoleId > 0)
                user.RoleId = updateUserDto.RoleId;
            user.IsActive = updateUserDto.IsActive;
            user.UpdatedAt = AppClock.Now;

            await _context.SaveChangesAsync();
            return await GetUserByIdAsync(id);
        }

        public async Task<ApiResponse<bool>> DeleteUserAsync(int id)
        {
            var user = await _context.Users.FindAsync(id);
            if (user == null) return new ApiResponse<bool> { Success = false, Message = "User not found" };

            user.IsDeleted = true;
            user.IsActive = false;
            user.UpdatedAt = AppClock.Now;

            // Revoke all active refresh tokens so the deleted account loses API access.
            var tokens = await _context.RefreshTokens
                .Where(r => r.UserId == id && !r.IsRevoked)
                .ToListAsync();
            foreach (var t in tokens) { t.IsRevoked = true; t.RevokedAt = AppClock.Now; }

            await _context.SaveChangesAsync();
            return new ApiResponse<bool> { Success = true, Data = true };
        }

        public async Task<ApiResponse<UserDto>> SetActiveAsync(int id, bool isActive)
        {
            var user = await _context.Users.FindAsync(id);
            if (user == null) return new ApiResponse<UserDto> { Success = false, Message = "User not found" };
            if (user.IsDeleted) return new ApiResponse<UserDto> { Success = false, Message = "Deleted users cannot be activated or deactivated. Use Reactivate instead." };

            user.IsActive = isActive;
            user.UpdatedAt = AppClock.Now;

            if (!isActive)
            {
                var tokens = await _context.RefreshTokens
                    .Where(r => r.UserId == id && !r.IsRevoked)
                    .ToListAsync();
                foreach (var t in tokens) { t.IsRevoked = true; t.RevokedAt = AppClock.Now; }
            }

            await _context.SaveChangesAsync();
            return await GetUserByIdAsync(id);
        }

        public async Task<ApiResponse<UserDto>> ReactivateAsync(int id)
        {
            var user = await _context.Users.FindAsync(id);
            if (user == null) return new ApiResponse<UserDto> { Success = false, Message = "User not found" };

            user.IsDeleted = false;
            user.IsActive = true;
            user.UpdatedAt = AppClock.Now;

            await _context.SaveChangesAsync();
            return await GetUserByIdAsync(id);
        }
    }
}
