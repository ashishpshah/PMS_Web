using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace TaskManagement.Services
{
    /// <summary>
    /// Runs once per hour and triggers scheduled task template generation.
    /// </summary>
    public class TaskTemplateSchedulerService : BackgroundService
    {
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly ILogger<TaskTemplateSchedulerService> _logger;
        private readonly IConfiguration _configuration;
        private static readonly TimeSpan Interval = TimeSpan.FromHours(1);

        public TaskTemplateSchedulerService(
            IServiceScopeFactory scopeFactory,
            ILogger<TaskTemplateSchedulerService> logger,
            IConfiguration configuration)
        {
            _scopeFactory = scopeFactory;
            _logger       = logger;
            _configuration = configuration;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            var enabled = _configuration.GetValue("TaskTemplateScheduler", true);
            if (!enabled)
            {
                SafeLogInformation(_logger, "TaskTemplateScheduler is disabled via configuration. Skipping execution.");
                return;
            }

            SafeLogInformation(_logger, "TaskTemplateScheduler started.");

            // Run once at startup, then every hour
            while (!stoppingToken.IsCancellationRequested)
            {
                await RunAsync(stoppingToken);
                try { await Task.Delay(Interval, stoppingToken); }
                catch (OperationCanceledException) { break; }
            }

            SafeLogInformation(_logger, "TaskTemplateScheduler stopped.");
        }

        private static void SafeLogInformation(ILogger logger, string message, params object[] args)
        {
            try { logger.LogInformation(message, args); }
            catch (ObjectDisposedException) { /* logger disposed during shutdown */ }
        }

        private async Task RunAsync(CancellationToken ct)
        {
            try
            {
                using var scope   = _scopeFactory.CreateScope();
                var service       = scope.ServiceProvider.GetRequiredService<ITaskTemplateService>();
                await service.ProcessScheduledGenerationsAsync();
                SafeLogInformation(_logger, "TaskTemplateScheduler: scheduled generation pass completed at {Time}.", AppClock.Now);
            }
            catch (Exception ex)
            {
                SafeLogError(_logger, ex, "TaskTemplateScheduler: error during generation pass.");
            }
        }

        private static void SafeLogError(ILogger logger, Exception ex, string message, params object[] args)
        {
            try { logger.LogError(ex, message, args); }
            catch (ObjectDisposedException) { /* logger disposed during shutdown */ }
        }
    }
}
