using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using TaskManagement.Data;
using TaskManagement.DTOs;

namespace TaskManagement.Services
{
    public interface ITaskTemplateService
    {
        Task<ApiResponse<List<TaskTemplateDto>>>          GetAllAsync();
        Task<ApiResponse<TaskTemplateDto>>                GetByIdAsync(int id);
        Task<ApiResponse<TaskTemplateDto>>                CreateAsync(SaveTaskTemplateDto dto, int userId);
        Task<ApiResponse<TaskTemplateDto>>                UpdateAsync(int id, SaveTaskTemplateDto dto, int userId);
        Task<ApiResponse<bool>>                           SetActiveAsync(int id, bool isActive);
        Task<ApiResponse<TaskTemplateDto>>                DuplicateAsync(int id, int userId);
        Task<ApiResponse<bool>>                           DeleteAsync(int id);
        Task<ApiResponse<TaskTemplateGenerationDto>>      GenerateAsync(int id, int? userId, string? notes = null, DateTime? forDate = null);
        Task<ApiResponse<List<TaskTemplateGenerationDto>>> GetHistoryAsync(int id);
        Task                                              ProcessScheduledGenerationsAsync();
    }

    public class TaskTemplateService : ITaskTemplateService
    {
        private readonly PMSDbContext          _db;
        private readonly INotificationService  _notifications;

        public TaskTemplateService(PMSDbContext db, INotificationService notifications)
        {
            _db            = db;
            _notifications = notifications;
        }

        // ── Queries ──────────────────────────────────────────────────────────────

        public async Task<ApiResponse<List<TaskTemplateDto>>> GetAllAsync()
        {
            var templates = await _db.TaskTemplates
                .Include(t => t.Project)
                .Include(t => t.CreatedBy)
                .Include(t => t.Assignees).ThenInclude(a => a.User)
                .Include(t => t.Generations)
                .Include(t => t.Items)
                .OrderByDescending(t => t.CreatedAt)
                .ToListAsync();

            return new ApiResponse<List<TaskTemplateDto>>
            {
                Success = true,
                Data    = templates.Select(MapToDto).ToList()
            };
        }

        public async Task<ApiResponse<TaskTemplateDto>> GetByIdAsync(int id)
        {
            var t = await LoadFullTemplateAsync(id);
            if (t == null) return NotFound<TaskTemplateDto>();
            return Ok(MapToFullDto(t));
        }

        // ── Mutations ────────────────────────────────────────────────────────────

        public async Task<ApiResponse<TaskTemplateDto>> CreateAsync(SaveTaskTemplateDto dto, int userId)
        {
            var template = new TaskTemplate
            {
                Name               = dto.Name.Trim(),
                Description        = dto.Description?.Trim(),
                ProjectId          = dto.ProjectId,
                Module             = dto.Module?.Trim(),
                RecurrenceType     = dto.RecurrenceType,
                DayOfWeek          = dto.DayOfWeek,
                DayOfMonth         = dto.DayOfMonth,
                DaysOfMonth        = FormatIntList(dto.DaysOfMonth),
                SkipDaysOfWeek     = FormatIntList(dto.SkipDaysOfWeek),
                SkipDates          = FormatStringList(dto.SkipDates),
                SkipDaysOfMonth    = FormatIntList(dto.SkipDaysOfMonth),
                CustomIntervalDays = dto.CustomIntervalDays,
                TriggerTime        = dto.TriggerTime?.Trim(),
                StartDate          = dto.StartDate,
                EndDate            = dto.EndDate,
                IsActive           = dto.IsActive,
                CreatedById        = userId,
                CreatedAt          = AppClock.Now,
                UpdatedAt          = AppClock.Now,
            };

            _db.TaskTemplates.Add(template);
            await _db.SaveChangesAsync();

            await SaveAssigneesAsync(template.Id, dto.AssigneeIds);
            await SaveItemsAsync(template.Id, dto.Items);
            await _db.SaveChangesAsync();

            var full = await LoadFullTemplateAsync(template.Id);
            return Ok(MapToFullDto(full!));
        }

        public async Task<ApiResponse<TaskTemplateDto>> UpdateAsync(int id, SaveTaskTemplateDto dto, int userId)
        {
            var template = await _db.TaskTemplates.FindAsync(id);
            if (template == null) return NotFound<TaskTemplateDto>();

            template.Name               = dto.Name.Trim();
            template.Description        = dto.Description?.Trim();
            template.ProjectId          = dto.ProjectId;
            template.Module             = dto.Module?.Trim();
            template.RecurrenceType     = dto.RecurrenceType;
            template.DayOfWeek          = dto.DayOfWeek;
            template.DayOfMonth         = dto.DayOfMonth;
            template.DaysOfMonth        = FormatIntList(dto.DaysOfMonth);
            template.SkipDaysOfWeek     = FormatIntList(dto.SkipDaysOfWeek);
            template.SkipDates          = FormatStringList(dto.SkipDates);
            template.SkipDaysOfMonth    = FormatIntList(dto.SkipDaysOfMonth);
            template.CustomIntervalDays = dto.CustomIntervalDays;
            template.TriggerTime        = dto.TriggerTime?.Trim();
            template.StartDate          = dto.StartDate;
            template.EndDate            = dto.EndDate;
            template.IsActive           = dto.IsActive;
            template.UpdatedAt          = AppClock.Now;

            // Replace assignees and items — previous generated tasks are unaffected
            var oldAssignees = await _db.TaskTemplateAssignees.Where(a => a.TemplateId == id).ToListAsync();
            _db.TaskTemplateAssignees.RemoveRange(oldAssignees);

            var oldItems = await _db.TaskTemplateItems
                .Include(i => i.Checklists)
                .Include(i => i.Tags)
                .Include(i => i.Dependencies)
                .Include(i => i.Attachments)
                .Include(i => i.ReviewCriteria)
                .Where(i => i.TemplateId == id)
                .ToListAsync();

            // Dependencies reference template items on BOTH sides — TemplateItemId (cascade) and
            // DependsOnItemId (restrict/required). Deleting the items directly would sever the
            // required DependsOnItem relationship and throw. Remove all dependency rows first.
            var itemIds = oldItems.Select(i => i.Id).ToList();
            var oldDeps = await _db.TaskTemplateItemDependencies
                .Where(d => itemIds.Contains(d.TemplateItemId) || itemIds.Contains(d.DependsOnItemId))
                .ToListAsync();
            _db.TaskTemplateItemDependencies.RemoveRange(oldDeps);
            await _db.SaveChangesAsync();

            _db.TaskTemplateItems.RemoveRange(oldItems);
            await _db.SaveChangesAsync();

            await SaveAssigneesAsync(id, dto.AssigneeIds);
            await SaveItemsAsync(id, dto.Items);
            await _db.SaveChangesAsync();

            var full = await LoadFullTemplateAsync(id);
            return Ok(MapToFullDto(full!));
        }

        public async Task<ApiResponse<bool>> SetActiveAsync(int id, bool isActive)
        {
            var t = await _db.TaskTemplates.FindAsync(id);
            if (t == null) return NotFound<bool>();
            t.IsActive  = isActive;
            t.UpdatedAt = AppClock.Now;
            await _db.SaveChangesAsync();
            return Ok(true);
        }

        public async Task<ApiResponse<TaskTemplateDto>> DuplicateAsync(int id, int userId)
        {
            var src = await LoadFullTemplateAsync(id);
            if (src == null) return NotFound<TaskTemplateDto>();

            var copy = new SaveTaskTemplateDto
            {
                Name               = src.Name + " (Copy)",
                Description        = src.Description,
                ProjectId          = src.ProjectId,
                Module             = src.Module,
                RecurrenceType     = src.RecurrenceType,
                DayOfWeek          = src.DayOfWeek,
                DayOfMonth         = src.DayOfMonth,
                DaysOfMonth        = ParseIntList(src.DaysOfMonth),
                SkipDaysOfWeek     = ParseIntList(src.SkipDaysOfWeek),
                SkipDates          = ParseStringList(src.SkipDates),
                SkipDaysOfMonth    = ParseIntList(src.SkipDaysOfMonth),
                CustomIntervalDays = src.CustomIntervalDays,
                TriggerTime        = src.TriggerTime,
                StartDate          = src.StartDate,
                EndDate            = src.EndDate,
                IsActive           = false, // duplicates start inactive
                AssigneeIds        = src.Assignees.Select(a => a.UserId).ToList(),
                Items              = src.Items.OrderBy(i => i.Position).Select(i => new SaveTemplateItemDto
                {
                    Position          = i.Position,
                    Title             = i.Title,
                    Description       = i.Description,
                    EstimatedHours    = i.EstimatedHours,
                    Priority          = i.Priority,
                    DefaultAssigneeId = i.DefaultAssigneeId,
                    QaReviewerId      = i.QaReviewerId,
                    DueDateOffsetDays = i.DueDateOffsetDays,
                    Tags              = i.Tags.Select(t => t.Tag).ToList(),
                    ChecklistItems    = i.Checklists.OrderBy(c => c.Position).Select(c => c.Text).ToList(),
                    DependsOnPositions= i.Dependencies.Select(d => d.DependsOnItem!.Position).ToList(),
                    ReviewCriteria    = i.ReviewCriteria.OrderBy(r => r.Position).Select(r => r.Text).ToList(),
                }).ToList(),
            };

            return await CreateAsync(copy, userId);
        }

        public async Task<ApiResponse<bool>> DeleteAsync(int id)
        {
            var t = await _db.TaskTemplates.FindAsync(id);
            if (t == null) return NotFound<bool>();

            // Remove item dependencies first — DependsOnItemId is a restrict FK, so cascading
            // the template delete straight to items would otherwise be blocked / sever it.
            var itemIds = await _db.TaskTemplateItems
                .Where(i => i.TemplateId == id)
                .Select(i => i.Id)
                .ToListAsync();
            if (itemIds.Count > 0)
            {
                var deps = await _db.TaskTemplateItemDependencies
                    .Where(d => itemIds.Contains(d.TemplateItemId) || itemIds.Contains(d.DependsOnItemId))
                    .ToListAsync();
                _db.TaskTemplateItemDependencies.RemoveRange(deps);
                await _db.SaveChangesAsync();
            }

            _db.TaskTemplates.Remove(t);
            await _db.SaveChangesAsync();
            return Ok(true);
        }

        // ── Generation ───────────────────────────────────────────────────────────

        public async Task<ApiResponse<TaskTemplateGenerationDto>> GenerateAsync(
            int id, int? userId, string? notes = null, DateTime? forDate = null)
        {
            var template = await LoadFullTemplateAsync(id);
            if (template == null) return NotFound<TaskTemplateGenerationDto>();
            if (!template.IsActive)
                return Fail<TaskTemplateGenerationDto>("Template is disabled.");

            var generateDate = (forDate ?? AppClock.Now).Date;
            var periodKey    = BuildPeriodKey(template, generateDate);

            // Duplicate-generation guard
            var exists = await _db.TaskTemplateGenerations
                .AnyAsync(g => g.TemplateId == id && g.PeriodKey == periodKey);
            if (exists)
                return Fail<TaskTemplateGenerationDto>($"Tasks for period '{periodKey}' were already generated.");

            var items = template.Items.OrderBy(i => i.Position).ToList();
            if (!items.Any())
                return Fail<TaskTemplateGenerationDto>("Template has no task items configured.");
            // Each task item is generated once and assigned to exactly one person.
            if (items.Any(i => i.DefaultAssigneeId == null))
                return Fail<TaskTemplateGenerationDto>("Every task item must have an assignee.");

            // Fetch project for code generation (needed by TaskEntity)
            var project = template.ProjectId.HasValue
                ? await _db.Projects.FindAsync(template.ProjectId.Value)
                : null;

            var generation = new TaskTemplateGeneration
            {
                TemplateId    = id,
                PeriodKey     = periodKey,
                GeneratedAt   = AppClock.Now,
                GeneratedById = userId,
                Notes         = notes,
            };
            _db.TaskTemplateGenerations.Add(generation);
            await _db.SaveChangesAsync();

            var generatedLinks = new List<TaskTemplateGeneratedTask>();

            // Read code-generation seed values once before the batch so each item in the
            // loop gets a unique, incrementing SeqNumber without extra DB round-trips.
            var projectId = template.ProjectId ?? (project?.Id ?? 1);
            var pp        = project?.SeqNumber ?? 0;
            var seqSeed   = await _db.Tasks
                .Where(t => t.ProjectId == projectId && t.ParentTaskId == null)
                .MaxAsync(t => (int?)t.SeqNumber) ?? 0;

            // Pass 1: create one task per item (single assignee) in one batch to get their IDs.
            var itemTaskPairs = new List<(TaskTemplateItem item, TaskEntity task)>();
            foreach (var item in items)
            {
                var assigneeId = item.DefaultAssigneeId!.Value;
                seqSeed++;
                var task = new TaskEntity
                {
                    Title                = item.Title,
                    Description          = item.Description,
                    Status               = "new",
                    Priority             = item.Priority,
                    ProjectId            = projectId,
                    Module               = template.Module,
                    AssignedToId         = assigneeId,
                    QaAssigneeId         = item.QaReviewerId,
                    RequiresQA           = item.QaReviewerId.HasValue,
                    EstimatedHours       = item.EstimatedHours,
                    DueDate              = generateDate.AddDays(item.DueDateOffsetDays),
                    CreatedById          = userId ?? assigneeId,
                    CreatedAt            = AppClock.Now,
                    SourceTemplateItemId = item.Id,
                    SeqNumber            = seqSeed,
                    Code                 = $"TSK-{CodeGenerator.Pad(pp)}-{CodeGenerator.Pad(seqSeed)}",
                };
                _db.Tasks.Add(task);
                itemTaskPairs.Add((item, task));
            }
            await _db.SaveChangesAsync(); // single round trip — all task.Id values are now populated

            // Pass 2: add child rows using the IDs from pass 1.
            var posToTaskId = new Dictionary<int, int>();
            foreach (var (item, task) in itemTaskPairs)
            {
                var assigneeId = item.DefaultAssigneeId!.Value;
                posToTaskId[item.Position] = task.Id;

                for (int ci = 0; ci < item.Checklists.Count; ci++)
                {
                    _db.ChecklistItems.Add(new ChecklistItem
                    {
                        TaskId     = task.Id,
                        Title      = item.Checklists.OrderBy(c => c.Position).ElementAt(ci).Text,
                        OrderIndex = ci,
                        CreatedAt  = AppClock.Now,
                    });
                }

                foreach (var tag in item.Tags)
                    _db.TaskTags.Add(new TaskTag { TaskId = task.Id, Tag = tag.Tag });

                foreach (var rc in item.ReviewCriteria.OrderBy(r => r.Position))
                {
                    _db.TaskReviewIssues.Add(new TaskReviewIssue
                    {
                        TaskId      = task.Id,
                        Description = rc.Text,
                        IsResolved  = false,
                        CreatedById = item.QaReviewerId ?? (userId ?? assigneeId),
                        CreatedAt   = AppClock.Now,
                    });
                }

                generatedLinks.Add(new TaskTemplateGeneratedTask
                {
                    GenerationId   = generation.Id,
                    TaskId         = task.Id,
                    TemplateItemId = item.Id,
                    AssigneeId     = assigneeId,
                });
            }

            // Pass 3: task-to-task dependency wiring is intentionally skipped here.
            // TaskBlockEntry.BlockedById is a FK to Users (not Tasks), so it cannot store
            // a task-dependency relationship without unique-index collisions when multiple
            // prerequisites share the same assignee. Template item dependencies are already
            // captured in TaskTemplateItemDependencies and can be surfaced via the template
            // detail view. Tasks generated from a template start unblocked and can be manually
            // blocked via the normal user-driven block flow if needed.

            // Notify each distinct assignee of the tasks created for them.
            foreach (var grp in items.GroupBy(i => i.DefaultAssigneeId!.Value))
            {
                try
                {
                    await _notifications.NotifyUserAsync(grp.Key, new NotificationDto
                    {
                        Title     = "New tasks assigned",
                        Body      = $"{grp.Count()} task(s) from template \"{template.Name}\" have been created for you.",
                        Type      = "task",
                        Timestamp = AppClock.Now,
                    });
                }
                catch { /* non-fatal */ }
            }

            _db.TaskTemplateGeneratedTasks.AddRange(generatedLinks);
            generation.TaskCount = generatedLinks.Count;
            await _db.SaveChangesAsync();

            var genDto = await BuildGenerationDtoAsync(generation.Id);
            return Ok(genDto);
        }

        public async Task<ApiResponse<List<TaskTemplateGenerationDto>>> GetHistoryAsync(int id)
        {
            var generations = await _db.TaskTemplateGenerations
                .Where(g => g.TemplateId == id)
                .OrderByDescending(g => g.GeneratedAt)
                .Select(g => g.Id)
                .ToListAsync();

            var result = new List<TaskTemplateGenerationDto>();
            foreach (var gid in generations)
                result.Add(await BuildGenerationDtoAsync(gid));

            return Ok(result);
        }

        // ── Scheduler ────────────────────────────────────────────────────────────

        public async Task ProcessScheduledGenerationsAsync()
        {
            var today     = AppClock.Now.Date;
            var templates = await _db.TaskTemplates
                .Where(t => t.IsActive && t.StartDate.Date <= today && (t.EndDate == null || t.EndDate.Value.Date >= today))
                .Include(t => t.Assignees)
                .ToListAsync();

            var nowTimeOfDay = AppClock.Now.TimeOfDay;

            foreach (var t in templates)
            {
                if (!ShouldFireToday(t, today)) continue;

                // If TriggerTime is set, fire once the trigger time has been reached today.
                // (We compare against "now or later", not an exact-hour match, so a template
                // still fires even if the hourly pass didn't land exactly on the trigger hour.
                // The PeriodKey duplicate-guard below prevents it from firing more than once.)
                if (!string.IsNullOrWhiteSpace(t.TriggerTime) &&
                    TimeSpan.TryParse(t.TriggerTime, out var triggerTs) &&
                    nowTimeOfDay < triggerTs) continue;

                var periodKey = BuildPeriodKey(t, today);
                var exists    = await _db.TaskTemplateGenerations
                    .AnyAsync(g => g.TemplateId == t.Id && g.PeriodKey == periodKey);
                if (exists) continue;
                await GenerateAsync(t.Id, null, "Scheduled", today);
            }
        }

        // ── Helpers ──────────────────────────────────────────────────────────────

        /// <summary>
        /// Computes when the scheduler will next generate tasks for this template, mirroring the
        /// firing rules in <see cref="ProcessScheduledGenerationsAsync"/> (active window,
        /// recurrence match, trigger time, and the per-period duplicate guard). Returns null when
        /// the template is inactive or has no remaining occurrence within the active window.
        /// </summary>
        private static DateTime? ComputeNextRunAt(TaskTemplate t)
        {
            if (!t.IsActive) return null;

            var now   = AppClock.Now;
            var today = now.Date;

            var triggerTs = TimeSpan.Zero;
            if (!string.IsNullOrWhiteSpace(t.TriggerTime) && TimeSpan.TryParse(t.TriggerTime, out var parsed))
                triggerTs = parsed;

            var existingKeys = new HashSet<string>(t.Generations.Select(g => g.PeriodKey));

            // Scan forward from the later of today / start date. Cap at ~2 years so a misconfigured
            // template (e.g. monthly day-of-month that never matches) can't loop unbounded.
            var scanFrom = today < t.StartDate.Date ? t.StartDate.Date : today;
            for (var date = scanFrom; date <= scanFrom.AddDays(732); date = date.AddDays(1))
            {
                if (t.EndDate.HasValue && date > t.EndDate.Value.Date) return null;
                if (!ShouldFireToday(t, date)) continue;
                if (existingKeys.Contains(BuildPeriodKey(t, date))) continue;
                return date.Add(triggerTs);
            }
            return null;
        }

        private static bool ShouldFireToday(TaskTemplate t, DateTime today)
        {
            bool match = t.RecurrenceType switch
            {
                "daily"   => true,
                "weekly"  => t.DayOfWeek.HasValue && (int)today.DayOfWeek == t.DayOfWeek.Value,
                "monthly" => ShouldFireMonthly(t, today),
                "custom"  => t.CustomIntervalDays.HasValue &&
                             (today - t.StartDate.Date).Days % t.CustomIntervalDays.Value == 0,
                _         => false,
            };
            if (!match) return false;

            if (ParseIntList(t.SkipDaysOfWeek).Contains((int)today.DayOfWeek))          return false;
            if (ParseIntList(t.SkipDaysOfMonth).Contains(today.Day))                    return false;
            if (ParseStringList(t.SkipDates).Contains(today.ToString("yyyy-MM-dd")))    return false;

            return true;
        }

        private static bool ShouldFireMonthly(TaskTemplate t, DateTime today)
        {
            var days = ParseIntList(t.DaysOfMonth);
            if (days.Count > 0) return days.Contains(today.Day);
            return t.DayOfMonth.HasValue && today.Day == t.DayOfMonth.Value;
        }

        private static string BuildPeriodKey(TaskTemplate t, DateTime date) =>
            t.RecurrenceType switch
            {
                "daily"   => $"{t.Id}::{date:yyyy-MM-dd}",
                "weekly"  => $"{t.Id}::{date:yyyy}-W{ISOWeek.GetWeekOfYear(date):D2}",
                "monthly" => ParseIntList(t.DaysOfMonth).Count > 0
                             ? $"{t.Id}::{date:yyyy-MM-dd}"  // multi-day: one generation per day
                             : $"{t.Id}::{date:yyyy-MM}",    // legacy single-day: one per month
                "custom"  => $"{t.Id}::{date:yyyy-MM-dd}",
                _         => $"{t.Id}::{date:yyyy-MM-dd}",
            };

        private async Task<TaskTemplate?> LoadFullTemplateAsync(int id) =>
            await _db.TaskTemplates
                .Include(t => t.Project)
                .Include(t => t.CreatedBy)
                .Include(t => t.Assignees).ThenInclude(a => a.User)
                .Include(t => t.Generations)
                .Include(t => t.Items).ThenInclude(i => i.DefaultAssignee)
                .Include(t => t.Items).ThenInclude(i => i.QaReviewer)
                .Include(t => t.Items).ThenInclude(i => i.Checklists)
                .Include(t => t.Items).ThenInclude(i => i.Tags)
                .Include(t => t.Items).ThenInclude(i => i.Dependencies).ThenInclude(d => d.DependsOnItem)
                .Include(t => t.Items).ThenInclude(i => i.Attachments)
                .Include(t => t.Items).ThenInclude(i => i.ReviewCriteria)
                .FirstOrDefaultAsync(t => t.Id == id);

        private Task SaveAssigneesAsync(int templateId, List<int> userIds)
        {
            foreach (var uid in userIds.Distinct())
                _db.TaskTemplateAssignees.Add(new TaskTemplateAssignee { TemplateId = templateId, UserId = uid });
            return Task.CompletedTask;
        }

        private async Task SaveItemsAsync(int templateId, List<SaveTemplateItemDto> dtos)
        {
            // Pass 1: insert all items in one batch to get their IDs.
            var ordered = dtos.OrderBy(d => d.Position).ToList();
            var pairs   = new List<(SaveTemplateItemDto dto, TaskTemplateItem item)>();
            foreach (var dto in ordered)
            {
                var item = new TaskTemplateItem
                {
                    TemplateId        = templateId,
                    Position          = dto.Position,
                    Title             = dto.Title.Trim(),
                    Description       = dto.Description?.Trim(),
                    EstimatedHours    = dto.EstimatedHours,
                    Priority          = dto.Priority,
                    DefaultAssigneeId = dto.DefaultAssigneeId,
                    QaReviewerId      = dto.QaReviewerId,
                    DueDateOffsetDays = dto.DueDateOffsetDays,
                };
                _db.TaskTemplateItems.Add(item);
                pairs.Add((dto, item));
            }
            await _db.SaveChangesAsync(); // single round trip — all item.Id values are now populated

            // Pass 2: add child rows and build position → id map.
            var posToItemId = new Dictionary<int, int>();
            foreach (var (dto, item) in pairs)
            {
                posToItemId[dto.Position] = item.Id;

                for (int ci = 0; ci < dto.ChecklistItems.Count; ci++)
                    _db.TaskTemplateItemChecklists.Add(new TaskTemplateItemChecklist { TemplateItemId = item.Id, Text = dto.ChecklistItems[ci], Position = ci });

                foreach (var tag in dto.Tags)
                    _db.TaskTemplateItemTags.Add(new TaskTemplateItemTag { TemplateItemId = item.Id, Tag = tag });

                for (int ri = 0; ri < dto.ReviewCriteria.Count; ri++)
                    _db.TaskTemplateItemReviewCriteria.Add(new TaskTemplateItemReviewCriteria { TemplateItemId = item.Id, Text = dto.ReviewCriteria[ri], Position = ri });
            }

            // Pass 3: wire dependencies using the position map (children + deps saved together by caller).
            foreach (var dto in dtos)
            {
                if (!posToItemId.TryGetValue(dto.Position, out var itemId)) continue;
                foreach (var depPos in dto.DependsOnPositions)
                {
                    if (!posToItemId.TryGetValue(depPos, out var depId)) continue;
                    _db.TaskTemplateItemDependencies.Add(new TaskTemplateItemDependency
                    {
                        TemplateItemId  = itemId,
                        DependsOnItemId = depId,
                    });
                }
            }
        }

        private async Task<TaskTemplateGenerationDto> BuildGenerationDtoAsync(int generationId)
        {
            var gen = await _db.TaskTemplateGenerations
                .Include(g => g.GeneratedBy)
                .Include(g => g.GeneratedTasks).ThenInclude(gt => gt.Task)
                .Include(g => g.GeneratedTasks).ThenInclude(gt => gt.Assignee)
                .Include(g => g.GeneratedTasks).ThenInclude(gt => gt.TemplateItem)
                .FirstOrDefaultAsync(g => g.Id == generationId);

            if (gen == null) return new TaskTemplateGenerationDto();

            return new TaskTemplateGenerationDto
            {
                Id              = gen.Id,
                PeriodKey       = gen.PeriodKey,
                GeneratedAt     = gen.GeneratedAt,
                GeneratedByName = gen.GeneratedBy?.FullName,
                TaskCount       = gen.TaskCount,
                Notes           = gen.Notes,
                Tasks           = gen.GeneratedTasks.Select(gt => new GeneratedTaskLinkDto
                {
                    TaskId            = gt.TaskId,
                    TaskTitle         = gt.Task?.Title ?? string.Empty,
                    AssigneeName      = gt.Assignee?.FullName ?? string.Empty,
                    TemplateItemTitle = gt.TemplateItem?.Title ?? string.Empty,
                }).ToList(),
            };
        }

        private static TaskTemplateDto MapToDto(TaskTemplate t) => new()
        {
            Id              = t.Id,
            Name            = t.Name,
            Description     = t.Description,
            ProjectId       = t.ProjectId,
            ProjectName     = t.Project?.Name,
            Module          = t.Module,
            RecurrenceType  = t.RecurrenceType,
            DayOfWeek       = t.DayOfWeek,
            DayOfMonth      = t.DayOfMonth,
            DaysOfMonth     = ParseIntList(t.DaysOfMonth),
            SkipDaysOfWeek  = ParseIntList(t.SkipDaysOfWeek),
            SkipDates       = ParseStringList(t.SkipDates),
            SkipDaysOfMonth = ParseIntList(t.SkipDaysOfMonth),
            CustomIntervalDays = t.CustomIntervalDays,
            TriggerTime     = t.TriggerTime,
            StartDate       = t.StartDate,
            EndDate         = t.EndDate,
            IsActive        = t.IsActive,
            CreatedByName   = t.CreatedBy?.FullName ?? string.Empty,
            CreatedAt       = t.CreatedAt,
            GenerationCount = t.Generations.Count,
            LastGeneratedAt = t.Generations.OrderByDescending(g => g.GeneratedAt).FirstOrDefault()?.GeneratedAt,
            NextRunAt       = ComputeNextRunAt(t),
            AssigneeIds     = t.Assignees.Select(a => a.UserId).ToList(),
            AssigneeNames   = t.Assignees.Select(a => a.User?.FullName ?? string.Empty).ToList(),
            // Total task count for this template — drives the list overview count.
            ItemCount       = t.Items.Count,
            Items           = new(),
        };

        private static TaskTemplateDto MapToFullDto(TaskTemplate t)
        {
            var dto = MapToDto(t);
            dto.Items = t.Items.OrderBy(i => i.Position).Select(i => new TaskTemplateItemDto
            {
                Id                  = i.Id,
                Position            = i.Position,
                Title               = i.Title,
                Description         = i.Description,
                EstimatedHours      = i.EstimatedHours,
                Priority            = i.Priority,
                DefaultAssigneeId   = i.DefaultAssigneeId,
                DefaultAssigneeName = i.DefaultAssignee?.FullName,
                QaReviewerId        = i.QaReviewerId,
                QaReviewerName      = i.QaReviewer?.FullName,
                DueDateOffsetDays   = i.DueDateOffsetDays,
                Tags                = i.Tags.Select(t => t.Tag).ToList(),
                ChecklistItems      = i.Checklists.OrderBy(c => c.Position).Select(c => c.Text).ToList(),
                DependsOnPositions  = i.Dependencies.Select(d => d.DependsOnItem?.Position ?? 0).ToList(),
                ReviewCriteria      = i.ReviewCriteria.OrderBy(r => r.Position).Select(r => r.Text).ToList(),
            }).ToList();
            return dto;
        }

        // ── CSV helpers ──────────────────────────────────────────────────────────
        private static List<int> ParseIntList(string? csv) =>
            string.IsNullOrWhiteSpace(csv) ? new()
            : csv.Split(',', StringSplitOptions.RemoveEmptyEntries)
                 .Select(s => int.TryParse(s.Trim(), out var n) ? n : (int?)null)
                 .Where(n => n.HasValue).Select(n => n!.Value).ToList();

        private static string? FormatIntList(List<int>? list) =>
            list is null || list.Count == 0 ? null
            : string.Join(",", list.Distinct().OrderBy(x => x));

        private static List<string> ParseStringList(string? csv) =>
            string.IsNullOrWhiteSpace(csv) ? new()
            : csv.Split(',', StringSplitOptions.RemoveEmptyEntries)
                 .Select(s => s.Trim()).Where(s => s.Length > 0).ToList();

        private static string? FormatStringList(List<string>? list) =>
            list is null || list.Count == 0 ? null
            : string.Join(",", list.Select(s => s.Trim()).Where(s => s.Length > 0).Distinct().OrderBy(x => x));

        private static ApiResponse<T> Ok<T>(T data)    => new() { Success = true,  Data = data };
        private static ApiResponse<T> Fail<T>(string m) => new() { Success = false, Message = m };
        private static ApiResponse<T> NotFound<T>()     => new() { Success = false, Message = "Template not found." };
    }
}
