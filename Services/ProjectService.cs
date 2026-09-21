using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using TaskManagement.Data;
using TaskManagement.DTOs;
using AutoMapper;

namespace TaskManagement.Services
{
    public interface IProjectService
    {
        Task<ApiResponse<List<ProjectDto>>> GetAllProjectsAsync(int page = 1, int pageSize = 25, string? search = null, string? status = null, int? ownerId = null, int? progressFrom = null, int? progressTo = null, string? sortField = null, string? sortDir = null);
        Task<ApiResponse<List<ProjectDto>>> SearchProjectsAsync(int page = 1, int pageSize = 25, string? search = null);
        Task<ApiResponse<ProjectDto>> GetProjectByIdAsync(int id);
        Task<ApiResponse<ProjectDto>> CreateProjectAsync(ProjectDto projectDto, int creatorId);
        Task<ApiResponse<ProjectDto>> UpdateProjectAsync(int id, ProjectDto projectDto);
        Task<ApiResponse<bool>> DeleteProjectAsync(int id);
        Task<ApiResponse<bool>> AssignUserToProjectAsync(int projectId, int userId, string role);
        Task<ApiResponse<bool>> RemoveUserFromProjectAsync(int projectId, int userId);
        Task<ApiResponse<ProjectDto>> SetProjectMembersAsync(int projectId, List<int> userIds);
        Task<ApiResponse<ProjectDto>> ReassignProjectAsync(int projectId, int newOwnerId, string reasonTag, int changedById);
        Task<ApiResponse<List<ProjectAssignmentHistoryDto>>> GetProjectAssignmentHistoryAsync(int projectId);
        Task<bool> IsProjectNameAvailableAsync(string name, int? excludeProjectId = null);
    }

    // Single-purpose probe response for the live "check-name" endpoint — mirrors AvailabilityDto's
    // role in Services/AuthService.cs. No AutoMapper mapping, so it lives here, not GeneralDtos.cs.
    public class ProjectNameAvailabilityDto
    {
        public bool Available { get; set; }
    }

    public class ProjectService : IProjectService
    {
        private readonly PMSDbContext _context;
        private readonly IMapper _mapper;

        public ProjectService(PMSDbContext context, IMapper mapper)
        {
            _context = context;
            _mapper = mapper;
        }

        public async Task<ApiResponse<List<ProjectDto>>> GetAllProjectsAsync(int page = 1, int pageSize = 25, string? search = null, string? status = null, int? ownerId = null, int? progressFrom = null, int? progressTo = null, string? sortField = null, string? sortDir = null)
        {
            pageSize = Math.Clamp(pageSize, 1, 100);
            page = Math.Max(1, page);

            // AsSplitQuery avoids a cartesian-product join across three independent collections
            // (Members, Modules, Tasks) — combined into one query, EF returns Members×Modules×
            // Tasks rows per project, which for a project with even a few dozen of each can
            // balloon into tens of thousands of duplicate rows to materialize/fix up client-side
            // (the DB round trip itself stays fast; it's this in-memory step that got slow).
            // OrderBy is required for split queries returning multiple rows, so results stay
            // consistent across the separate round trips (see TaskService.cs's paged task query
            // for the same pattern already established elsewhere in this codebase).
            var baseQuery = _context.Projects
                .Include(p => p.CreatedBy)
                .Include(p => p.Owner)
                .Include(p => p.Members).ThenInclude(m => m.User)
                .Include(p => p.Modules)
                .Include(p => p.Tasks)
                .AsSplitQuery();

            // Apply filters
            if (!string.IsNullOrWhiteSpace(search))
            {
                var term = search.Trim().ToLower();
                baseQuery = baseQuery.Where(p =>
                    p.Code != null && p.Code.ToLower().Contains(term) ||
                    p.Name.ToLower().Contains(term) ||
                    (p.Description != null && p.Description.ToLower().Contains(term)) ||
                    p.Status.ToLower().Contains(term));
            }

            if (!string.IsNullOrWhiteSpace(status))
            {
                baseQuery = baseQuery.Where(p => p.Status == status);
            }

            if (ownerId.HasValue)
            {
                baseQuery = baseQuery.Where(p => p.OwnerId == ownerId.Value);
            }

            // Progress filter requires computed field - we'll filter in memory after projection
            // For now, we'll handle it post-query (not ideal for large datasets but acceptable for progress)

            // Apply sorting
            baseQuery = ApplySorting(baseQuery, sortField, sortDir);

            var totalCount = await baseQuery.CountAsync();
            var totalPages = totalCount == 0 ? 1 : (int)Math.Ceiling((double)totalCount / pageSize);

            var projects = await baseQuery
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .ToListAsync();

            var dtos = projects.Select(p =>
            {
                var dto = _mapper.Map<ProjectDto>(p);
                dto.Progress = p.Tasks.Any()
                    ? (int)Math.Round(p.Tasks.Average(t => (double)t.Progress))
                    : 0;
                return dto;
            }).ToList();

            // Apply progress filter in memory (since it's computed)
            if (progressFrom.HasValue || progressTo.HasValue)
            {
                dtos = dtos.Where(d =>
                    (!progressFrom.HasValue || d.Progress >= progressFrom.Value) &&
                    (!progressTo.HasValue || d.Progress <= progressTo.Value)
                ).ToList();
                // Note: totalCount won't reflect this filter accurately, but it's acceptable for progress
            }

            return new ApiResponse<List<ProjectDto>>
            {
                Success = true,
                Data = dtos,
                TotalCount = totalCount,
                Page = page,
                PageSize = pageSize,
                TotalPages = totalPages
            };
        }

        private IQueryable<Project> ApplySorting(IQueryable<Project> query, string? sortField, string? sortDir)
        {
            var isDesc = sortDir?.ToLower() == "desc";

            return sortField?.ToLower() switch
            {
                "name" => isDesc ? query.OrderByDescending(p => p.Name) : query.OrderBy(p => p.Name),
                "status" => isDesc ? query.OrderByDescending(p => p.Status) : query.OrderBy(p => p.Status),
                "startdate" => isDesc ? query.OrderByDescending(p => p.StartDate) : query.OrderBy(p => p.StartDate),
                "enddate" => isDesc ? query.OrderByDescending(p => p.EndDate) : query.OrderBy(p => p.EndDate),
                "owner" => isDesc ? query.OrderByDescending(p => p.Owner.FullName) : query.OrderBy(p => p.Owner.FullName),
                _ => query.OrderBy(p => p.Id) // default
            };
        }

        public async Task<ApiResponse<ProjectDto>> GetProjectByIdAsync(int id)
        {
            // Same cartesian-product concern as GetAllProjectsAsync above — see its comment.
            var project = await _context.Projects
                .Include(p => p.CreatedBy)
                .Include(p => p.Owner)
                .Include(p => p.Members).ThenInclude(m => m.User)
                .Include(p => p.Modules)
                .Include(p => p.Tasks)
                .AsSplitQuery()
                .FirstOrDefaultAsync(p => p.Id == id);

            if (project == null)
                return new ApiResponse<ProjectDto> { Success = false, Message = "Project not found" };

            var dto = _mapper.Map<ProjectDto>(project);
            dto.Progress = project.Tasks.Any()
                ? (int)Math.Round(project.Tasks.Average(t => (double)t.Progress))
                : 0;
            var rawHistory = await _context.ProjectAssignmentHistories
                .Where(h => h.ProjectId == id)
                .OrderByDescending(h => h.ChangedAt)
                .ToListAsync();

            var userIds = rawHistory
                .SelectMany(h => new[] { h.PreviousOwnerId, h.NewOwnerId, h.ChangedById })
                .Distinct()
                .ToList();

            var userNames = await _context.Users
                .Where(u => userIds.Contains(u.Id))
                .Select(u => new { u.Id, u.FullName })
                .ToDictionaryAsync(u => u.Id, u => u.FullName);

            dto.AssignmentHistory = rawHistory.Select(h => new ProjectAssignmentHistoryDto
            {
                Id                = h.Id,
                ProjectId         = h.ProjectId,
                PreviousOwnerId   = h.PreviousOwnerId,
                PreviousOwnerName = userNames.TryGetValue(h.PreviousOwnerId, out var prev) ? prev : null,
                NewOwnerId        = h.NewOwnerId,
                NewOwnerName      = userNames.TryGetValue(h.NewOwnerId, out var next) ? next : null,
                ChangedById       = h.ChangedById,
                ChangedByName     = userNames.TryGetValue(h.ChangedById, out var changer) ? changer : string.Empty,
                ChangedAt         = h.ChangedAt,
                ReasonTag         = h.ReasonTag,
            }).ToList();

            return new ApiResponse<ProjectDto> { Success = true, Data = dto };
        }

        // Two projects sharing a Name only conflict while the earlier one is still active work —
        // a "completed" project's name is free to reuse. Used by both the live check-name endpoint
        // and the Create/Update safety net below, so the query is defined exactly once.
        private async Task<bool> ProjectNameConflictsAsync(string? name, int? excludeProjectId)
        {
            var trimmed = (name ?? string.Empty).Trim();
            if (trimmed.Length == 0) return false; // presence/length is FluentValidation's job
            var nameLower = trimmed.ToLower();
            return await _context.Projects.AnyAsync(p =>
                p.Name.ToLower() == nameLower &&
                p.Status.ToLower() != "completed" &&
                (!excludeProjectId.HasValue || p.Id != excludeProjectId.Value));
        }

        public async Task<bool> IsProjectNameAvailableAsync(string name, int? excludeProjectId = null) =>
            !(await ProjectNameConflictsAsync(name, excludeProjectId));

        public async Task<ApiResponse<ProjectDto>> CreateProjectAsync(ProjectDto projectDto, int creatorId)
        {
            if (await ProjectNameConflictsAsync(projectDto.Name, null))
                return new ApiResponse<ProjectDto> { Success = false, Message =
                    $"A project named \"{projectDto.Name.Trim()}\" already exists and is still active or on-hold. Choose a different name, or reuse it once that project is marked Completed." };

            var (seq, code) = await CodeGenerator.NextProjectCodeAsync(_context);

            var project = new Project
            {
                Code = code,
                SeqNumber = seq,
                Name = projectDto.Name,
                Description = projectDto.Description,
                Status = string.IsNullOrEmpty(projectDto.Status) ? "Active" : projectDto.Status,
                StartDate = projectDto.StartDate,
                EndDate = projectDto.EndDate,
                OwnerId = projectDto.OwnerId > 0 ? projectDto.OwnerId : creatorId,
                CreatedById = creatorId,
                CreatedAt = AppClock.Now,
                Modules = projectDto.Modules
                    .Where(m => !string.IsNullOrWhiteSpace(m))
                    .Select(m => m.Trim())
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .Select(m => new ProjectModule { Name = m })
                    .ToList()
            };

            _context.Projects.Add(project);
            await _context.SaveChangesAsync();

            return await GetProjectByIdAsync(project.Id);
        }

        public async Task<ApiResponse<ProjectDto>> UpdateProjectAsync(int id, ProjectDto projectDto)
        {
            var project = await _context.Projects
                .Include(p => p.Modules)
                .FirstOrDefaultAsync(p => p.Id == id);
            if (project == null)
                return new ApiResponse<ProjectDto> { Success = false, Message = "Project not found" };

            if (await ProjectNameConflictsAsync(projectDto.Name, id))
                return new ApiResponse<ProjectDto> { Success = false, Message =
                    $"A project named \"{projectDto.Name.Trim()}\" already exists and is still active or on-hold. Choose a different name, or reuse it once that project is marked Completed." };

            // ── Reconcile modules (replace-on-update, guard removals in use) ──
            var incoming = projectDto.Modules
                .Where(m => !string.IsNullOrWhiteSpace(m))
                .Select(m => m.Trim())
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            var removed = project.Modules
                .Where(m => !incoming.Contains(m.Name, StringComparer.OrdinalIgnoreCase))
                .ToList();

            foreach (var mod in removed)
            {
                var usingTasks = await _context.Tasks
                    .Where(t => t.ProjectId == id && t.Module == mod.Name)
                    .Select(t => t.Code ?? ("#" + t.Id))
                    .ToListAsync();
                if (usingTasks.Count > 0)
                    return new ApiResponse<ProjectDto>
                    {
                        Success = false,
                        Message = $"Cannot remove module '{mod.Name}' — {usingTasks.Count} task(s) still use it: {string.Join(", ", usingTasks)}"
                    };
            }

            _context.ProjectModules.RemoveRange(removed);
            var existingNames = project.Modules
                .Select(m => m.Name)
                .ToHashSet(StringComparer.OrdinalIgnoreCase);
            foreach (var name in incoming.Where(n => !existingNames.Contains(n)))
                project.Modules.Add(new ProjectModule { ProjectId = id, Name = name });

            project.Name = projectDto.Name;
            project.Description = projectDto.Description;
            if (!string.IsNullOrEmpty(projectDto.Status))
                project.Status = projectDto.Status;
            project.StartDate = projectDto.StartDate;
            project.EndDate = projectDto.EndDate;
            if (projectDto.OwnerId > 0)
                project.OwnerId = projectDto.OwnerId;
            project.UpdatedAt = AppClock.Now;

            await _context.SaveChangesAsync();
            return await GetProjectByIdAsync(id);
        }

        public async Task<ApiResponse<bool>> DeleteProjectAsync(int id)
        {
            var project = await _context.Projects
                .Include(p => p.Members)
                .Include(p => p.Tasks)
                    .ThenInclude(t => t.Tags)
                .Include(p => p.Tasks)
                    .ThenInclude(t => t.Comments)
                .Include(p => p.Tasks)
                    .ThenInclude(t => t.Attachments)
                .FirstOrDefaultAsync(p => p.Id == id);

            if (project == null)
                return new ApiResponse<bool> { Success = false, Message = "Project not found" };

            _context.ProjectMembers.RemoveRange(project.Members);

            // Remove project-level assignment history
            var projectHistory = await _context.ProjectAssignmentHistories
                .Where(h => h.ProjectId == id).ToListAsync();
            _context.ProjectAssignmentHistories.RemoveRange(projectHistory);

            foreach (var task in project.Tasks)
            {
                _context.TaskTags.RemoveRange(task.Tags);
                _context.TaskComments.RemoveRange(task.Comments);
                _context.Attachments.RemoveRange(task.Attachments);

                var taskHistory = await _context.TaskAssignmentHistories
                    .Where(h => h.TaskId == task.Id).ToListAsync();
                _context.TaskAssignmentHistories.RemoveRange(taskHistory);

                var checklistItems = await _context.ChecklistItems
                    .Where(c => c.TaskId == task.Id).ToListAsync();
                _context.ChecklistItems.RemoveRange(checklistItems);
            }
            _context.Tasks.RemoveRange(project.Tasks);
            _context.Projects.Remove(project);
            await _context.SaveChangesAsync();

            return new ApiResponse<bool> { Success = true, Data = true };
        }

        public async Task<ApiResponse<bool>> AssignUserToProjectAsync(int projectId, int userId, string role)
        {
            var exists = await _context.ProjectMembers.AnyAsync(pm => pm.ProjectId == projectId && pm.UserId == userId);
            if (exists)
                return new ApiResponse<bool> { Success = false, Message = "User already assigned to this project" };

            var member = new ProjectMember
            {
                ProjectId = projectId,
                UserId = userId,
                RoleInProject = role,
                JoinedAt = AppClock.Now
            };

            _context.ProjectMembers.Add(member);
            await _context.SaveChangesAsync();

            return new ApiResponse<bool> { Success = true, Data = true };
        }

        public async Task<ApiResponse<bool>> RemoveUserFromProjectAsync(int projectId, int userId)
        {
            var member = await _context.ProjectMembers
                .FirstOrDefaultAsync(pm => pm.ProjectId == projectId && pm.UserId == userId);

            if (member == null)
                return new ApiResponse<bool> { Success = false, Message = "User is not a member of this project" };

            _context.ProjectMembers.Remove(member);
            await _context.SaveChangesAsync();

            return new ApiResponse<bool> { Success = true, Data = true };
        }

        public async Task<ApiResponse<ProjectDto>> SetProjectMembersAsync(int projectId, List<int> userIds)
        {
            var project = await _context.Projects
                .Include(p => p.Members)
                .FirstOrDefaultAsync(p => p.Id == projectId);

            if (project == null)
                return new ApiResponse<ProjectDto> { Success = false, Message = "Project not found" };

            var existingUserIds = project.Members.Select(m => m.UserId).ToHashSet();
            var newUserIds = userIds.ToHashSet();

            // Remove members not in the new list
            var toRemove = project.Members.Where(m => !newUserIds.Contains(m.UserId)).ToList();
            _context.ProjectMembers.RemoveRange(toRemove);

            // Add new members
            foreach (var uid in newUserIds.Where(uid => !existingUserIds.Contains(uid)))
            {
                _context.ProjectMembers.Add(new ProjectMember
                {
                    ProjectId = projectId,
                    UserId = uid,
                    RoleInProject = "Developer",
                    JoinedAt = AppClock.Now
                });
            }

            await _context.SaveChangesAsync();
            return await GetProjectByIdAsync(projectId);
        }

        public async Task<ApiResponse<ProjectDto>> ReassignProjectAsync(int projectId, int newOwnerId, string reasonTag, int changedById)
        {
            var project = await _context.Projects.FindAsync(projectId);
            if (project == null)
                return new ApiResponse<ProjectDto> { Success = false, Message = "Project not found" };

            var history = new ProjectAssignmentHistory
            {
                ProjectId = projectId,
                PreviousOwnerId = project.OwnerId,
                NewOwnerId = newOwnerId,
                ChangedById = changedById,
                ChangedAt = AppClock.Now,
                ReasonTag = reasonTag
            };

            project.OwnerId = newOwnerId;
            project.UpdatedAt = AppClock.Now;

            _context.ProjectAssignmentHistories.Add(history);
            await _context.SaveChangesAsync();

            return await GetProjectByIdAsync(projectId);
        }

        public async Task<ApiResponse<List<ProjectAssignmentHistoryDto>>> GetProjectAssignmentHistoryAsync(int projectId)
        {
            var history = await _context.ProjectAssignmentHistories
                .Where(h => h.ProjectId == projectId)
                .OrderByDescending(h => h.ChangedAt)
                .Select(h => new ProjectAssignmentHistoryDto
                {
                    Id = h.Id,
                    ProjectId = h.ProjectId,
                    PreviousOwnerId = h.PreviousOwnerId,
                    PreviousOwnerName = _context.Users.Where(u => u.Id == h.PreviousOwnerId).Select(u => u.FullName).FirstOrDefault(),
                    NewOwnerId = h.NewOwnerId,
                    NewOwnerName = _context.Users.Where(u => u.Id == h.NewOwnerId).Select(u => u.FullName).FirstOrDefault(),
                    ChangedById = h.ChangedById,
                    ChangedByName = _context.Users.Where(u => u.Id == h.ChangedById).Select(u => u.FullName).FirstOrDefault() ?? string.Empty,
                    ChangedAt = h.ChangedAt,
                    ReasonTag = h.ReasonTag
                }).ToListAsync();

            return new ApiResponse<List<ProjectAssignmentHistoryDto>> { Success = true, Data = history };
        }

        public async Task<ApiResponse<List<ProjectDto>>> SearchProjectsAsync(int page = 1, int pageSize = 25, string? search = null)
        {
            pageSize = Math.Clamp(pageSize, 1, 100);
            page = Math.Max(1, page);

            var query = _context.Projects
                .Include(p => p.Owner)
                .Where(p => p.Status.ToLower() != "completed") // Only active/on-hold projects
                .AsQueryable();

            if (!string.IsNullOrWhiteSpace(search))
            {
                var term = search.Trim().ToLower();
                query = query.Where(p =>
                    p.Code != null && p.Code.ToLower().Contains(term) ||
                    p.Name.ToLower().Contains(term));
            }

            var totalCount = await query.CountAsync();
            var totalPages = totalCount == 0 ? 1 : (int)Math.Ceiling((double)totalCount / pageSize);

            var projects = await query
                .OrderBy(p => p.Name)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .ToListAsync();

            var dtos = _mapper.Map<List<ProjectDto>>(projects);
            return new ApiResponse<List<ProjectDto>>
            {
                Success = true,
                Data = dtos,
                TotalCount = totalCount,
                Page = page,
                PageSize = pageSize,
                TotalPages = totalPages
            };
        }

    }
}
