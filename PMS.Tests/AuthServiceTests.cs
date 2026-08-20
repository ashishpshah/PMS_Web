using System;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using TaskManagement.Data;
using TaskManagement.Services;
using Xunit;

namespace PMS.Tests
{
    public class AuthServiceTests : IDisposable
    {
        private readonly PMSDbContext _ctx;
        private readonly AuthService  _svc;

        public AuthServiceTests()
        {
            var opts = new DbContextOptionsBuilder<PMSDbContext>()
                .UseInMemoryDatabase(Guid.NewGuid().ToString())
                .Options;
            _ctx = new PMSDbContext(opts);

            var cfg = new ConfigurationBuilder()
                .AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["JwtSettings:Key"]             = "PMS_Test_Key_For_JWT_At_Least_32_Characters!",
                    ["JwtSettings:Issuer"]          = "PMS",
                    ["JwtSettings:Audience"]        = "PMS",
                    ["JwtSettings:ExpiryMinutes"]   = "15",
                    ["JwtSettings:RefreshExpiryDays"] = "7"
                })
                .Build();

            _svc = new AuthService(_ctx, cfg);
            Seed();
        }

        private void Seed()
        {
            var role = new Role { Id = 2, Name = "Developer", IsAdmin = false, Level = 5 };
            _ctx.Roles.Add(role);

            _ctx.Users.Add(new User
            {
                Id           = 10,
                UserName     = "devuser",
                Email        = "dev@test.com",
                FirstName    = "Dev",
                LastName     = "User",
                FullName     = "Dev User",
                PasswordHash = PasswordHasher.HashPassword("secret123"),
                RoleId       = 2,
                IsActive     = true,
                CreatedAt    = DateTime.UtcNow
            });
            _ctx.SaveChanges();
        }

        public void Dispose() => _ctx.Dispose();

        [Fact]
        public async Task Login_WithCorrectCredentials_ReturnsTokens()
        {
            var result = await _svc.LoginAsync(new LoginDto { UsernameOrEmail = "devuser", Password = "secret123" });

            Assert.True(result.Success, result.Message);
            Assert.NotEmpty(result.Data!.Token);
            Assert.NotEmpty(result.Data.RefreshToken);
            Assert.Equal("devuser", result.Data.User.UserName);
        }

        [Fact]
        public async Task Login_WithWrongPassword_Fails()
        {
            var result = await _svc.LoginAsync(new LoginDto { UsernameOrEmail = "devuser", Password = "wrong" });

            Assert.False(result.Success);
            Assert.Null(result.Data);
        }

        [Fact]
        public async Task Login_WithUnknownUser_Fails()
        {
            var result = await _svc.LoginAsync(new LoginDto { UsernameOrEmail = "nobody", Password = "secret123" });

            Assert.False(result.Success);
        }

        [Fact]
        public async Task Login_CaseSensitiveUsername_CorrectCase_Succeeds()
        {
            var result = await _svc.LoginAsync(new LoginDto { UsernameOrEmail = "devuser", Password = "secret123" });
            Assert.True(result.Success);
        }

        [Fact]
        public async Task Login_CaseSensitiveUsername_WrongCase_Fails()
        {
            var result = await _svc.LoginAsync(new LoginDto { UsernameOrEmail = "DevUser", Password = "secret123" });
            Assert.False(result.Success);
        }

        [Fact]
        public async Task Login_EmailCaseInsensitive_Succeeds()
        {
            var result = await _svc.LoginAsync(new LoginDto { UsernameOrEmail = "DEV@TEST.COM", Password = "secret123" });
            Assert.True(result.Success);
        }

        [Fact]
        public async Task Refresh_WithValidToken_ReturnsNewTokens()
        {
            var login = await _svc.LoginAsync(new LoginDto { UsernameOrEmail = "devuser", Password = "secret123" });
            var oldRefreshToken = login.Data!.RefreshToken;

            var refresh = await _svc.RefreshAsync(oldRefreshToken);

            Assert.True(refresh.Success, refresh.Message);
            Assert.NotEmpty(refresh.Data!.Token);
            Assert.NotEmpty(refresh.Data.RefreshToken);
            Assert.NotEqual(oldRefreshToken, refresh.Data.RefreshToken); // rotated
        }

        [Fact]
        public async Task Refresh_WithReusedToken_Fails()
        {
            var login = await _svc.LoginAsync(new LoginDto { UsernameOrEmail = "devuser", Password = "secret123" });
            var rt    = login.Data!.RefreshToken;

            await _svc.RefreshAsync(rt); // first use — rotates

            var second = await _svc.RefreshAsync(rt); // attempt replay
            Assert.False(second.Success);
        }

        [Fact]
        public async Task Refresh_WithBogusToken_Fails()
        {
            var result = await _svc.RefreshAsync("not-a-real-token");
            Assert.False(result.Success);
        }

        [Fact]
        public async Task RevokeAll_PreventsRefresh()
        {
            var login = await _svc.LoginAsync(new LoginDto { UsernameOrEmail = "devuser", Password = "secret123" });
            var rt    = login.Data!.RefreshToken;

            await _svc.RevokeAllAsync(10);

            var refresh = await _svc.RefreshAsync(rt);
            Assert.False(refresh.Success);
        }
    }
}
