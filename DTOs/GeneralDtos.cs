using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;

namespace TaskManagement.DTOs
{
    public static class ReasonTags
    {
        public static readonly HashSet<string> Valid = new(StringComparer.OrdinalIgnoreCase)
        {
            "Resignation", "Workload Balancing", "Management Decision", "Unavailability",
            "No Resource", "Unable to Complete", "Admin Decision", "Other"
        };
    }

    public static class BlockCategories
    {
        public static readonly HashSet<string> Valid = new(StringComparer.OrdinalIgnoreCase)
        {
            "Waiting for Client", "Waiting for Manager", "Waiting for Design",
            "Waiting for API", "Waiting for Backend", "Waiting for Frontend",
            "Waiting for Database", "Waiting for Third-party Service",
            "Waiting for Approval", "Waiting for Infrastructure",
            "Waiting for Requirement Clarification", "Other"
        };
    }

    public class UserDto
    {
        public int Id { get; set; }
        public string UserName { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string FirstName { get; set; } = string.Empty;
        public string LastName { get; set; } = string.Empty;
        public string FullName { get; set; } = string.Empty;
        public int RoleId { get; set; }
        public string? RoleName { get; set; }
        public bool IsAdmin { get; set; }
        public string? AvatarUrl { get; set; }
        public string? ContactNo { get; set; }
        public bool IsActive { get; set; }
        public bool IsDeleted { get; set; }
        public bool IsImpersonated { get; set; } = false;
        public string? ImpersonatedByName { get; set; }
    }

    public class SetUserActiveDto
    {
        public bool IsActive { get; set; }
    }

    public class ProjectMemberDto
    {
        public int UserId { get; set; }
        public string FullName { get; set; } = string.Empty;
        public string? Email { get; set; }
        public string? AvatarUrl { get; set; }
        public string? RoleInProject { get; set; }
    }

    public class ProjectDto
    {
        public int Id { get; set; }
        public string? Code { get; set; }
        public string Name { get; set; } = string.Empty;
        public string? Description { get; set; }
        public string Status { get; set; } = string.Empty;
        public DateTime? StartDate { get; set; }
        public DateTime? EndDate { get; set; }
        public int OwnerId { get; set; }
        public string? OwnerName { get; set; }
        public int CreatedById { get; set; }
        public string? CreatedByName { get; set; }
        public int MemberCount { get; set; }
        public List<int> MemberIds { get; set; } = new();
        public List<ProjectMemberDto> Members { get; set; } = new();
        public int TaskCount { get; set; }
        public int Progress { get; set; }
        public DateTime CreatedAt { get; set; }
        public List<ProjectAssignmentHistoryDto> AssignmentHistory { get; set; } = new();
        public List<string> Modules { get; set; } = new();
    }

    public class ReassignProjectDto
    {
        public int NewOwnerId { get; set; }
        public string ReasonTag { get; set; } = string.Empty;
    }

    public class ProjectAssignmentHistoryDto
    {
        public int Id { get; set; }
        public int ProjectId { get; set; }
        public int PreviousOwnerId { get; set; }
        public string? PreviousOwnerName { get; set; }
        public int NewOwnerId { get; set; }
        public string? NewOwnerName { get; set; }
        public int ChangedById { get; set; }
        public string ChangedByName { get; set; } = string.Empty;
        public DateTime ChangedAt { get; set; }
        public string ReasonTag { get; set; } = string.Empty;
    }

    public class AttachmentDto
    {
        public int Id { get; set; }
        public int TaskId { get; set; }
        public string FileName { get; set; } = string.Empty;
        public string FileType { get; set; } = string.Empty;
        public long FileSize { get; set; }
        public int UploadedById { get; set; }
        public string? UploadedByName { get; set; }
        public DateTime UploadedAt { get; set; }
    }

    public class TaskDto
    {
        public int Id { get; set; }
        public string? Code { get; set; }
        public string Title { get; set; } = string.Empty;
        public string? Description { get; set; }
        public string Status { get; set; } = string.Empty;
        public string Priority { get; set; } = string.Empty;
        public int ProjectId { get; set; }
        public string? ProjectName { get; set; }
        public string? ProjectCode { get; set; }
        public int? AssignedToId { get; set; }
        public string? AssignedToName { get; set; }
        public string? AssignedToAvatarUrl { get; set; }
        public int Progress { get; set; }
        public decimal? EstimatedHours { get; set; }
        public decimal? ActualHours { get; set; }
        public string? Module { get; set; }
        public bool IsBlocked { get; set; }
        public List<string> Tags { get; set; } = new List<string>();
        public int CommentCount { get; set; }
        public List<TaskCommentDto> Comments { get; set; } = new List<TaskCommentDto>();
        public List<ChecklistItemDto> ChecklistItems { get; set; } = new List<ChecklistItemDto>();
        public List<TaskAssignmentHistoryDto> AssignmentHistory { get; set; } = new List<TaskAssignmentHistoryDto>();
        public List<TaskBlockEntryDto> BlockEntries { get; set; } = new List<TaskBlockEntryDto>();
        public List<AttachmentDto> Attachments { get; set; } = new List<AttachmentDto>();
        public int CreatedById { get; set; }
        public string? CreatedByName { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime? UpdatedAt { get; set; }
        public DateTime? StartedAt { get; set; }
        public int? StartedById { get; set; }
        public string? StartedByName { get; set; }
        public int? ParentTaskId { get; set; }
        public string? ParentTaskTitle { get; set; }
        public bool RequiresQA { get; set; }
        public int? QaAssigneeId { get; set; }
        public string? QaAssigneeName { get; set; }
        public List<LinkedTaskDto> ChildTasks { get; set; } = new List<LinkedTaskDto>();
        public int ChildTaskCount { get; set; }
        public bool HasIssues { get; set; }
        public bool IsPaused  { get; set; }
        public bool IsOverdue { get; set; }
        public string? PauseReason { get; set; }
        public List<TaskConditionHistoryDto> ConditionHistory { get; set; } = new List<TaskConditionHistoryDto>();
        public List<TaskIssueEntryDto> IssueEntries { get; set; } = new List<TaskIssueEntryDto>();
        public List<TaskReviewIssueDto> ReviewIssues { get; set; } = new List<TaskReviewIssueDto>();
        public List<ReviewChecklistItemDto> ReviewChecklistItems { get; set; } = new List<ReviewChecklistItemDto>();
        public List<BlockChecklistItemDto> BlockChecklistItems { get; set; } = new List<BlockChecklistItemDto>();
    }

    public class ChangeStatusDto
    {
        public string ToStatus { get; set; } = string.Empty;
        public string? Reason { get; set; }
        public decimal? ActualHours { get; set; }
        // Required when ToStatus = "blocked"; each item replaces the plain-text reason.
        public List<AddBlockChecklistItemDto>? BlockItems { get; set; }
    }

    public class TaskStatusHistoryDto
    {
        public int Id { get; set; }
        public int TaskId { get; set; }
        public string FromStatus { get; set; } = string.Empty;
        public string ToStatus { get; set; } = string.Empty;
        public string? Action { get; set; }
        public int ChangedById { get; set; }
        public string? ChangedByName { get; set; }
        public string? Reason { get; set; }
        public decimal? ActualHours { get; set; }
        public DateTime ChangedAt { get; set; }
    }

    // ── Effort time tracking (derived from status + assignment history) ──────────
    public class StatusDurationDto
    {
        public string Status { get; set; } = string.Empty;
        public long Seconds { get; set; }
        public bool IsProductive { get; set; }
    }

    public class UserEffortDto
    {
        public int UserId { get; set; }
        public string UserName { get; set; } = string.Empty;
        public long ProductiveSeconds { get; set; }
        public long PausedSeconds { get; set; }
        public DateTime? AssignedAt { get; set; }
        public DateTime? FirstStartedAt { get; set; }
        public DateTime? CompletedAt { get; set; }
    }

    public class EffortTimelineSegmentDto
    {
        public string Status { get; set; } = string.Empty;
        public DateTime StartAt { get; set; }
        public DateTime EndAt { get; set; }
        public long Seconds { get; set; }
        public bool IsProductive { get; set; }
    }

    public class TaskEffortDto
    {
        public long TotalElapsedSeconds { get; set; }
        public long ProductiveSeconds { get; set; }
        public long PausedSeconds { get; set; }
        public long BlockedSeconds { get; set; }
        public long UnderReviewSeconds { get; set; }
        public long OtherSeconds { get; set; }
        public bool IsRunning { get; set; }
        public decimal? EstimatedHours { get; set; }
        public List<StatusDurationDto> ByStatus { get; set; } = new();
        public List<UserEffortDto> ByUser { get; set; } = new();
        public List<EffortTimelineSegmentDto> Timeline { get; set; } = new();
    }

    // ── Dashboard effort summary (org-wide, windowed) ────────────────────────────
    public class TopUserEffortDto
    {
        public int UserId { get; set; }
        public string UserName { get; set; } = string.Empty;
        public string? AvatarUrl { get; set; }
        public long ProductiveSeconds { get; set; }
        public long PausedSeconds { get; set; }
    }

    public class DashboardEffortDto
    {
        // Window covered (echoed back for display); null = all matched data.
        public DateTime? FromUtc { get; set; }
        public DateTime? ToUtc { get; set; }
        // Active users (IsActive) — not windowed.
        public int TotalActiveUsers { get; set; }
        // Windowed totals.
        public long ProductiveSeconds { get; set; }   // time in-progress
        public long PausedSeconds { get; set; }        // time paused
        public long WorkingSeconds { get; set; }       // productive + paused
        // Live snapshot (current task status, not windowed).
        public int UsersCurrentlyWorking { get; set; }     // assignee on an in-progress task
        public int UsersInPauseReview { get; set; }        // paused / under-review / blocked
        public List<TopUserEffortDto> TopProductiveUsers { get; set; } = new();
    }

    public class LinkedTaskDto
    {
        public int Id { get; set; }
        public string? Code { get; set; }
        public string Title { get; set; } = string.Empty;
        public string Status { get; set; } = string.Empty;
        public int? AssignedToId { get; set; }
        public string? AssignedToName { get; set; }
    }

    public class CreateTaskDto
    {
        public string Title { get; set; } = string.Empty;
        public string? Description { get; set; }
        public string Status { get; set; } = "new";
        public string Priority { get; set; } = "Medium";
        public int ProjectId { get; set; }
        public int? AssignedToId { get; set; }
        public string? Module { get; set; }
        public List<string>? Tags { get; set; }
        public int? ParentTaskId { get; set; }
        public bool RequiresQA { get; set; } = false;
        public int? QaAssigneeId { get; set; }
        // Every task must have an estimate (> 0). ActualHours is an optional manual figure.
        [Range(0.01, 100000)]
        public decimal? EstimatedHours { get; set; }
        public decimal? ActualHours { get; set; }
        // At least one checklist item is required on creation (ignored on updates).
        public List<string> ChecklistItems { get; set; } = new();
    }

    public class DashboardStatsDto
    {
        // Filter window echoed back for display; null FilterUserId means org-wide (admin "All Users").
        public int? FilterUserId { get; set; }
        public DateTime? FromUtc { get; set; }
        public DateTime? ToUtc { get; set; }
        public int TotalProjects { get; set; }
        public int TotalTasks { get; set; }
        public int ActiveUsers { get; set; }
        public int CompletedTasks { get; set; }
        public List<StatusCountDto> TasksByStatus { get; set; } = new();
        public DevChecklistStatsDto DevChecklist { get; set; } = new();
        public ReviewChecklistStatsDto ReviewChecklist { get; set; } = new();
        public BlockerStatsDto Blockers { get; set; } = new();
        public IssueStatsDto Issues { get; set; } = new();
    }

    // ── Project/Teammate x Status breakdown matrix (admin-only dashboard widget) ─
    public class ProjectStatusMatrixDto
    {
        public string Axis { get; set; } = "project"; // "project" | "assignee"
        public List<MatrixRowDto> Rows { get; set; } = new();
    }

    public class MatrixRowDto
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public Dictionary<string, int> CountsByStatus { get; set; } = new();
        public int Total { get; set; }
        // Assignee-axis only (0 on project-axis rows):
        // AssignedHours = sum of EstimatedHours across the user's tasks in scope (workload).
        // WorkingHours = computed productive+paused time (EffortHelpers, office-hours-clipped),
        // attributed to the task's current assignee, within the requested date window.
        public decimal AssignedHours { get; set; }
        public decimal WorkingHours { get; set; }
    }

    // ── At-risk snapshot (overdue tasks + stalled projects), current-state only ──
    public class AtRiskDto
    {
        public List<StalledProjectDto> StalledProjects { get; set; } = new();
    }

    public class StalledProjectDto
    {
        public int Id { get; set; }
        public string? Code { get; set; }
        public string Name { get; set; } = string.Empty;
        public int DaysSinceActivity { get; set; }
        public int OwnerId { get; set; }
        public string? OwnerName { get; set; }
    }

    public class StatusCountDto
    {
        public string Status { get; set; } = string.Empty;
        public int Count { get; set; }
    }

    public class DevChecklistStatsDto
    {
        public int Total { get; set; }
        public int Completed { get; set; }
        public int Remaining { get; set; }
    }

    public class ReviewChecklistStatsDto
    {
        public int Pending { get; set; }
        public int Passed { get; set; }
        public int Failed { get; set; }
    }

    public class BlockerStatsDto
    {
        public int Active { get; set; }
        public int Resolved { get; set; }
    }

    public class IssueStatsDto
    {
        public int Open { get; set; }
        public int Resolved { get; set; }
    }

    public class RoleDto
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string? Code { get; set; }
        public int Level { get; set; }
        public string? Description { get; set; }
        public bool IsAdmin { get; set; }
        public bool IsActive { get; set; } = true;
    }

    public class CreateUserDto
    {
        [StringLength(50)]
        public string? UserName { get; set; }
        [Required, EmailAddress, StringLength(256)]
        public string Email { get; set; } = string.Empty;
        [Required, StringLength(100)]
        public string FirstName { get; set; } = string.Empty;
        [Required, StringLength(100)]
        public string LastName { get; set; } = string.Empty;
        [Required, MinLength(6)]
        public string Password { get; set; } = string.Empty;
        public int RoleId { get; set; }
        public string? AvatarUrl { get; set; }
        [Phone]
        public string? ContactNo { get; set; }
        public bool IsActive { get; set; } = true;
    }

    public class UpdateUserDto
    {
        [StringLength(50)]
        public string? UserName { get; set; }
        [Required, StringLength(100)]
        public string FirstName { get; set; } = string.Empty;
        [Required, StringLength(100)]
        public string LastName { get; set; } = string.Empty;
        [Required, EmailAddress, StringLength(256)]
        public string Email { get; set; } = string.Empty;
        public int RoleId { get; set; }
        public string? AvatarUrl { get; set; }
        [Phone]
        public string? ContactNo { get; set; }
        public bool IsActive { get; set; }
    }

    public class ApiResponse<T>
    {
        public bool Success { get; set; }
        public string? Message { get; set; }
        public T? Data { get; set; }
        public List<string>? Errors { get; set; }
        public string? ErrorCode { get; set; }

        // Pagination metadata — populated only on paginated list endpoints.
        public int? TotalCount { get; set; }
        public int? Page { get; set; }
        public int? PageSize { get; set; }
        public int? TotalPages { get; set; }

        public static ApiResponse<T> Forbidden(string message) =>
            new() { Success = false, Message = message, ErrorCode = "FORBIDDEN" };

        public static ApiResponse<T> NotFound(string message) =>
            new() { Success = false, Message = message, ErrorCode = "NOT_FOUND" };
    }

    public class TaskCommentDto
    {
        public int Id { get; set; }
        public int TaskId { get; set; }
        public int UserId { get; set; }
        public string UserName { get; set; } = string.Empty;
        public string? AvatarUrl { get; set; }
        public string Text { get; set; } = string.Empty;
        public DateTime Timestamp { get; set; }
    }

    public class CreateTaskCommentDto
    {
        // UserId and UserName are intentionally omitted — the controller
        // derives these from the authenticated JWT claim.
        public string Text { get; set; } = string.Empty;
    }

    public class ActivityDto
    {
        public int Id { get; set; }
        public int UserId { get; set; }
        public string UserName { get; set; } = string.Empty;
        public string Action { get; set; } = string.Empty;
        public string TargetType { get; set; } = string.Empty;
        public int TargetId { get; set; }
        public string TargetName { get; set; } = string.Empty;
        public DateTime Timestamp { get; set; }
    }

    public class CreateActivityDto
    {
        public int UserId { get; set; }
        public string UserName { get; set; } = string.Empty;
        public string Action { get; set; } = string.Empty;
        public string TargetType { get; set; } = string.Empty;
        public int TargetId { get; set; }
        public string TargetName { get; set; } = string.Empty;
    }

    // Task Reassignment
    public class ReassignTaskDto
    {
        public int? NewAssigneeId { get; set; }
        public string ReasonTag { get; set; } = string.Empty;
    }

    public class TaskAssignmentHistoryDto
    {
        public int Id { get; set; }
        public int TaskId { get; set; }
        public int? PreviousAssigneeId { get; set; }
        public string? PreviousAssigneeName { get; set; }
        public int? NewAssigneeId { get; set; }
        public string? NewAssigneeName { get; set; }
        public int ChangedById { get; set; }
        public string ChangedByName { get; set; } = string.Empty;
        public DateTime ChangedAt { get; set; }
        public string ReasonTag { get; set; } = string.Empty;
    }

    // Checklist Items
    public class CreateChecklistItemDto
    {
        public string Title { get; set; } = string.Empty;
        public int OrderIndex { get; set; }
    }

    public class ChecklistItemDto
    {
        public int Id { get; set; }
        public int TaskId { get; set; }
        public string Title { get; set; } = string.Empty;
        public bool IsCompleted { get; set; }
        public DateTime? CompletedAt { get; set; }
        public int? CompletedById { get; set; }
        public string? CompletedByName { get; set; }
        public int OrderIndex { get; set; }
        public DateTime CreatedAt { get; set; }
    }

    public class ToggleChecklistItemDto
    {
        public bool IsCompleted { get; set; }
    }

    public class UpdateChecklistItemDto
    {
        public string Title { get; set; } = string.Empty;
        public int OrderIndex { get; set; }
    }

    public class ReorderChecklistItemDto
    {
        public int ItemId { get; set; }
        public int OrderIndex { get; set; }
    }

    // Task Block
    public class TaskBlockEntryDto
    {
        public int Id { get; set; }
        public int TaskId { get; set; }
        public int BlockedById { get; set; }
        public string BlockedByName { get; set; } = string.Empty;
        public string Reason { get; set; } = string.Empty;
        public bool IsActive { get; set; }
        public DateTime BlockedAt { get; set; }
        public DateTime? ResolvedAt { get; set; }
    }

    public class SetTaskBlockDto
    {
        public bool IsBlocked { get; set; }
        public string? Reason { get; set; }
        // Required when IsBlocked = true.
        public List<AddBlockChecklistItemDto>? BlockItems { get; set; }
    }

    public class TaskConditionHistoryDto
    {
        public int Id { get; set; }
        public string ConditionName { get; set; } = string.Empty;
        public bool NewValue { get; set; }
        public string? Notes { get; set; }
        public DateTime ChangedAt { get; set; }
        public int ChangedById { get; set; }
        public string? ChangedByName { get; set; }
    }

    public class ToggleConditionDto
    {
        [Required]
        public string ConditionName { get; set; } = string.Empty; // "HasIssues" | "IsPaused"
        public bool Value { get; set; }
        public string? Reason { get; set; }  // optional reason for IsPaused
    }

    public class TaskIssueEntryDto
    {
        public int Id { get; set; }
        public int TaskId { get; set; }
        public string Description { get; set; } = string.Empty;
        public bool IsResolved { get; set; }
        public DateTime CreatedAt { get; set; }
        public int CreatedById { get; set; }
        public string? CreatedByName { get; set; }
        public DateTime? ResolvedAt { get; set; }
        public int? ResolvedById { get; set; }
        public string? ResolvedByName { get; set; }
    }

    public class AddIssueEntryDto
    {
        [Required, MaxLength(500)]
        public string Description { get; set; } = string.Empty;
    }

    public class ResolveIssueEntryDto
    {
        public bool IsResolved { get; set; }
    }

    // ── Chat DTOs ──────────────────────────────────────────────

    public class ChatAttachmentDto
    {
        public int Id { get; set; }
        public string FileName { get; set; } = string.Empty;
        public string FileType { get; set; } = string.Empty;
        public long FileSize { get; set; }
        public string MimeType { get; set; } = string.Empty;
        public string Url { get; set; } = string.Empty;
    }

    public class ChatMessageDto
    {
        public int Id { get; set; }
        public string? Content { get; set; }
        public int SenderId { get; set; }
        public string SenderName { get; set; } = string.Empty;
        public string? SenderAvatar { get; set; }
        public DateTime SentAt { get; set; }
        public string MessageType { get; set; } = "text";
        public ChatAttachmentDto? Attachment { get; set; }
        public ChatMessageDto? ReplyTo { get; set; }
        public int? RoomId { get; set; }
    }

    public class SendMessageDto
    {
        public string? Content { get; set; }
        public string MessageType { get; set; } = "text";
        public int? ReplyToId { get; set; }
        public int? AttachmentId { get; set; }
        public int? RoomId { get; set; }
    }

    public class OnlineUserDto
    {
        public int UserId { get; set; }
        public string UserName { get; set; } = string.Empty;
        public string? AvatarUrl { get; set; }
        public DateTime ConnectedAt { get; set; }
    }

    public class ChatRoomDto
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string RoomType { get; set; } = "public";
        public int CreatedById { get; set; }
        public DateTime CreatedAt { get; set; }
        public List<ChatRoomMemberDto> Members { get; set; } = new();
        public ChatMessageDto? LastMessage { get; set; }
        public int UnreadCount { get; set; }
    }

    public class ChatRoomMemberDto
    {
        public int UserId { get; set; }
        public string UserName { get; set; } = string.Empty;
        public string? AvatarUrl { get; set; }
    }

    public class CreateChatRoomDto
    {
        public string Name { get; set; } = string.Empty;
        public string RoomType { get; set; } = "public";
        public List<int> MemberIds { get; set; } = new();
    }

    // ── Reports: user-wise effort breakdown ───────────────────────────────────
    public class UserEffortReportItemDto
    {
        public int UserId { get; set; }
        public string UserName { get; set; } = string.Empty;
        public string? AvatarUrl { get; set; }
        public int TaskCount { get; set; }
        public long ProductiveSeconds { get; set; }
        public long PausedSeconds { get; set; }
        public long BlockedSeconds { get; set; }
        public long UnderReviewSeconds { get; set; }
        public long TotalElapsedSeconds { get; set; }
    }

    public class UserEffortReportDto
    {
        public DateTime? FromUtc { get; set; }
        public DateTime? ToUtc { get; set; }
        public List<UserEffortReportItemDto> Users { get; set; } = new();
    }

    // ── Reports: user-wise status transition summary ──────────────────────────
    public class TransitionCountDto
    {
        public string FromStatus { get; set; } = string.Empty;
        public string ToStatus { get; set; } = string.Empty;
        public int Count { get; set; }
    }

    public class UserTransitionReportItemDto
    {
        public int UserId { get; set; }
        public string UserName { get; set; } = string.Empty;
        public string? AvatarUrl { get; set; }
        public int TotalTransitions { get; set; }
        public string MostCommonTransition { get; set; } = string.Empty;
        public List<TransitionCountDto> Breakdown { get; set; } = new();
    }

    public class UserTransitionReportDto
    {
        public DateTime? FromUtc { get; set; }
        public DateTime? ToUtc { get; set; }
        public List<UserTransitionReportItemDto> Users { get; set; } = new();
    }

    // ── Reports: per-task effort breakdown for a single user ─────────────────
    public class UserTaskEffortItemDto
    {
        public int TaskId { get; set; }
        public string TaskCode { get; set; } = string.Empty;
        public string TaskTitle { get; set; } = string.Empty;
        public string TaskStatus { get; set; } = string.Empty;
        public long ProductiveSeconds { get; set; }
        public long PausedSeconds { get; set; }
        public long BlockedSeconds { get; set; }
        public long UnderReviewSeconds { get; set; }
        public long TotalElapsedSeconds { get; set; }
    }

    public class UserTaskEffortReportDto
    {
        public int UserId { get; set; }
        public string UserName { get; set; } = string.Empty;
        public string? AvatarUrl { get; set; }
        public DateTime? FromUtc { get; set; }
        public DateTime? ToUtc { get; set; }
        public List<UserTaskEffortItemDto> Tasks { get; set; } = new();
    }

    // ── Reports: per-day effort for a single user ─────────────────────────────
    public class DailyEffortItemDto
    {
        public DateTime Date { get; set; }              // calendar date (time = 00:00)
        public long ProductiveSeconds { get; set; }
        public long PausedSeconds { get; set; }
        public long BlockedSeconds { get; set; }
        public long UnderReviewSeconds { get; set; }
        public long TotalElapsedSeconds { get; set; }
        public int TaskCount { get; set; }             // distinct tasks that had effort this day
    }

    public class UserDailyEffortReportDto
    {
        public int UserId { get; set; }
        public string UserName { get; set; } = string.Empty;
        public string? AvatarUrl { get; set; }
        public DateTime? FromUtc { get; set; }
        public DateTime? ToUtc { get; set; }
        public List<DailyEffortItemDto> Days { get; set; } = new();
    }

    // ── Reports: hours summary (user / task / project breakdown) ─────────────
    public class HoursSummaryUserRowDto
    {
        public int UserId { get; set; }
        public string UserName { get; set; } = string.Empty;
        public string? AvatarUrl { get; set; }
        public long ProductiveSeconds { get; set; }
        public long PausedSeconds { get; set; }
        public long BlockedSeconds { get; set; }
        public long UnderReviewSeconds { get; set; }
        public long TotalSeconds { get; set; }
        public int TaskCount { get; set; }
        // Sum of EstimatedHours across the user's distinct tasks in scope.
        public decimal EstimatedHours { get; set; }
        // Sum of ActualHours the user logged (TaskStatusHistory.ActualHours) across
        // their status transitions in scope — i.e. self-reported "hours spent",
        // distinct from ProductiveSeconds/TotalSeconds which are auto-reconstructed
        // from status-history timing rather than user-entered.
        public decimal WorkingHoursSpent { get; set; }
    }

    public class HoursSummaryTaskRowDto
    {
        public int TaskId { get; set; }
        public string TaskCode { get; set; } = string.Empty;
        public string TaskTitle { get; set; } = string.Empty;
        public string TaskStatus { get; set; } = string.Empty;
        public int ProjectId { get; set; }
        public string ProjectName { get; set; } = string.Empty;
        public long ProductiveSeconds { get; set; }
        public long PausedSeconds { get; set; }
        public long BlockedSeconds { get; set; }
        public long UnderReviewSeconds { get; set; }
        public long TotalSeconds { get; set; }
    }

    public class HoursSummaryProjectRowDto
    {
        public int ProjectId { get; set; }
        public string ProjectName { get; set; } = string.Empty;
        public long ProductiveSeconds { get; set; }
        public long PausedSeconds { get; set; }
        public long BlockedSeconds { get; set; }
        public long UnderReviewSeconds { get; set; }
        public long TotalSeconds { get; set; }
        public int TaskCount { get; set; }
        public int UserCount { get; set; }
    }

    public class HoursSummaryDto
    {
        public DateTime? FromUtc { get; set; }
        public DateTime? ToUtc { get; set; }
        public long TotalProductiveSeconds { get; set; }
        public long TotalWorkingSeconds { get; set; }    // productive + paused + blocked + under-review
        public int? FilterUserId { get; set; }
        public int? FilterProjectId { get; set; }
        public List<HoursSummaryUserRowDto> ByUser { get; set; } = new();
        public List<HoursSummaryTaskRowDto> ByTask { get; set; } = new();
        public List<HoursSummaryProjectRowDto> ByProject { get; set; } = new();
    }

    public class WorkDiaryDto
    {
        public int Id { get; set; }
        public int UserId { get; set; }
        public string UserFullName { get; set; } = string.Empty;
        public string? UserAvatarUrl { get; set; }
        public DateTime Date { get; set; }
        public string Description { get; set; } = string.Empty;
        public string? Category { get; set; }
        public decimal? HoursSpent { get; set; }
        public int? ProjectId { get; set; }
        public string? ProjectName { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
    }

    public class WorkDiaryProjectOptionDto
    {
        public int Id { get; set; }
        public string? Code { get; set; }
        public string Name { get; set; } = string.Empty;
    }

    public class CreateWorkDiaryDto
    {
        [System.ComponentModel.DataAnnotations.Required]
        public DateTime Date { get; set; }
        [System.ComponentModel.DataAnnotations.Required]
        public string Description { get; set; } = string.Empty;
        public string? Category { get; set; }
        public decimal? HoursSpent { get; set; }
        public int? ProjectId { get; set; }
    }

    public class UpdateWorkDiaryDto
    {
        [System.ComponentModel.DataAnnotations.Required]
        public string Description { get; set; } = string.Empty;
        public string? Category { get; set; }
        public decimal? HoursSpent { get; set; }
        public int? ProjectId { get; set; }
    }

    // ── Leave and Holidays module ───────────────────────────────────────────

    // Read shape for the editable Rules Settings. WorkStartTime/WorkEndTime are plain "HH:mm"
    // strings (matching ClientApp's TimeInput convention) rather than a raw TimeSpan, which
    // System.Text.Json would serialize as "10:00:00" instead.
    public class WorkweekRulesDto
    {
        public string WorkStartTime { get; set; } = "10:00";
        public string WorkEndTime { get; set; } = "19:00";
        public int BreakMinMinutes { get; set; } = 30;
        public int BreakMaxMinutes { get; set; } = 60;
        public List<int> HolidaySaturdayOccurrences { get; set; } = new() { 1, 3, 5 };
        public DateTime? UpdatedAt { get; set; }
    }

    public class UpdateWorkweekRulesDto
    {
        public string WorkStartTime { get; set; } = string.Empty;
        public string WorkEndTime { get; set; } = string.Empty;
        public int BreakMinMinutes { get; set; }
        public int BreakMaxMinutes { get; set; }
        public List<int> HolidaySaturdayOccurrences { get; set; } = new();
    }

    public class HolidayDto
    {
        public int Id { get; set; }
        public DateTime Date { get; set; }
        public string Name { get; set; } = string.Empty;
        // "Holiday" | "WorkingDay"
        public string DayType { get; set; } = "Holiday";
        public bool IsManualOverride { get; set; }
    }

    public class SetHolidayOverrideDto
    {
        public DateTime Date { get; set; }
        public string Name { get; set; } = string.Empty;
        public string DayType { get; set; } = string.Empty;
    }

    public class LeaveTypeDto
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public bool IsActive { get; set; } = true;
    }

    public class SaveLeaveTypeDto
    {
        public string Name { get; set; } = string.Empty;
        public bool IsActive { get; set; } = true;
    }

    // Type-agnostic — one pooled balance per user per year, sourced from AnnualLeaveAllocation.
    public class LeaveBalanceDto
    {
        public int Year { get; set; }
        public decimal AllocatedDays { get; set; }
        public decimal UsedDays { get; set; }
        public decimal AvailableDays { get; set; }
    }

    public class AnnualLeaveAllocationDto
    {
        public int Year { get; set; }
        public decimal LeaveDays { get; set; }
    }

    public class UpdateAnnualLeaveAllocationDto
    {
        public decimal LeaveDays { get; set; }
    }

    public class LeaveRequestDto
    {
        public int Id { get; set; }
        public int UserId { get; set; }
        public string UserFullName { get; set; } = string.Empty;
        public string? UserAvatarUrl { get; set; }
        public int LeaveTypeId { get; set; }
        public string LeaveTypeName { get; set; } = string.Empty;
        public DateTime StartDate { get; set; }
        public DateTime EndDate { get; set; }
        public decimal DayCount { get; set; }
        public string Reason { get; set; } = string.Empty;
        // "Pending" | "Approved" | "Rejected"
        public string Status { get; set; } = "Pending";
        public int? ApproverId { get; set; }
        public string? ApproverName { get; set; }
        public DateTime? DecisionAt { get; set; }
        public string? DecisionNote { get; set; }
        public bool AllowEdit { get; set; } = true;
        public bool AllowDelete { get; set; } = true;
        public DateTime CreatedAt { get; set; }
    }

    public class CreateLeaveRequestDto
    {
        public int LeaveTypeId { get; set; }
        public DateTime? StartDate { get; set; }
        public DateTime? EndDate { get; set; }
        public string Reason { get; set; } = string.Empty;
    }

    // Same shape as CreateLeaveRequestDto — kept as a separate type so the two can diverge later
    // (e.g. if edit ever needs different rules than create) without a breaking change.
    public class UpdateLeaveRequestDto
    {
        public int LeaveTypeId { get; set; }
        public DateTime? StartDate { get; set; }
        public DateTime? EndDate { get; set; }
        public string Reason { get; set; } = string.Empty;
    }

    public class DecideLeaveRequestDto
    {
        public bool Approve { get; set; }
        public string? DecisionNote { get; set; }
    }

    public class SetLeaveRequestPermissionsDto
    {
        public bool AllowEdit { get; set; }
        public bool AllowDelete { get; set; }
    }

    public class DailyUtilizationItemDto
    {
        public DateTime Date { get; set; }
        public string DayName { get; set; } = string.Empty;
        public double DiaryHours { get; set; }
        public double TaskHours { get; set; }
        public double TotalHours { get; set; }
        public double TargetHours { get; set; } = 8.0;
        public bool IsWorkingDay { get; set; }
        public bool IsComplete { get; set; }
    }

    public class UserDailyUtilizationReportDto
    {
        public int UserId { get; set; }
        public string UserName { get; set; } = string.Empty;
        public string? AvatarUrl { get; set; }
        public int Month { get; set; }
        public int Year { get; set; }
        public List<DailyUtilizationItemDto> Days { get; set; } = new();
        public int TotalWorkingDays { get; set; }
        public int DaysComplete { get; set; }
        public int DaysPartial { get; set; }
        public double TotalHoursLogged { get; set; }
    }

    // ── Task Template module ─────────────────────────────────────────────────────

    public class SaveTaskTemplateDto
    {
        [Required, MaxLength(200)]
        public string    Name                { get; set; } = string.Empty;
        public string?   Description         { get; set; }
        public int?      ProjectId           { get; set; }
        public string?   Module              { get; set; }
        [Required]
        public string    RecurrenceType      { get; set; } = "weekly";
        public int?      DayOfWeek           { get; set; }
        public int?      DayOfMonth          { get; set; }
        public List<int>?    DaysOfMonth     { get; set; }
        public List<int>?    SkipDaysOfWeek  { get; set; }
        public List<string>? SkipDates       { get; set; }
        public List<int>?    SkipDaysOfMonth { get; set; }
        public int?      CustomIntervalDays  { get; set; }
        public string?   TriggerTime         { get; set; }
        public DateTime  StartDate           { get; set; }
        public DateTime? EndDate             { get; set; }
        public bool      IsActive            { get; set; } = true;
        public List<int>                 AssigneeIds { get; set; } = new();
        public List<SaveTemplateItemDto> Items       { get; set; } = new();
    }

    public class SaveTemplateItemDto
    {
        public int?    Id                 { get; set; }
        public int     Position           { get; set; }
        [Required, MaxLength(200)]
        public string  Title              { get; set; } = string.Empty;
        public string? Description        { get; set; }
        public decimal EstimatedHours     { get; set; }
        public string  Priority           { get; set; } = "medium";
        public int?    DefaultAssigneeId  { get; set; }
        public int?    QaReviewerId       { get; set; }
        public int     DueDateOffsetDays  { get; set; }
        public List<string> Tags              { get; set; } = new();
        public List<string> ChecklistItems    { get; set; } = new();
        public List<int>    DependsOnPositions { get; set; } = new();
        public List<string> ReviewCriteria    { get; set; } = new();
    }

    public class ManualGenerateDto
    {
        public DateTime? ForDate { get; set; }
        public string?   Notes   { get; set; }
    }

    public class TaskTemplateDto
    {
        public int       Id                  { get; set; }
        public string    Name                { get; set; } = string.Empty;
        public string?   Description         { get; set; }
        public int?      ProjectId           { get; set; }
        public string?   ProjectName         { get; set; }
        public string?   Module              { get; set; }
        public string    RecurrenceType      { get; set; } = string.Empty;
        public int?      DayOfWeek           { get; set; }
        public int?      DayOfMonth          { get; set; }
        public List<int>     DaysOfMonth     { get; set; } = new();
        public List<int>     SkipDaysOfWeek  { get; set; } = new();
        public List<string>  SkipDates       { get; set; } = new();
        public List<int>     SkipDaysOfMonth { get; set; } = new();
        public int?      CustomIntervalDays  { get; set; }
        public string?   TriggerTime         { get; set; }
        public DateTime  StartDate           { get; set; }
        public DateTime? EndDate             { get; set; }
        public bool      IsActive            { get; set; }
        public string    CreatedByName       { get; set; } = string.Empty;
        public DateTime  CreatedAt           { get; set; }
        public int       GenerationCount     { get; set; }
        public DateTime? LastGeneratedAt     { get; set; }
        public DateTime? NextRunAt           { get; set; }
        public int       ItemCount           { get; set; }
        public List<int>                 AssigneeIds   { get; set; } = new();
        public List<string>              AssigneeNames { get; set; } = new();
        public List<TaskTemplateItemDto> Items         { get; set; } = new();
    }

    public class TaskTemplateItemDto
    {
        public int      Id                  { get; set; }
        public int      Position            { get; set; }
        public string   Title               { get; set; } = string.Empty;
        public string?  Description         { get; set; }
        public decimal  EstimatedHours      { get; set; }
        public string   Priority            { get; set; } = string.Empty;
        public int?     DefaultAssigneeId   { get; set; }
        public string?  DefaultAssigneeName { get; set; }
        public int?     QaReviewerId        { get; set; }
        public string?  QaReviewerName      { get; set; }
        public List<string> Tags              { get; set; } = new();
        public List<string> ChecklistItems    { get; set; } = new();
        public List<int>    DependsOnPositions { get; set; } = new();
        public List<string> ReviewCriteria    { get; set; } = new();
    }

    public class TaskTemplateGenerationDto
    {
        public int       Id              { get; set; }
        public string    PeriodKey       { get; set; } = string.Empty;
        public DateTime  GeneratedAt     { get; set; }
        public string?   GeneratedByName { get; set; }
        public int       TaskCount       { get; set; }
        public string?   Notes           { get; set; }
        public List<GeneratedTaskLinkDto> Tasks { get; set; } = new();
    }

    public class GeneratedTaskLinkDto
    {
        public int    TaskId              { get; set; }
        public string TaskTitle           { get; set; } = string.Empty;
        public string AssigneeName        { get; set; } = string.Empty;
        public string TemplateItemTitle   { get; set; } = string.Empty;
    }

    public class TaskReviewIssueDto
    {
        public int       Id              { get; set; }
        public int       TaskId          { get; set; }
        public string    Description     { get; set; } = string.Empty;
        public bool      IsResolved      { get; set; }
        public DateTime  CreatedAt       { get; set; }
        public int       CreatedById     { get; set; }
        public string?   CreatedByName   { get; set; }
        public DateTime? ResolvedAt      { get; set; }
        public int?      ResolvedById    { get; set; }
        public string?   ResolvedByName  { get; set; }
    }

    public class AddReviewIssueDto
    {
        [Required, MaxLength(500)]
        public string Description { get; set; } = string.Empty;
    }

    public class ResolveReviewIssueDto
    {
        public bool IsResolved { get; set; }
    }

    // ── Review Checklist (Phase 2) ───────────────────────────────────────────────

    public class ReviewChecklistItemDto
    {
        public int Id { get; set; }
        public int TaskId { get; set; }
        public string Title { get; set; } = string.Empty;
        public string? Description { get; set; }
        public int Sequence { get; set; }
        public bool IsRequired { get; set; }
        // "pending" | "passed" | "failed" | "na"
        public string Status { get; set; } = "pending";
        public string? ReviewerComment { get; set; }
        public DateTime? ReviewedAt { get; set; }
        public int? ReviewedById { get; set; }
        public string? ReviewedByName { get; set; }
        public string? DeveloperResolutionComment { get; set; }
        public DateTime? DeveloperResolutionAt { get; set; }
        public int CreatedById { get; set; }
        public string? CreatedByName { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime? UpdatedAt { get; set; }
    }

    public class CreateReviewChecklistItemDto
    {
        [Required, MaxLength(500)]
        public string Title { get; set; } = string.Empty;
        [MaxLength(2000)]
        public string? Description { get; set; }
        public int Sequence { get; set; }
        public bool IsRequired { get; set; } = true;
    }

    public class UpdateReviewChecklistItemDto
    {
        [Required, MaxLength(500)]
        public string Title { get; set; } = string.Empty;
        [MaxLength(2000)]
        public string? Description { get; set; }
        public int Sequence { get; set; }
        public bool IsRequired { get; set; } = true;
    }

    public class SetReviewChecklistItemResultDto
    {
        [Required]
        public string Status { get; set; } = string.Empty;  // "pending" | "passed" | "failed" | "na"
        [MaxLength(2000)]
        public string? ReviewerComment { get; set; }
    }

    public class SetReviewChecklistItemResolutionDto
    {
        [Required, MaxLength(2000)]
        public string DeveloperResolutionComment { get; set; } = string.Empty;
    }

    // ── Block Checklist (Phase 3) ────────────────────────────────────────────────

    public class BlockChecklistItemDto
    {
        public int Id { get; set; }
        public int TaskId { get; set; }
        public string Category { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public string? Comment { get; set; }
        public string? ExpectedResolution { get; set; }
        // "active" | "resolved" | "removed"
        public string Status { get; set; } = "active";
        public DateTime? ResolvedAt { get; set; }
        public int? ResolvedById { get; set; }
        public string? ResolvedByName { get; set; }
        public int CreatedById { get; set; }
        public string? CreatedByName { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime? UpdatedAt { get; set; }
    }

    public class AddBlockChecklistItemDto
    {
        [Required]
        public string Category { get; set; } = string.Empty;
        [Required, MaxLength(500)]
        public string Description { get; set; } = string.Empty;
        [MaxLength(1000)]
        public string? Comment { get; set; }
        [MaxLength(500)]
        public string? ExpectedResolution { get; set; }
    }

    public class ResolveBlockChecklistItemDto
    {
        [MaxLength(500)]
        public string? ResolvedComment { get; set; }
    }
}
