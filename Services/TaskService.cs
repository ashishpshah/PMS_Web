using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using TaskManagement.Data;
using TaskManagement.DTOs;
using AutoMapper;

namespace TaskManagement.Services
{
    public interface ITaskService
    {
        Task<ApiResponse<List<TaskDto>>> GetAllTasksAsync(string? status, string? priority, int? projectId, int? assigneeId = null, string? search = null, int page = 1, int pageSize = 100, CancellationToken ct = default);
        Task<ApiResponse<TaskDto>> GetTaskByIdAsync(int id, CancellationToken ct = default);
        Task<ApiResponse<TaskDto>> CreateTaskAsync(CreateTaskDto createTaskDto, int creatorId);
        Task<ApiResponse<TaskDto>> UpdateTaskAsync(int id, CreateTaskDto updateTaskDto, int userId);
        Task<ApiResponse<bool>> DeleteTaskAsync(int id);
        Task<ApiResponse<DashboardStatsDto>> GetDashboardStatsAsync(CancellationToken ct = default);
        Task<ApiResponse<TaskDto>> AssignTaskAsync(int taskId, int? assigneeId);
        Task<ApiResponse<TaskCommentDto>> AddCommentAsync(int taskId, CreateTaskCommentDto dto, int userId);
        Task<ApiResponse<TaskDto>> ReassignTaskAsync(int taskId, ReassignTaskDto dto, int changedById);
        Task<ApiResponse<TaskDto>> StartTaskAsync(int taskId, int userId);
        Task<ApiResponse<TaskDto>> ChangeStatusAsync(int taskId, ChangeStatusDto dto, int userId, bool isAdmin, bool requireActualHours = true);
        Task<ApiResponse<List<TaskStatusHistoryDto>>> GetStatusHistoryAsync(int taskId, CancellationToken ct = default);
        Task<ApiResponse<TaskEffortDto>> GetTaskEffortAsync(int taskId, CancellationToken ct = default);
        Task<ApiResponse<DashboardEffortDto>> GetEffortStatsAsync(DateTime? fromUtc, DateTime? toUtc, CancellationToken ct = default);
        Task<ApiResponse<List<TaskAssignmentHistoryDto>>> GetTaskAssignmentHistoryAsync(int taskId, CancellationToken ct = default);
        Task<ApiResponse<ChecklistItemDto>> AddChecklistItemAsync(int taskId, CreateChecklistItemDto dto, int userId);
        Task<ApiResponse<ChecklistItemDto>> ToggleChecklistItemAsync(int taskId, int itemId, bool isCompleted, int userId);
        Task<ApiResponse<ChecklistItemDto>> UpdateChecklistItemAsync(int taskId, int itemId, UpdateChecklistItemDto dto, int userId);
        Task<ApiResponse<bool>> DeleteChecklistItemAsync(int taskId, int itemId, int userId);
        Task<ApiResponse<bool>> MarkAllChecklistCompleteAsync(int taskId, int userId);
        Task<ApiResponse<List<TaskCommentDto>>> GetCommentsAsync(int taskId, int? userId, DateTime? from, DateTime? to, CancellationToken ct = default);
        Task<ApiResponse<TaskDto>> SetTaskBlockAsync(int taskId, SetTaskBlockDto dto, int requesterId);
        Task<ApiResponse<List<TaskBlockEntryDto>>> GetTaskBlockEntriesAsync(int taskId, CancellationToken ct = default);
        Task<TaskEntity?> GetTaskEntityAsync(int taskId);
        Task<bool> IsPreviousAssigneeAsync(int taskId, int userId);
        Task<ApiResponse<TaskDto>> ToggleConditionAsync(int taskId, ToggleConditionDto dto, int userId);
        Task<ApiResponse<TaskDto>> AddIssueEntryAsync(int taskId, AddIssueEntryDto dto, int userId);
        Task<ApiResponse<TaskDto>> ResolveIssueEntryAsync(int taskId, int entryId, ResolveIssueEntryDto dto, int userId);
        Task<ApiResponse<TaskDto>> DeleteIssueEntryAsync(int taskId, int entryId, int userId);
        Task<ApiResponse<TaskDto>> QaRejectAsync(int taskId, string? reason, int userId, bool isAdmin);
        Task<ApiResponse<TaskDto>> AddReviewIssueAsync(int taskId, AddReviewIssueDto dto, int userId, bool isAdmin);
        Task<ApiResponse<TaskDto>> ResolveReviewIssueAsync(int taskId, int issueId, ResolveReviewIssueDto dto, int userId, bool isAdmin);
        Task<ApiResponse<TaskDto>> DeleteReviewIssueAsync(int taskId, int issueId, int userId, bool isAdmin);
        Task<ApiResponse<TaskDto>> CompleteReviewAsync(int taskId, int userId, bool isAdmin);

        // ── Review Checklist (Phase 2) ──────────────────────────────────────────────
        Task<ApiResponse<List<ReviewChecklistItemDto>>> GetReviewChecklistAsync(int taskId, CancellationToken ct = default);
        Task<ApiResponse<ReviewChecklistItemDto>> AddReviewChecklistItemAsync(int taskId, CreateReviewChecklistItemDto dto, int userId);
        Task<ApiResponse<ReviewChecklistItemDto>> UpdateReviewChecklistItemAsync(int taskId, int itemId, UpdateReviewChecklistItemDto dto, int userId);
        Task<ApiResponse<bool>> DeleteReviewChecklistItemAsync(int taskId, int itemId, int userId);
        Task<ApiResponse<ReviewChecklistItemDto>> SetReviewChecklistItemResultAsync(int taskId, int itemId, SetReviewChecklistItemResultDto dto, int userId, bool isAdmin);
        Task<ApiResponse<ReviewChecklistItemDto>> SetReviewChecklistItemResolutionAsync(int taskId, int itemId, string resolutionComment, int userId);

        // ── Block Checklist (Phase 3) ───────────────────────────────────────────────
        Task<ApiResponse<List<BlockChecklistItemDto>>> GetBlockChecklistItemsAsync(int taskId, CancellationToken ct = default);
        Task<ApiResponse<BlockChecklistItemDto>> ResolveBlockChecklistItemAsync(int taskId, int itemId, ResolveBlockChecklistItemDto dto, int userId);
        Task<ApiResponse<bool>> RemoveBlockChecklistItemAsync(int taskId, int itemId, int userId);

        // ── Attachments ──────────────────────────────────────────────────────────────
        Task<ApiResponse<AttachmentDto>> UploadAttachmentAsync(int taskId, IFormFile file, int userId);
        Task<ApiResponse<bool>> DeleteAttachmentAsync(int taskId, int attachmentId, int userId, bool isAdmin);
        Task<Attachment?> GetAttachmentEntityAsync(int attachmentId);
    }

    public class TaskService : ITaskService
    {
        private readonly PMSDbContext _context;
        private readonly IMapper _mapper;
        private readonly INotificationService _notifications;
        private readonly IWebHostEnvironment _env;

        public TaskService(PMSDbContext context, IMapper mapper, INotificationService notifications, IWebHostEnvironment env)
        {
            _context = context;
            _mapper = mapper;
            _notifications = notifications;
            _env = env;
        }

        public async Task<ApiResponse<List<TaskDto>>> GetAllTasksAsync(string? status, string? priority, int? projectId, int? assigneeId = null, string? search = null, int page = 1, int pageSize = 100, CancellationToken ct = default)
        {
            // Lightweight base query for filter predicates — no includes, used for COUNT
            var baseQuery = _context.Tasks.AsQueryable();

            if (!string.IsNullOrEmpty(status))
                baseQuery = baseQuery.Where(t => t.Status == status);
            if (!string.IsNullOrEmpty(priority))
                baseQuery = baseQuery.Where(t => t.Priority == priority);
            if (projectId.HasValue)
                baseQuery = baseQuery.Where(t => t.ProjectId == projectId.Value);
            if (assigneeId.HasValue)
                baseQuery = baseQuery.Where(t => t.AssignedToId == assigneeId.Value);
            if (!string.IsNullOrWhiteSpace(search))
            {
                var term = search.Trim().ToLower();
                baseQuery = baseQuery.Where(t => t.Title.ToLower().Contains(term) || (t.Code != null && t.Code.ToLower().Contains(term)));
            }

            pageSize = Math.Clamp(pageSize, 1, 500);
            page     = Math.Max(1, page);

            var totalCount = await baseQuery.CountAsync(ct);
            var totalPages = totalCount == 0 ? 1 : (int)Math.Ceiling((double)totalCount / pageSize);

            // Full query with eager loads — scoped to requested page
            var tasks = await baseQuery
                .Include(t => t.Project)
                .Include(t => t.AssignedTo)
                .Include(t => t.CreatedBy)
                .Include(t => t.Tags)
                .Include(t => t.Comments).ThenInclude(c => c.User)
                .Include(t => t.ChecklistItems)
                .Include(t => t.BlockEntries).ThenInclude(b => b.BlockedBy)
                .AsSplitQuery()
                .OrderByDescending(t => t.CreatedAt)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .ToListAsync(ct);

            // Subtask counts per parent — one grouped query so the count is accurate
            // regardless of which tasks are visible to the current viewer.
            var taskIds = tasks.Select(t => t.Id).ToList();
            var childCounts = await _context.Tasks
                .Where(t => t.ParentTaskId.HasValue && taskIds.Contains(t.ParentTaskId.Value))
                .GroupBy(t => t.ParentTaskId!.Value)
                .Select(g => new { ParentId = g.Key, Count = g.Count() })
                .ToDictionaryAsync(x => x.ParentId, x => x.Count, ct);

            var dtos = tasks.Select(t =>
            {
                var dto = _mapper.Map<TaskDto>(t);
                dto.ChecklistItems = _mapper.Map<List<ChecklistItemDto>>(
                    t.ChecklistItems.OrderBy(c => c.OrderIndex).ToList());
                dto.ChildTaskCount = childCounts.TryGetValue(t.Id, out var cc) ? cc : 0;
                // Blocked = any active block entry exists (assignee, admin, or owner may have blocked)
                dto.IsBlocked = t.BlockEntries.Any(b => b.IsActive);
                dto.BlockEntries = t.BlockEntries
                    .OrderByDescending(b => b.BlockedAt)
                    .Select(b => new TaskBlockEntryDto
                    {
                        Id = b.Id, TaskId = b.TaskId, BlockedById = b.BlockedById,
                        BlockedByName = b.BlockedBy?.FullName ?? b.BlockedByName,
                        Reason = b.Reason, IsActive = b.IsActive,
                        BlockedAt = b.BlockedAt, ResolvedAt = b.ResolvedAt
                    }).ToList();
                return dto;
            }).ToList();

            return new ApiResponse<List<TaskDto>>
            {
                Success    = true,
                Data       = dtos,
                TotalCount = totalCount,
                Page       = page,
                PageSize   = pageSize,
                TotalPages = totalPages,
            };
        }

        public async Task<ApiResponse<TaskDto>> GetTaskByIdAsync(int id, CancellationToken ct = default)
        {
            var task = await _context.Tasks
                .Include(t => t.Project)
                .Include(t => t.AssignedTo)
                .Include(t => t.CreatedBy)
                .Include(t => t.StartedBy)
                .Include(t => t.QaAssignee)
                .Include(t => t.ParentTask)
                .Include(t => t.ChildTasks).ThenInclude(c => c.AssignedTo)
                .Include(t => t.Tags)
                .Include(t => t.Comments).ThenInclude(c => c.User)
                .Include(t => t.ChecklistItems).ThenInclude(ci => ci.CompletedBy)
                .Include(t => t.AssignmentHistory).ThenInclude(h => h.PreviousAssignee)
                .Include(t => t.AssignmentHistory).ThenInclude(h => h.NewAssignee)
                .Include(t => t.AssignmentHistory).ThenInclude(h => h.ChangedBy)
                .Include(t => t.BlockEntries).ThenInclude(b => b.BlockedBy)
                .Include(t => t.ConditionHistory).ThenInclude(h => h.ChangedBy)
                .Include(t => t.IssueEntries).ThenInclude(e => e.CreatedBy)
                .Include(t => t.IssueEntries).ThenInclude(e => e.ResolvedBy)
                .Include(t => t.ReviewIssues).ThenInclude(r => r.CreatedBy)
                .Include(t => t.ReviewIssues).ThenInclude(r => r.ResolvedBy)
                .Include(t => t.ReviewChecklistItems).ThenInclude(r => r.CreatedBy)
                .Include(t => t.ReviewChecklistItems).ThenInclude(r => r.ReviewedBy)
                .Include(t => t.BlockChecklistItems).ThenInclude(b => b.CreatedBy)
                .Include(t => t.BlockChecklistItems).ThenInclude(b => b.ResolvedBy)
                .Include(t => t.Attachments).ThenInclude(a => a.UploadedBy)
                .AsSplitQuery()
                .FirstOrDefaultAsync(t => t.Id == id, ct);

            if (task == null)
                return new ApiResponse<TaskDto> { Success = false, Message = "Task not found" };

            var dto = _mapper.Map<TaskDto>(task);

            dto.ChecklistItems = _mapper.Map<List<ChecklistItemDto>>(
                task.ChecklistItems.OrderBy(c => c.OrderIndex).ToList());

            dto.AssignmentHistory = task.AssignmentHistory
                .OrderByDescending(h => h.ChangedAt)
                .Select(h => new TaskAssignmentHistoryDto
                {
                    Id = h.Id,
                    TaskId = h.TaskId,
                    PreviousAssigneeId = h.PreviousAssigneeId,
                    PreviousAssigneeName = h.PreviousAssignee?.FullName,
                    NewAssigneeId = h.NewAssigneeId,
                    NewAssigneeName = h.NewAssignee?.FullName,
                    ChangedById = h.ChangedById,
                    ChangedByName = h.ChangedBy?.FullName ?? string.Empty,
                    ChangedAt = h.ChangedAt,
                    ReasonTag = h.ReasonTag
                }).ToList();

            dto.BlockEntries = task.BlockEntries
                .OrderByDescending(b => b.BlockedAt)
                .Select(b => new TaskBlockEntryDto
                {
                    Id = b.Id,
                    TaskId = b.TaskId,
                    BlockedById = b.BlockedById,
                    BlockedByName = b.BlockedBy?.FullName ?? b.BlockedByName,
                    Reason = b.Reason,
                    IsActive = b.IsActive,
                    BlockedAt = b.BlockedAt,
                    ResolvedAt = b.ResolvedAt
                }).ToList();

            // Blocked = any active block entry exists (assignee, admin, or owner may have blocked)
            dto.IsBlocked = task.BlockEntries.Any(b => b.IsActive);
            dto.ChildTaskCount = task.ChildTasks.Count;

            dto.ConditionHistory = task.ConditionHistory
                .OrderByDescending(h => h.ChangedAt)
                .Select(h => new TaskConditionHistoryDto
                {
                    Id = h.Id,
                    ConditionName = h.ConditionName,
                    NewValue = h.NewValue,
                    Notes = h.Notes,
                    ChangedAt = h.ChangedAt,
                    ChangedById = h.ChangedById,
                    ChangedByName = h.ChangedBy?.FullName
                }).ToList();

            dto.IssueEntries = task.IssueEntries
                .OrderBy(e => e.CreatedAt)
                .Select(e => new TaskIssueEntryDto
                {
                    Id = e.Id,
                    TaskId = e.TaskId,
                    Description = e.Description,
                    IsResolved = e.IsResolved,
                    CreatedAt = e.CreatedAt,
                    CreatedById = e.CreatedById,
                    CreatedByName = e.CreatedBy?.FullName,
                    ResolvedAt = e.ResolvedAt,
                    ResolvedById = e.ResolvedById,
                    ResolvedByName = e.ResolvedBy?.FullName
                }).ToList();

            dto.ReviewIssues = task.ReviewIssues
                .OrderBy(r => r.CreatedAt)
                .Select(r => new TaskReviewIssueDto
                {
                    Id = r.Id,
                    TaskId = r.TaskId,
                    Description = r.Description,
                    IsResolved = r.IsResolved,
                    CreatedAt = r.CreatedAt,
                    CreatedById = r.CreatedById,
                    CreatedByName = r.CreatedBy?.FullName,
                    ResolvedAt = r.ResolvedAt,
                    ResolvedById = r.ResolvedById,
                    ResolvedByName = r.ResolvedBy?.FullName
                }).ToList();

            dto.PauseReason = task.PauseReason;

            dto.ReviewChecklistItems = task.ReviewChecklistItems
                .OrderBy(r => r.Sequence)
                .Select(r => MapReviewChecklistItem(r))
                .ToList();

            dto.BlockChecklistItems = task.BlockChecklistItems
                .OrderBy(b => b.CreatedAt)
                .Select(b => MapBlockChecklistItem(b))
                .ToList();

            dto.Attachments = task.Attachments
                .OrderBy(a => a.UploadedAt)
                .Select(a => new AttachmentDto
                {
                    Id             = a.Id,
                    TaskId         = a.TaskId,
                    FileName       = a.FileName,
                    FileType       = a.FileType,
                    FileSize       = a.FileSize,
                    UploadedById   = a.UploadedById,
                    UploadedByName = a.UploadedBy?.FullName,
                    UploadedAt     = a.UploadedAt,
                }).ToList();

            return new ApiResponse<TaskDto> { Success = true, Data = dto };
        }

        public async Task<ApiResponse<TaskDto>> CreateTaskAsync(CreateTaskDto createTaskDto, int creatorId)
        {
            // Every task must have a positive estimate.
            if (!createTaskDto.EstimatedHours.HasValue || createTaskDto.EstimatedHours.Value <= 0)
                return new ApiResponse<TaskDto> { Success = false, Message = "Estimated hours are required and must be greater than zero." };

            // Every new task must have at least one checklist item.
            if (createTaskDto.ChecklistItems == null || createTaskDto.ChecklistItems.Count == 0)
                return new ApiResponse<TaskDto> { Success = false, Message = "At least one checklist item is required." };

            TaskEntity? parent = null;
            if (createTaskDto.ParentTaskId.HasValue)
            {
                parent = await _context.Tasks.FindAsync(createTaskDto.ParentTaskId.Value);
                if (parent == null)
                    return new ApiResponse<TaskDto> { Success = false, Message = "Parent task not found" };
                if (parent.ProjectId != createTaskDto.ProjectId)
                    return new ApiResponse<TaskDto> { Success = false, Message = "Parent task must be in the same project" };
            }

            var task = _mapper.Map<TaskEntity>(createTaskDto);
            task.CreatedById = creatorId;
            task.CreatedAt = AppClock.Now;

            // Generate hierarchy code: SUB-PP-TT-SS for subtasks, TSK-PP-TT for top-level tasks
            var (seq, code) = parent != null
                ? await CodeGenerator.NextSubtaskCodeAsync(_context, parent)
                : await CodeGenerator.NextTaskCodeAsync(_context, createTaskDto.ProjectId);
            task.SeqNumber = seq;
            task.Code = code;

            if (createTaskDto.Tags != null)
            {
                task.Tags = createTaskDto.Tags.Select(tag => new TaskTag { Tag = tag }).ToList();
            }

            _context.Tasks.Add(task);
            await _context.SaveChangesAsync();

            // Create checklist items supplied with the task.
            for (int i = 0; i < createTaskDto.ChecklistItems.Count; i++)
            {
                var item = new ChecklistItem
                {
                    TaskId     = task.Id,
                    Title      = createTaskDto.ChecklistItems[i],
                    OrderIndex = i,
                    CreatedAt  = AppClock.Now,
                };
                _context.ChecklistItems.Add(item);
            }
            await _context.SaveChangesAsync();

            await NotifyTaskStakeholdersAsync(task.Id, "New task created",
                $"\"{task.Title}\" was created.", "task", creatorId);

            return await GetTaskByIdAsync(task.Id);
        }

        public async Task<ApiResponse<TaskDto>> UpdateTaskAsync(int id, CreateTaskDto updateTaskDto, int userId)
        {
            // Every task must keep a positive estimate.
            if (!updateTaskDto.EstimatedHours.HasValue || updateTaskDto.EstimatedHours.Value <= 0)
                return new ApiResponse<TaskDto> { Success = false, Message = "Estimated hours are required and must be greater than zero." };

            var task = await _context.Tasks.Include(t => t.Tags).Include(t => t.Project).FirstOrDefaultAsync(t => t.Id == id);
            if (task == null)
                return new ApiResponse<TaskDto> { Success = false, Message = "Task not found" };

            // Status/conditions/codes are NOT changed via the generic update — preserve them.
            var preservedStatus = task.Status;
            var preservedStartedAt = task.StartedAt;
            var preservedStartedById = task.StartedById;
            var preservedCode = task.Code;
            var preservedSeq = task.SeqNumber;
            var preservedHasIssues = task.HasIssues;
            var preservedIsPaused  = task.IsPaused;

            _mapper.Map(updateTaskDto, task);
            task.Status = preservedStatus;
            task.StartedAt = preservedStartedAt;
            task.StartedById = preservedStartedById;
            task.Code = preservedCode;
            task.SeqNumber = preservedSeq;
            task.HasIssues = preservedHasIssues;
            task.IsPaused  = preservedIsPaused;
            task.UpdatedAt = AppClock.Now;

            if (updateTaskDto.Tags != null)
            {
                _context.TaskTags.RemoveRange(task.Tags);
                task.Tags = updateTaskDto.Tags.Select(tag => new TaskTag { Tag = tag }).ToList();
            }

            await _context.SaveChangesAsync();

            await NotifyTaskStakeholdersAsync(task.Id, "Task updated",
                $"\"{task.Title}\" was updated.", "task", userId);

            return await GetTaskByIdAsync(id);
        }

        private static readonly HashSet<string> ValidStatuses = new(StringComparer.OrdinalIgnoreCase)
        {
            "new", "in-progress", "paused", "blocked", "under-review", "issues", "completed"
        };

        // Status state machine: from → { to → ActualHoursExempt }. Each edge carries its own
        // requirement for ActualHours, rather than deriving it from the target status alone.
        private static readonly Dictionary<string, Dictionary<string, bool>> AllowedEdges = new(StringComparer.OrdinalIgnoreCase)
        {
            ["new"] = new(StringComparer.OrdinalIgnoreCase)
            {
                ["in-progress"] = true,  // starting work — no prior hours to report
            },
            ["in-progress"] = new(StringComparer.OrdinalIgnoreCase)
            {
                ["paused"]       = true,  // pausing — hours are logged cumulatively on resume
                ["blocked"]      = false, // reporting a blocker — must log hours worked before hitting it
                ["under-review"] = false, // submitting for review — must log hours worked
            },
            ["paused"] = new(StringComparer.OrdinalIgnoreCase)
            {
                ["in-progress"] = false, // resuming — logs hours spent while paused/investigating
            },
            ["blocked"] = new(StringComparer.OrdinalIgnoreCase)
            {
                ["in-progress"] = false, // unblocking — logs hours spent resolving the blocker
            },
            ["under-review"] = new(StringComparer.OrdinalIgnoreCase)
            {
                ["completed"] = false, // QA approve — logs review hours
                ["issues"]    = true,  // QA fail — no hours needed to reject
            },
            ["issues"] = new(StringComparer.OrdinalIgnoreCase)
            {
                ["in-progress"] = false, // fixing issues — logs hours spent addressing them
            },
            ["completed"] = new(StringComparer.OrdinalIgnoreCase)
            {
                ["in-progress"] = false, // reopen (manager only) — logs hours spent on the reopen work
            },
        };

        // True when the given (from, to) edge doesn't require ActualHours. False (including for
        // an edge that doesn't exist) so callers still fail closed via the AllowedEdges lookup.
        private static bool IsActualHoursExempt(string from, string to) =>
            AllowedEdges.TryGetValue(from, out var edges) && edges.TryGetValue(to, out var exempt) && exempt;

        // Derives the human-readable action name from a (fromStatus, toStatus) pair.
        private static string DeriveActionName(string from, string to) =>
            (from.ToLowerInvariant(), to.ToLowerInvariant()) switch
            {
                ("new",          "in-progress")  => "Start Work",
                ("in-progress",  "paused")        => "Pause",
                ("paused",       "in-progress")   => "Resume",
                ("in-progress",  "blocked")       => "Block",
                ("blocked",      "in-progress")   => "Unblock",
                ("in-progress",  "under-review")  => "Submit for Review",
                ("under-review", "completed")     => "Approve & Complete",
                ("under-review", "issues")        => "QA Failed / Return Issues",
                ("issues",       "in-progress")   => "Fix Issues",
                ("completed",    "in-progress")   => "Reopen",
                _                                 => $"{from} → {to}"
            };

        // Returns null when transition is allowed, error message otherwise.
        private string? ValidateStatusTransition(TaskEntity task, string from, string to, int userId, bool isAdmin, string? reason, decimal? actualHours, bool requireActualHours)
        {
            if (!ValidStatuses.Contains(to))
                return $"Invalid status '{to}'. Allowed: {string.Join(", ", ValidStatuses)}";

            if (!AllowedEdges.TryGetValue(from, out var edges) || !edges.ContainsKey(to))
                return $"Cannot move a task from '{from}' to '{to}'.";

            // Actual hours compulsory except for edges explicitly marked exempt.
            if (requireActualHours && !IsActualHoursExempt(from, to)
                && (!actualHours.HasValue || actualHours.Value <= 0))
                return $"Actual hours are required when moving a task to '{to}'.";

            var isAssignee = task.AssignedToId == userId;
            var isManager = isAdmin
                || task.CreatedById == userId
                || (task.Project != null && (task.Project.OwnerId == userId || task.Project.CreatedById == userId));
            var isQa = task.QaAssigneeId.HasValue && task.QaAssigneeId.Value == userId;

            // Submitting for review requires 100% checklist.
            if (to.Equals("under-review", StringComparison.OrdinalIgnoreCase) && task.Progress < 100)
                return "Complete all checklist items before submitting for review.";

            // Completing requires 100% checklist (only when the task has items).
            if (to.Equals("completed", StringComparison.OrdinalIgnoreCase)
                && task.ChecklistItems.Count > 0 && task.Progress < 100)
                return "Complete all checklist items before completing the task.";

            // Role gates per target.
            switch (to.ToLowerInvariant())
            {
                case "under-review":
                    if (!isAssignee && !isManager)
                        return "Only the assignee can submit work for review.";
                    break;

                case "completed":
                    if (task.RequiresQA)
                    {
                        if (!isQa && !isManager)
                            return "Only the assigned QA reviewer can approve this task.";
                    }
                    else if (!isManager)
                    {
                        return "Only the task creator or project owner can complete this task.";
                    }
                    break;

                case "issues":
                    if (!isQa && !isManager)
                        return "Only the QA reviewer or manager can return a task with issues.";
                    break;

                case "in-progress":
                    if (from.Equals("completed", StringComparison.OrdinalIgnoreCase) && !isManager)
                        return "Only the manager can reopen a completed task.";
                    if (from.Equals("under-review", StringComparison.OrdinalIgnoreCase) && !isManager)
                        return "Only the manager can send a task back from review.";
                    if (!isAssignee && !isManager)
                        return "Only the assignee or manager can change this task's status.";
                    break;

                default: // paused, blocked
                    if (!isAssignee && !isManager)
                        return "Only the assignee or manager can change this task's status.";
                    break;
            }

            return null;
        }

        public async Task<ApiResponse<bool>> DeleteTaskAsync(int id)
        {
            var task = await _context.Tasks
                .Include(t => t.Tags)
                .Include(t => t.Comments)
                .Include(t => t.Attachments)
                .Include(t => t.ChecklistItems)
                .Include(t => t.AssignmentHistory)
                .Include(t => t.ChildTasks)
                .FirstOrDefaultAsync(t => t.Id == id);

            if (task == null)
                return new ApiResponse<bool> { Success = false, Message = "Task not found" };

            if (task.ChildTasks.Any())
                return new ApiResponse<bool> { Success = false, Message = "Cannot delete a task that has linked tasks. Remove or relink the child tasks first." };

            // Notify stakeholders before the task row disappears.
            await NotifyTaskStakeholdersAsync(task.Id, "Task deleted",
                $"\"{task.Title}\" was deleted.", "task", 0);

            _context.ChecklistItems.RemoveRange(task.ChecklistItems);
            _context.TaskAssignmentHistories.RemoveRange(task.AssignmentHistory);
            _context.TaskTags.RemoveRange(task.Tags);
            _context.TaskComments.RemoveRange(task.Comments);
            _context.Attachments.RemoveRange(task.Attachments);

            // Template-generated tasks have a Restrict FK from TaskTemplateGeneratedTasks →
            // must be removed explicitly or SaveChanges throws a FK violation (delete would fail).
            var generatedLinks = await _context.TaskTemplateGeneratedTasks
                .Where(g => g.TaskId == id)
                .ToListAsync();
            _context.TaskTemplateGeneratedTasks.RemoveRange(generatedLinks);

            _context.Tasks.Remove(task);

            try
            {
                await _context.SaveChangesAsync();
            }
            catch (DbUpdateException ex)
            {
                // Surface the real reason instead of a bare 500 → generic "Failed to delete task"
                return new ApiResponse<bool>
                {
                    Success = false,
                    Message = "Unable to delete this task because other records still reference it. "
                            + (ex.InnerException?.Message ?? ex.Message)
                };
            }

            return new ApiResponse<bool> { Success = true, Data = true };
        }

        public async Task<ApiResponse<DashboardStatsDto>> GetDashboardStatsAsync(CancellationToken ct = default)
        {
            var validStatuses = new[] { "new", "in-progress", "paused", "blocked", "under-review", "issues", "completed" };

            var totalProjects  = await _context.Projects.CountAsync(ct);
            var totalTasks     = await _context.Tasks.CountAsync(ct);
            var activeUsers    = await _context.Users.CountAsync(u => u.IsActive, ct);
            var completedTasks = await _context.Tasks.CountAsync(t => t.Status == "completed", ct);
            var byStatus       = await _context.Tasks
                .Where(t => validStatuses.Contains(t.Status))
                .GroupBy(t => t.Status)
                .Select(g => new StatusCountDto { Status = g.Key, Count = g.Count() })
                .ToListAsync(ct);

            // Dev checklist
            var clStatuses = await _context.ChecklistItems.Select(c => c.IsCompleted).ToListAsync(ct);
            var clTotal     = clStatuses.Count;
            var clCompleted = clStatuses.Count(s => s);

            // Review checklist
            var rcStatuses = await _context.ReviewChecklistItems.Select(r => r.Status).ToListAsync(ct);

            // Block checklist items
            var bcStatuses = await _context.BlockChecklistItems.Select(b => b.Status).ToListAsync(ct);

            // Issues
            var ieResolved = await _context.TaskIssueEntries.Select(e => e.IsResolved).ToListAsync(ct);
            var riResolved = await _context.TaskReviewIssues.Select(r => r.IsResolved).ToListAsync(ct);

            return new ApiResponse<DashboardStatsDto>
            {
                Success = true,
                Data = new DashboardStatsDto
                {
                    TotalProjects  = totalProjects,
                    TotalTasks     = totalTasks,
                    ActiveUsers    = activeUsers,
                    CompletedTasks = completedTasks,
                    TasksByStatus  = byStatus,
                    DevChecklist = new DevChecklistStatsDto
                    {
                        Total     = clTotal,
                        Completed = clCompleted,
                        Remaining = clTotal - clCompleted
                    },
                    ReviewChecklist = new ReviewChecklistStatsDto
                    {
                        Pending = rcStatuses.Count(s => s == "pending"),
                        Passed  = rcStatuses.Count(s => s == "passed"),
                        Failed  = rcStatuses.Count(s => s == "failed")
                    },
                    Blockers = new BlockerStatsDto
                    {
                        Active   = bcStatuses.Count(s => s == "active"),
                        Resolved = bcStatuses.Count(s => s == "resolved")
                    },
                    Issues = new IssueStatsDto
                    {
                        Open     = ieResolved.Count(r => !r) + riResolved.Count(r => !r),
                        Resolved = ieResolved.Count(r => r)  + riResolved.Count(r => r)
                    }
                }
            };
        }

        public async Task<ApiResponse<TaskDto>> AssignTaskAsync(int taskId, int? assigneeId)
        {
            var task = await _context.Tasks.FindAsync(taskId);
            if (task == null)
                return new ApiResponse<TaskDto> { Success = false, Message = "Task not found" };

            var previousAssigneeId = task.AssignedToId;
            task.AssignedToId = assigneeId;
            task.UpdatedAt = AppClock.Now;

            // P2-E: record initial assignment for audit trail
            _context.TaskAssignmentHistories.Add(new TaskAssignmentHistory
            {
                TaskId = taskId,
                PreviousAssigneeId = previousAssigneeId,
                NewAssigneeId = assigneeId,
                ChangedById = task.CreatedById,
                ChangedAt = AppClock.Now,
                ReasonTag = "initial-assignment"
            });

            await _context.SaveChangesAsync();

            return await GetTaskByIdAsync(taskId);
        }

        public async Task<ApiResponse<TaskCommentDto>> AddCommentAsync(int taskId, CreateTaskCommentDto dto, int userId)
        {
            var task = await _context.Tasks.FindAsync(taskId);
            if (task == null)
                return new ApiResponse<TaskCommentDto> { Success = false, Message = "Task not found" };

            var user = await _context.Users.FindAsync(userId);
            if (user == null)
                return new ApiResponse<TaskCommentDto> { Success = false, Message = "User not found" };

            var comment = new TaskComment
            {
                TaskId    = taskId,
                UserId    = userId,
                Content   = dto.Text,
                CreatedAt = AppClock.Now,
            };

            _context.TaskComments.Add(comment);
            await _context.SaveChangesAsync();

            return new ApiResponse<TaskCommentDto>
            {
                Success = true,
                Data = new TaskCommentDto
                {
                    Id        = comment.Id,
                    TaskId    = taskId,
                    UserId    = userId,
                    UserName  = user.FullName,
                    AvatarUrl = user.AvatarUrl,
                    Text      = comment.Content,
                    Timestamp = comment.CreatedAt,
                }
            };
        }

        public async Task<ApiResponse<TaskDto>> ReassignTaskAsync(int taskId, ReassignTaskDto dto, int changedById)
        {
            if (!ReasonTags.Valid.Contains(dto.ReasonTag))
                return new ApiResponse<TaskDto> { Success = false, Message = "Invalid reason tag. Must be one of: " + string.Join(", ", ReasonTags.Valid) };

            var task = await _context.Tasks
                .Include(t => t.Project)
                .Include(t => t.BlockEntries)
                .FirstOrDefaultAsync(t => t.Id == taskId);

            if (task == null)
                return new ApiResponse<TaskDto> { Success = false, Message = "Task not found" };

            if (task.Status == "completed")
                return new ApiResponse<TaskDto> { Success = false, Message = "Cannot reassign a completed task. Move it to In Progress first." };

            var isProjectOwnerOrCreator = task.Project != null &&
                (task.Project.OwnerId == changedById || task.Project.CreatedById == changedById);
            var isAdmin = await IsUserAdminAsync(changedById);
            if (task.CreatedById != changedById && !isProjectOwnerOrCreator && !isAdmin)
                return new ApiResponse<TaskDto> { Success = false, Message = "Only the task creator, project owner, or an admin can reassign this task" };

            var previousAssigneeId = task.AssignedToId;

            await using var tx = await _context.Database.BeginTransactionAsync();
            try
            {
                // Auto-resolve any active block entries when reassigning
                var activeBlocks = task.BlockEntries.Where(b => b.IsActive).ToList();
                foreach (var block in activeBlocks)
                {
                    block.IsActive = false;
                    block.ResolvedAt = AppClock.Now;
                }

                // P2-B: If the task was sitting in the Blocked column, record the auto-transition
                if (task.Status == "blocked")
                {
                    var resumeStatus = task.StartedAt == null ? "new" : "in-progress";
                    _context.TaskStatusHistories.Add(new TaskStatusHistory
                    {
                        TaskId = taskId, FromStatus = task.Status, ToStatus = resumeStatus,
                        ChangedById = changedById, Reason = $"Auto-resolved on reassign. Reason: {dto.ReasonTag}",
                        ChangedAt = AppClock.Now
                    });
                    task.Status = resumeStatus;
                }

                _context.TaskAssignmentHistories.Add(new TaskAssignmentHistory
                {
                    TaskId = taskId,
                    PreviousAssigneeId = previousAssigneeId,
                    NewAssigneeId = dto.NewAssigneeId,
                    ChangedById = changedById,
                    ChangedAt = AppClock.Now,
                    ReasonTag = dto.ReasonTag
                });

                task.AssignedToId = dto.NewAssigneeId;
                task.UpdatedAt = AppClock.Now;

                var changer = await _context.Users.FindAsync(changedById);
                var newAssignee = dto.NewAssigneeId.HasValue
                    ? await _context.Users.FindAsync(dto.NewAssigneeId.Value)
                    : null;

                _context.Activities.Add(new Activity
                {
                    UserId = changedById,
                    UserName = changer?.FullName ?? "Unknown",
                    Action = $"reassigned task to {newAssignee?.FullName ?? "Unassigned"}. Reason: {dto.ReasonTag}",
                    TargetType = "task",
                    TargetId = taskId,
                    TargetName = task.Title,
                    Timestamp = AppClock.Now
                });

                await _context.SaveChangesAsync();
                await tx.CommitAsync();
            }
            catch
            {
                await tx.RollbackAsync();
                throw;
            }

            return await GetTaskByIdAsync(taskId);
        }

        public async Task<ApiResponse<TaskDto>> StartTaskAsync(int taskId, int userId)
        {
            var task = await _context.Tasks.FindAsync(taskId);
            if (task == null)
                return new ApiResponse<TaskDto> { Success = false, Message = "Task not found" };
            if (task.AssignedToId != userId)
                return new ApiResponse<TaskDto> { Success = false, Message = "Only the assignee can start this task" };
            if (!task.Status.Equals("new", StringComparison.OrdinalIgnoreCase))
                return new ApiResponse<TaskDto> { Success = false, Message = "Only tasks in 'New' status can be started this way." };

            var fromStatus = task.Status;
            task.StartedAt   = AppClock.Now;
            task.StartedById = userId;
            task.Status      = "in-progress";
            task.UpdatedAt   = AppClock.Now;

            var user = await _context.Users.FindAsync(userId);

            await using var tx = await _context.Database.BeginTransactionAsync();
            try
            {
                _context.Activities.Add(new Activity
                {
                    UserId = userId, UserName = user?.FullName ?? "Unknown",
                    Action = $"started task '{task.Title}'",
                    TargetType = "task", TargetId = taskId, TargetName = task.Title,
                    Timestamp = AppClock.Now
                });
                _context.TaskStatusHistories.Add(new TaskStatusHistory
                {
                    TaskId = taskId, FromStatus = fromStatus, ToStatus = "in-progress",
                    Action = "Start Work", ChangedById = userId, ChangedAt = AppClock.Now
                });
                await _context.SaveChangesAsync();
                await tx.CommitAsync();
            }
            catch { await tx.RollbackAsync(); throw; }

            return await GetTaskByIdAsync(taskId);
        }

        public async Task<ApiResponse<TaskDto>> ChangeStatusAsync(int taskId, ChangeStatusDto dto, int userId, bool isAdmin, bool requireActualHours = true)
        {
            var task = await _context.Tasks
                .Include(t => t.Project)
                .Include(t => t.ChecklistItems)
                .Include(t => t.BlockEntries)
                .FirstOrDefaultAsync(t => t.Id == taskId);

            if (task == null)
                return new ApiResponse<TaskDto> { Success = false, Message = "Task not found" };

            var from = task.Status;
            var to = (dto.ToStatus ?? string.Empty).Trim();

            if (string.Equals(from, to, StringComparison.OrdinalIgnoreCase))
                return await GetTaskByIdAsync(taskId); // no-op

            var err = ValidateStatusTransition(task, from, to, userId, isAdmin, dto.Reason, dto.ActualHours, requireActualHours);
            if (err != null)
            {
                // "Only …" messages are authorization failures; the rest are validation failures.
                var code = err.StartsWith("Only", StringComparison.OrdinalIgnoreCase) ? "FORBIDDEN" : null;
                return new ApiResponse<TaskDto> { Success = false, Message = err, ErrorCode = code };
            }

            // Review checklist gate: enforced when leaving under-review.
            if (from.Equals("under-review", StringComparison.OrdinalIgnoreCase))
            {
                var rcRequired = await _context.ReviewChecklistItems
                    .Where(i => i.TaskId == taskId && i.IsRequired)
                    .ToListAsync();

                if (rcRequired.Count > 0)
                {
                    if (to.Equals("completed", StringComparison.OrdinalIgnoreCase))
                    {
                        var blockers = rcRequired.Count(i => i.Status != "passed" && i.Status != "na");
                        if (blockers > 0)
                            return new ApiResponse<TaskDto> { Success = false, Message = $"{blockers} required review checklist item(s) must be Passed or N/A before completing." };
                    }
                    else if (to.Equals("issues", StringComparison.OrdinalIgnoreCase))
                    {
                        if (!rcRequired.Any(i => i.Status == "failed"))
                            return new ApiResponse<TaskDto> { Success = false, Message = "Mark at least one Required checklist item as Failed before returning to Issues." };
                    }
                }
            }

            task.Status = to;
            task.UpdatedAt = AppClock.Now;
            // First time work starts, stamp StartedAt
            if (to.Equals("in-progress", StringComparison.OrdinalIgnoreCase) && task.StartedAt == null)
            {
                task.StartedAt = AppClock.Now;
                task.StartedById = userId;
            }

            // Block checklist gate: must supply items when blocking; all active items must be resolved when unblocking.
            if (to.Equals("blocked", StringComparison.OrdinalIgnoreCase))
            {
                if (dto.BlockItems == null || dto.BlockItems.Count == 0)
                    return new ApiResponse<TaskDto> { Success = false, Message = "At least one block checklist item is required when blocking a task." };

                foreach (var item in dto.BlockItems)
                {
                    if (!BlockCategories.Valid.Contains(item.Category))
                        return new ApiResponse<TaskDto> { Success = false, Message = $"Invalid block category '{item.Category}'." };
                    if (string.IsNullOrWhiteSpace(item.Description))
                        return new ApiResponse<TaskDto> { Success = false, Message = "Each block checklist item must have a description." };
                }
            }

            if (from.Equals("blocked", StringComparison.OrdinalIgnoreCase))
            {
                var activeItems = await _context.BlockChecklistItems
                    .Where(i => i.TaskId == taskId && i.Status == "active")
                    .ToListAsync();
                if (activeItems.Count > 0)
                    return new ApiResponse<TaskDto> { Success = false, Message = $"{activeItems.Count} block item(s) must be resolved before unblocking." };
            }

            // Block reason lifecycle reuses TaskBlockEntry + block checklist items
            if (to.Equals("blocked", StringComparison.OrdinalIgnoreCase) && task.AssignedToId.HasValue)
            {
                // Mark any previously active block items as removed (fresh block session).
                var previousActive = await _context.BlockChecklistItems
                    .Where(i => i.TaskId == taskId && i.Status == "active")
                    .ToListAsync();
                foreach (var old in previousActive)
                {
                    old.Status = "removed";
                    old.UpdatedAt = AppClock.Now;
                }

                // Create new block checklist items.
                foreach (var item in dto.BlockItems!)
                {
                    _context.BlockChecklistItems.Add(new BlockChecklistItem
                    {
                        TaskId = taskId,
                        Category = item.Category,
                        Description = item.Description.Trim(),
                        Comment = item.Comment?.Trim(),
                        ExpectedResolution = item.ExpectedResolution?.Trim(),
                        Status = "active",
                        CreatedById = userId,
                        CreatedAt = AppClock.Now
                    });
                }

                var existing = task.BlockEntries.FirstOrDefault(b => b.IsActive && b.BlockedById == task.AssignedToId.Value);
                if (existing == null)
                {
                    var blocker = await _context.Users.FindAsync(task.AssignedToId.Value);
                    _context.TaskBlockEntries.Add(new TaskBlockEntry
                    {
                        TaskId = taskId,
                        BlockedById = task.AssignedToId.Value,
                        BlockedByName = blocker?.FullName ?? "Unknown",
                        Reason = dto.Reason ?? string.Empty,
                        IsActive = true,
                        BlockedAt = AppClock.Now
                    });
                }
            }
            // Leaving blocked → resolve active block entries
            if (from.Equals("blocked", StringComparison.OrdinalIgnoreCase))
            {
                foreach (var b in task.BlockEntries.Where(b => b.IsActive))
                {
                    b.IsActive = false;
                    b.ResolvedAt = AppClock.Now;
                }
            }

            var actor = await _context.Users.FindAsync(userId);

            // Auto-assign to QA reviewer when submitted for review
            if (to.Equals("under-review", StringComparison.OrdinalIgnoreCase) && task.QaAssigneeId.HasValue
                && task.AssignedToId != task.QaAssigneeId)
            {
                var previousAssigneeId = task.AssignedToId;
                task.AssignedToId = task.QaAssigneeId.Value;
                _context.TaskAssignmentHistories.Add(new TaskAssignmentHistory
                {
                    TaskId             = taskId,
                    PreviousAssigneeId = previousAssigneeId,
                    NewAssigneeId      = task.QaAssigneeId.Value,
                    ReasonTag          = "Management Decision",
                    ChangedById        = userId,
                    ChangedAt          = AppClock.Now
                });
            }

            var actionName = DeriveActionName(from, to);
            _context.TaskStatusHistories.Add(new TaskStatusHistory
            {
                TaskId = taskId,
                FromStatus = from,
                ToStatus = to,
                Action = actionName,
                ChangedById = userId,
                Reason = dto.Reason,
                ActualHours = IsActualHoursExempt(from, to) ? null : dto.ActualHours,
                ChangedAt = AppClock.Now
            });
            _context.Activities.Add(new Activity
            {
                UserId = userId,
                UserName = actor?.FullName ?? "Unknown",
                Action = $"{actionName}: '{from}' → '{to}'" + (string.IsNullOrWhiteSpace(dto.Reason) ? "" : $". {dto.Reason}"),
                TargetType = "task",
                TargetId = taskId,
                TargetName = task.Title,
                Timestamp = AppClock.Now
            });

            await using var tx = await _context.Database.BeginTransactionAsync();
            try
            {
                await _context.SaveChangesAsync();
                await tx.CommitAsync();
            }
            catch { await tx.RollbackAsync(); throw; }

            await SendStatusNotificationsAsync(task, from, to, dto.Reason);

            return await GetTaskByIdAsync(taskId);
        }

        // Decide who hears about a transition and push in-app notifications.
        private async Task SendStatusNotificationsAsync(TaskEntity task, string from, string to, string? reason)
        {
            var recipients = new List<int>();
            void addManagers()
            {
                recipients.Add(task.CreatedById);
                if (task.Project != null) { recipients.Add(task.Project.OwnerId); recipients.Add(task.Project.CreatedById); }
            }

            switch (to.ToLowerInvariant())
            {
                case "under-review":
                    addManagers();
                    if (task.RequiresQA && task.QaAssigneeId.HasValue) recipients.Add(task.QaAssigneeId.Value);
                    break;
                case "completed":
                    if (task.AssignedToId.HasValue) recipients.Add(task.AssignedToId.Value);
                    addManagers();
                    break;
                case "blocked":
                case "paused":
                    addManagers();
                    break;
                case "issues":
                    // Notify the developer (assignee) that QA returned issues
                    if (task.AssignedToId.HasValue) recipients.Add(task.AssignedToId.Value);
                    addManagers();
                    break;
                case "in-progress":
                    if (from.Equals("completed", StringComparison.OrdinalIgnoreCase) && task.AssignedToId.HasValue)
                        recipients.Add(task.AssignedToId.Value);
                    if (from.Equals("under-review", StringComparison.OrdinalIgnoreCase) && task.AssignedToId.HasValue)
                        recipients.Add(task.AssignedToId.Value);
                    if (from.Equals("issues", StringComparison.OrdinalIgnoreCase))
                        addManagers();
                    break;
            }

            recipients.RemoveAll(id => id <= 0);
            if (recipients.Count == 0) return;

            var toL   = to.ToLowerInvariant();
            var fromL = from.ToLowerInvariant();
            var title = (toL, fromL) switch
            {
                ("blocked",      _)             => "Task Blocked",
                ("in-progress",  "blocked")     => "Task Unblocked",
                ("in-progress",  "completed")   => "Task Reopened",
                ("in-progress",  "under-review")=> "Review Returned",
                ("in-progress",  _)             => "Task Resumed",
                ("under-review", _)             => "Submitted for Review",
                ("completed",    "under-review")=> "Review Approved",
                ("completed",    _)             => "Task Completed",
                ("issues",       _)             => "QA Failed — Issues Found",
                ("paused",       _)             => "Task Paused",
                _                               => "Task Status Updated"
            };
            var body = $"\"{task.Title}\"" + (string.IsNullOrWhiteSpace(reason) ? "" : $" — {reason}");
            await _notifications.NotifyUsersAsync(recipients, new NotificationDto
            {
                Title = title,
                Body  = body,
                Type  = "status",
                TaskId = task.Id
            });
        }

        // Notify everyone connected to a task (assignee, creator, QA reviewer, project owner/creator),
        // except the user who performed the action. `type` drives frontend behavior — "block"/"issue"
        // pop a dialog, everything else lands in the notification feed.
        private async Task NotifyTaskStakeholdersAsync(int taskId, string title, string body, string type, int excludeUserId)
        {
            var task = await _context.Tasks
                .Include(t => t.Project)
                .FirstOrDefaultAsync(t => t.Id == taskId);
            if (task == null) return;

            var recipients = new List<int> { task.CreatedById };
            if (task.AssignedToId.HasValue) recipients.Add(task.AssignedToId.Value);
            if (task.QaAssigneeId.HasValue) recipients.Add(task.QaAssigneeId.Value);
            if (task.Project != null) { recipients.Add(task.Project.OwnerId); recipients.Add(task.Project.CreatedById); }

            recipients.RemoveAll(id => id <= 0 || id == excludeUserId);
            if (recipients.Count == 0) return;

            await _notifications.NotifyUsersAsync(recipients, new NotificationDto
            {
                Title  = title,
                Body   = body,
                Type   = type,
                TaskId = task.Id,
            });
        }

        public async Task<ApiResponse<List<TaskStatusHistoryDto>>> GetStatusHistoryAsync(int taskId, CancellationToken ct = default)
        {
            var history = await _context.TaskStatusHistories
                .Where(h => h.TaskId == taskId)
                .Include(h => h.ChangedBy)
                .OrderByDescending(h => h.ChangedAt)
                .ToListAsync(ct);

            var dtos = history.Select(h => new TaskStatusHistoryDto
            {
                Id = h.Id,
                TaskId = h.TaskId,
                FromStatus = h.FromStatus,
                ToStatus = h.ToStatus,
                Action = h.Action,
                ChangedById = h.ChangedById,
                ChangedByName = h.ChangedBy?.FullName,
                Reason = h.Reason,
                ActualHours = h.ActualHours,
                ChangedAt = h.ChangedAt
            }).ToList();

            return new ApiResponse<List<TaskStatusHistoryDto>> { Success = true, Data = dtos };
        }

        // ── Effort time tracking (derived from status + assignment history) ──────
        // Productive = time in "in-progress". Non-productive (excluded but reported):
        // "paused", "blocked", "under-review". "new"/"issues"/unknown = "other".
        private static bool IsProductiveStatus(string status) => EffortHelpers.IsProductiveStatus(status);

        public async Task<ApiResponse<TaskEffortDto>> GetTaskEffortAsync(int taskId, CancellationToken ct = default)
        {
            var task = await _context.Tasks
                .FirstOrDefaultAsync(t => t.Id == taskId, ct);
            if (task == null)
                return new ApiResponse<TaskEffortDto> { Success = false, Message = "Task not found" };

            var statusRows = await _context.TaskStatusHistories
                .Where(h => h.TaskId == taskId)
                .OrderBy(h => h.ChangedAt)
                .ToListAsync(ct);

            var assignRows = await _context.TaskAssignmentHistories
                .Where(h => h.TaskId == taskId)
                .OrderBy(h => h.ChangedAt)
                .ToListAsync(ct);

            // Single name lookup for every user referenced (no N+1).
            var userIds = new HashSet<int>();
            if (task.AssignedToId.HasValue) userIds.Add(task.AssignedToId.Value);
            foreach (var r in assignRows)
            {
                if (r.PreviousAssigneeId.HasValue) userIds.Add(r.PreviousAssigneeId.Value);
                if (r.NewAssigneeId.HasValue) userIds.Add(r.NewAssigneeId.Value);
            }
            var userNames = await _context.Users
                .Where(u => userIds.Contains(u.Id))
                .ToDictionaryAsync(u => u.Id, u => u.FullName, ct);

            var effort = ComputeEffort(task.CreatedAt, task.Status, statusRows, assignRows,
                task.AssignedToId, userNames, AppClock.Now);

            return new ApiResponse<TaskEffortDto> { Success = true, Data = effort };
        }

        // Org-wide effort summary for the dashboard, clipped to an optional [fromUtc, toUtc) window.
        // Working = productive (in-progress) + paused. Live snapshot counts use current task status.
        public async Task<ApiResponse<DashboardEffortDto>> GetEffortStatsAsync(DateTime? fromUtc, DateTime? toUtc, CancellationToken ct = default)
        {
            var now = AppClock.Now;
            var winStart = fromUtc ?? DateTime.MinValue;
            var winEnd = toUtc ?? now;

            // Pull only what we need for every task, in three bulk queries (no N+1).
            // Filter tasks and histories by the window end to exclude future data and reduce memory.
            var tasks = await _context.Tasks
                .Where(t => t.CreatedAt < winEnd)
                .Select(t => new { t.Id, t.CreatedAt, t.Status, t.AssignedToId })
                .ToListAsync(ct);

            var statusByTask = (await _context.TaskStatusHistories
                    .Where(h => h.ChangedAt < winEnd)
                    .OrderBy(h => h.ChangedAt)
                    .ToListAsync(ct))
                .GroupBy(h => h.TaskId)
                .ToDictionary(g => g.Key, g => (IReadOnlyList<TaskStatusHistory>)g.ToList());

            var assignByTask = (await _context.TaskAssignmentHistories
                    .Where(h => h.ChangedAt < winEnd)
                    .OrderBy(h => h.ChangedAt)
                    .ToListAsync(ct))
                .GroupBy(h => h.TaskId)
                .ToDictionary(g => g.Key, g => (IReadOnlyList<TaskAssignmentHistory>)g.ToList());

            long totalProductive = 0;
            long totalPaused = 0;
            var perUserProductive = new Dictionary<int, long>();
            var perUserPaused = new Dictionary<int, long>();
            var empty = new List<TaskStatusHistory>();
            var emptyAssign = new List<TaskAssignmentHistory>();

            foreach (var t in tasks)
            {
                var statusRows = statusByTask.TryGetValue(t.Id, out var sr) ? sr : empty;
                var assignRows = assignByTask.TryGetValue(t.Id, out var ar) ? ar : emptyAssign;

                // Build status segments for this task (same shape as the per-task view).
                var segments = BuildStatusSegments(t.CreatedAt, t.Status, statusRows, now);
                if (segments.Count == 0) continue;

                var windows = BuildAssignmentWindows(t.CreatedAt, assignRows, t.AssignedToId, now);

                foreach (var s in segments)
                {
                    var statusLower = (s.Status ?? string.Empty).ToLowerInvariant();
                    var isProd   = statusLower == "in-progress";
                    var isPaused = statusLower == "paused";
                    if (!isProd && !isPaused) continue;

                    // Clip segment to the requested date window, then filter to working hours.
                    var segWinStart = s.StartAt > winStart ? s.StartAt : winStart;
                    var segWinEnd   = s.EndAt   < winEnd   ? s.EndAt   : winEnd;
                    if (segWinEnd <= segWinStart) continue;
                    var clip = EffortHelpers.WorkingOverlap(segWinStart, segWinEnd);
                    if (clip <= 0) continue;

                    if (isProd)   totalProductive += clip;
                    if (isPaused) totalPaused     += clip;

                    // Attribute to whichever assignee held the task during the overlapping slice.
                    foreach (var w in windows)
                    {
                        if (w.UserId == 0) continue;
                        var intStart = segWinStart > w.Start ? segWinStart : w.Start;
                        var intEnd   = segWinEnd   < w.End   ? segWinEnd   : w.End;
                        if (intEnd <= intStart) continue;
                        var ov = EffortHelpers.WorkingOverlap(intStart, intEnd);
                        if (ov <= 0) continue;
                        if (isProd)
                        {
                            perUserProductive.TryGetValue(w.UserId, out var acc);
                            perUserProductive[w.UserId] = acc + ov;
                        }
                        if (isPaused)
                        {
                            perUserPaused.TryGetValue(w.UserId, out var pacc);
                            perUserPaused[w.UserId] = pacc + ov;
                        }
                    }
                }
            }

            // Live snapshot from current task status (not windowed).
            var workingUserIds = tasks
                .Where(t => t.AssignedToId.HasValue && string.Equals(t.Status, "in-progress", StringComparison.OrdinalIgnoreCase))
                .Select(t => t.AssignedToId!.Value).Distinct().ToHashSet();
            var pauseReviewUserIds = tasks
                .Where(t => t.AssignedToId.HasValue &&
                    (string.Equals(t.Status, "under-review", StringComparison.OrdinalIgnoreCase)
                     || string.Equals(t.Status, "paused", StringComparison.OrdinalIgnoreCase)
                     || string.Equals(t.Status, "blocked", StringComparison.OrdinalIgnoreCase)
                     || string.Equals(t.Status, "issues", StringComparison.OrdinalIgnoreCase)))
                .Select(t => t.AssignedToId!.Value).Distinct().ToHashSet();

            // Names + avatars for the top-users list.
            var topIds = perUserProductive.OrderByDescending(kv => kv.Value).Take(5).Select(kv => kv.Key).ToList();
            var userInfo = await _context.Users
                .Where(u => topIds.Contains(u.Id))
                .Select(u => new { u.Id, u.FullName, u.AvatarUrl })
                .ToDictionaryAsync(u => u.Id, u => new { u.FullName, u.AvatarUrl });

            var topUsers = perUserProductive
                .OrderByDescending(kv => kv.Value)
                .Take(5)
                .Select(kv => new TopUserEffortDto
                {
                    UserId = kv.Key,
                    UserName = userInfo.TryGetValue(kv.Key, out var info) ? info.FullName : $"User #{kv.Key}",
                    AvatarUrl = userInfo.TryGetValue(kv.Key, out var info2) ? info2.AvatarUrl : null,
                    ProductiveSeconds = kv.Value,
                    PausedSeconds = perUserPaused.TryGetValue(kv.Key, out var ps) ? ps : 0
                })
                .ToList();

            var dto = new DashboardEffortDto
            {
                FromUtc = fromUtc,
                ToUtc = toUtc,
                TotalActiveUsers = await _context.Users.CountAsync(u => u.IsActive, ct),
                ProductiveSeconds = totalProductive,
                PausedSeconds = totalPaused,
                WorkingSeconds = totalProductive + totalPaused,
                UsersCurrentlyWorking = workingUserIds.Count,
                UsersInPauseReview = pauseReviewUserIds.Count,
                TopProductiveUsers = topUsers
            };

            return new ApiResponse<DashboardEffortDto> { Success = true, Data = dto };
        }

        private static List<EffortTimelineSegmentDto> BuildStatusSegments(
            DateTime createdAt, string currentStatus, IReadOnlyList<TaskStatusHistory> statusRows, DateTime now)
            => EffortHelpers.BuildStatusSegments(createdAt, currentStatus, statusRows, now);

        // Pure computation — no DB access. Walks the ordered timelines into segments.
        private static TaskEffortDto ComputeEffort(
            DateTime createdAt,
            string currentStatus,
            IReadOnlyList<TaskStatusHistory> statusRows,
            IReadOnlyList<TaskAssignmentHistory> assignRows,
            int? currentAssigneeId,
            IReadOnlyDictionary<int, string> userNames,
            DateTime now)
        {
            // 1) Build status segments [StartAt, EndAt) tagged with the status held.
            var segments = new List<EffortTimelineSegmentDto>();
            var initialStatus = statusRows.Count > 0 ? statusRows[0].FromStatus : currentStatus;
            var segStart = createdAt;
            var segStatus = initialStatus ?? currentStatus ?? string.Empty;

            void Close(DateTime end, string nextStatus)
            {
                var endClamped = end < segStart ? segStart : end;        // clamp skew
                var seconds = EffortHelpers.WorkingOverlap(segStart, endClamped);
                segments.Add(new EffortTimelineSegmentDto
                {
                    Status = segStatus,
                    StartAt = segStart,
                    EndAt = endClamped,
                    Seconds = seconds,
                    IsProductive = IsProductiveStatus(segStatus)
                });
                segStart = endClamped;
                segStatus = nextStatus ?? string.Empty;
            }

            foreach (var row in statusRows)
                Close(row.ChangedAt, row.ToStatus);

            // Final segment: completed tasks accrue no running tail; otherwise runs to now.
            if (string.Equals(currentStatus, "completed", StringComparison.OrdinalIgnoreCase))
                Close(segStart, currentStatus ?? string.Empty);  // zero-length close
            else
                Close(now, currentStatus ?? string.Empty);

            // Drop any zero-length trailing/duplicate segments for a clean timeline,
            // but keep them out of the displayed list only (totals already exclude 0s).
            var timeline = segments.Where(s => s.Seconds > 0).ToList();

            // 2) Group durations by status.
            long productive = 0, paused = 0, blocked = 0, underReview = 0, other = 0;
            var byStatusMap = new Dictionary<string, long>(StringComparer.OrdinalIgnoreCase);
            foreach (var s in segments)
            {
                if (s.Seconds <= 0) continue;
                byStatusMap.TryGetValue(s.Status ?? string.Empty, out var acc);
                byStatusMap[s.Status ?? string.Empty] = acc + s.Seconds;
                switch ((s.Status ?? string.Empty).ToLowerInvariant())
                {
                    case "in-progress": productive  += s.Seconds; break;
                    case "paused":      paused      += s.Seconds; break;
                    case "blocked":     blocked     += s.Seconds; break;
                    case "under-review": underReview += s.Seconds; break;
                    default: other += s.Seconds; break;   // new, issues, unknown
                }
            }
            var byStatus = byStatusMap
                .Select(kv => new StatusDurationDto
                {
                    Status = kv.Key,
                    Seconds = kv.Value,
                    IsProductive = IsProductiveStatus(kv.Key)
                })
                .OrderByDescending(d => d.Seconds)
                .ToList();

            var total = productive + paused + blocked + underReview + other;

            // 3) Per-user attribution via assignment windows ∩ productive/paused segments.
            var windows = BuildAssignmentWindows(createdAt, assignRows, currentAssigneeId, now);
            var byUser = new List<UserEffortDto>();
            foreach (var w in windows.GroupBy(w => w.UserId))
            {
                var uid = w.Key;
                if (uid == 0) continue;  // unassigned periods belong to nobody
                long uProductive = 0;
                foreach (var win in w)
                {
                    foreach (var s in segments)
                    {
                        if (s.Seconds <= 0) continue;
                        var intStart = s.StartAt > win.Start ? s.StartAt : win.Start;
                        var intEnd   = s.EndAt   < win.End   ? s.EndAt   : win.End;
                        if (intEnd <= intStart) continue;
                        var ov = EffortHelpers.WorkingOverlap(intStart, intEnd);
                        if (ov <= 0) continue;
                        if (IsProductiveStatus(s.Status)) uProductive += ov;
                    }
                }

                DateTime? assignedAt = w.Min(x => x.Start) == createdAt ? createdAt : w.Min(x => x.Start);
                DateTime? firstStarted = segments
                    .Where(s => IsProductiveStatus(s.Status) && w.Any(win => Overlap(s.StartAt, s.EndAt, win.Start, win.End) > 0))
                    .Select(s => (DateTime?)s.StartAt)
                    .DefaultIfEmpty(null)
                    .Min();
                DateTime? completedAt = null;
                if (string.Equals(currentStatus, "completed", StringComparison.OrdinalIgnoreCase)
                    && currentAssigneeId == uid && statusRows.Count > 0)
                {
                    var lastCompleted = statusRows.LastOrDefault(r => string.Equals(r.ToStatus, "completed", StringComparison.OrdinalIgnoreCase));
                    completedAt = lastCompleted?.ChangedAt;
                }

                byUser.Add(new UserEffortDto
                {
                    UserId = uid,
                    UserName = userNames.TryGetValue(uid, out var n) ? n : $"User #{uid}",
                    ProductiveSeconds = uProductive,
                    PausedSeconds = 0,
                    AssignedAt = assignedAt,
                    FirstStartedAt = firstStarted,
                    CompletedAt = completedAt
                });
            }
            byUser = byUser.OrderByDescending(u => u.ProductiveSeconds).ToList();

            return new TaskEffortDto
            {
                TotalElapsedSeconds = total,
                ProductiveSeconds = productive,
                PausedSeconds = paused,
                BlockedSeconds = blocked,
                UnderReviewSeconds = underReview,
                OtherSeconds = other,
                IsRunning = IsProductiveStatus(currentStatus),
                ByStatus = byStatus,
                ByUser = byUser,
                Timeline = timeline
            };
        }

        private static List<EffortHelpers.AssignmentWindow> BuildAssignmentWindows(
            DateTime createdAt, IReadOnlyList<TaskAssignmentHistory> assignRows, int? currentAssigneeId, DateTime now)
            => EffortHelpers.BuildAssignmentWindows(createdAt, assignRows, currentAssigneeId, now);

        private static long Overlap(DateTime aStart, DateTime aEnd, DateTime bStart, DateTime bEnd)
            => EffortHelpers.Overlap(aStart, aEnd, bStart, bEnd);

        public async Task<ApiResponse<List<TaskAssignmentHistoryDto>>> GetTaskAssignmentHistoryAsync(int taskId, CancellationToken ct = default)
        {
            var history = await _context.TaskAssignmentHistories
                .Where(h => h.TaskId == taskId)
                .Include(h => h.PreviousAssignee)
                .Include(h => h.NewAssignee)
                .Include(h => h.ChangedBy)
                .OrderByDescending(h => h.ChangedAt)
                .ToListAsync(ct);

            var dtos = history.Select(h => new TaskAssignmentHistoryDto
            {
                Id = h.Id,
                TaskId = h.TaskId,
                PreviousAssigneeId = h.PreviousAssigneeId,
                PreviousAssigneeName = h.PreviousAssignee?.FullName,
                NewAssigneeId = h.NewAssigneeId,
                NewAssigneeName = h.NewAssignee?.FullName,
                ChangedById = h.ChangedById,
                ChangedByName = h.ChangedBy?.FullName ?? string.Empty,
                ChangedAt = h.ChangedAt,
                ReasonTag = h.ReasonTag
            }).ToList();

            return new ApiResponse<List<TaskAssignmentHistoryDto>> { Success = true, Data = dtos };
        }

        public async Task<ApiResponse<ChecklistItemDto>> AddChecklistItemAsync(int taskId, CreateChecklistItemDto dto, int userId)
        {
            var task = await _context.Tasks.FindAsync(taskId);
            if (task == null)
                return new ApiResponse<ChecklistItemDto> { Success = false, Message = "Task not found" };

            await using var tx = await _context.Database.BeginTransactionAsync();
            try
            {
                var item = new ChecklistItem
                {
                    TaskId = taskId,
                    Title = dto.Title,
                    IsCompleted = false,
                    OrderIndex = dto.OrderIndex,
                    CreatedAt = AppClock.Now
                };

                _context.ChecklistItems.Add(item);
                await _context.SaveChangesAsync();
                await RecalculateTaskProgressAsync(taskId);

                var user = await _context.Users.FindAsync(userId);
                _context.Activities.Add(new Activity
                {
                    UserId = userId,
                    UserName = user?.FullName ?? "Unknown",
                    Action = $"added checklist item '{dto.Title}'",
                    TargetType = "task",
                    TargetId = taskId,
                    TargetName = task.Title,
                    Timestamp = AppClock.Now
                });
                await _context.SaveChangesAsync();
                await tx.CommitAsync();

                return new ApiResponse<ChecklistItemDto>
                {
                    Success = true,
                    Data = _mapper.Map<ChecklistItemDto>(item)
                };
            }
            catch
            {
                await tx.RollbackAsync();
                throw;
            }
        }

        public async Task<ApiResponse<ChecklistItemDto>> ToggleChecklistItemAsync(int taskId, int itemId, bool isCompleted, int userId)
        {
            var item = await _context.ChecklistItems
                .Include(c => c.CompletedBy)
                .FirstOrDefaultAsync(c => c.Id == itemId && c.TaskId == taskId);

            if (item == null)
                return new ApiResponse<ChecklistItemDto> { Success = false, Message = "Checklist item not found" };

            var taskForAuth = await _context.Tasks.FindAsync(taskId);
            if (taskForAuth == null)
                return new ApiResponse<ChecklistItemDto> { Success = false, Message = "Task not found" };
            if (taskForAuth.AssignedToId != userId)
                return new ApiResponse<ChecklistItemDto> { Success = false, Message = "No permission: only the current assignee can toggle checklist items" };
            if (taskForAuth.StartedAt == null)
                return new ApiResponse<ChecklistItemDto> { Success = false, Message = "Press 'Start Task' before completing checklist items" };

            await using var tx = await _context.Database.BeginTransactionAsync();
            try
            {
                item.IsCompleted = isCompleted;
                item.CompletedAt = isCompleted ? AppClock.Now : null;
                item.CompletedById = isCompleted ? userId : null;

                await _context.SaveChangesAsync();
                await RecalculateTaskProgressAsync(taskId);

                var user = await _context.Users.FindAsync(userId);
                var task = await _context.Tasks.FindAsync(taskId);
                _context.Activities.Add(new Activity
                {
                    UserId = userId,
                    UserName = user?.FullName ?? "Unknown",
                    Action = isCompleted
                        ? $"completed checklist item '{item.Title}'"
                        : $"unchecked checklist item '{item.Title}'",
                    TargetType = "task",
                    TargetId = taskId,
                    TargetName = task?.Title ?? string.Empty,
                    Timestamp = AppClock.Now
                });
                await _context.SaveChangesAsync();
                await tx.CommitAsync();
            }
            catch
            {
                await tx.RollbackAsync();
                throw;
            }

            await NotifyTaskStakeholdersAsync(taskId,
                isCompleted ? "Checklist item completed" : "Checklist item reopened",
                $"\"{item.Title}\" was {(isCompleted ? "completed" : "unchecked")}.", "checklist", userId);

            // Reload with navigation to get updated CompletedBy
            var updatedItem = await _context.ChecklistItems
                .Include(c => c.CompletedBy)
                .FirstOrDefaultAsync(c => c.Id == itemId);

            return new ApiResponse<ChecklistItemDto>
            {
                Success = true,
                Data = _mapper.Map<ChecklistItemDto>(updatedItem)
            };
        }

        public async Task<ApiResponse<ChecklistItemDto>> UpdateChecklistItemAsync(int taskId, int itemId, UpdateChecklistItemDto dto, int userId)
        {
            var item = await _context.ChecklistItems
                .Include(c => c.CompletedBy)
                .FirstOrDefaultAsync(c => c.Id == itemId && c.TaskId == taskId);

            if (item == null)
                return new ApiResponse<ChecklistItemDto> { Success = false, Message = "Checklist item not found" };

            var oldTitle = item.Title;
            item.Title = dto.Title;
            item.OrderIndex = dto.OrderIndex;
            await _context.SaveChangesAsync();

            var task = await _context.Tasks.FindAsync(taskId);
            var user = await _context.Users.FindAsync(userId);
            if (oldTitle != dto.Title)
            {
                _context.Activities.Add(new Activity
                {
                    UserId = userId,
                    UserName = user?.FullName ?? "Unknown",
                    Action = $"updated checklist item '{oldTitle}' to '{dto.Title}'",
                    TargetType = "task",
                    TargetId = taskId,
                    TargetName = task?.Title ?? string.Empty,
                    Timestamp = AppClock.Now
                });
                await _context.SaveChangesAsync();
            }

            return new ApiResponse<ChecklistItemDto>
            {
                Success = true,
                Data = _mapper.Map<ChecklistItemDto>(item)
            };
        }

        public async Task<ApiResponse<bool>> DeleteChecklistItemAsync(int taskId, int itemId, int userId)
        {
            var item = await _context.ChecklistItems
                .FirstOrDefaultAsync(c => c.Id == itemId && c.TaskId == taskId);

            if (item == null)
                return new ApiResponse<bool> { Success = false, Message = "Checklist item not found" };

            var title = item.Title;
            var task = await _context.Tasks.FindAsync(taskId);
            var user = await _context.Users.FindAsync(userId);

            await using var tx = await _context.Database.BeginTransactionAsync();
            try
            {
                _context.ChecklistItems.Remove(item);
                await _context.SaveChangesAsync();
                await RecalculateTaskProgressAsync(taskId);

                _context.Activities.Add(new Activity
                {
                    UserId = userId,
                    UserName = user?.FullName ?? "Unknown",
                    Action = $"deleted checklist item '{title}'",
                    TargetType = "task",
                    TargetId = taskId,
                    TargetName = task?.Title ?? string.Empty,
                    Timestamp = AppClock.Now
                });
                await _context.SaveChangesAsync();
                await tx.CommitAsync();
            }
            catch
            {
                await tx.RollbackAsync();
                throw;
            }

            return new ApiResponse<bool> { Success = true, Data = true };
        }

        public async Task<ApiResponse<bool>> MarkAllChecklistCompleteAsync(int taskId, int userId)
        {
            var task = await _context.Tasks.FindAsync(taskId);
            if (task == null)
                return new ApiResponse<bool> { Success = false, Message = "Task not found" };
            // P2-D: the service is canonical for who may mark-all-complete (only the assignee)
            if (task.AssignedToId != userId)
                return new ApiResponse<bool> { Success = false, Message = "Only the current assignee can mark items complete" };
            if (task.StartedAt == null)
                return new ApiResponse<bool> { Success = false, Message = "Press 'Start Task' before completing checklist items" };

            var items = await _context.ChecklistItems
                .Where(c => c.TaskId == taskId && !c.IsCompleted)
                .ToListAsync();

            if (items.Count == 0)
                return new ApiResponse<bool> { Success = true, Data = true };

            await using var tx = await _context.Database.BeginTransactionAsync();
            try
            {
                var now = AppClock.Now;
                foreach (var item in items)
                {
                    item.IsCompleted = true;
                    item.CompletedAt = now;
                    item.CompletedById = userId;
                }
                await _context.SaveChangesAsync();
                await RecalculateTaskProgressAsync(taskId);

                var user = await _context.Users.FindAsync(userId);
                _context.Activities.Add(new Activity
                {
                    UserId = userId,
                    UserName = user?.FullName ?? "Unknown",
                    Action = "marked all checklist items complete",
                    TargetType = "task",
                    TargetId = taskId,
                    TargetName = task.Title,
                    Timestamp = AppClock.Now
                });
                await _context.SaveChangesAsync();
                await tx.CommitAsync();
            }
            catch
            {
                await tx.RollbackAsync();
                throw;
            }

            return new ApiResponse<bool> { Success = true, Data = true };
        }

        public async Task<ApiResponse<List<TaskCommentDto>>> GetCommentsAsync(int taskId, int? userId, DateTime? from, DateTime? to, CancellationToken ct = default)
        {
            var query = _context.TaskComments
                .Include(c => c.User)
                .Where(c => c.TaskId == taskId)
                .AsQueryable();

            if (userId.HasValue)
                query = query.Where(c => c.UserId == userId.Value);
            if (from.HasValue)
                query = query.Where(c => c.CreatedAt >= from.Value);
            if (to.HasValue)
                query = query.Where(c => c.CreatedAt <= to.Value);

            var comments = await query.OrderBy(c => c.CreatedAt).ToListAsync(ct);

            return new ApiResponse<List<TaskCommentDto>>
            {
                Success = true,
                Data = _mapper.Map<List<TaskCommentDto>>(comments)
            };
        }

        public async Task<ApiResponse<TaskDto>> SetTaskBlockAsync(int taskId, SetTaskBlockDto dto, int requesterId)
        {
            var task = await _context.Tasks
                .Include(t => t.BlockEntries).ThenInclude(b => b.BlockedBy)
                .FirstOrDefaultAsync(t => t.Id == taskId);

            if (task == null)
                return new ApiResponse<TaskDto> { Success = false, Message = "Task not found" };

            var project = await _context.Projects.FindAsync(task.ProjectId);
            bool isTaskCreator = task.CreatedById == requesterId;
            bool isProjectOwnerOrCreator = project != null && (project.OwnerId == requesterId || project.CreatedById == requesterId);
            bool isAssignee = task.AssignedToId == requesterId;

            bool isAdmin = await IsUserAdminAsync(requesterId);

            if (dto.IsBlocked)
            {
                // Assignee, an admin, or the project owner/creator can block
                if (!isAssignee && !isAdmin && !isProjectOwnerOrCreator)
                    return new ApiResponse<TaskDto> { Success = false, Message = "Only the assignee, an admin, or the project owner can block this task" };
            }
            else
            {
                // Unblock: task creator, project owner/creator, admin, or current assignee (their own block)
                if (!isTaskCreator && !isProjectOwnerOrCreator && !isAssignee && !isAdmin)
                    return new ApiResponse<TaskDto> { Success = false, Message = "Only the task creator, project owner, or an admin can unblock this task" };
            }

            var requester = await _context.Users.FindAsync(requesterId);

            await using var tx = await _context.Database.BeginTransactionAsync();
            try
            {
                if (dto.IsBlocked)
                {
                    if (dto.BlockItems == null || dto.BlockItems.Count == 0)
                        return new ApiResponse<TaskDto> { Success = false, Message = "At least one block checklist item is required when blocking a task." };

                    foreach (var item in dto.BlockItems)
                    {
                        if (!BlockCategories.Valid.Contains(item.Category))
                            return new ApiResponse<TaskDto> { Success = false, Message = $"Invalid block category '{item.Category}'." };
                        if (string.IsNullOrWhiteSpace(item.Description))
                            return new ApiResponse<TaskDto> { Success = false, Message = "Each block checklist item must have a description." };
                    }

                    // Mark any previous active block items as removed (fresh block session).
                    var previousActive = await _context.BlockChecklistItems
                        .Where(i => i.TaskId == taskId && i.Status == "active")
                        .ToListAsync();
                    foreach (var old in previousActive)
                    {
                        old.Status = "removed";
                        old.UpdatedAt = AppClock.Now;
                    }

                    foreach (var item in dto.BlockItems)
                    {
                        _context.BlockChecklistItems.Add(new BlockChecklistItem
                        {
                            TaskId = taskId,
                            Category = item.Category,
                            Description = item.Description.Trim(),
                            Comment = item.Comment?.Trim(),
                            ExpectedResolution = item.ExpectedResolution?.Trim(),
                            Status = "active",
                            CreatedById = requesterId,
                            CreatedAt = AppClock.Now
                        });
                    }

                    // Upsert block entry
                    var existing = task.BlockEntries.FirstOrDefault(b => b.BlockedById == requesterId);
                    var blockReason = dto.Reason ?? string.Empty;
                    if (existing != null)
                    {
                        existing.Reason = blockReason;
                        existing.IsActive = true;
                        existing.BlockedAt = AppClock.Now;
                        existing.ResolvedAt = null;
                    }
                    else
                    {
                        _context.TaskBlockEntries.Add(new TaskBlockEntry
                        {
                            TaskId = taskId,
                            BlockedById = requesterId,
                            BlockedByName = requester?.FullName ?? string.Empty,
                            Reason = blockReason,
                            IsActive = true,
                            BlockedAt = AppClock.Now
                        });
                    }

                    if (task.Status != "blocked") task.Status = "blocked";
                    task.UpdatedAt = AppClock.Now;

                    _context.Activities.Add(new Activity
                    {
                        UserId = requesterId,
                        UserName = requester?.FullName ?? "Unknown",
                        Action = $"blocked task with {dto.BlockItems.Count} item(s)",
                        TargetType = "task",
                        TargetId = taskId,
                        TargetName = task.Title,
                        Timestamp = AppClock.Now
                    });
                }
                else
                {
                    // Unblock gate: all active block checklist items must be resolved.
                    var activeItems = await _context.BlockChecklistItems
                        .Where(i => i.TaskId == taskId && i.Status == "active")
                        .ToListAsync();
                    if (activeItems.Count > 0)
                        return new ApiResponse<TaskDto> { Success = false, Message = $"{activeItems.Count} block item(s) must be resolved before unblocking." };

                    // Deactivate ALL active block entries on the task.
                    var actives = task.BlockEntries.Where(b => b.IsActive).ToList();
                    foreach (var b in actives)
                    {
                        b.IsActive = false;
                        b.ResolvedAt = AppClock.Now;
                    }

                    // Leaving the Blocked column → resume work
                    if (task.Status == "blocked")
                    {
                        task.Status = "in-progress";
                        if (task.StartedAt == null)
                        {
                            task.StartedAt = AppClock.Now;
                            task.StartedById = requesterId;
                        }
                    }
                    task.UpdatedAt = AppClock.Now;

                    _context.Activities.Add(new Activity
                    {
                        UserId = requesterId,
                        UserName = requester?.FullName ?? "Unknown",
                        Action = "unblocked task",
                        TargetType = "task",
                        TargetId = taskId,
                        TargetName = task.Title,
                        Timestamp = AppClock.Now
                    });
                }

                await _context.SaveChangesAsync();
                await tx.CommitAsync();
            }
            catch
            {
                await tx.RollbackAsync();
                throw;
            }

            if (dto.IsBlocked)
                await NotifyTaskStakeholdersAsync(taskId, "Task blocked",
                    $"\"{task.Title}\" was blocked." + (string.IsNullOrWhiteSpace(dto.Reason) ? "" : $" Reason: {dto.Reason}"), "block", requesterId);
            else
                await NotifyTaskStakeholdersAsync(taskId, "Task unblocked",
                    $"\"{task.Title}\" was unblocked.", "task", requesterId);

            return await GetTaskByIdAsync(taskId);
        }

        public async Task<ApiResponse<List<TaskBlockEntryDto>>> GetTaskBlockEntriesAsync(int taskId, CancellationToken ct = default)
        {
            var entries = await _context.TaskBlockEntries
                .Include(b => b.BlockedBy)
                .Where(b => b.TaskId == taskId)
                .OrderByDescending(b => b.BlockedAt)
                .ToListAsync(ct);

            var dtos = entries.Select(b => new TaskBlockEntryDto
            {
                Id = b.Id,
                TaskId = b.TaskId,
                BlockedById = b.BlockedById,
                BlockedByName = b.BlockedBy?.FullName ?? b.BlockedByName,
                Reason = b.Reason,
                IsActive = b.IsActive,
                BlockedAt = b.BlockedAt,
                ResolvedAt = b.ResolvedAt
            }).ToList();

            return new ApiResponse<List<TaskBlockEntryDto>> { Success = true, Data = dtos };
        }

        public async Task<TaskEntity?> GetTaskEntityAsync(int taskId)
        {
            return await _context.Tasks.FindAsync(taskId);
        }

        // True if the user's role is SystemAdmin (RoleId 1) or a role flagged IsAdmin.
        private async Task<bool> IsUserAdminAsync(int userId)
        {
            var user = await _context.Users.Include(u => u.Role).FirstOrDefaultAsync(u => u.Id == userId);
            if (user == null) return false;
            return user.RoleId == 1 || (user.Role?.IsAdmin ?? false);
        }

        private static readonly HashSet<string> ValidConditionNames =
            new(StringComparer.OrdinalIgnoreCase) { "HasIssues", "IsPaused" };

        public async Task<ApiResponse<TaskDto>> ToggleConditionAsync(int taskId, ToggleConditionDto dto, int userId)
        {
            if (!ValidConditionNames.Contains(dto.ConditionName))
                return new ApiResponse<TaskDto> { Success = false, Message = "Invalid condition name. Must be 'HasIssues' or 'IsPaused'." };

            var task = await _context.Tasks
                .Include(t => t.Project)
                .FirstOrDefaultAsync(t => t.Id == taskId);

            if (task == null)
                return new ApiResponse<TaskDto> { Success = false, Message = "Task not found" };

            var condName = dto.ConditionName;

            // Unpausing is restricted to admins and the task creator only.
            if (condName.Equals("IsPaused", StringComparison.OrdinalIgnoreCase) && !dto.Value)
            {
                var isAdminUser = await IsUserAdminAsync(userId);
                if (!isAdminUser && task.CreatedById != userId)
                    return new ApiResponse<TaskDto> { Success = false, Message = "Only an admin or the task creator can unpause a task.", ErrorCode = "FORBIDDEN" };
            }
            else
            {
                var isAssignee = task.AssignedToId == userId;
                var isManager = task.CreatedById == userId
                    || (task.Project != null && (task.Project.OwnerId == userId || task.Project.CreatedById == userId))
                    || await IsUserAdminAsync(userId);
                if (!isAssignee && !isManager)
                    return new ApiResponse<TaskDto> { Success = false, Message = "Only the assignee or manager can set task conditions.", ErrorCode = "FORBIDDEN" };
            }
            string? notes = null;
            if (condName.Equals("HasIssues", StringComparison.OrdinalIgnoreCase))
            {
                task.HasIssues = dto.Value;
            }
            else
            {
                task.IsPaused = dto.Value;
                if (dto.Value)
                {
                    task.PauseReason = string.IsNullOrWhiteSpace(dto.Reason) ? null : dto.Reason.Trim();
                    notes = task.PauseReason;
                }
                else
                {
                    task.PauseReason = null;
                }
            }

            task.UpdatedAt = AppClock.Now;

            _context.TaskConditionHistories.Add(new TaskConditionHistory
            {
                TaskId = taskId,
                ConditionName = condName,
                NewValue = dto.Value,
                Notes = notes,
                ChangedAt = AppClock.Now,
                ChangedById = userId
            });

            var actor = await _context.Users.FindAsync(userId);
            _context.Activities.Add(new Activity
            {
                UserId = userId,
                UserName = actor?.FullName ?? "Unknown",
                Action = $"set {condName} = {dto.Value} on task",
                TargetType = "task",
                TargetId = taskId,
                TargetName = task.Title,
                Timestamp = AppClock.Now
            });

            await using var tx = await _context.Database.BeginTransactionAsync();
            try
            {
                await _context.SaveChangesAsync();
                await tx.CommitAsync();
            }
            catch { await tx.RollbackAsync(); throw; }

            if (condName.Equals("HasIssues", StringComparison.OrdinalIgnoreCase) && dto.Value)
                await NotifyTaskStakeholdersAsync(taskId, "Task has issues",
                    $"\"{task.Title}\" was flagged as having issues.", "issue", userId);
            else if (condName.Equals("IsPaused", StringComparison.OrdinalIgnoreCase) && dto.Value)
                await NotifyTaskStakeholdersAsync(taskId, "Task paused",
                    $"\"{task.Title}\" was paused." + (notes != null ? $" Reason: {notes}" : ""), "task", userId);

            return await GetTaskByIdAsync(taskId);
        }

        public async Task<ApiResponse<TaskDto>> AddIssueEntryAsync(int taskId, AddIssueEntryDto dto, int userId)
        {
            var task = await _context.Tasks
                .Include(t => t.Project)
                .FirstOrDefaultAsync(t => t.Id == taskId);

            if (task == null)
                return new ApiResponse<TaskDto> { Success = false, Message = "Task not found" };

            var isAssignee = task.AssignedToId == userId;
            var isManager = task.CreatedById == userId
                || (task.Project != null && (task.Project.OwnerId == userId || task.Project.CreatedById == userId))
                || await IsUserAdminAsync(userId);

            if (!isAssignee && !isManager)
                return new ApiResponse<TaskDto> { Success = false, Message = "Only the assignee or manager can add issue entries.", ErrorCode = "FORBIDDEN" };

            _context.TaskIssueEntries.Add(new TaskIssueEntry
            {
                TaskId = taskId,
                Description = dto.Description.Trim(),
                CreatedById = userId,
                CreatedAt = AppClock.Now
            });

            if (!task.HasIssues)
            {
                task.HasIssues = true;
                _context.TaskConditionHistories.Add(new TaskConditionHistory
                {
                    TaskId = taskId, ConditionName = "HasIssues", NewValue = true,
                    ChangedAt = AppClock.Now, ChangedById = userId
                });
            }

            task.UpdatedAt = AppClock.Now;

            var actor = await _context.Users.FindAsync(userId);
            _context.Activities.Add(new Activity
            {
                UserId = userId,
                UserName = actor?.FullName ?? "Unknown",
                Action = $"added issue entry to task",
                TargetType = "task",
                TargetId = taskId,
                TargetName = task.Title,
                Timestamp = AppClock.Now
            });

            await using var tx = await _context.Database.BeginTransactionAsync();
            try
            {
                await _context.SaveChangesAsync();
                await tx.CommitAsync();
            }
            catch { await tx.RollbackAsync(); throw; }

            await NotifyTaskStakeholdersAsync(taskId, "New issue reported",
                $"\"{task.Title}\": {dto.Description.Trim()}", "issue", userId);

            return await GetTaskByIdAsync(taskId);
        }

        public async Task<ApiResponse<TaskDto>> ResolveIssueEntryAsync(int taskId, int entryId, ResolveIssueEntryDto dto, int userId)
        {
            var task = await _context.Tasks
                .Include(t => t.Project)
                .FirstOrDefaultAsync(t => t.Id == taskId);

            if (task == null)
                return new ApiResponse<TaskDto> { Success = false, Message = "Task not found" };

            var entry = await _context.TaskIssueEntries.FindAsync(entryId);
            if (entry == null || entry.TaskId != taskId)
                return new ApiResponse<TaskDto> { Success = false, Message = "Issue entry not found" };

            var isAssignee = task.AssignedToId == userId;
            var isManager = task.CreatedById == userId
                || (task.Project != null && (task.Project.OwnerId == userId || task.Project.CreatedById == userId))
                || await IsUserAdminAsync(userId);

            if (!isAssignee && !isManager)
                return new ApiResponse<TaskDto> { Success = false, Message = "Only the assignee or manager can resolve issue entries.", ErrorCode = "FORBIDDEN" };

            var wasResolved = entry.IsResolved;
            entry.IsResolved = dto.IsResolved;
            if (dto.IsResolved && !wasResolved)
            {
                entry.ResolvedAt = AppClock.Now;
                entry.ResolvedById = userId;
            }
            else if (!dto.IsResolved)
            {
                entry.ResolvedAt = null;
                entry.ResolvedById = null;
            }

            // Recompute HasIssues — true if any unresolved entry remains
            var anyOpen = await _context.TaskIssueEntries
                .AnyAsync(e => e.TaskId == taskId && !e.IsResolved && e.Id != entryId);
            // also account for the just-changed entry itself
            anyOpen = anyOpen || !dto.IsResolved;

            if (task.HasIssues != anyOpen)
            {
                task.HasIssues = anyOpen;
                _context.TaskConditionHistories.Add(new TaskConditionHistory
                {
                    TaskId = taskId, ConditionName = "HasIssues", NewValue = anyOpen,
                    ChangedAt = AppClock.Now, ChangedById = userId
                });
            }

            task.UpdatedAt = AppClock.Now;

            await using var tx = await _context.Database.BeginTransactionAsync();
            try
            {
                await _context.SaveChangesAsync();
                await tx.CommitAsync();
            }
            catch { await tx.RollbackAsync(); throw; }

            return await GetTaskByIdAsync(taskId);
        }

        public async Task<ApiResponse<TaskDto>> DeleteIssueEntryAsync(int taskId, int entryId, int userId)
        {
            var task = await _context.Tasks
                .Include(t => t.Project)
                .FirstOrDefaultAsync(t => t.Id == taskId);

            if (task == null)
                return new ApiResponse<TaskDto> { Success = false, Message = "Task not found" };

            var entry = await _context.TaskIssueEntries.FindAsync(entryId);
            if (entry == null || entry.TaskId != taskId)
                return new ApiResponse<TaskDto> { Success = false, Message = "Issue entry not found" };

            var isOwner = entry.CreatedById == userId;
            var isManager = task.CreatedById == userId
                || (task.Project != null && (task.Project.OwnerId == userId || task.Project.CreatedById == userId))
                || await IsUserAdminAsync(userId);

            if (!isOwner && !isManager)
                return new ApiResponse<TaskDto> { Success = false, Message = "Only the entry creator or manager can delete issue entries.", ErrorCode = "FORBIDDEN" };

            _context.TaskIssueEntries.Remove(entry);

            // Recompute HasIssues after removal
            var anyOpen = await _context.TaskIssueEntries
                .AnyAsync(e => e.TaskId == taskId && !e.IsResolved && e.Id != entryId);

            if (task.HasIssues != anyOpen)
            {
                task.HasIssues = anyOpen;
                _context.TaskConditionHistories.Add(new TaskConditionHistory
                {
                    TaskId = taskId, ConditionName = "HasIssues", NewValue = anyOpen,
                    ChangedAt = AppClock.Now, ChangedById = userId
                });
            }

            task.UpdatedAt = AppClock.Now;

            await using var tx = await _context.Database.BeginTransactionAsync();
            try
            {
                await _context.SaveChangesAsync();
                await tx.CommitAsync();
            }
            catch { await tx.RollbackAsync(); throw; }

            return await GetTaskByIdAsync(taskId);
        }

        public async Task<ApiResponse<TaskDto>> QaRejectAsync(int taskId, string? reason, int userId, bool isAdmin)
        {
            var task = await _context.Tasks
                .Include(t => t.Project)
                .Include(t => t.ChecklistItems)
                .Include(t => t.BlockEntries)
                .FirstOrDefaultAsync(t => t.Id == taskId);

            if (task == null)
                return new ApiResponse<TaskDto> { Success = false, Message = "Task not found" };

            var isManager = isAdmin
                || task.CreatedById == userId
                || (task.Project != null && (task.Project.OwnerId == userId || task.Project.CreatedById == userId));
            var isQa = task.QaAssigneeId.HasValue && task.QaAssigneeId.Value == userId;

            if (!isManager && !isQa)
                return new ApiResponse<TaskDto> { Success = false, Message = "Only the manager or QA reviewer can reject a task.", ErrorCode = "FORBIDDEN" };

            if (!task.Status.Equals("under-review", StringComparison.OrdinalIgnoreCase))
                return new ApiResponse<TaskDto> { Success = false, Message = "Task must be in 'Under Review' status to reject." };

            // Review checklist gate: at least one Required item must be Failed.
            var rcRejectRequired = await _context.ReviewChecklistItems
                .Where(i => i.TaskId == taskId && i.IsRequired)
                .ToListAsync();
            if (rcRejectRequired.Count > 0 && !rcRejectRequired.Any(i => i.Status == "failed"))
                return new ApiResponse<TaskDto> { Success = false, Message = "Mark at least one Required review checklist item as Failed before rejecting." };

            // Move to 'issues' status — developer sees this as a failed QA pass.
            var from = task.Status;
            task.Status = "issues";
            task.UpdatedAt = AppClock.Now;

            _context.TaskStatusHistories.Add(new TaskStatusHistory
            {
                TaskId = taskId, FromStatus = from, ToStatus = "issues",
                Action = "QA Failed / Return Issues",
                ChangedById = userId, Reason = reason ?? "QA rejected",
                ChangedAt = AppClock.Now
            });

            // Record the rejection as an issue entry for traceability.
            _context.TaskIssueEntries.Add(new TaskIssueEntry
            {
                TaskId = taskId,
                Description = $"QA rejected: {(string.IsNullOrWhiteSpace(reason) ? "Please fix and re-submit." : reason.Trim())}",
                CreatedById = userId,
                CreatedAt = AppClock.Now
            });

            var actor = await _context.Users.FindAsync(userId);
            _context.Activities.Add(new Activity
            {
                UserId = userId,
                UserName = actor?.FullName ?? "Unknown",
                Action = $"rejected task (QA fail). {reason ?? string.Empty}".TrimEnd(),
                TargetType = "task",
                TargetId = taskId,
                TargetName = task.Title,
                Timestamp = AppClock.Now
            });

            await using var tx = await _context.Database.BeginTransactionAsync();
            try
            {
                await _context.SaveChangesAsync();
                await tx.CommitAsync();
            }
            catch { await tx.RollbackAsync(); throw; }

            if (task.AssignedToId.HasValue)
            {
                await _notifications.NotifyUsersAsync(new List<int> { task.AssignedToId.Value }, new NotificationDto
                {
                    Title = "Task rejected by QA",
                    Body = $"\"{task.Title}\" has open issues — {reason ?? "please fix and re-submit."}",
                    Type = "task",
                    TaskId = task.Id
                });
            }

            return await GetTaskByIdAsync(taskId);
        }

        // ── Review Issues (reviewer-facing, distinct from assignee TaskIssueEntry) ──────

        // Only the assigned QA reviewer or a manager (creator / project owner / admin) may
        // manage review issues.
        private async Task<(bool ok, TaskEntity? task, string? error)> AuthorizeReviewerAsync(int taskId, int userId, bool isAdmin)
        {
            var task = await _context.Tasks
                .Include(t => t.Project)
                .FirstOrDefaultAsync(t => t.Id == taskId);
            if (task == null) return (false, null, "Task not found");

            var isManager = isAdmin
                || task.CreatedById == userId
                || (task.Project != null && (task.Project.OwnerId == userId || task.Project.CreatedById == userId));
            var isQa = task.QaAssigneeId.HasValue && task.QaAssigneeId.Value == userId;

            if (!isManager && !isQa)
                return (false, task, "Only the QA reviewer or a manager can manage review issues.");
            return (true, task, null);
        }

        public async Task<ApiResponse<TaskDto>> AddReviewIssueAsync(int taskId, AddReviewIssueDto dto, int userId, bool isAdmin)
        {
            var (ok, task, error) = await AuthorizeReviewerAsync(taskId, userId, isAdmin);
            if (!ok) return new ApiResponse<TaskDto> { Success = false, Message = error, ErrorCode = task == null ? null : "FORBIDDEN" };

            _context.TaskReviewIssues.Add(new TaskReviewIssue
            {
                TaskId = taskId,
                Description = dto.Description.Trim(),
                IsResolved = false,
                CreatedById = userId,
                CreatedAt = AppClock.Now
            });
            await _context.SaveChangesAsync();

            await NotifyTaskStakeholdersAsync(taskId, "Review issue added",
                $"\"{task!.Title}\": {dto.Description.Trim()}", "issue", userId);

            return await GetTaskByIdAsync(taskId);
        }

        public async Task<ApiResponse<TaskDto>> ResolveReviewIssueAsync(int taskId, int issueId, ResolveReviewIssueDto dto, int userId, bool isAdmin)
        {
            var (ok, task, error) = await AuthorizeReviewerAsync(taskId, userId, isAdmin);
            if (!ok) return new ApiResponse<TaskDto> { Success = false, Message = error, ErrorCode = task == null ? null : "FORBIDDEN" };

            var issue = await _context.TaskReviewIssues.FirstOrDefaultAsync(r => r.Id == issueId && r.TaskId == taskId);
            if (issue == null) return new ApiResponse<TaskDto> { Success = false, Message = "Review issue not found" };

            issue.IsResolved   = dto.IsResolved;
            issue.ResolvedAt   = dto.IsResolved ? AppClock.Now : null;
            issue.ResolvedById = dto.IsResolved ? userId : null;
            await _context.SaveChangesAsync();

            return await GetTaskByIdAsync(taskId);
        }

        public async Task<ApiResponse<TaskDto>> DeleteReviewIssueAsync(int taskId, int issueId, int userId, bool isAdmin)
        {
            var (ok, task, error) = await AuthorizeReviewerAsync(taskId, userId, isAdmin);
            if (!ok) return new ApiResponse<TaskDto> { Success = false, Message = error, ErrorCode = task == null ? null : "FORBIDDEN" };

            var issue = await _context.TaskReviewIssues.FirstOrDefaultAsync(r => r.Id == issueId && r.TaskId == taskId);
            if (issue == null) return new ApiResponse<TaskDto> { Success = false, Message = "Review issue not found" };

            _context.TaskReviewIssues.Remove(issue);
            await _context.SaveChangesAsync();

            return await GetTaskByIdAsync(taskId);
        }

        // Finish the review pass. Any unresolved review issue → send the task back to the
        // assignee (in-progress); otherwise pass it (completed). Kept separate from the
        // assignee's Task Issues — HasIssues / TaskIssueEntry are not touched.
        public async Task<ApiResponse<TaskDto>> CompleteReviewAsync(int taskId, int userId, bool isAdmin)
        {
            var (ok, task, error) = await AuthorizeReviewerAsync(taskId, userId, isAdmin);
            if (!ok) return new ApiResponse<TaskDto> { Success = false, Message = error, ErrorCode = task == null ? null : "FORBIDDEN" };

            if (!task!.Status.Equals("under-review", StringComparison.OrdinalIgnoreCase))
                return new ApiResponse<TaskDto> { Success = false, Message = "Task must be in 'Under Review' status to complete a review." };

            var rcAllItems = await _context.ReviewChecklistItems
                .Where(i => i.TaskId == taskId)
                .ToListAsync();

            int openCount;
            string reason;

            if (rcAllItems.Count > 0)
            {
                // Checklist-driven gate: Required items must all be evaluated.
                var rcRequired = rcAllItems.Where(i => i.IsRequired).ToList();
                var pendingRequired = rcRequired.Count(i => i.Status == "pending");

                if (pendingRequired > 0)
                    return new ApiResponse<TaskDto> { Success = false, Message = $"{pendingRequired} required checklist item(s) have not been evaluated yet." };

                var failedRequired = rcRequired.Count(i => i.Status == "failed");
                openCount = failedRequired;
                reason = openCount > 0
                    ? $"Review failed: {failedRequired} required item(s) did not pass."
                    : "All required checklist items passed.";
            }
            else
            {
                // Legacy fallback when no review checklist is defined.
                openCount = await _context.TaskReviewIssues
                    .CountAsync(r => r.TaskId == taskId && !r.IsResolved)
                    + await _context.TaskIssueEntries
                    .CountAsync(e => e.TaskId == taskId && !e.IsResolved);

                reason = openCount > 0
                    ? $"Review returned {openCount} unresolved issue(s)."
                    : "Review passed.";
            }

            var from = task.Status;
            var to = openCount > 0 ? "issues" : "completed";

            task.Status = to;
            task.UpdatedAt = AppClock.Now;

            // When review fails: reassign back to original developer
            if (openCount > 0)
            {
                var reviewerAssignment = await _context.TaskAssignmentHistories
                    .Where(h => h.TaskId == taskId && h.NewAssigneeId == task.AssignedToId)
                    .OrderByDescending(h => h.ChangedAt)
                    .FirstOrDefaultAsync();

                if (reviewerAssignment?.PreviousAssigneeId != null)
                {
                    _context.TaskAssignmentHistories.Add(new TaskAssignmentHistory
                    {
                        TaskId             = taskId,
                        PreviousAssigneeId = task.AssignedToId,
                        NewAssigneeId      = reviewerAssignment.PreviousAssigneeId.Value,
                        ReasonTag          = "Management Decision",
                        ChangedById        = userId,
                        ChangedAt          = AppClock.Now
                    });
                    task.AssignedToId = reviewerAssignment.PreviousAssigneeId.Value;
                }
            }

            var reviewAction = openCount > 0 ? "QA Failed / Return Issues" : "Approve & Complete";
            _context.TaskStatusHistories.Add(new TaskStatusHistory
            {
                TaskId = taskId, FromStatus = from, ToStatus = to,
                Action = reviewAction,
                ChangedById = userId, Reason = reason, ChangedAt = AppClock.Now
            });

            var actor = await _context.Users.FindAsync(userId);
            _context.Activities.Add(new Activity
            {
                UserId = userId,
                UserName = actor?.FullName ?? "Unknown",
                Action = openCount > 0
                    ? $"completed review — returned {openCount} issue(s) to assignee"
                    : "completed review — passed",
                TargetType = "task",
                TargetId = taskId,
                TargetName = task.Title,
                Timestamp = AppClock.Now
            });

            await using var tx = await _context.Database.BeginTransactionAsync();
            try
            {
                await _context.SaveChangesAsync();
                await tx.CommitAsync();
            }
            catch { await tx.RollbackAsync(); throw; }

            if (openCount > 0 && task.AssignedToId.HasValue)
                await _notifications.NotifyUsersAsync(new List<int> { task.AssignedToId.Value }, new NotificationDto
                {
                    Title = "QA returned your task",
                    Body  = $"\"{task.Title}\" has {openCount} review issue(s) to address. Status: Issues.",
                    Type  = "issue",
                    TaskId = task.Id
                });
            else
                await NotifyTaskStakeholdersAsync(taskId, "Task approved & completed",
                    $"\"{task.Title}\" passed review and is now completed.", "status", userId);

            return await GetTaskByIdAsync(taskId);
        }

        public async Task<bool> IsPreviousAssigneeAsync(int taskId, int userId)
        {
            return await _context.TaskAssignmentHistories
                .AnyAsync(h => h.TaskId == taskId && h.PreviousAssigneeId == userId);
        }

        private async Task RecalculateTaskProgressAsync(int taskId)
        {
            var items = await _context.ChecklistItems
                .Where(c => c.TaskId == taskId)
                .ToListAsync();

            if (items.Count == 0) return;

            var task = await _context.Tasks.FindAsync(taskId);
            if (task == null) return;

            var completed = items.Count(c => c.IsCompleted);
            task.Progress = (int)Math.Round((double)completed / items.Count * 100);
            task.UpdatedAt = AppClock.Now;

            await _context.SaveChangesAsync();
        }

        // ── Review Checklist (Phase 2) ──────────────────────────────────────────────

        private static ReviewChecklistItemDto MapReviewChecklistItem(ReviewChecklistItem r) => new()
        {
            Id = r.Id, TaskId = r.TaskId, Title = r.Title, Description = r.Description,
            Sequence = r.Sequence, IsRequired = r.IsRequired, Status = r.Status,
            ReviewerComment = r.ReviewerComment, ReviewedAt = r.ReviewedAt,
            ReviewedById = r.ReviewedById, ReviewedByName = r.ReviewedBy?.FullName,
            DeveloperResolutionComment = r.DeveloperResolutionComment,
            DeveloperResolutionAt = r.DeveloperResolutionAt,
            CreatedById = r.CreatedById, CreatedByName = r.CreatedBy?.FullName,
            CreatedAt = r.CreatedAt, UpdatedAt = r.UpdatedAt
        };

        public async Task<ApiResponse<List<ReviewChecklistItemDto>>> GetReviewChecklistAsync(int taskId, CancellationToken ct = default)
        {
            var items = await _context.ReviewChecklistItems
                .Where(i => i.TaskId == taskId)
                .Include(i => i.CreatedBy)
                .Include(i => i.ReviewedBy)
                .OrderBy(i => i.Sequence)
                .ToListAsync(ct);

            return new ApiResponse<List<ReviewChecklistItemDto>>
            {
                Success = true,
                Data = items.Select(MapReviewChecklistItem).ToList()
            };
        }

        public async Task<ApiResponse<ReviewChecklistItemDto>> AddReviewChecklistItemAsync(int taskId, CreateReviewChecklistItemDto dto, int userId)
        {
            var task = await _context.Tasks.FindAsync(taskId);
            if (task == null)
                return new ApiResponse<ReviewChecklistItemDto> { Success = false, Message = "Task not found" };

            var item = new ReviewChecklistItem
            {
                TaskId = taskId,
                Title = dto.Title.Trim(),
                Description = dto.Description?.Trim(),
                Sequence = dto.Sequence,
                IsRequired = dto.IsRequired,
                Status = "pending",
                CreatedById = userId,
                CreatedAt = AppClock.Now
            };
            _context.ReviewChecklistItems.Add(item);
            await _context.SaveChangesAsync();

            await _context.Entry(item).Reference(i => i.CreatedBy).LoadAsync();
            return new ApiResponse<ReviewChecklistItemDto> { Success = true, Data = MapReviewChecklistItem(item) };
        }

        public async Task<ApiResponse<ReviewChecklistItemDto>> UpdateReviewChecklistItemAsync(int taskId, int itemId, UpdateReviewChecklistItemDto dto, int userId)
        {
            var item = await _context.ReviewChecklistItems
                .Include(i => i.CreatedBy)
                .Include(i => i.ReviewedBy)
                .FirstOrDefaultAsync(i => i.Id == itemId && i.TaskId == taskId);
            if (item == null)
                return new ApiResponse<ReviewChecklistItemDto> { Success = false, Message = "Review checklist item not found" };

            if (item.Status != "pending")
                return new ApiResponse<ReviewChecklistItemDto> { Success = false, Message = "Cannot edit a checklist item that has already been evaluated." };

            item.Title = dto.Title.Trim();
            item.Description = dto.Description?.Trim();
            item.Sequence = dto.Sequence;
            item.IsRequired = dto.IsRequired;
            item.UpdatedAt = AppClock.Now;

            await _context.SaveChangesAsync();
            return new ApiResponse<ReviewChecklistItemDto> { Success = true, Data = MapReviewChecklistItem(item) };
        }

        public async Task<ApiResponse<bool>> DeleteReviewChecklistItemAsync(int taskId, int itemId, int userId)
        {
            var item = await _context.ReviewChecklistItems
                .FirstOrDefaultAsync(i => i.Id == itemId && i.TaskId == taskId);
            if (item == null)
                return new ApiResponse<bool> { Success = false, Message = "Review checklist item not found" };

            if (item.Status != "pending")
                return new ApiResponse<bool> { Success = false, Message = "Cannot delete a checklist item that has already been evaluated." };

            _context.ReviewChecklistItems.Remove(item);
            await _context.SaveChangesAsync();
            return new ApiResponse<bool> { Success = true, Data = true };
        }

        private static readonly HashSet<string> ValidReviewItemStatuses =
            new(StringComparer.OrdinalIgnoreCase) { "pending", "passed", "failed", "na" };

        public async Task<ApiResponse<ReviewChecklistItemDto>> SetReviewChecklistItemResultAsync(int taskId, int itemId, SetReviewChecklistItemResultDto dto, int userId, bool isAdmin)
        {
            if (!ValidReviewItemStatuses.Contains(dto.Status))
                return new ApiResponse<ReviewChecklistItemDto> { Success = false, Message = "Invalid status. Allowed: pending, passed, failed, na." };

            var task = await _context.Tasks.Include(t => t.Project).FirstOrDefaultAsync(t => t.Id == taskId);
            if (task == null)
                return new ApiResponse<ReviewChecklistItemDto> { Success = false, Message = "Task not found" };

            if (!task.Status.Equals("under-review", StringComparison.OrdinalIgnoreCase))
                return new ApiResponse<ReviewChecklistItemDto> { Success = false, Message = "Review checklist items can only be evaluated while the task is Under Review." };

            var isManager = isAdmin
                || task.CreatedById == userId
                || (task.Project != null && (task.Project.OwnerId == userId || task.Project.CreatedById == userId));
            var isQa = task.QaAssigneeId.HasValue && task.QaAssigneeId.Value == userId;

            if (!isManager && !isQa)
                return new ApiResponse<ReviewChecklistItemDto> { Success = false, Message = "Only the QA reviewer or manager can evaluate review checklist items.", ErrorCode = "FORBIDDEN" };

            var item = await _context.ReviewChecklistItems
                .Include(i => i.CreatedBy)
                .Include(i => i.ReviewedBy)
                .FirstOrDefaultAsync(i => i.Id == itemId && i.TaskId == taskId);
            if (item == null)
                return new ApiResponse<ReviewChecklistItemDto> { Success = false, Message = "Review checklist item not found" };

            item.Status = dto.Status.ToLowerInvariant();
            item.ReviewerComment = dto.ReviewerComment?.Trim();
            item.ReviewedAt = AppClock.Now;
            item.ReviewedById = userId;
            item.UpdatedAt = AppClock.Now;

            await _context.SaveChangesAsync();
            await _context.Entry(item).Reference(i => i.ReviewedBy).LoadAsync();
            return new ApiResponse<ReviewChecklistItemDto> { Success = true, Data = MapReviewChecklistItem(item) };
        }

        public async Task<ApiResponse<ReviewChecklistItemDto>> SetReviewChecklistItemResolutionAsync(int taskId, int itemId, string resolutionComment, int userId)
        {
            var task = await _context.Tasks.FindAsync(taskId);
            if (task == null)
                return new ApiResponse<ReviewChecklistItemDto> { Success = false, Message = "Task not found" };

            if (!task.Status.Equals("issues", StringComparison.OrdinalIgnoreCase))
                return new ApiResponse<ReviewChecklistItemDto> { Success = false, Message = "Resolution comments can only be added when the task is in Issues status." };

            if (task.AssignedToId != userId)
                return new ApiResponse<ReviewChecklistItemDto> { Success = false, Message = "Only the assignee can add resolution comments.", ErrorCode = "FORBIDDEN" };

            var item = await _context.ReviewChecklistItems
                .Include(i => i.CreatedBy)
                .Include(i => i.ReviewedBy)
                .FirstOrDefaultAsync(i => i.Id == itemId && i.TaskId == taskId);
            if (item == null)
                return new ApiResponse<ReviewChecklistItemDto> { Success = false, Message = "Review checklist item not found" };

            if (item.Status != "failed")
                return new ApiResponse<ReviewChecklistItemDto> { Success = false, Message = "Resolution comments can only be added to Failed items." };

            item.DeveloperResolutionComment = resolutionComment.Trim();
            item.DeveloperResolutionAt = AppClock.Now;
            item.UpdatedAt = AppClock.Now;

            await _context.SaveChangesAsync();
            return new ApiResponse<ReviewChecklistItemDto> { Success = true, Data = MapReviewChecklistItem(item) };
        }

        // ── Block Checklist (Phase 3) ───────────────────────────────────────────────

        private static BlockChecklistItemDto MapBlockChecklistItem(BlockChecklistItem b) => new()
        {
            Id = b.Id, TaskId = b.TaskId, Category = b.Category, Description = b.Description,
            Comment = b.Comment, ExpectedResolution = b.ExpectedResolution,
            Status = b.Status, ResolvedAt = b.ResolvedAt,
            ResolvedById = b.ResolvedById, ResolvedByName = b.ResolvedBy?.FullName,
            CreatedById = b.CreatedById, CreatedByName = b.CreatedBy?.FullName,
            CreatedAt = b.CreatedAt, UpdatedAt = b.UpdatedAt
        };

        public async Task<ApiResponse<List<BlockChecklistItemDto>>> GetBlockChecklistItemsAsync(int taskId, CancellationToken ct = default)
        {
            var items = await _context.BlockChecklistItems
                .Where(i => i.TaskId == taskId)
                .Include(i => i.CreatedBy)
                .Include(i => i.ResolvedBy)
                .OrderBy(i => i.CreatedAt)
                .ToListAsync(ct);

            return new ApiResponse<List<BlockChecklistItemDto>>
            {
                Success = true,
                Data = items.Select(MapBlockChecklistItem).ToList()
            };
        }

        public async Task<ApiResponse<BlockChecklistItemDto>> ResolveBlockChecklistItemAsync(int taskId, int itemId, ResolveBlockChecklistItemDto dto, int userId)
        {
            var task = await _context.Tasks.Include(t => t.Project).FirstOrDefaultAsync(t => t.Id == taskId);
            if (task == null)
                return new ApiResponse<BlockChecklistItemDto> { Success = false, Message = "Task not found" };

            var isAssignee = task.AssignedToId == userId;
            var isManager = task.CreatedById == userId
                || (task.Project != null && (task.Project.OwnerId == userId || task.Project.CreatedById == userId))
                || await IsUserAdminAsync(userId);

            if (!isAssignee && !isManager)
                return new ApiResponse<BlockChecklistItemDto> { Success = false, Message = "Only the assignee or manager can resolve block items.", ErrorCode = "FORBIDDEN" };

            var item = await _context.BlockChecklistItems
                .Include(i => i.CreatedBy)
                .Include(i => i.ResolvedBy)
                .FirstOrDefaultAsync(i => i.Id == itemId && i.TaskId == taskId);
            if (item == null)
                return new ApiResponse<BlockChecklistItemDto> { Success = false, Message = "Block checklist item not found" };

            if (item.Status != "active")
                return new ApiResponse<BlockChecklistItemDto> { Success = false, Message = "Only active block items can be resolved." };

            item.Status = "resolved";
            item.Comment = dto.ResolvedComment?.Trim() ?? item.Comment;
            item.ResolvedAt = AppClock.Now;
            item.ResolvedById = userId;
            item.UpdatedAt = AppClock.Now;

            await _context.SaveChangesAsync();
            await _context.Entry(item).Reference(i => i.ResolvedBy).LoadAsync();
            return new ApiResponse<BlockChecklistItemDto> { Success = true, Data = MapBlockChecklistItem(item) };
        }

        public async Task<ApiResponse<bool>> RemoveBlockChecklistItemAsync(int taskId, int itemId, int userId)
        {
            var task = await _context.Tasks.Include(t => t.Project).FirstOrDefaultAsync(t => t.Id == taskId);
            if (task == null)
                return new ApiResponse<bool> { Success = false, Message = "Task not found" };

            var isAssignee = task.AssignedToId == userId;
            var isManager = task.CreatedById == userId
                || (task.Project != null && (task.Project.OwnerId == userId || task.Project.CreatedById == userId))
                || await IsUserAdminAsync(userId);

            if (!isAssignee && !isManager)
                return new ApiResponse<bool> { Success = false, Message = "Only the assignee or manager can remove block items.", ErrorCode = "FORBIDDEN" };

            var item = await _context.BlockChecklistItems
                .FirstOrDefaultAsync(i => i.Id == itemId && i.TaskId == taskId);
            if (item == null)
                return new ApiResponse<bool> { Success = false, Message = "Block checklist item not found" };

            if (item.Status != "active")
                return new ApiResponse<bool> { Success = false, Message = "Only active block items can be removed." };

            item.Status = "removed";
            item.UpdatedAt = AppClock.Now;

            await _context.SaveChangesAsync();
            return new ApiResponse<bool> { Success = true, Data = true };
        }

        // ── Attachments ──────────────────────────────────────────────────────────────

        private static readonly HashSet<string> AllowedAttachmentExtensions = new(StringComparer.OrdinalIgnoreCase)
        {
            ".jpg", ".jpeg", ".png", ".gif", ".webp",
            ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
            ".zip", ".rar", ".7z",
            ".txt", ".csv", ".json", ".xml"
        };

        private const long MaxAttachmentBytes = 10 * 1024 * 1024; // 10 MB

        public async Task<ApiResponse<AttachmentDto>> UploadAttachmentAsync(int taskId, IFormFile file, int userId)
        {
            var task = await _context.Tasks.FindAsync(taskId);
            if (task == null)
                return new ApiResponse<AttachmentDto> { Success = false, Message = "Task not found" };

            if (file == null || file.Length == 0)
                return new ApiResponse<AttachmentDto> { Success = false, Message = "No file provided." };

            if (file.Length > MaxAttachmentBytes)
                return new ApiResponse<AttachmentDto> { Success = false, Message = "File exceeds the 10 MB limit." };

            var ext = Path.GetExtension(file.FileName);
            if (string.IsNullOrEmpty(ext) || !AllowedAttachmentExtensions.Contains(ext))
                return new ApiResponse<AttachmentDto> { Success = false, Message = $"File type '{ext}' is not allowed." };

            var webRoot     = _env.WebRootPath;
            var storedName  = $"{Guid.NewGuid()}{ext}";
            var now         = AppClock.Now;
            var relativeDir = Path.Combine("task-uploads", now.Year.ToString(), now.Month.ToString("D2"));
            var absoluteDir = Path.Combine(webRoot, relativeDir);
            Directory.CreateDirectory(absoluteDir);

            var absolutePath = Path.Combine(absoluteDir, storedName);
            using (var fs = new FileStream(absolutePath, FileMode.Create))
                await file.CopyToAsync(fs);

            var fileType = file.ContentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase) ? "image" : "document";
            var relPath  = "/" + relativeDir.Replace('\\', '/') + "/" + storedName;

            var attachment = new Attachment
            {
                TaskId       = taskId,
                FileName     = file.FileName,
                FilePath     = relPath,
                FileType     = fileType,
                FileSize     = file.Length,
                UploadedById = userId,
                UploadedAt   = now,
            };
            _context.Attachments.Add(attachment);
            await _context.SaveChangesAsync();

            await _context.Entry(attachment).Reference(a => a.UploadedBy).LoadAsync();

            return new ApiResponse<AttachmentDto>
            {
                Success = true,
                Data = new AttachmentDto
                {
                    Id             = attachment.Id,
                    TaskId         = attachment.TaskId,
                    FileName       = attachment.FileName,
                    FileType       = attachment.FileType,
                    FileSize       = attachment.FileSize,
                    UploadedById   = attachment.UploadedById,
                    UploadedByName = attachment.UploadedBy?.FullName,
                    UploadedAt     = attachment.UploadedAt,
                }
            };
        }

        public async Task<ApiResponse<bool>> DeleteAttachmentAsync(int taskId, int attachmentId, int userId, bool isAdmin)
        {
            var attachment = await _context.Attachments
                .FirstOrDefaultAsync(a => a.Id == attachmentId && a.TaskId == taskId);
            if (attachment == null)
                return new ApiResponse<bool> { Success = false, Message = "Attachment not found" };

            // Only the uploader, an admin, or the task manager may delete
            var task = await _context.Tasks.Include(t => t.Project).FirstOrDefaultAsync(t => t.Id == taskId);
            var isManager = task != null && (task.CreatedById == userId
                || (task.Project != null && (task.Project.OwnerId == userId || task.Project.CreatedById == userId)));

            if (attachment.UploadedById != userId && !isAdmin && !isManager)
                return new ApiResponse<bool> { Success = false, Message = "You are not allowed to delete this attachment." };

            // Remove the physical file — best-effort, don't fail if already gone.
            if (!string.IsNullOrEmpty(attachment.FilePath) && !string.IsNullOrEmpty(_env.WebRootPath))
            {
                try
                {
                    var wwwRoot  = Path.GetFullPath(_env.WebRootPath);
                    var relative = attachment.FilePath.TrimStart('/').Replace('/', Path.DirectorySeparatorChar);
                    var resolved = Path.GetFullPath(Path.Combine(wwwRoot, relative));
                    if (resolved.StartsWith(wwwRoot + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)
                        && File.Exists(resolved))
                    {
                        File.Delete(resolved);
                    }
                }
                catch { /* ignore */ }
            }

            _context.Attachments.Remove(attachment);
            await _context.SaveChangesAsync();
            return new ApiResponse<bool> { Success = true, Data = true };
        }

        public async Task<Attachment?> GetAttachmentEntityAsync(int attachmentId) =>
            await _context.Attachments.FindAsync(attachmentId);
    }
}
