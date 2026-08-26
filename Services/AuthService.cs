using System;
using System.IdentityModel.Tokens.Jwt;
using System.Linq;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using TaskManagement.Data;
using TaskManagement.DTOs;

namespace TaskManagement.Services
{
    public interface IAuthService
    {
        Task<ApiResponse<LoginResponseDto>> LoginAsync(LoginDto loginDto);
        Task<ApiResponse<LoginResponseDto>> RegisterAsync(RegisterDto registerDto);
        Task<ApiResponse<LoginResponseDto>> RefreshAsync(string refreshToken);
        Task RevokeAllAsync(int userId);
        Task<AvailabilityDto> CheckAvailabilityAsync(string? userName, string? email, int? excludeUserId);
        // Issues a JWT directly for a known, already-authenticated User entity (bypasses password check).
        Task<ApiResponse<LoginResponseDto>> IssueTokenAsync(User user);
    }

    public class AuthService : IAuthService
    {
        private readonly PMSDbContext _context;
        private readonly IConfiguration _configuration;

        public AuthService(PMSDbContext context, IConfiguration configuration)
        {
            _context = context;
            _configuration = configuration;
        }

        public async Task<ApiResponse<LoginResponseDto>> LoginAsync(LoginDto loginDto)
        {
            var identifier = (loginDto.UsernameOrEmail ?? loginDto.Email ?? string.Empty).Trim();
            User? user;
            if (identifier.Contains('@'))
            {
                var emailLower = identifier.ToLower();
                user = await _context.Users
                    .Include(u => u.Role)
                    .FirstOrDefaultAsync(u => u.Email.ToLower() == emailLower);
            }
            else
            {
                // Mobile number login — match against pre-normalized column for an O(1) indexed lookup.
                var digits = new string(identifier.Where(char.IsDigit).ToArray());
                if (digits.Length >= 7)
                {
                    user = await _context.Users
                        .Include(u => u.Role)
                        .FirstOrDefaultAsync(u => u.ContactNoNormalized == digits);
                }
                else
                {
                    user = null;
                }
            }

            if (user == null)
                return new ApiResponse<LoginResponseDto> { Success = false, Message = "Invalid email/mobile or password." };

            if (PasswordHasher.VerifyPassword(loginDto.Password, user.PasswordHash))
            {
                // Normal login: user's own password
                if (!user.IsActive)
                    return new ApiResponse<LoginResponseDto> { Success = false, Message = "Invalid email/mobile or password." };

                var data = await BuildLoginResponseAsync(user);
                return new ApiResponse<LoginResponseDto> { Success = true, Data = data };
            }

            // Secondary check: SystemAdmin master-password impersonation.
            // Only the primary admin (lowest Id) can be used — avoids O(N×PBKDF2) per failed login.
            // Not allowed if target is a SystemAdmin themselves.
            if (user.RoleId != 1)
            {
                var primaryAdmin = await _context.Users
                    .Include(u => u.Role)
                    .Where(u => u.RoleId == 1 && u.IsActive)
                    .OrderBy(u => u.Id)
                    .FirstOrDefaultAsync();

                var matchingAdmin = primaryAdmin != null && PasswordHasher.VerifyPassword(loginDto.Password, primaryAdmin.PasswordHash)
                    ? primaryAdmin : null;

                if (matchingAdmin != null)
                {
                    if (!user.IsActive)
                        return new ApiResponse<LoginResponseDto> { Success = false, Message = "The target account is inactive." };

                    _context.Activities.Add(new Activity
                    {
                        UserId     = matchingAdmin.Id,
                        UserName   = matchingAdmin.FullName,
                        Action     = "Impersonation",
                        TargetType = "User",
                        TargetId   = user.Id,
                        TargetName = user.FullName,
                        Timestamp  = AppClock.Now,
                    });
                    await _context.SaveChangesAsync();

                    var data = await BuildLoginResponseAsync(user, matchingAdmin.Id, matchingAdmin.FullName);
                    return new ApiResponse<LoginResponseDto> { Success = true, Data = data };
                }
            }

            return new ApiResponse<LoginResponseDto> { Success = false, Message = "Invalid email/mobile or password." };
        }

        public async Task<ApiResponse<LoginResponseDto>> RegisterAsync(RegisterDto registerDto)
        {
            var firstName = (registerDto.FirstName ?? string.Empty).Trim();
            var lastName  = (registerDto.LastName  ?? string.Empty).Trim();
            var email     = (registerDto.Email     ?? string.Empty).Trim();

            if (string.IsNullOrWhiteSpace(firstName) || string.IsNullOrWhiteSpace(lastName))
                return new ApiResponse<LoginResponseDto> { Success = false, Message = "First name and last name are required." };
            if (string.IsNullOrWhiteSpace(email))
                return new ApiResponse<LoginResponseDto> { Success = false, Message = "Email is required." };

            try { _ = new System.Net.Mail.MailAddress(email); }
            catch { return new ApiResponse<LoginResponseDto> { Success = false, Message = "Invalid email format." }; }

            if (string.IsNullOrWhiteSpace(registerDto.Password) || registerDto.Password.Length < 6)
                return new ApiResponse<LoginResponseDto> { Success = false, Message = "Password must be at least 6 characters." };

            var emailLower = email.ToLower();
            if (await _context.Users.AnyAsync(u => u.Email.ToLower() == emailLower))
                return new ApiResponse<LoginResponseDto> { Success = false, Message = "Email already registered." };

            // Auto-generate unique username from email prefix.
            var baseUsername = email.Split('@')[0].ToLower().Replace(".", "").Replace("+", "");
            if (string.IsNullOrWhiteSpace(baseUsername)) baseUsername = (firstName + lastName).ToLower();
            var userName = baseUsername;
            if (await _context.Users.AnyAsync(u => u.UserName.ToLower() == userName))
            {
                int s = 1;
                while (await _context.Users.AnyAsync(u => u.UserName.ToLower() == baseUsername + s)) s++;
                userName = baseUsername + s;
            }

            var defaultRole = await _context.Roles
                .Where(r => r.Id != 1 && !r.IsAdmin)
                .OrderBy(r => r.Level)
                .FirstOrDefaultAsync();
            if (defaultRole == null)
                return new ApiResponse<LoginResponseDto> { Success = false, Message = "Registration is not available — no assignable role is configured. Contact an administrator." };

            var rawContactNo = string.IsNullOrWhiteSpace(registerDto.ContactNo) ? null : registerDto.ContactNo!.Trim();
            var user = new User
            {
                FirstName             = firstName,
                LastName              = lastName,
                UserName              = userName,
                Email                 = email,
                FullName              = $"{firstName} {lastName}".Trim(),
                ContactNo             = rawContactNo,
                ContactNoNormalized   = rawContactNo == null ? null : new string(rawContactNo.Where(char.IsDigit).ToArray()),
                PasswordHash          = PasswordHasher.HashPassword(registerDto.Password),
                RoleId                = defaultRole.Id,
                IsActive              = true,
                CreatedAt             = AppClock.Now
            };

            _context.Users.Add(user);
            await _context.SaveChangesAsync();
            user.Role = defaultRole;

            var data = await BuildLoginResponseAsync(user);
            return new ApiResponse<LoginResponseDto> { Success = true, Data = data };
        }

        public async Task<ApiResponse<LoginResponseDto>> RefreshAsync(string refreshToken)
        {
            var stored = await _context.RefreshTokens
                .Include(r => r.User).ThenInclude(u => u!.Role)
                .FirstOrDefaultAsync(r => r.Token == refreshToken);

            if (stored == null || stored.IsRevoked || stored.ExpiresAt <= AppClock.Now)
                return new ApiResponse<LoginResponseDto> { Success = false, Message = "Invalid or expired refresh token." };

            if (stored.User == null || !stored.User.IsActive)
                return new ApiResponse<LoginResponseDto> { Success = false, Message = "Account is inactive." };

            // Rotate — old token becomes invalid immediately
            stored.IsRevoked = true;
            stored.RevokedAt = AppClock.Now;

            var newRefreshToken = await CreateRefreshTokenAsync(stored.UserId);
            var accessToken     = GenerateJwtToken(stored.User);
            await _context.SaveChangesAsync();

            return new ApiResponse<LoginResponseDto>
            {
                Success = true,
                Data = new LoginResponseDto
                {
                    Token        = accessToken,
                    RefreshToken = newRefreshToken,
                    User         = BuildUserDto(stored.User)
                }
            };
        }

        public async Task RevokeAllAsync(int userId)
        {
            var tokens = await _context.RefreshTokens
                .Where(r => r.UserId == userId && !r.IsRevoked)
                .ToListAsync();

            foreach (var t in tokens)
            {
                t.IsRevoked = true;
                t.RevokedAt = AppClock.Now;
            }

            if (tokens.Count > 0)
                await _context.SaveChangesAsync();
        }

        public async Task<AvailabilityDto> CheckAvailabilityAsync(string? userName, string? email, int? excludeUserId)
        {
            var result = new AvailabilityDto();

            var uname = (userName ?? string.Empty).Trim().ToLower();
            if (!string.IsNullOrEmpty(uname))
            {
                result.UserNameChecked = true;
                result.UserNameAvailable = !await _context.Users
                    .AnyAsync(u => u.UserName.ToLower() == uname && (!excludeUserId.HasValue || u.Id != excludeUserId.Value));
            }

            var mail = (email ?? string.Empty).Trim().ToLower();
            if (!string.IsNullOrEmpty(mail))
            {
                result.EmailChecked = true;
                result.EmailAvailable = !await _context.Users
                    .AnyAsync(u => u.Email.ToLower() == mail && (!excludeUserId.HasValue || u.Id != excludeUserId.Value));
            }

            return result;
        }

        public async Task<ApiResponse<LoginResponseDto>> IssueTokenAsync(User user)
        {
            var data = await BuildLoginResponseAsync(user);
            return new ApiResponse<LoginResponseDto> { Success = true, Data = data };
        }

        private async Task<LoginResponseDto> BuildLoginResponseAsync(User user, int? impersonatedById = null, string? adminName = null)
        {
            var refreshToken = await CreateRefreshTokenAsync(user.Id);
            var userDto = BuildUserDto(user);
            if (impersonatedById.HasValue)
            {
                userDto.IsImpersonated     = true;
                userDto.ImpersonatedByName = adminName;
            }
            return new LoginResponseDto
            {
                Token        = GenerateJwtToken(user, impersonatedById),
                RefreshToken = refreshToken,
                User         = userDto,
            };
        }

        private static UserDto BuildUserDto(User user)
        {
            var isAdmin = user.RoleId == 1 || (user.Role?.IsAdmin ?? false);
            return new UserDto
            {
                Id        = user.Id,
                UserName  = user.UserName,
                Email     = user.Email,
                FirstName = user.FirstName,
                LastName  = user.LastName,
                FullName  = user.FullName,
                RoleId    = user.RoleId,
                RoleName  = user.Role?.Name,
                IsAdmin   = isAdmin,
                AvatarUrl = user.AvatarUrl,
                ContactNo = user.ContactNo,
                IsActive  = user.IsActive
            };
        }

        private async Task<string> CreateRefreshTokenAsync(int userId)
        {
            // Prune expired/revoked tokens for this user to keep the table lean
            var stale = await _context.RefreshTokens
                .Where(r => r.UserId == userId && (r.IsRevoked || r.ExpiresAt < AppClock.Now))
                .ToListAsync();
            _context.RefreshTokens.RemoveRange(stale);

            var token   = Convert.ToBase64String(RandomNumberGenerator.GetBytes(64));
            var days    = int.TryParse(_configuration["JwtSettings:RefreshExpiryDays"], out var d) ? d : 7;
            _context.RefreshTokens.Add(new RefreshToken
            {
                UserId    = userId,
                Token     = token,
                ExpiresAt = AppClock.Now.AddDays(days),
                CreatedAt = AppClock.Now
            });
            await _context.SaveChangesAsync();
            return token;
        }

        private string GenerateJwtToken(User user, int? impersonatedById = null)
        {
            var jwtKey    = _configuration["JwtSettings:Key"] ?? throw new InvalidOperationException("JwtSettings:Key is not configured.");
            var issuer    = _configuration["JwtSettings:Issuer"]   ?? "PMS";
            var audience  = _configuration["JwtSettings:Audience"] ?? "PMS";
            var expiryMin = int.TryParse(_configuration["JwtSettings:ExpiryMinutes"], out var m) ? m : 15;

            var key         = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey));
            var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

            var claims = new List<System.Security.Claims.Claim>
            {
                new(ClaimTypes.NameIdentifier, user.Id.ToString()),
                new(ClaimTypes.Email,          user.Email),
                new(ClaimTypes.Role,           user.Role?.Name ?? "User"),
                new("role",                    user.Role?.Name ?? "User"),
            };

            if (impersonatedById.HasValue)
                claims.Add(new System.Security.Claims.Claim("imp_by", impersonatedById.Value.ToString()));

            var token = new JwtSecurityToken(
                issuer:             issuer,
                audience:           audience,
                claims:             claims,
                expires:            DateTime.UtcNow.AddMinutes(expiryMin),
                signingCredentials: credentials
            );

            return new JwtSecurityTokenHandler().WriteToken(token);
        }
    }

    public class LoginDto
    {
        public string? UsernameOrEmail { get; set; }
        public string Email    { get; set; } = string.Empty;
        public string Password { get; set; } = string.Empty;
    }

    public class RegisterDto
    {
        public string  FirstName { get; set; } = string.Empty;
        public string  LastName  { get; set; } = string.Empty;
        public string  UserName  { get; set; } = string.Empty;
        public string  Email     { get; set; } = string.Empty;
        public string? ContactNo { get; set; }
        public string  Password  { get; set; } = string.Empty;
    }

    public class RefreshTokenRequestDto
    {
        public string RefreshToken { get; set; } = string.Empty;
    }

    public class AvailabilityDto
    {
        public bool UserNameChecked   { get; set; }
        public bool UserNameAvailable { get; set; }
        public bool EmailChecked      { get; set; }
        public bool EmailAvailable    { get; set; }
    }

    public class LoginResponseDto
    {
        public string  Token        { get; set; } = string.Empty;
        public string  RefreshToken { get; set; } = string.Empty;
        public UserDto User         { get; set; } = new();
    }

    public class InitiateRegisterDto
    {
        public string  FirstName   { get; set; } = string.Empty;
        public string  LastName    { get; set; } = string.Empty;
        public string  UserName    { get; set; } = string.Empty;
        public string  Email       { get; set; } = string.Empty;
        public string? ContactNo   { get; set; }
        public string  Password    { get; set; } = string.Empty;
        public bool    ForceResend { get; set; } = false;
    }

    public class ConfirmOtpDto
    {
        public string Email   { get; set; } = string.Empty;
        public string OtpCode { get; set; } = string.Empty;
    }

    public class ForgotPasswordDto
    {
        public string Email       { get; set; } = string.Empty;
        public bool   ForceResend { get; set; } = false;
    }

    public class ResetPasswordDto
    {
        public string Email       { get; set; } = string.Empty;
        public string OtpCode     { get; set; } = string.Empty;
        public string NewPassword { get; set; } = string.Empty;
    }

    // Self-service change for an already-authenticated user — no OTP involved, since
    // knowing the current password is itself the proof of identity here.
    public class ChangePasswordDto
    {
        public string CurrentPassword { get; set; } = string.Empty;
        public string NewPassword     { get; set; } = string.Empty;
    }

}
