using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using TaskManagement.Data;

namespace TaskManagement.Services
{
    public class OtpCleanupService : BackgroundService
    {
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly ILogger<OtpCleanupService> _logger;
        private static readonly TimeSpan Interval = TimeSpan.FromHours(6);

        public OtpCleanupService(IServiceScopeFactory scopeFactory, ILogger<OtpCleanupService> logger)
        {
            _scopeFactory = scopeFactory;
            _logger       = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                await CleanupAsync(stoppingToken);
                try { await Task.Delay(Interval, stoppingToken); }
                catch (OperationCanceledException) { break; }
            }
        }

        private async Task CleanupAsync(CancellationToken ct)
        {
            try
            {
                using var scope   = _scopeFactory.CreateScope();
                var context       = scope.ServiceProvider.GetRequiredService<PMSDbContext>();
                var cutoff        = AppClock.Now.AddDays(-7);

                var stale = await context.EmailOtps
                    .Where(o => o.IsUsed || o.ExpiresAt < cutoff)
                    .ToListAsync(ct);

                if (stale.Count > 0)
                {
                    context.EmailOtps.RemoveRange(stale);
                    await context.SaveChangesAsync(ct);
                    _logger.LogInformation("OtpCleanup: removed {Count} stale OTP records.", stale.Count);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "OtpCleanup: error during cleanup pass.");
            }
        }
    }
}
