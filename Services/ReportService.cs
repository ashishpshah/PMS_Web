using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using TaskManagement.Data;
using TaskManagement.DTOs;

namespace TaskManagement.Services
{
    public interface IReportService
    {
        Task<ApiResponse<UserEffortReportDto>> GetUserEffortReportAsync(DateTime? fromUtc, DateTime? toUtc, int requestingUserId, bool isAdmin, CancellationToken ct = default);
        Task<ApiResponse<UserTransitionReportDto>> GetUserTransitionReportAsync(DateTime? fromUtc, DateTime? toUtc, int requestingUserId, bool isAdmin, CancellationToken ct = default);
        Task<ApiResponse<UserTaskEffortReportDto>> GetUserTaskEffortAsync(int targetUserId, DateTime? fromUtc, DateTime? toUtc, int requestingUserId, bool isAdmin, CancellationToken ct = default);
        Task<ApiResponse<UserDailyEffortReportDto>> GetUserDailyEffortAsync(int targetUserId, DateTime? fromUtc, DateTime? toUtc, int requestingUserId, bool isAdmin, CancellationToken ct = default);
        Task<ApiResponse<HoursSummaryDto>> GetHoursSummaryAsync(DateTime? fromUtc, DateTime? toUtc, int? filterUserId, int? filterProjectId, int requestingUserId, bool isAdmin, CancellationToken ct = default);
        Task<ApiResponse<UserDailyUtilizationReportDto>> GetDailyUtilizationAsync(int targetUserId, int month, int year, int requestingUserId, bool isAdmin, CancellationToken ct = default);
    }

    public class ReportService : IReportService
    {
        private readonly PMSDbContext _context;

        public ReportService(PMSDbContext context)
        {
            _context = context;
        }

        public async Task<ApiResponse<UserEffortReportDto>> GetUserEffortReportAsync(
            DateTime? fromUtc, DateTime? toUtc, int requestingUserId, bool isAdmin, CancellationToken ct = default)
        {
            var now = AppClock.Now;
            var winStart = fromUtc ?? DateTime.MinValue;
            var winEnd = toUtc ?? now;

            // Only load tasks that could overlap the window (skip tasks created after it)
            var tasks = await _context.Tasks
                .Where(t => t.CreatedAt < winEnd)
                .Select(t => new { t.Id, t.CreatedAt, t.Status, t.AssignedToId })
                .ToListAsync(ct);

            var taskIds = tasks.Select(t => t.Id).ToHashSet();

            // Only load status transitions up to the window end — future rows don't affect segments
            var statusByTask = (await _context.TaskStatusHistories
                    .Where(h => taskIds.Contains(h.TaskId) && h.ChangedAt <= winEnd)
                    .OrderBy(h => h.ChangedAt)
                    .ToListAsync(ct))
                .GroupBy(h => h.TaskId)
                .ToDictionary(g => g.Key, g => (IReadOnlyList<TaskStatusHistory>)g.ToList());

            var assignByTask = (await _context.TaskAssignmentHistories
                    .Where(h => taskIds.Contains(h.TaskId))
                    .OrderBy(h => h.ChangedAt)
                    .ToListAsync(ct))
                .GroupBy(h => h.TaskId)
                .ToDictionary(g => g.Key, g => (IReadOnlyList<TaskAssignmentHistory>)g.ToList());

            var perUserProductive = new Dictionary<int, long>();
            var perUserPaused = new Dictionary<int, long>();
            var perUserBlocked = new Dictionary<int, long>();
            var perUserUnderReview = new Dictionary<int, long>();
            var perUserTotal = new Dictionary<int, long>();
            var perUserTaskIds = new Dictionary<int, HashSet<int>>();

            var emptyStatus = new List<TaskStatusHistory>();
            var emptyAssign = new List<TaskAssignmentHistory>();

            foreach (var t in tasks)
            {
                var statusRows = statusByTask.TryGetValue(t.Id, out var sr) ? sr : emptyStatus;
                var assignRows = assignByTask.TryGetValue(t.Id, out var ar) ? ar : emptyAssign;

                var segments = EffortHelpers.BuildStatusSegments(t.CreatedAt, t.Status, statusRows, now);
                if (segments.Count == 0) continue;

                var windows = EffortHelpers.BuildAssignmentWindows(t.CreatedAt, assignRows, t.AssignedToId, now);

                foreach (var s in segments)
                {
                    // Clip segment to the requested date window.
                    var segWinStart = s.StartAt > winStart ? s.StartAt : winStart;
                    var segWinEnd   = s.EndAt   < winEnd   ? s.EndAt   : winEnd;
                    if (segWinEnd <= segWinStart) continue;

                    var statusLower = (s.Status ?? string.Empty).ToLowerInvariant();
                    bool isProd = statusLower == "in-progress";
                    bool isBlocked = statusLower == "blocked";
                    bool isUnderReview = statusLower == "under-review";

                    foreach (var w in windows)
                    {
                        if (w.UserId == 0) continue;
                        var intStart = segWinStart > w.Start ? segWinStart : w.Start;
                        var intEnd   = segWinEnd   < w.End   ? segWinEnd   : w.End;
                        if (intEnd <= intStart) continue;
                        var ov = EffortHelpers.WorkingOverlap(intStart, intEnd);
                        if (ov <= 0) continue;

                        if (isProd) Add(perUserProductive, w.UserId, ov);
                        else if (isBlocked) Add(perUserBlocked, w.UserId, ov);
                        else if (isUnderReview) Add(perUserUnderReview, w.UserId, ov);
                        Add(perUserTotal, w.UserId, ov);

                        if (!perUserTaskIds.TryGetValue(w.UserId, out var taskSet))
                            perUserTaskIds[w.UserId] = taskSet = new HashSet<int>();
                        taskSet.Add(t.Id);
                    }
                }
            }

            var allUserIds = perUserTotal.Keys.ToList();
            var userInfo = await _context.Users
                .Where(u => allUserIds.Contains(u.Id))
                .Select(u => new { u.Id, u.FullName, u.AvatarUrl })
                .ToDictionaryAsync(u => u.Id, u => new { u.FullName, u.AvatarUrl }, ct);

            var items = allUserIds
                .Select(uid => new UserEffortReportItemDto
                {
                    UserId = uid,
                    UserName = userInfo.TryGetValue(uid, out var info) ? info.FullName : $"User #{uid}",
                    AvatarUrl = userInfo.TryGetValue(uid, out var info2) ? info2.AvatarUrl : null,
                    TaskCount = perUserTaskIds.TryGetValue(uid, out var ts) ? ts.Count : 0,
                    ProductiveSeconds = perUserProductive.TryGetValue(uid, out var prod) ? prod : 0,
                    PausedSeconds = perUserPaused.TryGetValue(uid, out var pau) ? pau : 0,
                    BlockedSeconds = perUserBlocked.TryGetValue(uid, out var blk) ? blk : 0,
                    UnderReviewSeconds = perUserUnderReview.TryGetValue(uid, out var rev) ? rev : 0,
                    TotalElapsedSeconds = perUserTotal.TryGetValue(uid, out var tot) ? tot : 0,
                })
                .OrderByDescending(i => i.ProductiveSeconds)
                .ToList();

            if (!isAdmin)
                items = items.Where(i => i.UserId == requestingUserId).ToList();

            return new ApiResponse<UserEffortReportDto>
            {
                Success = true,
                Data = new UserEffortReportDto { FromUtc = fromUtc, ToUtc = toUtc, Users = items }
            };
        }

        public async Task<ApiResponse<UserTransitionReportDto>> GetUserTransitionReportAsync(
            DateTime? fromUtc, DateTime? toUtc, int requestingUserId, bool isAdmin, CancellationToken ct = default)
        {
            var now = AppClock.Now;
            var winStart = fromUtc ?? DateTime.MinValue;
            var winEnd = toUtc ?? now;

            // Load tasks for assignment window computation (skip tasks created after the window).
            var tasks = await _context.Tasks
                .Where(t => t.CreatedAt < winEnd)
                .Select(t => new { t.Id, t.CreatedAt, t.Status, t.AssignedToId })
                .ToListAsync(ct);

            var taskIds2 = tasks.Select(t => t.Id).ToHashSet();

            // Load status histories within the window.
            var historyRows = await _context.TaskStatusHistories
                .Where(h => taskIds2.Contains(h.TaskId) && h.ChangedAt >= winStart && h.ChangedAt < winEnd)
                .OrderBy(h => h.ChangedAt)
                .ToListAsync(ct);

            // Load assignment histories only for relevant tasks.
            var assignByTask = (await _context.TaskAssignmentHistories
                    .Where(h => taskIds2.Contains(h.TaskId))
                    .OrderBy(h => h.ChangedAt)
                    .ToListAsync(ct))
                .GroupBy(h => h.TaskId)
                .ToDictionary(g => g.Key, g => (IReadOnlyList<TaskAssignmentHistory>)g.ToList());

            var taskMap = tasks.ToDictionary(t => t.Id);
            var emptyAssign = new List<TaskAssignmentHistory>();

            // Per-assignee: (fromStatus, toStatus) → count
            var perUserTransitions = new Dictionary<int, Dictionary<(string from, string to), int>>();

            foreach (var h in historyRows)
            {
                if (!taskMap.TryGetValue(h.TaskId, out var task)) continue;
                var assignRows = assignByTask.TryGetValue(h.TaskId, out var ar) ? ar : emptyAssign;
                var windows = EffortHelpers.BuildAssignmentWindows(task.CreatedAt, assignRows, task.AssignedToId, now);

                // Find who was assigned at the time of this transition.
                var assignee = windows.FirstOrDefault(w => w.UserId != 0 && h.ChangedAt >= w.Start && h.ChangedAt < w.End);
                var uid = assignee.UserId == 0
                    ? windows.LastOrDefault(w => w.UserId != 0 && h.ChangedAt >= w.Start).UserId
                    : assignee.UserId;

                if (uid == 0) continue;

                if (!perUserTransitions.TryGetValue(uid, out var tmap))
                    perUserTransitions[uid] = tmap = new Dictionary<(string, string), int>();

                var key = (h.FromStatus ?? string.Empty, h.ToStatus ?? string.Empty);
                tmap.TryGetValue(key, out var cnt);
                tmap[key] = cnt + 1;
            }

            var allUserIds = perUserTransitions.Keys.ToList();
            var userInfo = await _context.Users
                .Where(u => allUserIds.Contains(u.Id))
                .Select(u => new { u.Id, u.FullName, u.AvatarUrl })
                .ToDictionaryAsync(u => u.Id, u => new { u.FullName, u.AvatarUrl }, ct);

            var items = allUserIds
                .Select(uid =>
                {
                    var tmap = perUserTransitions[uid];
                    var breakdown = tmap
                        .Select(kv => new TransitionCountDto
                        {
                            FromStatus = kv.Key.from,
                            ToStatus = kv.Key.to,
                            Count = kv.Value
                        })
                        .OrderByDescending(t => t.Count)
                        .ToList();

                    var top = breakdown.FirstOrDefault();
                    var mostCommon = top != null ? $"{top.FromStatus} → {top.ToStatus}" : string.Empty;

                    return new UserTransitionReportItemDto
                    {
                        UserId = uid,
                        UserName = userInfo.TryGetValue(uid, out var info) ? info.FullName : $"User #{uid}",
                        AvatarUrl = userInfo.TryGetValue(uid, out var info2) ? info2.AvatarUrl : null,
                        TotalTransitions = tmap.Values.Sum(),
                        MostCommonTransition = mostCommon,
                        Breakdown = breakdown
                    };
                })
                .OrderByDescending(i => i.TotalTransitions)
                .ToList();

            if (!isAdmin)
                items = items.Where(i => i.UserId == requestingUserId).ToList();

            return new ApiResponse<UserTransitionReportDto>
            {
                Success = true,
                Data = new UserTransitionReportDto { FromUtc = fromUtc, ToUtc = toUtc, Users = items }
            };
        }

        public async Task<ApiResponse<UserTaskEffortReportDto>> GetUserTaskEffortAsync(
            int targetUserId, DateTime? fromUtc, DateTime? toUtc, int requestingUserId, bool isAdmin, CancellationToken ct = default)
        {
            // Non-admins may only query their own data.
            if (!isAdmin && targetUserId != requestingUserId)
                return new ApiResponse<UserTaskEffortReportDto> { Success = false, Message = "Forbidden" };

            var now = AppClock.Now;
            var winStart = fromUtc ?? DateTime.MinValue;
            var winEnd   = toUtc   ?? now;

            // Load only tasks that were ever assigned to this user (or currently assigned).
            var tasks = await _context.Tasks
                .Select(t => new { t.Id, t.Code, t.Title, t.Status, t.CreatedAt, t.AssignedToId })
                .ToListAsync(ct);

            var taskIds = tasks.Select(t => t.Id).ToList();

            var statusByTask = (await _context.TaskStatusHistories
                    .Where(h => taskIds.Contains(h.TaskId))
                    .OrderBy(h => h.ChangedAt)
                    .ToListAsync(ct))
                .GroupBy(h => h.TaskId)
                .ToDictionary(g => g.Key, g => (IReadOnlyList<TaskStatusHistory>)g.ToList());

            var assignByTask = (await _context.TaskAssignmentHistories
                    .Where(h => taskIds.Contains(h.TaskId))
                    .OrderBy(h => h.ChangedAt)
                    .ToListAsync(ct))
                .GroupBy(h => h.TaskId)
                .ToDictionary(g => g.Key, g => (IReadOnlyList<TaskAssignmentHistory>)g.ToList());

            var emptyStatus = new List<TaskStatusHistory>();
            var emptyAssign = new List<TaskAssignmentHistory>();

            var taskEfforts = new List<UserTaskEffortItemDto>();

            foreach (var t in tasks)
            {
                var statusRows = statusByTask.TryGetValue(t.Id, out var sr) ? sr : emptyStatus;
                var assignRows = assignByTask.TryGetValue(t.Id, out var ar) ? ar : emptyAssign;

                var segments = EffortHelpers.BuildStatusSegments(t.CreatedAt, t.Status, statusRows, now);
                if (segments.Count == 0) continue;

                var windows = EffortHelpers.BuildAssignmentWindows(t.CreatedAt, assignRows, t.AssignedToId, now);

                // Check if targetUser ever held this task.
                bool userEverAssigned = windows.Any(w => w.UserId == targetUserId);
                if (!userEverAssigned) continue;

                long prod = 0, paused = 0, blocked = 0, underReview = 0, total = 0;

                foreach (var s in segments)
                {
                    var segWinStart = s.StartAt > winStart ? s.StartAt : winStart;
                    var segWinEnd   = s.EndAt   < winEnd   ? s.EndAt   : winEnd;
                    if (segWinEnd <= segWinStart) continue;

                    var statusLower = (s.Status ?? string.Empty).ToLowerInvariant();

                    foreach (var w in windows)
                    {
                        if (w.UserId != targetUserId) continue;
                        var intStart = segWinStart > w.Start ? segWinStart : w.Start;
                        var intEnd   = segWinEnd   < w.End   ? segWinEnd   : w.End;
                        if (intEnd <= intStart) continue;
                        var ov = EffortHelpers.WorkingOverlap(intStart, intEnd);
                        if (ov <= 0) continue;

                        switch (statusLower)
                        {
                            case "in-progress": prod        += ov; break;
                            case "blocked":     blocked     += ov; break;
                            case "under-review": underReview += ov; break;
                        }
                        total += ov;
                    }
                }

                if (total == 0) continue;

                taskEfforts.Add(new UserTaskEffortItemDto
                {
                    TaskId              = t.Id,
                    TaskCode            = t.Code ?? string.Empty,
                    TaskTitle           = t.Title,
                    TaskStatus          = t.Status,
                    ProductiveSeconds   = prod,
                    PausedSeconds       = paused,
                    BlockedSeconds      = blocked,
                    UnderReviewSeconds  = underReview,
                    TotalElapsedSeconds = total,
                });
            }

            taskEfforts = taskEfforts.OrderByDescending(x => x.ProductiveSeconds).ToList();

            var userInfo = await _context.Users
                .Where(u => u.Id == targetUserId)
                .Select(u => new { u.FullName, u.AvatarUrl })
                .FirstOrDefaultAsync(ct);

            return new ApiResponse<UserTaskEffortReportDto>
            {
                Success = true,
                Data = new UserTaskEffortReportDto
                {
                    UserId    = targetUserId,
                    UserName  = userInfo?.FullName ?? $"User #{targetUserId}",
                    AvatarUrl = userInfo?.AvatarUrl,
                    FromUtc   = fromUtc,
                    ToUtc     = toUtc,
                    Tasks     = taskEfforts,
                }
            };
        }

        public async Task<ApiResponse<UserDailyEffortReportDto>> GetUserDailyEffortAsync(
            int targetUserId, DateTime? fromUtc, DateTime? toUtc, int requestingUserId, bool isAdmin, CancellationToken ct = default)
        {
            if (!isAdmin && targetUserId != requestingUserId)
                return new ApiResponse<UserDailyEffortReportDto> { Success = false, Message = "Forbidden" };

            var now = AppClock.Now;
            var winStart = (fromUtc ?? DateTime.MinValue).Date;
            var winEnd   = (toUtc   ?? now).Date;

            var tasks = await _context.Tasks
                .Select(t => new { t.Id, t.CreatedAt, t.Status, t.AssignedToId })
                .ToListAsync(ct);

            var taskIds = tasks.Select(t => t.Id).ToList();

            var statusByTask = (await _context.TaskStatusHistories
                    .Where(h => taskIds.Contains(h.TaskId))
                    .OrderBy(h => h.ChangedAt)
                    .ToListAsync(ct))
                .GroupBy(h => h.TaskId)
                .ToDictionary(g => g.Key, g => (IReadOnlyList<TaskStatusHistory>)g.ToList());

            var assignByTask = (await _context.TaskAssignmentHistories
                    .Where(h => taskIds.Contains(h.TaskId))
                    .OrderBy(h => h.ChangedAt)
                    .ToListAsync(ct))
                .GroupBy(h => h.TaskId)
                .ToDictionary(g => g.Key, g => (IReadOnlyList<TaskAssignmentHistory>)g.ToList());

            var emptyStatus = new List<TaskStatusHistory>();
            var emptyAssign = new List<TaskAssignmentHistory>();

            // dayProd[date] = { prod, paused, blocked, underReview, total, taskIds }
            var dayProd        = new Dictionary<DateTime, long>();
            var dayPaused      = new Dictionary<DateTime, long>();
            var dayBlocked     = new Dictionary<DateTime, long>();
            var dayUnderReview = new Dictionary<DateTime, long>();
            var dayTotal       = new Dictionary<DateTime, long>();
            var dayTaskIds     = new Dictionary<DateTime, HashSet<int>>();

            foreach (var t in tasks)
            {
                var statusRows = statusByTask.TryGetValue(t.Id, out var sr) ? sr : emptyStatus;
                var assignRows = assignByTask.TryGetValue(t.Id, out var ar) ? ar : emptyAssign;

                var segments = EffortHelpers.BuildStatusSegments(t.CreatedAt, t.Status, statusRows, now);
                if (segments.Count == 0) continue;

                var windows = EffortHelpers.BuildAssignmentWindows(t.CreatedAt, assignRows, t.AssignedToId, now);
                if (!windows.Any(w => w.UserId == targetUserId)) continue;

                foreach (var s in segments)
                {
                    // Clip segment to the user's assignment windows for this task.
                    foreach (var w in windows)
                    {
                        if (w.UserId != targetUserId) continue;

                        var intStart = s.StartAt > w.Start ? s.StartAt : w.Start;
                        var intEnd   = s.EndAt   < w.End   ? s.EndAt   : w.End;
                        if (intEnd <= intStart) continue;

                        var statusLower = (s.Status ?? string.Empty).ToLowerInvariant();

                        // Iterate each calendar day covered by this intersection.
                        var day = intStart.Date;
                        while (day <= intEnd.Date)
                        {
                            if (day >= winStart && day <= winEnd)
                            {
                                var ov = EffortHelpers.WorkingOverlapForDay(intStart, intEnd, day);
                                if (ov > 0)
                                {
                                    switch (statusLower)
                                    {
                                        case "in-progress": AddDay(dayProd,        day, ov); break;
                                        case "blocked":     AddDay(dayBlocked,     day, ov); break;
                                        case "under-review": AddDay(dayUnderReview, day, ov); break;
                                    }
                                    AddDay(dayTotal, day, ov);

                                    if (!dayTaskIds.TryGetValue(day, out var ts))
                                        dayTaskIds[day] = ts = new HashSet<int>();
                                    ts.Add(t.Id);
                                }
                            }
                            day = day.AddDays(1);
                        }
                    }
                }
            }

            // Build day list for the entire requested window (include days with zero effort too,
            // so the UI can navigate smoothly without gaps).
            var days = new List<DailyEffortItemDto>();
            if (dayTotal.Count > 0)
            {
                var firstDay = dayTotal.Keys.Min();
                var lastDay  = dayTotal.Keys.Max();
                for (var d = firstDay; d <= lastDay; d = d.AddDays(1))
                {
                    days.Add(new DailyEffortItemDto
                    {
                        Date               = d,
                        ProductiveSeconds  = dayProd.TryGetValue(d, out var p)  ? p  : 0,
                        PausedSeconds      = dayPaused.TryGetValue(d, out var pa) ? pa : 0,
                        BlockedSeconds     = dayBlocked.TryGetValue(d, out var b)  ? b  : 0,
                        UnderReviewSeconds = dayUnderReview.TryGetValue(d, out var u) ? u : 0,
                        TotalElapsedSeconds= dayTotal.TryGetValue(d, out var tt) ? tt : 0,
                        TaskCount          = dayTaskIds.TryGetValue(d, out var ts) ? ts.Count : 0,
                    });
                }
            }

            var userInfo = await _context.Users
                .Where(u => u.Id == targetUserId)
                .Select(u => new { u.FullName, u.AvatarUrl })
                .FirstOrDefaultAsync(ct);

            return new ApiResponse<UserDailyEffortReportDto>
            {
                Success = true,
                Data = new UserDailyEffortReportDto
                {
                    UserId    = targetUserId,
                    UserName  = userInfo?.FullName ?? $"User #{targetUserId}",
                    AvatarUrl = userInfo?.AvatarUrl,
                    FromUtc   = fromUtc,
                    ToUtc     = toUtc,
                    Days      = days,
                }
            };
        }

        public async Task<ApiResponse<HoursSummaryDto>> GetHoursSummaryAsync(
            DateTime? fromUtc, DateTime? toUtc, int? filterUserId, int? filterProjectId,
            int requestingUserId, bool isAdmin, CancellationToken ct = default)
        {
            // Non-admins can only see their own data.
            if (!isAdmin) filterUserId = requestingUserId;

            var now = AppClock.Now;
            var winStart = fromUtc ?? DateTime.MinValue;
            var winEnd   = toUtc   ?? now;

            // Load tasks (with project info).
            var allTasks = await _context.Tasks
                .Select(t => new { t.Id, t.Code, t.Title, t.Status, t.CreatedAt, t.AssignedToId, t.ProjectId, t.EstimatedHours })
                .ToListAsync(ct);

            // Apply project filter at task level.
            var tasks = filterProjectId.HasValue
                ? allTasks.Where(t => t.ProjectId == filterProjectId.Value).ToList()
                : allTasks;

            var taskIds = tasks.Select(t => t.Id).ToList();

            var statusByTask = (await _context.TaskStatusHistories
                    .Where(h => taskIds.Contains(h.TaskId))
                    .OrderBy(h => h.ChangedAt)
                    .ToListAsync(ct))
                .GroupBy(h => h.TaskId)
                .ToDictionary(g => g.Key, g => (IReadOnlyList<TaskStatusHistory>)g.ToList());

            var assignByTask = (await _context.TaskAssignmentHistories
                    .Where(h => taskIds.Contains(h.TaskId))
                    .OrderBy(h => h.ChangedAt)
                    .ToListAsync(ct))
                .GroupBy(h => h.TaskId)
                .ToDictionary(g => g.Key, g => (IReadOnlyList<TaskAssignmentHistory>)g.ToList());

            // All active projects in scope (or just the one filtered project, active or not —
            // an explicit selection always wins) — used both to seed "By Project" so it always
            // lists every active project (zero-filled), and as the ProjectName lookup for By
            // Task/By Project rows built from actual task data.
            var projectsForSeed = await (filterProjectId.HasValue
                    ? _context.Projects.Where(p => p.Id == filterProjectId.Value)
                    : _context.Projects.Where(p => p.Status == "active"))
                .Select(p => new { p.Id, p.Name })
                .ToListAsync(ct);
            var projectNames = projectsForSeed.ToDictionary(p => p.Id, p => p.Name);
            // Guards the final ByProject output against non-active projects sneaking in via
            // the dynamic-creation fallback below (e.g. a task on a since-archived project).
            var activeProjectIdSet = new HashSet<int>(projectsForSeed.Select(p => p.Id));

            var emptyStatus = new List<TaskStatusHistory>();
            var emptyAssign = new List<TaskAssignmentHistory>();

            // Accumulators keyed by userId / taskId / projectId
            var byUser    = new Dictionary<int, HoursSummaryUserRowDto>();
            var byTask    = new Dictionary<int, HoursSummaryTaskRowDto>();
            var byProject = new Dictionary<int, HoursSummaryProjectRowDto>();

            // Track distinct users per project
            var projectUsers = new Dictionary<int, HashSet<int>>();

            // ── Pre-seed byUser/byProject with every active user/project (zero-filled) so
            // the "By User"/"By Project" tabs always list the whole active roster, even with
            // no tracked time in the current filter/period. Matches the app's "show the whole
            // team" convention used elsewhere (see GetProjectStatusMatrixAsync). An explicit
            // filterUserId selection always wins, active or not. The SystemAdmin account
            // (RoleId 1) is never shown — it's a root/utility account, not a team member.
            var usersForSeed = await (filterUserId.HasValue
                    ? _context.Users.Where(u => u.Id == filterUserId.Value)
                    : _context.Users.Where(u => u.IsActive))
                .Where(u => u.RoleId != 1)
                .Select(u => new { u.Id, u.FullName, u.AvatarUrl })
                .ToListAsync(ct);
            // Guards the final ByUser output against inactive users sneaking in via the
            // dynamic-creation fallback below (e.g. a deactivated user with historical time).
            var activeUserIdSet = new HashSet<int>(usersForSeed.Select(u => u.Id));
            foreach (var u in usersForSeed)
                byUser[u.Id] = new HoursSummaryUserRowDto { UserId = u.Id, UserName = u.FullName, AvatarUrl = u.AvatarUrl };

            foreach (var p in projectsForSeed)
                byProject[p.Id] = new HoursSummaryProjectRowDto { ProjectId = p.Id, ProjectName = p.Name };

            foreach (var t in tasks)
            {
                var statusRows = statusByTask.TryGetValue(t.Id, out var sr) ? sr : emptyStatus;
                var assignRows = assignByTask.TryGetValue(t.Id, out var ar) ? ar : emptyAssign;

                var segments = EffortHelpers.BuildStatusSegments(t.CreatedAt, t.Status, statusRows, now);
                if (segments.Count == 0) continue;

                var windows = EffortHelpers.BuildAssignmentWindows(t.CreatedAt, assignRows, t.AssignedToId, now);

                // If filtering by user, skip tasks where user was never assigned.
                if (filterUserId.HasValue && !windows.Any(w => w.UserId == filterUserId.Value)) continue;

                foreach (var s in segments)
                {
                    var segWinStart = s.StartAt > winStart ? s.StartAt : winStart;
                    var segWinEnd   = s.EndAt   < winEnd   ? s.EndAt   : winEnd;
                    if (segWinEnd <= segWinStart) continue;

                    var statusLower = (s.Status ?? string.Empty).ToLowerInvariant();
                    bool isProd   = statusLower == "in-progress";
                    bool isBlock  = statusLower == "blocked";
                    bool isReview = statusLower == "under-review";
                    bool counts   = isProd || isBlock || isReview;
                    if (!counts) continue;

                    foreach (var w in windows)
                    {
                        if (w.UserId == 0) continue;
                        if (filterUserId.HasValue && w.UserId != filterUserId.Value) continue;

                        var intStart = segWinStart > w.Start ? segWinStart : w.Start;
                        var intEnd   = segWinEnd   < w.End   ? segWinEnd   : w.End;
                        if (intEnd <= intStart) continue;

                        var ov = EffortHelpers.WorkingOverlap(intStart, intEnd);
                        if (ov <= 0) continue;

                        // ── by User ──
                        if (!byUser.TryGetValue(w.UserId, out var uRow))
                            byUser[w.UserId] = uRow = new HoursSummaryUserRowDto { UserId = w.UserId };
                        if (isProd)   uRow.ProductiveSeconds  += ov;
                        if (isBlock)  uRow.BlockedSeconds     += ov;
                        if (isReview) uRow.UnderReviewSeconds += ov;
                        uRow.TotalSeconds += ov;

                        // ── by Task ──
                        if (!byTask.TryGetValue(t.Id, out var tRow))
                            byTask[t.Id] = tRow = new HoursSummaryTaskRowDto
                            {
                                TaskId      = t.Id,
                                TaskCode    = t.Code ?? string.Empty,
                                TaskTitle   = t.Title,
                                TaskStatus  = t.Status,
                                ProjectId   = t.ProjectId,
                                ProjectName = projectNames.TryGetValue(t.ProjectId, out var pn) ? pn : string.Empty,
                            };
                        if (isProd)   tRow.ProductiveSeconds  += ov;
                        if (isBlock)  tRow.BlockedSeconds     += ov;
                        if (isReview) tRow.UnderReviewSeconds += ov;
                        tRow.TotalSeconds += ov;

                        // ── by Project ──
                        if (!byProject.TryGetValue(t.ProjectId, out var pRow))
                            byProject[t.ProjectId] = pRow = new HoursSummaryProjectRowDto
                            {
                                ProjectId   = t.ProjectId,
                                ProjectName = projectNames.TryGetValue(t.ProjectId, out var pn2) ? pn2 : string.Empty,
                            };
                        if (isProd)   pRow.ProductiveSeconds  += ov;
                        if (isBlock)  pRow.BlockedSeconds     += ov;
                        if (isReview) pRow.UnderReviewSeconds += ov;
                        pRow.TotalSeconds += ov;

                        if (!projectUsers.TryGetValue(t.ProjectId, out var pu))
                            projectUsers[t.ProjectId] = pu = new HashSet<int>();
                        pu.Add(w.UserId);
                    }
                }

                // Count distinct tasks per user and per project
                foreach (var uid in windows.Where(w => w.UserId != 0).Select(w => w.UserId).Distinct())
                {
                    if (filterUserId.HasValue && uid != filterUserId.Value) continue;
                    if (byUser.TryGetValue(uid, out var ur) && ur.TotalSeconds > 0)
                    {
                        ur.TaskCount++;
                        ur.EstimatedHours += t.EstimatedHours ?? 0;
                    }
                }
                if (byTask.ContainsKey(t.Id))
                {
                    if (!byProject.TryGetValue(t.ProjectId, out var pr)) { }
                    else pr.TaskCount++;
                }
            }

            // Populate UserCount for projects
            foreach (var kv in projectUsers)
                if (byProject.TryGetValue(kv.Key, out var pr)) pr.UserCount = kv.Value.Count;

            // ── Working Hours Spent — sum of self-reported ActualHours logged on each
            // status transition (TaskStatusHistory.ActualHours), attributed to whoever
            // made that transition. This is distinct from ProductiveSeconds/TotalSeconds
            // above, which are auto-reconstructed from status-history timing rather than
            // user-entered. Scoped by the same project filter (via taskIds) and date
            // window (via ChangedAt) as the rest of this report.
            var actualHoursRows = await _context.TaskStatusHistories
                .Where(h => taskIds.Contains(h.TaskId) && h.ActualHours != null
                         && h.ChangedAt >= winStart && h.ChangedAt < winEnd)
                .Select(h => new { h.ChangedById, h.ActualHours })
                .ToListAsync(ct);

            foreach (var row in actualHoursRows)
            {
                if (filterUserId.HasValue && row.ChangedById != filterUserId.Value) continue;
                if (!byUser.TryGetValue(row.ChangedById, out var uRowHrs))
                    byUser[row.ChangedById] = uRowHrs = new HoursSummaryUserRowDto { UserId = row.ChangedById };
                uRowHrs.WorkingHoursSpent += row.ActualHours ?? 0;
            }

            // Bulk-load user names + avatars
            var userIds = byUser.Keys.ToList();
            var userInfo = await _context.Users
                .Where(u => userIds.Contains(u.Id))
                .Select(u => new { u.Id, u.FullName, u.AvatarUrl })
                .ToDictionaryAsync(u => u.Id, u => new { u.FullName, u.AvatarUrl }, ct);

            foreach (var kv in byUser)
            {
                if (!userInfo.TryGetValue(kv.Key, out var info)) continue;
                kv.Value.UserName  = info.FullName;
                kv.Value.AvatarUrl = info.AvatarUrl;
            }

            // Final active-only view — guards against inactive users / non-active projects
            // that got dynamically created above (e.g. via a task's actual-hours history)
            // rather than the pre-seed, so "only active" holds no matter how a row was added.
            var activeByUser = byUser.Values.Where(u => activeUserIdSet.Contains(u.UserId)).ToList();

            var totalProd    = activeByUser.Sum(u => u.ProductiveSeconds);
            var totalWorking = activeByUser.Sum(u => u.TotalSeconds);

            return new ApiResponse<HoursSummaryDto>
            {
                Success = true,
                Data = new HoursSummaryDto
                {
                    FromUtc                = fromUtc,
                    ToUtc                  = toUtc,
                    TotalProductiveSeconds = totalProd,
                    TotalWorkingSeconds    = totalWorking,
                    FilterUserId           = filterUserId,
                    FilterProjectId        = filterProjectId,
                    ByUser    = activeByUser.OrderByDescending(u => u.ProductiveSeconds).ToList(),
                    ByTask    = byTask.Values.OrderByDescending(t => t.ProductiveSeconds).ToList(),
                    ByProject = byProject.Values.Where(p => activeProjectIdSet.Contains(p.ProjectId)).OrderByDescending(p => p.ProductiveSeconds).ToList(),
                }
            };
        }

        public async Task<ApiResponse<UserDailyUtilizationReportDto>> GetDailyUtilizationAsync(
            int targetUserId, int month, int year, int requestingUserId, bool isAdmin, CancellationToken ct = default)
        {
            if (!isAdmin && targetUserId != requestingUserId)
                return new ApiResponse<UserDailyUtilizationReportDto> { Success = false, Message = "Forbidden" };

            var monthStart = new DateTime(year, month, 1);
            var monthEnd   = monthStart.AddMonths(1);
            var now        = AppClock.Now;

            // ── Diary hours grouped by date + set of TaskIds covered by diary ────────
            var diaryEntries = await _context.WorkDiaries
                .Where(wd => wd.UserId == targetUserId && wd.Date >= monthStart && wd.Date < monthEnd)
                .Select(wd => new { wd.Date, wd.HoursSpent, wd.TaskId })
                .ToListAsync(ct);

            // Value: (total hours for that day, task IDs whose time diary already covers)
            var diaryByDate = diaryEntries
                .GroupBy(wd => wd.Date.Date)
                .ToDictionary(
                    g => g.Key,
                    g => (
                        Hours:          (double)g.Sum(wd => wd.HoursSpent ?? 0m),
                        CoveredTaskIds: new HashSet<int>(
                            g.Where(wd => wd.TaskId.HasValue).Select(wd => wd.TaskId!.Value))
                    )
                );

            // ── Task productive seconds by day (reuse segment-walk from GetUserDailyEffortAsync) ──
            var tasks = await _context.Tasks
                .Select(t => new { t.Id, t.CreatedAt, t.Status, t.AssignedToId })
                .ToListAsync(ct);

            var taskIds = tasks.Select(t => t.Id).ToList();

            var statusByTask = (await _context.TaskStatusHistories
                    .Where(h => taskIds.Contains(h.TaskId))
                    .OrderBy(h => h.ChangedAt)
                    .ToListAsync(ct))
                .GroupBy(h => h.TaskId)
                .ToDictionary(g => g.Key, g => (IReadOnlyList<TaskStatusHistory>)g.ToList());

            var assignByTask = (await _context.TaskAssignmentHistories
                    .Where(h => taskIds.Contains(h.TaskId))
                    .OrderBy(h => h.ChangedAt)
                    .ToListAsync(ct))
                .GroupBy(h => h.TaskId)
                .ToDictionary(g => g.Key, g => (IReadOnlyList<TaskAssignmentHistory>)g.ToList());

            var emptyStatus = new List<TaskStatusHistory>();
            var emptyAssign = new List<TaskAssignmentHistory>();
            var dayTaskProdSeconds = new Dictionary<DateTime, long>();

            foreach (var t in tasks)
            {
                var statusRows = statusByTask.TryGetValue(t.Id, out var sr) ? sr : emptyStatus;
                var assignRows = assignByTask.TryGetValue(t.Id, out var ar) ? ar : emptyAssign;

                var segments = EffortHelpers.BuildStatusSegments(t.CreatedAt, t.Status, statusRows, now);
                if (segments.Count == 0) continue;

                var windows = EffortHelpers.BuildAssignmentWindows(t.CreatedAt, assignRows, t.AssignedToId, now);
                if (!windows.Any(w => w.UserId == targetUserId)) continue;

                foreach (var s in segments)
                {
                    if (!(s.Status ?? string.Empty).Equals("in-progress", StringComparison.OrdinalIgnoreCase))
                        continue;

                    foreach (var w in windows)
                    {
                        if (w.UserId != targetUserId) continue;

                        var intStart = s.StartAt > w.Start ? s.StartAt : w.Start;
                        var intEnd   = s.EndAt   < w.End   ? s.EndAt   : w.End;
                        if (intEnd <= intStart) continue;

                        var day = intStart.Date;
                        while (day <= intEnd.Date)
                        {
                            if (day >= monthStart && day < monthEnd)
                            {
                                // Diary entry linked to this task on this day → diary hours already
                                // represent this work; skip auto-tracking to avoid double-counting.
                                var diaryCovered = diaryByDate.TryGetValue(day, out var dc)
                                                   && dc.CoveredTaskIds.Contains(t.Id);
                                if (!diaryCovered)
                                {
                                    var ov = EffortHelpers.WorkingOverlapForDay(intStart, intEnd, day);
                                    if (ov > 0) AddDay(dayTaskProdSeconds, day, ov);
                                }
                            }
                            day = day.AddDays(1);
                        }
                    }
                }
            }

            // ── Build one entry per calendar day in the month ──────────────────────────
            var days = new List<DailyUtilizationItemDto>();
            for (var d = monthStart; d < monthEnd; d = d.AddDays(1))
            {
                var diaryH  = diaryByDate.TryGetValue(d, out var dc)  ? dc.Hours  : 0.0;
                var taskSec = dayTaskProdSeconds.TryGetValue(d, out var ts) ? ts : 0L;
                var taskH   = taskSec / 3600.0;
                var total   = diaryH + taskH;
                var isWorking = WorkDiaryService.IsWorkingDay(d);

                days.Add(new DailyUtilizationItemDto
                {
                    Date         = d,
                    DayName      = d.ToString("dddd"),
                    DiaryHours   = Math.Round(diaryH,  2),
                    TaskHours    = Math.Round(taskH,   2),
                    TotalHours   = Math.Round(total,   2),
                    TargetHours  = 8.0,
                    IsWorkingDay = isWorking,
                    IsComplete   = total >= 8.0,
                });
            }

            var workingDays  = days.Count(day => day.IsWorkingDay);
            var daysComplete = days.Count(day => day.IsWorkingDay && day.IsComplete);
            var daysPartial  = days.Count(day => day.IsWorkingDay && !day.IsComplete && day.TotalHours > 0);
            var totalLogged  = Math.Round(days.Sum(day => day.TotalHours), 2);

            var userInfo = await _context.Users
                .Where(u => u.Id == targetUserId)
                .Select(u => new { u.FullName, u.AvatarUrl })
                .FirstOrDefaultAsync(ct);

            return new ApiResponse<UserDailyUtilizationReportDto>
            {
                Success = true,
                Data = new UserDailyUtilizationReportDto
                {
                    UserId           = targetUserId,
                    UserName         = userInfo?.FullName ?? $"User #{targetUserId}",
                    AvatarUrl        = userInfo?.AvatarUrl,
                    Month            = month,
                    Year             = year,
                    Days             = days,
                    TotalWorkingDays = workingDays,
                    DaysComplete     = daysComplete,
                    DaysPartial      = daysPartial,
                    TotalHoursLogged = totalLogged,
                }
            };
        }

        private static void AddDay(Dictionary<DateTime, long> dict, DateTime key, long value)
        {
            dict.TryGetValue(key, out var cur);
            dict[key] = cur + value;
        }

        private static void Add(Dictionary<int, long> dict, int key, long value)
        {
            dict.TryGetValue(key, out var cur);
            dict[key] = cur + value;
        }
    }
}
