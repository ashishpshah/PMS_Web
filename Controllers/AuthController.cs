using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TaskManagement.DTOs;
using TaskManagement.Services;
using System.Threading.Tasks;
using System.Linq;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using TaskManagement.Data;
using System.Security.Claims;

namespace TaskManagement.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AuthController : ControllerBase
    {
        private readonly IAuthService _authService;
        private readonly PMSDbContext _context;
        private readonly IOtpService  _otpService;
        private readonly IConfiguration _configuration;

        public AuthController(IAuthService authService, PMSDbContext context, IOtpService otpService, IConfiguration configuration)
        {
            _authService   = authService;
            _context       = context;
            _otpService    = otpService;
            _configuration = configuration;
        }

        [HttpPost("login")]
        [AllowAnonymous]
        public async Task<ActionResult<ApiResponse<LoginResponseDto>>> Login([FromBody] LoginDto loginDto)
        {
            var result = await _authService.LoginAsync(loginDto);
            if (!result.Success) return Unauthorized(result);
            SetRefreshCookie(result.Data?.RefreshToken);
            StripRefreshTokenFromBody(result);
            return Ok(result);
        }

        [HttpPost("register")]
        [AllowAnonymous]
        public async Task<ActionResult<ApiResponse<LoginResponseDto>>> Register([FromBody] RegisterDto registerDto)
        {
            var result = await _authService.RegisterAsync(registerDto);
            if (!result.Success) return BadRequest(result);
            SetRefreshCookie(result.Data?.RefreshToken);
            StripRefreshTokenFromBody(result);
            return Ok(result);
        }

        [HttpPost("refresh")]
        [AllowAnonymous]
        public async Task<ActionResult<ApiResponse<LoginResponseDto>>> Refresh(
            [FromBody(EmptyBodyBehavior = Microsoft.AspNetCore.Mvc.ModelBinding.EmptyBodyBehavior.Allow)] RefreshTokenRequestDto? dto)
        {
            // Accept refresh token from httpOnly cookie (preferred) or request body (fallback,
            // kept server-side for any non-browser caller — the frontend no longer sends this).
            var refreshToken = Request.Cookies["pms_rt"] ?? dto?.RefreshToken;
            if (string.IsNullOrWhiteSpace(refreshToken))
                return BadRequest(new ApiResponse<LoginResponseDto> { Success = false, Message = "Refresh token is required." });

            var result = await _authService.RefreshAsync(refreshToken);
            if (!result.Success) { ClearRefreshCookie(); return Unauthorized(result); }
            SetRefreshCookie(result.Data?.RefreshToken);
            StripRefreshTokenFromBody(result);
            return Ok(result);
        }

        [Authorize]
        [HttpPost("logout")]
        public async Task<ActionResult> Logout()
        {
            var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (int.TryParse(userIdClaim, out var userId))
                await _authService.RevokeAllAsync(userId);

            ClearRefreshCookie();
            return Ok(new ApiResponse<bool> { Success = true, Data = true });
        }

        private void SetRefreshCookie(string? token)
        {
            if (string.IsNullOrEmpty(token)) return;
            // Mirrors the DB-side refresh token expiry (AuthService.CreateRefreshTokenAsync)
            // instead of a hardcoded value, so the cookie never outlives (or expires long before)
            // the token it carries.
            var days = int.TryParse(_configuration["JwtSettings:RefreshExpiryDays"], out var d) ? d : 7;
            Response.Cookies.Append("pms_rt", token, new CookieOptions
            {
                HttpOnly = true,
                Secure   = Request.IsHttps,
                SameSite = SameSiteMode.Strict,
                MaxAge   = TimeSpan.FromDays(days),
                Path     = "/",
            });
        }

        private void ClearRefreshCookie() =>
            Response.Cookies.Delete("pms_rt", new CookieOptions { Path = "/api/auth" });

        // The refresh token is delivered to the browser solely via the httpOnly pms_rt cookie
        // (set just before this runs) — it must never also appear in the JSON response body,
        // or an XSS payload could read it straight out of the fetch() response like any other
        // JS-readable value. Clearing it here (rather than removing the DTO property) keeps
        // LoginResponseDto's shape stable for any other consumer.
        private static void StripRefreshTokenFromBody(ApiResponse<LoginResponseDto> result)
        {
            if (result.Data != null) result.Data.RefreshToken = string.Empty;
        }

        // ── OTP Register ──────────────────────────────────────────────────────

        [HttpPost("register/initiate")]
        [AllowAnonymous]
        public async Task<ActionResult<ApiResponse<bool>>> InitiateRegister([FromBody] InitiateRegisterDto dto)
        {
            var email = (dto.Email ?? string.Empty).Trim().ToLower();
            if (string.IsNullOrWhiteSpace(dto.FirstName) || string.IsNullOrWhiteSpace(dto.LastName))
                return BadRequest(new ApiResponse<bool> { Success = false, Message = "First name and last name are required." });
            if (string.IsNullOrWhiteSpace(email))
                return BadRequest(new ApiResponse<bool> { Success = false, Message = "Email is required." });
            if (string.IsNullOrWhiteSpace(dto.Password) || dto.Password.Length < 6)
                return BadRequest(new ApiResponse<bool> { Success = false, Message = "Password must be at least 6 characters." });
            if (!string.IsNullOrWhiteSpace(dto.UserName) && await _context.Users.AnyAsync(u => u.UserName.ToLower() == dto.UserName.ToLower()))
                return BadRequest(new ApiResponse<bool> { Success = false, Message = "Username already taken." });
            if (await _context.Users.AnyAsync(u => u.Email.ToLower() == email))
                return BadRequest(new ApiResponse<bool> { Success = false, Message = "Email already registered." });

            // Hash the password before persisting in the OTP payload — plain-text must never reach the DB.
            var safeDto = new InitiateRegisterDto
            {
                FirstName   = dto.FirstName,
                LastName    = dto.LastName,
                UserName    = dto.UserName,
                Email       = email,
                ContactNo   = dto.ContactNo,
                Password    = PasswordHasher.HashPassword(dto.Password),
                ForceResend = false,
            };
            var payload = JsonSerializer.Serialize(safeDto);
            var (sent, message) = await _otpService.GenerateAndSendAsync(email, "register", payload, dto.FirstName, dto.ForceResend);

            if (!sent)
                return BadRequest(new ApiResponse<bool> { Success = false, Message = message });

            return Ok(new ApiResponse<bool> { Success = true, Message = "OTP sent to your email address." });
        }

        [HttpPost("register/confirm")]
        [AllowAnonymous]
        public async Task<ActionResult<ApiResponse<LoginResponseDto>>> ConfirmRegister([FromBody] ConfirmOtpDto dto)
        {
            var email = (dto.Email ?? string.Empty).Trim().ToLower();
            var record = await _otpService.ValidateAndConsumeAsync(email, dto.OtpCode, "register");
            if (record == null)
                return BadRequest(new ApiResponse<LoginResponseDto> { Success = false, Message = "Invalid or expired OTP." });

            var pending = JsonSerializer.Deserialize<InitiateRegisterDto>(record.Payload ?? "{}");
            if (pending == null)
                return BadRequest(new ApiResponse<LoginResponseDto> { Success = false, Message = "Registration data not found. Please start over." });

            // Re-check uniqueness in case it was registered while OTP was pending
            if (await _context.Users.AnyAsync(u => u.Email.ToLower() == email))
                return BadRequest(new ApiResponse<LoginResponseDto> { Success = false, Message = "Email already registered." });

            var firstName = pending.FirstName.Trim();
            var lastName  = pending.LastName.Trim();

            // Resolve username
            var baseUsername = string.IsNullOrWhiteSpace(pending.UserName)
                ? email.Split('@')[0].ToLower().Replace(".", "").Replace("+", "")
                : pending.UserName.ToLower();
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
                return BadRequest(new ApiResponse<LoginResponseDto> { Success = false, Message = "No assignable role is configured. Contact an administrator." });

            var rawContactNo = string.IsNullOrWhiteSpace(pending.ContactNo) ? null : pending.ContactNo.Trim();
            var user = new User
            {
                FirstName           = firstName,
                LastName            = lastName,
                UserName            = userName,
                Email               = pending.Email.Trim(),
                FullName            = $"{firstName} {lastName}".Trim(),
                ContactNo           = rawContactNo,
                ContactNoNormalized = rawContactNo == null ? null : new string(rawContactNo.Where(char.IsDigit).ToArray()),
                // pending.Password is already a PBKDF2 hash stored in the OTP payload — assign directly.
                PasswordHash        = pending.Password,
                RoleId              = defaultRole.Id,
                IsActive            = true,
                CreatedAt           = AppClock.Now
            };

            _context.Users.Add(user);
            await _context.SaveChangesAsync();

            // Reload with Role navigation property for token generation, then issue JWT directly
            // (we can't call LoginAsync because the payload stores a hash, not the original password).
            await _context.Entry(user).Reference(u => u.Role).LoadAsync();
            var result = await _authService.IssueTokenAsync(user);
            if (result.Success)
            {
                SetRefreshCookie(result.Data?.RefreshToken);
                StripRefreshTokenFromBody(result);
            }
            return result.Success ? Ok(result) : BadRequest(result);
        }

        // ── Forgot / Reset Password ────────────────────────────────────────────

        [HttpPost("forgot-password")]
        [AllowAnonymous]
        public async Task<ActionResult<ApiResponse<bool>>> ForgotPassword([FromBody] ForgotPasswordDto dto)
        {
            var email = (dto.Email ?? string.Empty).Trim().ToLower();
            var user  = await _context.Users.FirstOrDefaultAsync(u => u.Email.ToLower() == email);

            if (user != null && user.IsActive)
            {
                var (sent, message) = await _otpService.GenerateAndSendAsync(email, "reset", recipientName: user.FirstName, forceResend: dto.ForceResend);
                if (!sent)
                    return BadRequest(new ApiResponse<bool> { Success = false, Message = message });
            }

            // Always return success to prevent email enumeration
            return Ok(new ApiResponse<bool> { Success = true, Message = "If that email is registered, a reset code has been sent." });
        }

        [HttpPost("reset-password")]
        [AllowAnonymous]
        public async Task<ActionResult<ApiResponse<bool>>> ResetPassword([FromBody] ResetPasswordDto dto)
        {
            var email = (dto.Email ?? string.Empty).Trim().ToLower();
            if (string.IsNullOrWhiteSpace(dto.NewPassword) || dto.NewPassword.Length < 6)
                return BadRequest(new ApiResponse<bool> { Success = false, Message = "Password must be at least 6 characters." });

            var record = await _otpService.ValidateAndConsumeAsync(email, dto.OtpCode, "reset");
            if (record == null)
                return BadRequest(new ApiResponse<bool> { Success = false, Message = "Invalid or expired OTP." });

            var user = await _context.Users.FirstOrDefaultAsync(u => u.Email.ToLower() == email);
            if (user == null || !user.IsActive)
                return BadRequest(new ApiResponse<bool> { Success = false, Message = "Account not found or inactive." });

            user.PasswordHash = PasswordHasher.HashPassword(dto.NewPassword);
            await _context.SaveChangesAsync();

            return Ok(new ApiResponse<bool> { Success = true, Message = "Password updated successfully.", Data = true });
        }

        // Authenticated self-service change — no OTP round-trip, since the caller already
        // proves identity via their current password (checked below) plus a valid JWT.
        [Authorize]
        [HttpPost("change-password")]
        public async Task<ActionResult<ApiResponse<bool>>> ChangePassword([FromBody] ChangePasswordDto dto)
        {
            var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (userIdClaim == null || !int.TryParse(userIdClaim, out var userId))
                return Unauthorized(new ApiResponse<bool> { Success = false, Message = "Invalid token" });

            var user = await _context.Users.FirstOrDefaultAsync(u => u.Id == userId);
            if (user == null || !user.IsActive)
                return BadRequest(new ApiResponse<bool> { Success = false, Message = "Account not found or inactive." });

            if (!PasswordHasher.VerifyPassword(dto.CurrentPassword, user.PasswordHash))
                return BadRequest(new ApiResponse<bool> { Success = false, Message = "Current password is incorrect." });

            user.PasswordHash = PasswordHasher.HashPassword(dto.NewPassword);
            user.UpdatedAt    = AppClock.Now;
            await _context.SaveChangesAsync();

            // Force other sessions/devices to re-authenticate with the new password.
            await _authService.RevokeAllAsync(userId);

            return Ok(new ApiResponse<bool> { Success = true, Message = "Password changed successfully.", Data = true });
        }

        [Authorize]
        [HttpGet("check-availability")]
        public async Task<ActionResult<ApiResponse<AvailabilityDto>>> CheckAvailability(
            [FromQuery] string? userName, [FromQuery] string? email, [FromQuery] int? excludeUserId)
        {
            var result = await _authService.CheckAvailabilityAsync(userName, email, excludeUserId);
            return Ok(new ApiResponse<AvailabilityDto> { Success = true, Data = result });
        }

        [Authorize]
        [HttpGet("validate")]
        public async Task<ActionResult<ApiResponse<UserDto>>> Validate()
        {
            var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (userIdClaim == null || !int.TryParse(userIdClaim, out var userId))
                return Unauthorized(new ApiResponse<UserDto> { Success = false, Message = "Invalid token" });

            var user = await _context.Users
                .Include(u => u.Role)
                .FirstOrDefaultAsync(u => u.Id == userId);

            if (user == null)
                return NotFound(new ApiResponse<UserDto> { Success = false, Message = "User not found" });

            if (!user.IsActive)
                return Unauthorized(new ApiResponse<UserDto> { Success = false, Message = "Account is inactive" });

            var userDto = new UserDto
            {
                Id       = user.Id,
                UserName = user.UserName,
                Email    = user.Email,
                FirstName = user.FirstName,
                LastName  = user.LastName,
                FullName  = user.FullName,
                RoleId    = user.RoleId,
                RoleName  = user.Role?.Name,
                IsAdmin   = user.RoleId == 1 || (user.Role?.IsAdmin ?? false),
                AvatarUrl = user.AvatarUrl,
                ContactNo = user.ContactNo,
                IsActive  = user.IsActive
            };

            // Restore impersonation state from JWT claim so the UI banner persists across page refresh
            var impByRaw = User.FindFirst("imp_by")?.Value;
            if (int.TryParse(impByRaw, out var adminId))
            {
                var admin = await _context.Users.FindAsync(adminId);
                userDto.IsImpersonated     = true;
                userDto.ImpersonatedByName = admin?.FullName;
            }

            return Ok(new ApiResponse<UserDto> { Success = true, Data = userDto });
        }
    }
}
