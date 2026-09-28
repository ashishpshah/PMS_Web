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
            SafeLogInformation(_logger, "OtpCleanupService started.");

            while (!stoppingToken.IsCancellationRequested)
            {
                await CleanupAsync(stoppingToken);
                try { await Task.Delay(Interval, stoppingToken); }
                catch (OperationCanceledException) { break; }
            }

            SafeLogInformation(_logger, "OtpCleanupService stopped.");
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
                    SafeLogInformation(_logger, "OtpCleanup: removed {Count} stale OTP records.", stale.Count);
                }
            }
            catch (Exception ex)
            {
                SafeLogError(_logger, ex, "OtpCleanup: error during cleanup pass.");
            }
        }

        private static void SafeLogInformation(ILogger logger, string message, params object[] args)
        {
            try { logger.LogInformation(message, args); }
            catch (ObjectDisposedException) { /* logger disposed during shutdown */ }
        }

        private static void SafeLogError(ILogger logger, Exception ex, string message, params object[] args)
        {
            try { logger.LogError(ex, message, args); }
            catch (ObjectDisposedException) { /* logger disposed during shutdown */ }
        }
    }
}
