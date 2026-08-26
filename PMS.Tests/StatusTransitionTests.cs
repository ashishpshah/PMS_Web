using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using AutoMapper;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Moq;
using TaskManagement.Data;
using TaskManagement.DTOs;
using TaskManagement.Mappings;
using TaskManagement.Services;
using Xunit;

namespace PMS.Tests
{
    /// <summary>
    /// Tests the TaskService status machine through the public ChangeStatusAsync API,
    /// using an EF Core in-memory database.
    /// </summary>
    public class StatusTransitionTests : IDisposable
    {
        private readonly PMSDbContext _ctx;
        private readonly TaskService  _svc;

        private int _userId;
        private int _taskId;

        public StatusTransitionTests()
        {
            var opts = new DbContextOptionsBuilder<PMSDbContext>()
                .UseInMemoryDatabase(Guid.NewGuid().ToString())
                // In-memory provider silently ignores transactions; suppress the warning so tests pass.
                .ConfigureWarnings(w => w.Ignore(InMemoryEventId.TransactionIgnoredWarning))
                .Options;
            _ctx = new PMSDbContext(opts);

            var mapperCfg = new MapperConfiguration(c => c.AddProfile<MappingProfile>());
            var mapper    = mapperCfg.CreateMapper();

            var notifs = new Mock<INotificationService>();
            notifs.Setup(n => n.NotifyUsersAsync(It.IsAny<List<int>>(), It.IsAny<NotificationDto>()))
                  .Returns(Task.CompletedTask);

            var env = new Mock<Microsoft.AspNetCore.Hosting.IWebHostEnvironment>();
            var transitions = new Mock<ITaskStatusTransitionProvider>();
            transitions.Setup(t => t.Edges).Returns(new Dictionary<string, IReadOnlyDictionary<string, bool>>(StringComparer.OrdinalIgnoreCase)
            {
                ["new"]           = new Dictionary<string, bool>(StringComparer.OrdinalIgnoreCase) { ["in-progress"] = false },
                ["in-progress"]   = new Dictionary<string, bool>(StringComparer.OrdinalIgnoreCase) { ["paused"] = false, ["blocked"] = false, ["under-review"] = false },
                ["paused"]        = new Dictionary<string, bool>(StringComparer.OrdinalIgnoreCase) { ["in-progress"] = true },
                ["blocked"]       = new Dictionary<string, bool>(StringComparer.OrdinalIgnoreCase) { ["in-progress"] = true },
                ["under-review"]  = new Dictionary<string, bool>(StringComparer.OrdinalIgnoreCase) { ["completed"] = false, ["issues"] = false },
                ["issues"]        = new Dictionary<string, bool>(StringComparer.OrdinalIgnoreCase) { ["in-progress"] = true },
            });

            _svc = new TaskService(_ctx, mapper, notifs.Object, env.Object, transitions.Object);

            Seed();
        }

        private void Seed()
        {
            var role = new Role { Id = 1, Name = "SystemAdmin", IsAdmin = true };
            _ctx.Roles.Add(role);

            var user = new User
            {
                Id           = 1,
                UserName     = "admin",
                Email        = "admin@test.com",
                FirstName    = "Admin",
                LastName     = "User",
                FullName     = "Admin User",
                PasswordHash = "x",
                RoleId       = 1,
                IsActive     = true,
                CreatedAt    = DateTime.UtcNow
            };
            _ctx.Users.Add(user);

            var project = new Project
            {
                Id          = 1,
                Name        = "Test Project",
                CreatedById = 1,
                OwnerId     = 1,
                CreatedAt   = DateTime.UtcNow
            };
            _ctx.Projects.Add(project);

            var task = new TaskEntity
            {
                Id           = 1,
                Title        = "Test Task",
                Status       = "new",
                Priority     = "medium",
                ProjectId    = 1,
                AssignedToId = 1,
                CreatedById  = 1,
                CreatedAt    = DateTime.UtcNow,
                // No checklist items → treat as 100% complete so the under-review gate passes
                Progress     = 100
            };
            _ctx.Tasks.Add(task);
            _ctx.SaveChanges();

            _userId = user.Id;
            _taskId = task.Id;
        }

        public void Dispose() => _ctx.Dispose();

        // ── Valid transitions ──────────────────────────────────────────────────

        [Fact]
        public async Task NewToInProgress_Succeeds()
        {
            var result = await _svc.ChangeStatusAsync(_taskId,
                new ChangeStatusDto { ToStatus = "in-progress", ActualHours = 0.5m }, _userId, isAdmin: true);

            Assert.True(result.Success, result.Message);
            Assert.Equal("in-progress", result.Data?.Status);
        }

        [Fact]
        public async Task InProgressToBlocked_Succeeds()
        {
            await SetStatus("in-progress");

            var result = await _svc.ChangeStatusAsync(_taskId,
                new ChangeStatusDto { ToStatus = "blocked", Reason = "waiting on dependency", ActualHours = 1m },
                _userId, isAdmin: true);

            Assert.True(result.Success, result.Message);
            Assert.Equal("blocked", result.Data?.Status);
        }

        [Fact]
        public async Task BlockedToInProgress_Succeeds()
        {
            await SetStatus("in-progress");
            await SetStatus("blocked", reason: "dep");

            var result = await _svc.ChangeStatusAsync(_taskId,
                new ChangeStatusDto { ToStatus = "in-progress", ActualHours = 0.5m }, _userId, isAdmin: true);

            Assert.True(result.Success, result.Message);
        }

        [Fact]
        public async Task UnderReviewToCompleted_ByAdmin_Succeeds()
        {
            // Complete the checklist so the gate passes
            await SetStatus("in-progress");
            await SetStatus("under-review", actualHours: 1m);

            var result = await _svc.ChangeStatusAsync(_taskId,
                new ChangeStatusDto { ToStatus = "completed", ActualHours = 1m }, _userId, isAdmin: true);

            Assert.True(result.Success, result.Message);
            Assert.Equal("completed", result.Data?.Status);
        }

        // ── Invalid transitions ────────────────────────────────────────────────

        [Fact]
        public async Task NewToCompleted_Fails()
        {
            var result = await _svc.ChangeStatusAsync(_taskId,
                new ChangeStatusDto { ToStatus = "completed", ActualHours = 1m }, _userId, isAdmin: true);

            Assert.False(result.Success);
        }

        [Fact]
        public async Task NewToUnderReview_Fails()
        {
            var result = await _svc.ChangeStatusAsync(_taskId,
                new ChangeStatusDto { ToStatus = "under-review", ActualHours = 1m }, _userId, isAdmin: true);

            Assert.False(result.Success);
        }

        [Fact]
        public async Task ChangeStatus_WithZeroActualHours_Fails()
        {
            // ActualHours = 0 is not allowed when transitioning away from 'new'
            var result = await _svc.ChangeStatusAsync(_taskId,
                new ChangeStatusDto { ToStatus = "in-progress", ActualHours = 0m }, _userId, isAdmin: false);

            Assert.False(result.Success);
        }

        [Fact]
        public async Task ChecklistGate_BlocksInReview_WhenIncomplete()
        {
            // Add an incomplete checklist item and reset progress so the gate is meaningful
            var item = new ChecklistItem
            {
                TaskId      = _taskId,
                Title       = "Step 1",
                IsCompleted = false,
                OrderIndex  = 1,
                CreatedAt   = DateTime.UtcNow
            };
            _ctx.ChecklistItems.Add(item);
            var task = (await _ctx.Tasks.FindAsync(_taskId))!;
            task.Progress = 0; // unchecked item → 0 % progress
            await _ctx.SaveChangesAsync();

            await SetStatus("in-progress");

            var result = await _svc.ChangeStatusAsync(_taskId,
                new ChangeStatusDto { ToStatus = "under-review", ActualHours = 1m }, _userId, isAdmin: true);

            Assert.False(result.Success);
            Assert.Contains("checklist", result.Message, StringComparison.OrdinalIgnoreCase);
        }

        // ── Helper ────────────────────────────────────────────────────────────

        private async Task SetStatus(string toStatus, string? reason = null, decimal actualHours = 1m)
        {
            var dto = new ChangeStatusDto { ToStatus = toStatus, Reason = reason, ActualHours = actualHours };
            var r   = await _svc.ChangeStatusAsync(_taskId, dto, _userId, isAdmin: true);
            Assert.True(r.Success, $"Setup failed moving to '{toStatus}': {r.Message}");
        }
    }
}
