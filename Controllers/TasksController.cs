using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using TaskManagement.DTOs;
using TaskManagement.Services;
using TaskManagement.Data;
using System;
using System.Collections.Generic;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using IAuthorizationService = TaskManagement.Services.IAuthorizationService;

namespace TaskManagement.Controllers
{
    [Authorize]
    [ApiController]
    [Route("api/[controller]")]
    public class TasksController : ControllerBase
    {
        private readonly ITaskService _taskService;
        private readonly IAuthorizationService _authService;
        private readonly PMSDbContext _context;
        private readonly IWebHostEnvironment _env;

        public TasksController(ITaskService taskService, IAuthorizationService authService, PMSDbContext context, IWebHostEnvironment env)
        {
            _taskService = taskService;
            _authService = authService;
            _context = context;
            _env = env;
        }

        [HttpGet]
        public async Task<ActionResult<ApiResponse<List<TaskDto>>>> GetAll(
            [FromQuery] string? status, [FromQuery] string? priority,
            [FromQuery] int? projectId, [FromQuery] int? assigneeId,
            [FromQuery] string? search, [FromQuery] int? createdById,
            [FromQuery] DateTime? fromDate, [FromQuery] DateTime? toDate,
            [FromQuery] string? completionFilter,
            [FromQuery] int page = 1, [FromQuery] int pageSize = 100)
        {
            if (!await _authService.CanViewAsync("/tasks"))
                return StatusCode(403, new ApiResponse<string> { Success = false, Message = "You do not have permission to view tasks" });
            var result = await _taskService.GetAllTasksAsync(status, priority, projectId, assigneeId, search, createdById, fromDate, toDate, completionFilter, page, pageSize, HttpContext.RequestAborted);
            return Ok(result);
        }

        [HttpGet("{id}")]
        public async Task<ActionResult<ApiResponse<TaskDto>>> GetById(int id)
        {
            if (!await _authService.CanViewAsync("/tasks"))
                return StatusCode(403, new ApiResponse<string> { Success = false, Message = "You do not have permission to view tasks" });
            var result = await _taskService.GetTaskByIdAsync(id, HttpContext.RequestAborted);
            if (!result.Success) return NotFound(result);
            return Ok(result);
        }

        [HttpPost]
        public async Task<ActionResult<ApiResponse<TaskDto>>> Create(CreateTaskDto createTaskDto)
        {
            var userId = _authService.GetCurrentUserId();
            if (!await _authService.CanCreateAsync("/tasks"))
            {
                // Also allow project creator or current project owner
                var project = await _context.Projects.FindAsync(createTaskDto.ProjectId);
                if (project == null || (project.CreatedById != userId && project.OwnerId != userId))
                    return StatusCode(403, new ApiResponse<string> { Success = false, Message = "You do not have permission to create tasks" });
            }
            if (userId <= 0)
                return Unauthorized(new ApiResponse<TaskDto> { Success = false, Message = "Unable to determine current user" });
            var result = await _taskService.CreateTaskAsync(createTaskDto, userId);
            if (!result.Success) return BadRequest(result);
            return CreatedAtAction(nameof(GetById), new { id = result.Data?.Id }, result);
        }

        [HttpPut("{id}")]
        public async Task<ActionResult<ApiResponse<TaskDto>>> Update(int id, CreateTaskDto updateTaskDto)
        {
            var userId = _authService.GetCurrentUserId();
            if (!await _authService.CanUpdateAsync("/tasks"))
            {
                var task = await _taskService.GetTaskEntityAsync(id);
                if (task == null) return NotFound(new ApiResponse<TaskDto> { Success = false, Message = "Task not found" });
                var project = await _context.Projects.FindAsync(task.ProjectId);
                bool isTaskCreator = task.CreatedById == userId;
                bool isProjectOwnerOrCreator = project != null && (project.OwnerId == userId || project.CreatedById == userId);
                if (!isTaskCreator && !isProjectOwnerOrCreator)
                    return StatusCode(403, new ApiResponse<string> { Success = false, Message = "You do not have permission to update this task" });
            }
            var result = await _taskService.UpdateTaskAsync(id, updateTaskDto, userId);
            if (!result.Success)
                return result.ErrorCode == "FORBIDDEN" ? StatusCode(403, result) : BadRequest(result);
            return Ok(result);
        }

        // Live "as-you-type" duplicate-title check used by the create/edit modal — always
        // Success = true, the boolean Available is the actual signal (mirrors
        // AuthController.CheckAvailability). Scoped per-project; a conflict only counts against
        // another task in the same project that isn't already Completed.
        [HttpGet("check-title")]
        public async Task<ActionResult<ApiResponse<TaskTitleAvailabilityDto>>> CheckTitle(
            [FromQuery] string title, [FromQuery] int projectId, [FromQuery] int? excludeTaskId)
        {
            if (!await _authService.CanViewAsync("/tasks"))
                return StatusCode(403, new ApiResponse<string> { Success = false, Message = "You do not have permission to view tasks" });
            var available = await _taskService.IsTaskTitleAvailableAsync(title, projectId, excludeTaskId);
            return Ok(new ApiResponse<TaskTitleAvailabilityDto> { Success = true, Data = new TaskTitleAvailabilityDto { Available = available } });
        }

        // Exposes the config-driven status transition graph (appsettings.json's
        // TaskStatusTransitions, via Services/TaskStatusTransitionProvider.cs) so the frontend
        // can drive its Kanban/status-actions UI from the same source of truth this controller's
        // own status-change endpoints enforce, instead of maintaining a separate hardcoded copy.
        [HttpGet("status-transitions")]
        public async Task<ActionResult<ApiResponse<Dictionary<string, Dictionary<string, TaskStatusEdgeDto>>>>> GetStatusTransitions()
        {
            if (!await _authService.CanViewAsync("/tasks"))
                return StatusCode(403, new ApiResponse<string> { Success = false, Message = "You do not have permission to view tasks" });
            var graph = _taskService.GetStatusTransitions();
            return Ok(new ApiResponse<Dictionary<string, Dictionary<string, TaskStatusEdgeDto>>> { Success = true, Data = graph });
        }

        [HttpDelete("{id}")]
        public async Task<ActionResult<ApiResponse<bool>>> Delete(int id)
        {
            var userId = _authService.GetCurrentUserId();
            if (!await _authService.CanDeleteAsync("/tasks"))
            {
                var task = await _taskService.GetTaskEntityAsync(id);
                if (task == null) return NotFound(new ApiResponse<bool> { Success = false, Message = "Task not found" });
                var project = await _context.Projects.FindAsync(task.ProjectId);
                bool isTaskCreator = task.CreatedById == userId;
                bool isProjectOwnerOrCreator = project != null && (project.OwnerId == userId || project.CreatedById == userId);
                if (!isTaskCreator && !isProjectOwnerOrCreator)
                    return StatusCode(403, new ApiResponse<string> { Success = false, Message = "You do not have permission to delete this task" });
            }
            var result = await _taskService.DeleteTaskAsync(id);
            if (!result.Success) return NotFound(result);
            return Ok(result);
        }

        [HttpPost("{id}/comments")]
        public async Task<ActionResult<ApiResponse<TaskCommentDto>>> AddComment(int id, [FromBody] CreateTaskCommentDto dto)
        {
            var userId = _authService.GetCurrentUserId();
            if (userId <= 0)
                return Unauthorized(new ApiResponse<TaskCommentDto> { Success = false, Message = "Unable to determine current user" });
            var task = await _taskService.GetTaskEntityAsync(id);
            if (task == null)
                return NotFound(new ApiResponse<TaskCommentDto> { Success = false, Message = "Task not found" });
            var project = await _context.Projects.FindAsync(task.ProjectId);
            var isProjectOwnerOrCreator = project != null && (project.OwnerId == userId || project.CreatedById == userId);
            if (task.CreatedById != userId && task.AssignedToId != userId && !isProjectOwnerOrCreator)
                return StatusCode(403, new ApiResponse<string> { Success = false, Message = "Only the task creator, current assignee, or project owner/creator can comment on this task" });
            var result = await _taskService.AddCommentAsync(id, dto, userId);
            if (!result.Success) return NotFound(result);
            return Ok(result);
        }

        [HttpGet("{id}/comments")]
        public async Task<ActionResult<ApiResponse<List<TaskCommentDto>>>> GetComments(
            int id,
            [FromQuery] int? userId,
            [FromQuery] DateTime? from,
            [FromQuery] DateTime? to)
        {
            if (!await _authService.CanViewAsync("/tasks"))
                return StatusCode(403, new ApiResponse<string> { Success = false, Message = "You do not have permission to view task comments" });
            var result = await _taskService.GetCommentsAsync(id, userId, from, to, HttpContext.RequestAborted);
            return Ok(result);
        }

        [HttpGet("dashboard-stats")]
        public async Task<ActionResult<ApiResponse<DashboardStatsDto>>> GetStats(
            [FromQuery] int? userId, [FromQuery] DateTime? from, [FromQuery] DateTime? to)
        {
            var requestingUserId = _authService.GetCurrentUserId();
            if (requestingUserId <= 0)
                return Unauthorized(new ApiResponse<DashboardStatsDto> { Success = false, Message = "Unauthorized" });
            var isAdmin = await _authService.IsAdminAsync();
            var result = await _taskService.GetDashboardStatsAsync(userId, from, to, requestingUserId, isAdmin, HttpContext.RequestAborted);
            return Ok(result);
        }

        // Project axis stays admin-only (org-wide breakdown). Teammate axis is open to
        // every authenticated user and always shows all teammates by default — the
        // Task Distribution list view intentionally does not scope this to "just me"
        // for non-admins. `userId` remains an optional display filter (used by the
        // admin-only Breakdown Matrix section to narrow to one person), not a
        // per-role restriction.
        [HttpGet("status-matrix")]
        public async Task<ActionResult<ApiResponse<ProjectStatusMatrixDto>>> GetStatusMatrix(
            [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] string axis = "project", [FromQuery] int? userId = null)
        {
            var requestingUserId = _authService.GetCurrentUserId();
            if (requestingUserId <= 0)
                return Unauthorized(new ApiResponse<ProjectStatusMatrixDto> { Success = false, Message = "Unauthorized" });
            var isAdmin = await _authService.IsAdminAsync();
            var isProjectAxis = string.Equals(axis, "project", StringComparison.OrdinalIgnoreCase);
            if (isProjectAxis && !isAdmin)
                return StatusCode(403, new ApiResponse<string> { Success = false, Message = "Only admins can view the project breakdown matrix" });
            var result = await _taskService.GetProjectStatusMatrixAsync(from, to, axis, userId, HttpContext.RequestAborted);
            return Ok(result);
        }

        // Current-state snapshot of overdue tasks + stalled projects (not date-range filterable).
        [HttpGet("at-risk")]
        public async Task<ActionResult<ApiResponse<AtRiskDto>>> GetAtRisk([FromQuery] int? userId)
        {
            var requestingUserId = _authService.GetCurrentUserId();
            if (requestingUserId <= 0)
                return Unauthorized(new ApiResponse<AtRiskDto> { Success = false, Message = "Unauthorized" });
            var isAdmin = await _authService.IsAdminAsync();
            var result = await _taskService.GetAtRiskAsync(userId, requestingUserId, isAdmin, HttpContext.RequestAborted);
            return Ok(result);
        }

        [HttpPut("{id}/assign")]
        public async Task<ActionResult<ApiResponse<TaskDto>>> AssignTask(int id, [FromBody] int? assigneeId)
        {
            if (!await _authService.IsAdminAsync())
                return StatusCode(403, new ApiResponse<string> { Success = false, Message = "Only admins can assign tasks" });
            var result = await _taskService.AssignTaskAsync(id, assigneeId);
            if (!result.Success) return BadRequest(result);
            return Ok(result);
        }

        [HttpPut("{id}/reassign")]
        public async Task<ActionResult<ApiResponse<TaskDto>>> ReassignTask(int id, [FromBody] ReassignTaskDto dto)
        {
            if (!await _authService.IsAdminAsync())
                return StatusCode(403, new ApiResponse<string> { Success = false, Message = "Only admins can reassign tasks" });
            var userId = _authService.GetCurrentUserId();
            if (userId <= 0)
                return Unauthorized(new ApiResponse<TaskDto> { Success = false, Message = "Unable to determine current user" });
            var result = await _taskService.ReassignTaskAsync(id, dto, userId);
            if (!result.Success) return BadRequest(result);
            return Ok(result);
        }

        [HttpPost("{id}/start")]
        public async Task<ActionResult<ApiResponse<TaskDto>>> StartTask(int id)
        {
            var userId = _authService.GetCurrentUserId();
            if (userId <= 0)
                return Unauthorized(new ApiResponse<TaskDto> { Success = false, Message = "Unable to determine current user" });
            var result = await _taskService.StartTaskAsync(id, userId);
            if (!result.Success) return BadRequest(result);
            return Ok(result);
        }

        [HttpPut("{id}/status")]
        public async Task<ActionResult<ApiResponse<TaskDto>>> ChangeStatus(int id, [FromBody] ChangeStatusDto dto)
        {
            var userId = _authService.GetCurrentUserId();
            if (userId <= 0)
                return Unauthorized(new ApiResponse<TaskDto> { Success = false, Message = "Unable to determine current user" });
            var result = await _taskService.ChangeStatusAsync(id, dto, userId, await _authService.IsAdminAsync());
            if (!result.Success)
                return result.ErrorCode == "FORBIDDEN" ? StatusCode(403, result) : BadRequest(result);
            return Ok(result);
        }

        [HttpGet("{id}/status-history")]
        public async Task<ActionResult<ApiResponse<List<TaskStatusHistoryDto>>>> GetStatusHistory(int id)
        {
            if (!await _authService.CanViewAsync("/tasks"))
                return StatusCode(403, new ApiResponse<string> { Success = false, Message = "You do not have permission to view task history" });
            var result = await _taskService.GetStatusHistoryAsync(id, HttpContext.RequestAborted);
            return Ok(result);
        }

        [HttpGet("{id}/effort")]
        public async Task<ActionResult<ApiResponse<TaskEffortDto>>> GetEffort(int id)
        {
            if (!await _authService.CanViewAsync("/tasks"))
                return StatusCode(403, new ApiResponse<string> { Success = false, Message = "You do not have permission to view task effort" });
            var result = await _taskService.GetTaskEffortAsync(id, HttpContext.RequestAborted);
            if (!result.Success) return NotFound(result);
            return Ok(result);
        }

        // Effort summary for dashboard widgets. Optional UTC window [from, to) and optional
        // userId (admins may pass any user or omit for org-wide; non-admins are always
        // clamped to their own id).
        [HttpGet("effort-stats")]
        public async Task<ActionResult<ApiResponse<DashboardEffortDto>>> GetEffortStats(
            [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] int? userId)
        {
            var requestingUserId = _authService.GetCurrentUserId();
            if (requestingUserId <= 0)
                return Unauthorized(new ApiResponse<DashboardEffortDto> { Success = false, Message = "Unauthorized" });
            var isAdmin = await _authService.IsAdminAsync();
            var filterUserId = isAdmin ? userId : requestingUserId;
            var result = await _taskService.GetEffortStatsAsync(from, to, filterUserId, HttpContext.RequestAborted);
            return Ok(result);
        }

        [HttpPost("{id}/qa/pass")]
        public async Task<ActionResult<ApiResponse<TaskDto>>> QaPass(int id)
        {
            var userId = _authService.GetCurrentUserId();
            if (userId <= 0)
                return Unauthorized(new ApiResponse<TaskDto> { Success = false, Message = "Unable to determine current user" });
            // QA approval is a reviewer action, not the assignee logging effort — no ActualHours required.
            var result = await _taskService.ChangeStatusAsync(id, new ChangeStatusDto { ToStatus = "completed" }, userId, await _authService.IsAdminAsync(), requireActualHours: false);
            if (!result.Success) return result.ErrorCode == "FORBIDDEN" ? StatusCode(403, result) : BadRequest(result);
            return Ok(result);
        }

        [HttpPost("{id}/qa/fail")]
        public async Task<ActionResult<ApiResponse<TaskDto>>> QaFail(int id, [FromBody] ChangeStatusDto dto)
        {
            var userId = _authService.GetCurrentUserId();
            if (userId <= 0)
                return Unauthorized(new ApiResponse<TaskDto> { Success = false, Message = "Unable to determine current user" });
            // QA rejection: move under-review → issues
            var result = await _taskService.QaRejectAsync(id, dto?.Reason, userId, await _authService.IsAdminAsync());
            if (!result.Success) return result.ErrorCode == "FORBIDDEN" ? StatusCode(403, result) : BadRequest(result);
            return Ok(result);
        }

        [HttpPut("{id}/condition")]
        public async Task<ActionResult<ApiResponse<TaskDto>>> ToggleCondition(int id, [FromBody] ToggleConditionDto dto)
        {
            if (!await _authService.CanViewAsync("/tasks"))
                return StatusCode(403, new ApiResponse<TaskDto> { Success = false, Message = "You do not have permission to update tasks" });
            var userId = _authService.GetCurrentUserId();
            if (userId <= 0)
                return Unauthorized(new ApiResponse<TaskDto> { Success = false, Message = "Unable to determine current user" });
            var result = await _taskService.ToggleConditionAsync(id, dto, userId);
            if (!result.Success) return result.ErrorCode == "FORBIDDEN" ? StatusCode(403, result) : BadRequest(result);
            return Ok(result);
        }

        [HttpPost("{id}/issues")]
        public async Task<ActionResult<ApiResponse<TaskDto>>> AddIssueEntry(int id, [FromBody] AddIssueEntryDto dto)
        {
            var userId = _authService.GetCurrentUserId();
            if (userId <= 0)
                return Unauthorized(new ApiResponse<TaskDto> { Success = false, Message = "Unable to determine current user" });
            var result = await _taskService.AddIssueEntryAsync(id, dto, userId);
            if (!result.Success) return result.ErrorCode == "FORBIDDEN" ? StatusCode(403, result) : BadRequest(result);
            return Ok(result);
        }

        [HttpPut("{id}/issues/{entryId}")]
        public async Task<ActionResult<ApiResponse<TaskDto>>> ResolveIssueEntry(int id, int entryId, [FromBody] ResolveIssueEntryDto dto)
        {
            var userId = _authService.GetCurrentUserId();
            if (userId <= 0)
                return Unauthorized(new ApiResponse<TaskDto> { Success = false, Message = "Unable to determine current user" });
            var result = await _taskService.ResolveIssueEntryAsync(id, entryId, dto, userId);
            if (!result.Success) return result.ErrorCode == "FORBIDDEN" ? StatusCode(403, result) : BadRequest(result);
            return Ok(result);
        }

        [HttpDelete("{id}/issues/{entryId}")]
        public async Task<ActionResult<ApiResponse<TaskDto>>> DeleteIssueEntry(int id, int entryId)
        {
            var userId = _authService.GetCurrentUserId();
            if (userId <= 0)
                return Unauthorized(new ApiResponse<TaskDto> { Success = false, Message = "Unable to determine current user" });
            var result = await _taskService.DeleteIssueEntryAsync(id, entryId, userId);
            if (!result.Success) return result.ErrorCode == "FORBIDDEN" ? StatusCode(403, result) : BadRequest(result);
            return Ok(result);
        }

        // ── Review Issues (reviewer-facing) ────────────────────────────────────────

        [HttpPost("{id}/review-issues")]
        public async Task<ActionResult<ApiResponse<TaskDto>>> AddReviewIssue(int id, [FromBody] AddReviewIssueDto dto)
        {
            var userId = _authService.GetCurrentUserId();
            if (userId <= 0)
                return Unauthorized(new ApiResponse<TaskDto> { Success = false, Message = "Unable to determine current user" });
            var result = await _taskService.AddReviewIssueAsync(id, dto, userId, await _authService.IsAdminAsync());
            if (!result.Success) return result.ErrorCode == "FORBIDDEN" ? StatusCode(403, result) : BadRequest(result);
            return Ok(result);
        }

        [HttpPut("{id}/review-issues/{issueId}")]
        public async Task<ActionResult<ApiResponse<TaskDto>>> ResolveReviewIssue(int id, int issueId, [FromBody] ResolveReviewIssueDto dto)
        {
            var userId = _authService.GetCurrentUserId();
            if (userId <= 0)
                return Unauthorized(new ApiResponse<TaskDto> { Success = false, Message = "Unable to determine current user" });
            var result = await _taskService.ResolveReviewIssueAsync(id, issueId, dto, userId, await _authService.IsAdminAsync());
            if (!result.Success) return result.ErrorCode == "FORBIDDEN" ? StatusCode(403, result) : BadRequest(result);
            return Ok(result);
        }

        [HttpDelete("{id}/review-issues/{issueId}")]
        public async Task<ActionResult<ApiResponse<TaskDto>>> DeleteReviewIssue(int id, int issueId)
        {
            var userId = _authService.GetCurrentUserId();
            if (userId <= 0)
                return Unauthorized(new ApiResponse<TaskDto> { Success = false, Message = "Unable to determine current user" });
            var result = await _taskService.DeleteReviewIssueAsync(id, issueId, userId, await _authService.IsAdminAsync());
            if (!result.Success) return result.ErrorCode == "FORBIDDEN" ? StatusCode(403, result) : BadRequest(result);
            return Ok(result);
        }

        [HttpPost("{id}/review/complete")]
        public async Task<ActionResult<ApiResponse<TaskDto>>> CompleteReview(int id)
        {
            var userId = _authService.GetCurrentUserId();
            if (userId <= 0)
                return Unauthorized(new ApiResponse<TaskDto> { Success = false, Message = "Unable to determine current user" });
            var result = await _taskService.CompleteReviewAsync(id, userId, await _authService.IsAdminAsync());
            if (!result.Success) return result.ErrorCode == "FORBIDDEN" ? StatusCode(403, result) : BadRequest(result);
            return Ok(result);
        }

        [HttpGet("{id}/assignment-history")]
        public async Task<ActionResult<ApiResponse<List<TaskAssignmentHistoryDto>>>> GetTaskAssignmentHistory(int id)
        {
            if (!await _authService.CanViewAsync("/tasks"))
                return StatusCode(403, new ApiResponse<string> { Success = false, Message = "You do not have permission to view task history" });
            var result = await _taskService.GetTaskAssignmentHistoryAsync(id, HttpContext.RequestAborted);
            return Ok(result);
        }

        // Returns true if userId is the task creator OR the project owner/creator
        private async Task<bool> HasTaskEditAccess(TaskEntity task, int userId)
        {
            if (task.CreatedById == userId) return true;
            var project = await _context.Projects.FindAsync(task.ProjectId);
            return project != null && (project.OwnerId == userId || project.CreatedById == userId);
        }

        [HttpPost("{id}/checklist")]
        public async Task<ActionResult<ApiResponse<ChecklistItemDto>>> AddChecklistItem(int id, [FromBody] CreateChecklistItemDto dto)
        {
            var userId = _authService.GetCurrentUserId();
            if (userId <= 0) return Unauthorized(new ApiResponse<ChecklistItemDto> { Success = false, Message = "Unable to determine current user" });
            var task = await _taskService.GetTaskEntityAsync(id);
            if (task == null) return NotFound(new ApiResponse<ChecklistItemDto> { Success = false, Message = "Task not found" });
            if (!await HasTaskEditAccess(task, userId))
                return StatusCode(403, new ApiResponse<string> { Success = false, Message = "Only the task creator or project owner can add checklist items" });
            var result = await _taskService.AddChecklistItemAsync(id, dto, userId);
            if (!result.Success) return BadRequest(result);
            return Ok(result);
        }

        [HttpPut("{id}/checklist/{itemId}/toggle")]
        public async Task<ActionResult<ApiResponse<ChecklistItemDto>>> ToggleChecklistItem(int id, int itemId, [FromBody] ToggleChecklistItemDto dto)
        {
            var userId = _authService.GetCurrentUserId();
            if (userId <= 0)
                return Unauthorized(new ApiResponse<ChecklistItemDto> { Success = false, Message = "Unable to determine current user" });
            var result = await _taskService.ToggleChecklistItemAsync(id, itemId, dto.IsCompleted, userId);
            if (!result.Success) return result.Message?.Contains("permission") == true ? Forbid(result.Message) : NotFound(result);
            return Ok(result);
        }

        [HttpPut("{id}/checklist/{itemId}")]
        public async Task<ActionResult<ApiResponse<ChecklistItemDto>>> UpdateChecklistItem(int id, int itemId, [FromBody] UpdateChecklistItemDto dto)
        {
            var userId = _authService.GetCurrentUserId();
            if (userId <= 0) return Unauthorized(new ApiResponse<ChecklistItemDto> { Success = false, Message = "Unable to determine current user" });
            var task = await _taskService.GetTaskEntityAsync(id);
            if (task == null) return NotFound(new ApiResponse<ChecklistItemDto> { Success = false, Message = "Task not found" });
            if (!await HasTaskEditAccess(task, userId))
                return StatusCode(403, new ApiResponse<string> { Success = false, Message = "Only the task creator or project owner can edit checklist items" });
            var result = await _taskService.UpdateChecklistItemAsync(id, itemId, dto, userId);
            if (!result.Success) return NotFound(result);
            return Ok(result);
        }

        [HttpDelete("{id}/checklist/{itemId}")]
        public async Task<ActionResult<ApiResponse<bool>>> DeleteChecklistItem(int id, int itemId)
        {
            var userId = _authService.GetCurrentUserId();
            if (userId <= 0) return Unauthorized(new ApiResponse<bool> { Success = false, Message = "Unable to determine current user" });
            var task = await _taskService.GetTaskEntityAsync(id);
            if (task == null) return NotFound(new ApiResponse<bool> { Success = false, Message = "Task not found" });
            if (!await HasTaskEditAccess(task, userId))
                return StatusCode(403, new ApiResponse<string> { Success = false, Message = "Only the task creator or project owner can delete checklist items" });
            var result = await _taskService.DeleteChecklistItemAsync(id, itemId, userId);
            if (!result.Success) return NotFound(result);
            return Ok(result);
        }

        [HttpPost("{id}/checklist/mark-all-complete")]
        public async Task<ActionResult<ApiResponse<bool>>> MarkAllChecklistComplete(int id)
        {
            var userId = _authService.GetCurrentUserId();
            if (userId <= 0) return Unauthorized(new ApiResponse<bool> { Success = false, Message = "Unable to determine current user" });
            // P2-D: service enforces assignee-only rule; no redundant pre-check here
            var result = await _taskService.MarkAllChecklistCompleteAsync(id, userId);
            if (!result.Success) return BadRequest(result);
            return Ok(result);
        }

        [HttpPut("{id}/block")]
        public async Task<ActionResult<ApiResponse<TaskDto>>> SetBlock(int id, [FromBody] SetTaskBlockDto dto)
        {
            var userId = _authService.GetCurrentUserId();
            if (userId <= 0)
                return Unauthorized(new ApiResponse<TaskDto> { Success = false, Message = "Unable to determine current user" });
            var result = await _taskService.SetTaskBlockAsync(id, dto, userId);
            if (!result.Success) return BadRequest(result);
            return Ok(result);
        }

        [HttpGet("{id}/block-entries")]
        public async Task<ActionResult<ApiResponse<List<TaskBlockEntryDto>>>> GetBlockEntries(int id)
        {
            if (!await _authService.CanViewAsync("/tasks"))
                return StatusCode(403, new ApiResponse<string> { Success = false, Message = "You do not have permission to view task details" });
            var result = await _taskService.GetTaskBlockEntriesAsync(id, HttpContext.RequestAborted);
            return Ok(result);
        }

        // ── Review Checklist (Phase 2) ──────────────────────────────────────────────

        [HttpGet("{id}/review-checklist")]
        public async Task<ActionResult<ApiResponse<List<ReviewChecklistItemDto>>>> GetReviewChecklist(int id)
        {
            if (!await _authService.CanViewAsync("/tasks"))
                return StatusCode(403, new ApiResponse<string> { Success = false, Message = "You do not have permission to view tasks" });
            var result = await _taskService.GetReviewChecklistAsync(id, HttpContext.RequestAborted);
            return Ok(result);
        }

        [HttpPost("{id}/review-checklist")]
        public async Task<ActionResult<ApiResponse<ReviewChecklistItemDto>>> AddReviewChecklistItem(int id, [FromBody] CreateReviewChecklistItemDto dto)
        {
            var userId = _authService.GetCurrentUserId();
            if (userId <= 0) return Unauthorized(new ApiResponse<ReviewChecklistItemDto> { Success = false, Message = "Unable to determine current user" });
            var task = await _taskService.GetTaskEntityAsync(id);
            if (task == null) return NotFound(new ApiResponse<ReviewChecklistItemDto> { Success = false, Message = "Task not found" });
            if (!await HasTaskEditAccess(task, userId))
                return StatusCode(403, new ApiResponse<string> { Success = false, Message = "Only the task creator or project owner can add review checklist items" });
            var result = await _taskService.AddReviewChecklistItemAsync(id, dto, userId);
            if (!result.Success) return BadRequest(result);
            return Ok(result);
        }

        [HttpPut("{id}/review-checklist/{itemId}")]
        public async Task<ActionResult<ApiResponse<ReviewChecklistItemDto>>> UpdateReviewChecklistItem(int id, int itemId, [FromBody] UpdateReviewChecklistItemDto dto)
        {
            var userId = _authService.GetCurrentUserId();
            if (userId <= 0) return Unauthorized(new ApiResponse<ReviewChecklistItemDto> { Success = false, Message = "Unable to determine current user" });
            var task = await _taskService.GetTaskEntityAsync(id);
            if (task == null) return NotFound(new ApiResponse<ReviewChecklistItemDto> { Success = false, Message = "Task not found" });
            if (!await HasTaskEditAccess(task, userId))
                return StatusCode(403, new ApiResponse<string> { Success = false, Message = "Only the task creator or project owner can edit review checklist items" });
            var result = await _taskService.UpdateReviewChecklistItemAsync(id, itemId, dto, userId);
            if (!result.Success) return result.ErrorCode == "FORBIDDEN" ? StatusCode(403, result) : BadRequest(result);
            return Ok(result);
        }

        [HttpDelete("{id}/review-checklist/{itemId}")]
        public async Task<ActionResult<ApiResponse<bool>>> DeleteReviewChecklistItem(int id, int itemId)
        {
            var userId = _authService.GetCurrentUserId();
            if (userId <= 0) return Unauthorized(new ApiResponse<bool> { Success = false, Message = "Unable to determine current user" });
            var task = await _taskService.GetTaskEntityAsync(id);
            if (task == null) return NotFound(new ApiResponse<bool> { Success = false, Message = "Task not found" });
            if (!await HasTaskEditAccess(task, userId))
                return StatusCode(403, new ApiResponse<string> { Success = false, Message = "Only the task creator or project owner can delete review checklist items" });
            var result = await _taskService.DeleteReviewChecklistItemAsync(id, itemId, userId);
            if (!result.Success) return BadRequest(result);
            return Ok(result);
        }

        [HttpPut("{id}/review-checklist/{itemId}/result")]
        public async Task<ActionResult<ApiResponse<ReviewChecklistItemDto>>> SetReviewChecklistItemResult(int id, int itemId, [FromBody] SetReviewChecklistItemResultDto dto)
        {
            var userId = _authService.GetCurrentUserId();
            if (userId <= 0) return Unauthorized(new ApiResponse<ReviewChecklistItemDto> { Success = false, Message = "Unable to determine current user" });
            var result = await _taskService.SetReviewChecklistItemResultAsync(id, itemId, dto, userId, await _authService.IsAdminAsync());
            if (!result.Success) return result.ErrorCode == "FORBIDDEN" ? StatusCode(403, result) : BadRequest(result);
            return Ok(result);
        }

        [HttpPut("{id}/review-checklist/{itemId}/resolution")]
        public async Task<ActionResult<ApiResponse<ReviewChecklistItemDto>>> SetReviewChecklistItemResolution(int id, int itemId, [FromBody] SetReviewChecklistItemResolutionDto dto)
        {
            var userId = _authService.GetCurrentUserId();
            if (userId <= 0) return Unauthorized(new ApiResponse<ReviewChecklistItemDto> { Success = false, Message = "Unable to determine current user" });
            var result = await _taskService.SetReviewChecklistItemResolutionAsync(id, itemId, dto.DeveloperResolutionComment, userId);
            if (!result.Success) return result.ErrorCode == "FORBIDDEN" ? StatusCode(403, result) : BadRequest(result);
            return Ok(result);
        }

        // ── Block Checklist (Phase 3) ───────────────────────────────────────────────

        [HttpGet("{id}/block-checklist")]
        public async Task<ActionResult<ApiResponse<List<BlockChecklistItemDto>>>> GetBlockChecklist(int id)
        {
            if (!await _authService.CanViewAsync("/tasks"))
                return StatusCode(403, new ApiResponse<List<BlockChecklistItemDto>> { Success = false, Message = "Access denied" });
            var result = await _taskService.GetBlockChecklistItemsAsync(id);
            return Ok(result);
        }

        [HttpPut("{id}/block-checklist/{itemId}/resolve")]
        public async Task<ActionResult<ApiResponse<BlockChecklistItemDto>>> ResolveBlockChecklistItem(int id, int itemId, [FromBody] ResolveBlockChecklistItemDto dto)
        {
            var userId = _authService.GetCurrentUserId();
            if (userId <= 0) return Unauthorized(new ApiResponse<BlockChecklistItemDto> { Success = false, Message = "Unable to determine current user" });
            var result = await _taskService.ResolveBlockChecklistItemAsync(id, itemId, dto, userId);
            if (!result.Success) return result.ErrorCode == "FORBIDDEN" ? StatusCode(403, result) : BadRequest(result);
            return Ok(result);
        }

        [HttpDelete("{id}/block-checklist/{itemId}")]
        public async Task<ActionResult<ApiResponse<bool>>> RemoveBlockChecklistItem(int id, int itemId)
        {
            var userId = _authService.GetCurrentUserId();
            if (userId <= 0) return Unauthorized(new ApiResponse<bool> { Success = false, Message = "Unable to determine current user" });
            var result = await _taskService.RemoveBlockChecklistItemAsync(id, itemId, userId);
            if (!result.Success) return result.ErrorCode == "FORBIDDEN" ? StatusCode(403, result) : BadRequest(result);
            return Ok(result);
        }

        // ── Attachments ──────────────────────────────────────────────────────────────

        [HttpPost("{id}/attachments")]
        [RequestSizeLimit(10_500_000)]
        public async Task<ActionResult<ApiResponse<AttachmentDto>>> UploadAttachment(int id, IFormFile file)
        {
            if (!await _authService.CanViewAsync("/tasks"))
                return StatusCode(403, new ApiResponse<AttachmentDto> { Success = false, Message = "Access denied" });
            var userId = _authService.GetCurrentUserId();
            if (userId <= 0) return Unauthorized(new ApiResponse<AttachmentDto> { Success = false, Message = "Unable to determine current user" });
            var result = await _taskService.UploadAttachmentAsync(id, file, userId);
            if (!result.Success) return BadRequest(result);
            return Ok(result);
        }

        [HttpDelete("{id}/attachments/{attachmentId}")]
        public async Task<ActionResult<ApiResponse<bool>>> DeleteAttachment(int id, int attachmentId)
        {
            if (!await _authService.CanViewAsync("/tasks"))
                return StatusCode(403, new ApiResponse<bool> { Success = false, Message = "Access denied" });
            var userId  = _authService.GetCurrentUserId();
            var isAdmin = await _authService.IsAdminAsync();
            var result  = await _taskService.DeleteAttachmentAsync(id, attachmentId, userId, isAdmin);
            if (!result.Success) return BadRequest(result);
            return Ok(result);
        }

        [HttpGet("attachments/download/{attachmentId}")]
        public async Task<IActionResult> DownloadAttachment(int attachmentId)
        {
            if (!await _authService.CanViewAsync("/tasks"))
                return StatusCode(403, new { message = "Access denied" });

            var attachment = await _taskService.GetAttachmentEntityAsync(attachmentId);
            if (attachment == null) return NotFound();

            // Path traversal guard
            var wwwRoot  = Path.GetFullPath(_env.WebRootPath);
            var relative = attachment.FilePath.TrimStart('/').Replace('/', Path.DirectorySeparatorChar);
            var resolved = Path.GetFullPath(Path.Combine(wwwRoot, relative));
            if (!resolved.StartsWith(wwwRoot + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
                return BadRequest(new { message = "Invalid file path." });

            if (!System.IO.File.Exists(resolved))
                return NotFound();

            var ext      = Path.GetExtension(attachment.FileName).ToLowerInvariant();
            var mimeType = attachment.FileType == "image"
                ? (ext == ".png" ? "image/png" : ext == ".gif" ? "image/gif" : ext == ".webp" ? "image/webp" : "image/jpeg")
                : "application/octet-stream";

            var stream = System.IO.File.OpenRead(resolved);
            return File(stream, mimeType, attachment.FileName);
        }
    }
}

