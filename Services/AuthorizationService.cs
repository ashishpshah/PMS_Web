using System;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using TaskManagement.Data;

namespace TaskManagement.Services
{
    public interface IAuthorizationService
    {
        Task<bool> IsSystemAdminAsync();
        Task<bool> IsAdminAsync();
        int GetCurrentUserId();
        string? GetCurrentUserRole();
        Task<bool> CanViewAsync(string pageRoute);
        Task<bool> CanCreateAsync(string pageRoute);
        Task<bool> CanUpdateAsync(string pageRoute);
        Task<bool> CanDeleteAsync(string pageRoute);
    }

    public class AuthorizationService : IAuthorizationService
    {
        private readonly IHttpContextAccessor _httpContextAccessor;
        private readonly PMSDbContext _context;

        // Per-request caches — loaded once then reused within the same HTTP request.
        private User? _cachedUser;
        private bool _userLoaded;
        private bool _permissionsLoaded;
        // null = admin (all routes allowed); non-null = route → effective permission bitmap
        private Dictionary<string, int>? _routePermCache;

        public AuthorizationService(IHttpContextAccessor httpContextAccessor, PMSDbContext context)
        {
            _httpContextAccessor = httpContextAccessor;
            _context = context;
        }

        public int GetCurrentUserId()
        {
            var claim = _httpContextAccessor.HttpContext?.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            return int.TryParse(claim, out var id) ? id : 0;
        }

        public string? GetCurrentUserRole()
        {
            return _httpContextAccessor.HttpContext?.User.FindFirst(ClaimTypes.Role)?.Value
                ?? _httpContextAccessor.HttpContext?.User.FindFirst("role")?.Value;
        }

        private async Task<User?> GetCurrentUserAsync()
        {
            if (_userLoaded) return _cachedUser;
            _userLoaded = true;
            var userId = GetCurrentUserId();
            if (userId == 0) return _cachedUser = null;
            _cachedUser = await _context.Users.Include(u => u.Role).FirstOrDefaultAsync(u => u.Id == userId);
            return _cachedUser;
        }

        // Loads all page permissions for the current user in 3 bulk queries and caches them.
        // Per-request only (AddScoped) — never leaks across requests.
        private async Task EnsurePermissionsAsync(User user)
        {
            if (_permissionsLoaded) return;
            _permissionsLoaded = true;

            // Admins bypass the bitmap entirely — leave _routePermCache null as sentinel.
            if (user.RoleId == 1 || (user.Role?.IsAdmin ?? false)) return;

            var modules = await _context.PageModules.ToListAsync();

            var userPerms = await _context.UserPagePermissions
                .Where(up => up.UserId == user.Id)
                .ToDictionaryAsync(up => up.PageModuleId, up => up.Permissions);

            var rolePerms = await _context.RolePagePermissions
                .Where(rp => rp.RoleId == user.RoleId)
                .ToDictionaryAsync(rp => rp.PageModuleId, rp => rp.Permissions);

            _routePermCache = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            foreach (var m in modules)
            {
                var routeKey = NormalizeRoute(m.Route);
                // Priority: user override → role default → 1 (view-only, mirrors old behaviour when no perm configured)
                if (userPerms.TryGetValue(m.Id, out var up))
                    _routePermCache[routeKey] = up;
                else if (rolePerms.TryGetValue(m.Id, out var rp))
                    _routePermCache[routeKey] = rp;
                else
                    _routePermCache[routeKey] = 1;
            }
        }

        public async Task<bool> IsSystemAdminAsync()
        {
            var user = await GetCurrentUserAsync();
            return user?.RoleId == 1;
        }

        public async Task<bool> IsAdminAsync()
        {
            var user = await GetCurrentUserAsync();
            return user != null && (user.RoleId == 1 || (user.Role?.IsAdmin ?? false));
        }

        public async Task<bool> CanViewAsync(string pageRoute)
        {
            if (string.IsNullOrEmpty(pageRoute) || pageRoute.Equals("/", StringComparison.Ordinal)
                || pageRoute.Equals("dashboard", StringComparison.OrdinalIgnoreCase)) return true;

            var user = await GetCurrentUserAsync();
            if (user == null) return false;
            if (user.RoleId == 1 || (user.Role?.IsAdmin ?? false)) return true;

            await EnsurePermissionsAsync(user);
            var routeKey = NormalizeRoute(pageRoute);
            return _routePermCache != null
                && _routePermCache.TryGetValue(routeKey, out var perm)
                && (perm & 1) == 1;
        }

        public Task<bool> CanCreateAsync(string pageRoute) => HasPermissionAsync(pageRoute, 2);
        public Task<bool> CanUpdateAsync(string pageRoute) => HasPermissionAsync(pageRoute, 4);
        public Task<bool> CanDeleteAsync(string pageRoute) => HasPermissionAsync(pageRoute, 8);

        private async Task<bool> HasPermissionAsync(string pageRoute, int bit)
        {
            var user = await GetCurrentUserAsync();
            if (user == null) return false;
            if (user.RoleId == 1 || (user.Role?.IsAdmin ?? false)) return true;

            await EnsurePermissionsAsync(user);
            var routeKey = NormalizeRoute(pageRoute);
            return _routePermCache != null
                && _routePermCache.TryGetValue(routeKey, out var perm)
                && (perm & bit) == bit;
        }

        private static string NormalizeRoute(string route)
        {
            if (string.IsNullOrEmpty(route)) return "/";
            var normalized = route.Trim();
            if (!normalized.StartsWith("/")) normalized = "/" + normalized;
            return normalized;
        }

    }
}
