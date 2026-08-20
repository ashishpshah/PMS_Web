using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;

namespace TaskManagement.Middleware
{
    /// <summary>
    /// Sliding-window rate limiter for auth endpoints.
    /// Allows up to <see cref="MaxAttempts"/> POST requests per IP per <see cref="Window"/>.
    /// </summary>
    public class LoginRateLimitMiddleware
    {
        private readonly RequestDelegate _next;
        private static readonly ConcurrentDictionary<string, Queue<DateTime>> _hits = new();
        private const int MaxAttempts = 5;
        private static readonly TimeSpan Window = TimeSpan.FromMinutes(1);

        public LoginRateLimitMiddleware(RequestDelegate next) => _next = next;

        public async Task InvokeAsync(HttpContext ctx)
        {
            if (ctx.Request.Method == HttpMethods.Post &&
                (ctx.Request.Path.StartsWithSegments("/api/auth/login")          ||
                 ctx.Request.Path.StartsWithSegments("/api/auth/refresh")         ||
                 ctx.Request.Path.StartsWithSegments("/api/auth/forgot-password") ||
                 ctx.Request.Path.StartsWithSegments("/api/auth/register/initiate")))
            {
                var ip  = ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown";
                var now = DateTime.UtcNow;

                var queue = _hits.GetOrAdd(ip, _ => new Queue<DateTime>());
                lock (queue)
                {
                    // Evict timestamps outside the sliding window
                    while (queue.Count > 0 && now - queue.Peek() > Window)
                        queue.Dequeue();

                    if (queue.Count >= MaxAttempts)
                    {
                        ctx.Response.StatusCode  = 429;
                        ctx.Response.ContentType = "application/json";
                        ctx.Response.WriteAsync("{\"success\":false,\"message\":\"Too many attempts. Please wait a minute and try again.\"}");
                        return;
                    }

                    queue.Enqueue(now);
                }
            }

            await _next(ctx);
        }
    }
}
