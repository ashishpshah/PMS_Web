using Microsoft.AspNetCore.SignalR;
using TaskManagement.Hubs;

namespace TaskManagement.Services
{
    public class NotificationDto
    {
        public string Title { get; set; } = string.Empty;
        public string Body { get; set; } = string.Empty;
        public string Type { get; set; } = "task";       // task | system
        public int? TaskId { get; set; }
        public DateTime Timestamp { get; set; } = AppClock.Now;
    }

    public interface INotificationService
    {
        // Pushes an in-app notification to a single user over the SignalR chat hub.
        Task NotifyUserAsync(int userId, NotificationDto notification);
        Task NotifyUsersAsync(IEnumerable<int> userIds, NotificationDto notification);
    }

    public class NotificationService : INotificationService
    {
        private readonly IHubContext<ChatHub> _hub;

        public NotificationService(IHubContext<ChatHub> hub)
        {
            _hub = hub;
        }

        public Task NotifyUserAsync(int userId, NotificationDto notification)
        {
            // SignalR's default user-id provider uses the NameIdentifier claim (= our user id).
            return _hub.Clients.User(userId.ToString()).SendAsync("ReceiveNotification", notification);
        }

        public Task NotifyUsersAsync(IEnumerable<int> userIds, NotificationDto notification)
        {
            // P4-F: fire all SignalR sends in parallel — they're independent network I/O
            var tasks = userIds.Distinct().Select(id => NotifyUserAsync(id, notification));
            return Task.WhenAll(tasks);
        }
    }
}
