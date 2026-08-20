using System;
using System.Threading;
using System.Threading.Tasks;
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
        private static readonly TimeSpan Interval = TimeSpan.FromHours(1);

        public TaskTemplateSchedulerService(
            IServiceScopeFactory scopeFactory,
            ILogger<TaskTemplateSchedulerService> logger)
        {
            _scopeFactory = scopeFactory;
            _logger       = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("TaskTemplateScheduler started.");

            // Run once at startup, then every hour
            while (!stoppingToken.IsCancellationRequested)
            {
                await RunAsync(stoppingToken);
                try { await Task.Delay(Interval, stoppingToken); }
                catch (OperationCanceledException) { break; }
            }

            _logger.LogInformation("TaskTemplateScheduler stopped.");
        }

        private async Task RunAsync(CancellationToken ct)
        {
            try
            {
                using var scope   = _scopeFactory.CreateScope();
                var service       = scope.ServiceProvider.GetRequiredService<ITaskTemplateService>();
                await service.ProcessScheduledGenerationsAsync();
                _logger.LogInformation("TaskTemplateScheduler: scheduled generation pass completed at {Time}.", AppClock.Now);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "TaskTemplateScheduler: error during generation pass.");
            }
        }
    }
}
