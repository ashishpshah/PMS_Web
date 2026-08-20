using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;
using TaskManagement.Data;

namespace TaskManagement.Services
{
    public interface IDatabaseInitializer
    {
        Task InitializeAsync();
    }

    public class DatabaseInitializer : IDatabaseInitializer
    {
        private readonly IServiceProvider _serviceProvider;

        public DatabaseInitializer(IServiceProvider serviceProvider)
        {
            _serviceProvider = serviceProvider;
        }

        public async Task InitializeAsync()
        {
            using var scope = _serviceProvider.CreateScope();
            var context = scope.ServiceProvider.GetRequiredService<PMSDbContext>();

            await context.Database.MigrateAsync();

            var rolesExist = await context.Roles.AnyAsync();
            if (!rolesExist)
            {
                // ── 1. Roles ──────────────────────────────────────────────────
                var adminRole = new Role { Name = "System Administrator",         Code = "ADMIN", Level = 1,  Description = "Full system access",      IsAdmin = true };
                var roles = new List<Role>
                {
                    adminRole,
                    new Role { Name = "Project Manager",                   Code = "PM",  Level = 2,  Description = "Project management" },
                    new Role { Name = "Senior Software Developer",          Code = "SSD", Level = 3,  Description = "Senior developer" },
                    new Role { Name = "Junior Software Developer",          Code = "JSD", Level = 4,  Description = "Junior developer" },
                    new Role { Name = "Mobile App Developer",               Code = "MAD", Level = 5,  Description = "Mobile developer" },
                    new Role { Name = "Wordpress Developer",                Code = "WPD", Level = 6,  Description = "Wordpress developer" },
                    new Role { Name = "UI/UX Designer",                     Code = "UXD", Level = 7,  Description = "UI/UX designer" },
                    new Role { Name = "Quality Assurance (QA) Tester",     Code = "QAT", Level = 8,  Description = "QA tester" },
                    new Role { Name = "Graphic Designer",                   Code = "GD",  Level = 9,  Description = "Graphic designer" },
                    new Role { Name = "Technical Content Creator",          Code = "TCC", Level = 10, Description = "Content creator" },
                    new Role { Name = "Social Media Manager",               Code = "SMM", Level = 11, Description = "Social media manager" },
                };
                context.Roles.AddRange(roles);
                await context.SaveChangesAsync();

                // ── 2. Page modules ───────────────────────────────────────────
                var pageModules = new List<PageModule>
                {
                    new PageModule { Name = "Dashboard", Route = "/",           Description = "Main dashboard" },
                    new PageModule { Name = "Projects",  Route = "/projects",   Description = "Project management" },
                    new PageModule { Name = "Tasks",     Route = "/tasks",      Description = "Task management" },
                    new PageModule { Name = "Users",     Route = "/users",      Description = "User management" },
                    new PageModule { Name = "Roles",     Route = "/roles",      Description = "Role management" },
                    new PageModule { Name = "Templates", Route = "/templates",  Description = "Task template management" },
                };
                context.PageModules.AddRange(pageModules);
                await context.SaveChangesAsync();

                // ── 3. Role page permissions ──────────────────────────────────
                const int fullAccess = 15; // View(1) + Create(2) + Update(4) + Delete(8)
                var rolePagePermissions = roles
                    .SelectMany(role => pageModules.Select(page => new RolePagePermission
                    {
                        RoleId      = role.Id,
                        PageModuleId = page.Id,
                        Permissions = role.IsAdmin ? fullAccess : 0,
                    }))
                    .ToList();
                context.RolePagePermissions.AddRange(rolePagePermissions);
                await context.SaveChangesAsync();

                // ── 4. Users ──────────────────────────────────────────────────
                var pmRole  = roles.First(r => r.Code == "PM");
                var ssdRole = roles.First(r => r.Code == "SSD");

                var adminUser = new User
                {
                    UserName     = "admin",
                    Email        = "admin@pms.com",
                    FirstName    = "System",
                    LastName     = "Admin",
                    FullName     = "System Admin",
                    PasswordHash = PasswordHasher.HashPassword("admin@123"),
                    RoleId       = adminRole.Id,
                    IsActive     = true,
                    CreatedAt    = AppClock.Now,
                };
                var ashish = new User
                {
                    UserName     = "ashish",
                    Email        = "ashish@padhyasoft.com",
                    FirstName    = "Ashish",
                    LastName     = "Shah",
                    FullName     = "Ashish Shah",
                    PasswordHash = PasswordHasher.HashPassword("12345"),
                    RoleId       = pmRole.Id,
                    IsActive     = true,
                    CreatedAt    = AppClock.Now,
                };
                var vishal = new User
                {
                    UserName     = "vishal",
                    Email        = "vishal@padhyasoft.com",
                    FirstName    = "Vishal",
                    LastName     = "Chudasama",
                    FullName     = "Vishal Chudasama",
                    PasswordHash = PasswordHasher.HashPassword("12345"),
                    RoleId       = ssdRole.Id,
                    IsActive     = true,
                    CreatedAt    = AppClock.Now,
                };
                context.Users.AddRange(adminUser, ashish, vishal);
                await context.SaveChangesAsync();

                // ── 5. Project: IFFCO Work ─────────────────────────────────
                var (projSeq, projCode) = await CodeGenerator.NextProjectCodeAsync(context);
                var project = new Project
                {
                    Code        = projCode,
                    SeqNumber   = projSeq,
                    Name        = "IFFCO Work",
                    Description = "IFFCO project work management",
                    Status      = "active",
                    OwnerId     = ashish.Id,
                    CreatedById = adminUser.Id,
                    CreatedAt   = AppClock.Now,
                };
                context.Projects.Add(project);
                await context.SaveChangesAsync();

                context.ProjectMembers.AddRange(
                    new ProjectMember { ProjectId = project.Id, UserId = adminUser.Id, RoleInProject = "Administrator" },
                    new ProjectMember { ProjectId = project.Id, UserId = ashish.Id,    RoleInProject = "Project Manager" },
                    new ProjectMember { ProjectId = project.Id, UserId = vishal.Id,    RoleInProject = "Developer" }
                );
                await context.SaveChangesAsync();
            }
        }

        // ──────────────────────────────────────────────────────────────────────
        // Sample data import
        // ──────────────────────────────────────────────────────────────────────
/*
        private const string SampleProjectName = "PMS Enterprise System";
        private const string SeedPassword = "Pms@123";

        private async Task SeedSampleDataAsync(PMSDbContext ctx, IHostEnvironment? env)
        {
            // Idempotency guard — skip if already imported
            if (await ctx.Projects.AnyAsync(p => p.Name == SampleProjectName))
                return;

            var json = ReadSampleJson(env);
            if (json == null) return;

            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;

            // 1. Wipe existing Projects + Tasks and all their children (keep Users/Roles/Chat)
            await WipeProjectsAndTasksAsync(ctx);

            // 2. Roles — ensure the sample roles exist; map sourceRoleId -> dbRoleId
            var roleIdMap = await EnsureRolesAsync(ctx, root);

            // 3. Users — insert if email not present; map sourceUserId -> dbUserId
            var userIdMap = await EnsureUsersAsync(ctx, root, roleIdMap);

            int Resolve(int sourceUserId) =>
                userIdMap.TryGetValue(sourceUserId, out var id) ? id : 0;

            // module map: sourceModuleId -> moduleName
            var moduleNames = new Dictionary<int, string>();
            if (root.TryGetProperty("modules", out var modulesEl))
                foreach (var m in modulesEl.EnumerateArray())
                    moduleNames[m.GetProperty("moduleId").GetInt32()] = m.GetProperty("moduleName").GetString() ?? "";

            // 4. Project
            var projEl = root.GetProperty("project");
            var ownerSrc = projEl.GetProperty("ownerId").GetInt32();
            var ownerId = Resolve(ownerSrc);
            var (projSeq, projCode) = await CodeGenerator.NextProjectCodeAsync(ctx);
            var project = new Project
            {
                Code = projCode,
                SeqNumber = projSeq,
                Name = projEl.GetProperty("projectName").GetString() ?? SampleProjectName,
                Description = GetString(projEl, "description"),
                Status = MapProjectStatus(GetString(projEl, "status")),
                StartDate = ParseDate(GetString(projEl, "startDate")),
                EndDate = ParseDate(GetString(projEl, "endDate")),
                OwnerId = ownerId,
                CreatedById = ownerId,
                CreatedAt = AppClock.Now,
                Modules = moduleNames.Values
                    .Where(n => !string.IsNullOrWhiteSpace(n))
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .Select(n => new ProjectModule { Name = n })
                    .ToList()
            };
            ctx.Projects.Add(project);
            await ctx.SaveChangesAsync();

            var activities = new List<Activity>();
            activities.Add(MakeActivity(ownerId, UserName(ctx, userIdMap, ownerSrc), $"created project {project.Code}", "project", project.Id, project.Name));

            // 5. Project members
            if (root.TryGetProperty("projectMembers", out var membersEl))
            {
                foreach (var pm in membersEl.EnumerateArray())
                {
                    var uid = Resolve(pm.GetProperty("userId").GetInt32());
                    if (uid == 0) continue;
                    ctx.ProjectMembers.Add(new ProjectMember
                    {
                        ProjectId = project.Id,
                        UserId = uid,
                        RoleInProject = GetString(pm, "role")
                    });
                }
                await ctx.SaveChangesAsync();
            }

            // 6. Tasks (top-level) — map sourceTaskId -> entity
            var taskMap = new Dictionary<int, TaskEntity>();
            if (root.TryGetProperty("tasks", out var tasksEl))
            {
                foreach (var t in tasksEl.EnumerateArray())
                {
                    var srcTaskId = t.GetProperty("taskId").GetInt32();
                    var assignee = Resolve(t.GetProperty("assignedTo").GetInt32());
                    // Creator: "assignedBy" (new schema) or "createdBy" (older schema), else project owner
                    var creatorSrc = t.TryGetProperty("assignedBy", out var abEl) ? abEl.GetInt32()
                        : t.TryGetProperty("createdBy", out var cbEl) ? cbEl.GetInt32() : 0;
                    var creator = Resolve(creatorSrc);
                    if (creator == 0) creator = ownerId;
                    var status = MapTaskStatus(GetString(t, "status"));
                    var moduleId = t.TryGetProperty("moduleId", out var mEl) ? mEl.GetInt32() : 0;
                    var startDate = ParseDate(GetString(t, "startDate"));

                    var (seq, code) = await CodeGenerator.NextTaskCodeAsync(ctx, project.Id);
                    var task = new TaskEntity
                    {
                        Code = code,
                        SeqNumber = seq,
                        Title = GetString(t, "title") ?? "Untitled",
                        Description = GetString(t, "description"),
                        Status = status,
                        Priority = MapPriority(GetString(t, "priority")),
                        ProjectId = project.Id,
                        AssignedToId = assignee == 0 ? null : assignee,
                        CreatedById = creator,
                        DueDate = ParseDate(GetString(t, "dueDate")),
                        EstimatedHours = GetDecimal(t, "estimatedHours"),
                        ActualHours = GetDecimal(t, "actualHours"),
                        Progress = status == "completed" ? 100 : 0,
                        Module = moduleNames.TryGetValue(moduleId, out var mn) ? mn : null,
                        CreatedAt = AppClock.Now,
                        StartedAt = status == "new" ? null : startDate,
                        StartedById = status == "new" ? null : (assignee == 0 ? null : assignee)
                    };
                    ctx.Tasks.Add(task);
                    await ctx.SaveChangesAsync(); // get Id + SeqNumber for subtasks/codes
                    taskMap[srcTaskId] = task;

                    activities.Add(MakeActivity(creator, UserName(ctx, userIdMap, creatorSrc),
                        $"created task {task.Code}", "task", task.Id, task.Title));
                }
            }

            // 7. Subtasks (tasks with ParentTaskId)
            if (root.TryGetProperty("subTasks", out var subsEl))
            {
                foreach (var s in subsEl.EnumerateArray())
                {
                    var parentSrc = s.GetProperty("taskId").GetInt32();
                    if (!taskMap.TryGetValue(parentSrc, out var parent)) continue;

                    var status = MapTaskStatus(GetString(s, "status"));
                    var (seq, code) = await CodeGenerator.NextSubtaskCodeAsync(ctx, parent);
                    // Subtask is a separate task: keeps the parent link but owns its fields
                    // (own status; its own assignee/module — NOT inherited from the parent).
                    var subAssignee = s.TryGetProperty("assignedTo", out var saEl) ? Resolve(saEl.GetInt32()) : 0;
                    var sub = new TaskEntity
                    {
                        Code = code,
                        SeqNumber = seq,
                        Title = GetString(s, "title") ?? "Untitled",
                        Status = status,
                        Priority = GetString(s, "priority") is string sp ? MapPriority(sp) : "Medium",
                        ProjectId = parent.ProjectId,
                        ParentTaskId = parent.Id,
                        AssignedToId = subAssignee == 0 ? null : subAssignee,
                        CreatedById = parent.CreatedById,
                        Progress = status == "completed" ? 100 : 0,
                        Module = GetString(s, "module"),
                        CreatedAt = AppClock.Now,
                        StartedAt = status == "new" ? null : AppClock.Now,
                        StartedById = status == "new" ? null : (subAssignee == 0 ? null : subAssignee)
                    };
                    ctx.Tasks.Add(sub);
                    await ctx.SaveChangesAsync();
                }
            }

            // 7b. QA tasks → flag the related task RequiresQA + assign the tester as QA reviewer
            if (root.TryGetProperty("qaTasks", out var qaEl))
            {
                foreach (var q in qaEl.EnumerateArray())
                {
                    var relatedSrc = q.TryGetProperty("relatedTaskId", out var rEl) ? rEl.GetInt32() : 0;
                    if (!taskMap.TryGetValue(relatedSrc, out var task)) continue;
                    var testerSrc = q.TryGetProperty("assignedTester", out var tEl) ? tEl.GetInt32() : 0;
                    var tester = Resolve(testerSrc);

                    task.RequiresQA = true;
                    if (tester != 0) task.QaAssigneeId = tester;
                    await ctx.SaveChangesAsync();

                    activities.Add(MakeActivity(tester == 0 ? ownerId : tester, UserName(ctx, userIdMap, testerSrc),
                        $"assigned QA for task {task.Code}", "task", task.Id, task.Title));
                }
            }

            // 8. Task comments
            if (root.TryGetProperty("taskComments", out var commentsEl))
            {
                foreach (var c in commentsEl.EnumerateArray())
                {
                    var srcTaskId = c.GetProperty("taskId").GetInt32();
                    if (!taskMap.TryGetValue(srcTaskId, out var task)) continue;
                    var srcUser = c.GetProperty("userId").GetInt32();
                    var uid = Resolve(srcUser);
                    if (uid == 0) continue;
                    ctx.TaskComments.Add(new TaskComment
                    {
                        TaskId = task.Id,
                        UserId = uid,
                        Content = GetString(c, "comment") ?? "",
                        CreatedAt = AppClock.Now
                    });
                    activities.Add(MakeActivity(uid, UserName(ctx, userIdMap, srcUser),
                        $"commented on task {task.Code}", "task", task.Id, task.Title));
                }
                await ctx.SaveChangesAsync();
            }

            // 9. Task assignment history
            if (root.TryGetProperty("taskAssignmentHistory", out var histEl))
            {
                foreach (var h in histEl.EnumerateArray())
                {
                    var srcTaskId = h.GetProperty("taskId").GetInt32();
                    if (!taskMap.TryGetValue(srcTaskId, out var task)) continue;
                    var changedBySrc = h.GetProperty("changedBy").GetInt32();
                    var changedBy = Resolve(changedBySrc);
                    var reason = GetString(h, "reason") ?? "Other";
                    if (!Array.Exists(DTOs.ReasonTags.Valid, r => r == reason)) reason = "Other";

                    ctx.TaskAssignmentHistories.Add(new TaskAssignmentHistory
                    {
                        TaskId = task.Id,
                        PreviousAssigneeId = NullableResolve(userIdMap, h, "fromUserId"),
                        NewAssigneeId = NullableResolve(userIdMap, h, "toUserId"),
                        ChangedById = changedBy,
                        ChangedAt = AppClock.Now,
                        ReasonTag = reason
                    });
                    activities.Add(MakeActivity(changedBy, UserName(ctx, userIdMap, changedBySrc),
                        $"reassigned task {task.Code}. Reason: {reason}", "task", task.Id, task.Title));
                }
                await ctx.SaveChangesAsync();
            }

            // 10. Bugs → separate tasks ([BUG] + title, "bug" tag), linked to the related task.
            //     Creating a bug forces its parent/related task to "in-progress".
            if (root.TryGetProperty("bugs", out var bugsEl))
            {
                foreach (var b in bugsEl.EnumerateArray())
                {
                    var reporter = Resolve(b.GetProperty("reportedBy").GetInt32());
                    var assignee = Resolve(b.GetProperty("assignedTo").GetInt32());
                    var status = MapBugStatus(GetString(b, "status"));
                    var title = "[BUG] " + (GetString(b, "title") ?? "Untitled");

                    // Resolve the related task (parent) if relatedTaskId is provided
                    TaskEntity? parentTask = null;
                    if (b.TryGetProperty("relatedTaskId", out var relEl) && taskMap.TryGetValue(relEl.GetInt32(), out var pt))
                        parentTask = pt;

                    var (seq, code) = parentTask != null
                        ? await CodeGenerator.NextSubtaskCodeAsync(ctx, parentTask)
                        : await CodeGenerator.NextTaskCodeAsync(ctx, project.Id);

                    var bugTask = new TaskEntity
                    {
                        Code = code,
                        SeqNumber = seq,
                        Title = title,
                        Description = $"Imported bug. Severity: {GetString(b, "severity")}",
                        Status = status,
                        Priority = MapPriority(GetString(b, "severity")),
                        ProjectId = project.Id,
                        ParentTaskId = parentTask?.Id,
                        AssignedToId = assignee == 0 ? null : assignee,
                        CreatedById = reporter == 0 ? project.OwnerId : reporter,
                        Module = "Testing & QA",
                        Progress = status == "completed" ? 100 : 0,
                        CreatedAt = AppClock.Now,
                        Tags = new List<TaskTag> { new TaskTag { Tag = "bug" } }
                    };
                    ctx.Tasks.Add(bugTask);
                    await ctx.SaveChangesAsync();

                    // A new bug means work is needed on the parent → move it to in-progress (unless completed)
                    if (parentTask != null && parentTask.Status != "in-progress" && parentTask.Status != "completed")
                    {
                        parentTask.Status = "in-progress";
                        if (parentTask.StartedAt == null) parentTask.StartedAt = AppClock.Now;
                        await ctx.SaveChangesAsync();
                    }

                    activities.Add(MakeActivity(bugTask.CreatedById, UserName(ctx, userIdMap, b.GetProperty("reportedBy").GetInt32()),
                        $"reported bug {bugTask.Code}", "task", bugTask.Id, bugTask.Title));
                }
            }

            // 11. Activity logs
            if (activities.Count > 0)
            {
                ctx.Activities.AddRange(activities);
                await ctx.SaveChangesAsync();
            }
        }

        // ── wipe ────────────────────────────────────────────────────────────
        private async Task WipeProjectsAndTasksAsync(PMSDbContext ctx)
        {
            // Children of tasks first
            ctx.TaskStatusHistories.RemoveRange(await ctx.TaskStatusHistories.ToListAsync());
            ctx.TaskAssignmentHistories.RemoveRange(await ctx.TaskAssignmentHistories.ToListAsync());
            ctx.TaskBlockEntries.RemoveRange(await ctx.TaskBlockEntries.ToListAsync());
            ctx.ChecklistItems.RemoveRange(await ctx.ChecklistItems.ToListAsync());
            ctx.TaskComments.RemoveRange(await ctx.TaskComments.ToListAsync());
            ctx.Attachments.RemoveRange(await ctx.Attachments.ToListAsync());
            ctx.TaskTags.RemoveRange(await ctx.TaskTags.ToListAsync());
            await ctx.SaveChangesAsync();

            // Subtasks (have ParentTaskId) before parents to satisfy the self-FK (Restrict)
            var childTasks = await ctx.Tasks.Where(t => t.ParentTaskId != null).ToListAsync();
            ctx.Tasks.RemoveRange(childTasks);
            await ctx.SaveChangesAsync();
            var rootTasks = await ctx.Tasks.ToListAsync();
            ctx.Tasks.RemoveRange(rootTasks);
            await ctx.SaveChangesAsync();

            // Project children then projects
            ctx.ProjectModules.RemoveRange(await ctx.ProjectModules.ToListAsync());
            ctx.ProjectMembers.RemoveRange(await ctx.ProjectMembers.ToListAsync());
            ctx.ProjectAssignmentHistories.RemoveRange(await ctx.ProjectAssignmentHistories.ToListAsync());
            await ctx.SaveChangesAsync();
            ctx.Projects.RemoveRange(await ctx.Projects.ToListAsync());
            await ctx.SaveChangesAsync();

            // Drop project/task activity rows so the feed reflects only the fresh import
            var staleActivities = await ctx.Activities
                .Where(a => a.TargetType == "task" || a.TargetType == "project")
                .ToListAsync();
            ctx.Activities.RemoveRange(staleActivities);
            await ctx.SaveChangesAsync();
        }

        // ── roles & users ────────────────────────────────────────────────────
        private async Task<Dictionary<int, int>> EnsureRolesAsync(PMSDbContext ctx, JsonElement root)
        {
            var map = new Dictionary<int, int>();
            if (!root.TryGetProperty("roles", out var rolesEl)) return map;

            var existing = await ctx.Roles.ToListAsync();
            foreach (var r in rolesEl.EnumerateArray())
            {
                var srcId = r.GetProperty("roleId").GetInt32();
                var name = r.GetProperty("roleName").GetString() ?? "";
                // "System Admin" maps onto the existing admin role (any IsAdmin role, else "SystemAdmin")
                var isAdminRole = name.Replace(" ", "").Equals("SystemAdmin", StringComparison.OrdinalIgnoreCase);
                var match = existing.FirstOrDefault(x =>
                    x.Name.Equals(name, StringComparison.OrdinalIgnoreCase) ||
                    (isAdminRole && (x.IsAdmin || x.Name.Equals("SystemAdmin", StringComparison.OrdinalIgnoreCase))));
                if (match == null)
                {
                    var code = RoleCodeFromName(name);
                    // avoid code clash with existing roles
                    if (existing.Any(x => string.Equals(x.Code, code, StringComparison.OrdinalIgnoreCase)))
                        code = code + srcId;
                    match = new Role { Name = name, Code = code, Level = srcId, Description = name, IsAdmin = isAdminRole };
                    ctx.Roles.Add(match);
                    await ctx.SaveChangesAsync();
                    existing.Add(match);
                }
                map[srcId] = match.Id;
            }
            return map;
        }

        private async Task<Dictionary<int, int>> EnsureUsersAsync(PMSDbContext ctx, JsonElement root, Dictionary<int, int> roleIdMap)
        {
            var map = new Dictionary<int, int>();
            if (!root.TryGetProperty("users", out var usersEl)) return map;

            // Resolve roles by NAME (new schema: user.role string) — fall back to roleId map (old schema)
            var allRoles = await ctx.Roles.ToListAsync();

            foreach (var u in usersEl.EnumerateArray())
            {
                var srcId = u.GetProperty("userId").GetInt32();
                var email = u.GetProperty("email").GetString() ?? "";
                var existing = await ctx.Users.FirstOrDefaultAsync(x => x.Email == email);
                if (existing != null)
                {
                    map[srcId] = existing.Id;
                    continue;
                }

                // Determine role by name (new schema) or legacy roleId mapping.
                // Fallback to the lowest-privilege non-admin role; NEVER auto-assign System Admin (RoleId 1).
                int roleId = 0;
                var roleName = GetString(u, "role");
                if (!string.IsNullOrWhiteSpace(roleName))
                {
                    var r = allRoles.FirstOrDefault(x => x.Name.Equals(roleName, StringComparison.OrdinalIgnoreCase));
                    if (r != null) roleId = r.Id;
                }
                else if (u.TryGetProperty("roleId", out var ridEl) && roleIdMap.TryGetValue(ridEl.GetInt32(), out var rid))
                {
                    roleId = rid;
                }
                // System Admin is a single seeded account — imported users never get RoleId 1.
                if (roleId == 1 || roleId == 0)
                {
                    var fallback = allRoles.Where(x => x.Id != 1).OrderByDescending(x => x.Id).FirstOrDefault();
                    roleId = fallback?.Id ?? roleId;
                }

                var status = GetString(u, "status");
                var fullName = u.GetProperty("name").GetString() ?? email;
                var spaceIdx = fullName.IndexOf(' ');
                var firstName = spaceIdx > 0 ? fullName.Substring(0, spaceIdx) : fullName;
                var lastName = spaceIdx > 0 ? fullName.Substring(spaceIdx + 1).Trim() : string.Empty;
                var user = new User
                {
                    UserName = email.Split('@')[0],
                    Email = email,
                    FirstName = firstName,
                    LastName = lastName,
                    FullName = fullName,
                    PasswordHash = PasswordHasher.HashPassword(SeedPassword),
                    RoleId = roleId,
                    IsActive = string.Equals(status, "Active", StringComparison.OrdinalIgnoreCase),
                    CreatedAt = AppClock.Now
                };
                ctx.Users.Add(user);
                await ctx.SaveChangesAsync();
                map[srcId] = user.Id;
            }
            return map;
        }

        // Derive a short uppercase role code from a name, e.g. "Senior Software Developer" -> "SSD"
        private static string RoleCodeFromName(string name)
        {
            var words = name.Split(' ', StringSplitOptions.RemoveEmptyEntries);
            if (words.Length == 1) return words[0].ToUpperInvariant();
            return new string(words.Select(w => char.ToUpperInvariant(w[0])).ToArray());
        }

        // ── helpers ───────────────────────────────────────────────────────────
        private string? ReadSampleJson(IHostEnvironment? env)
        {
            var candidates = new List<string>();
            if (env != null) candidates.Add(Path.Combine(env.ContentRootPath, "SampleData.json"));
            candidates.Add(Path.Combine(AppContext.BaseDirectory, "SampleData.json"));
            candidates.Add(Path.Combine(Directory.GetCurrentDirectory(), "SampleData.json"));

            foreach (var path in candidates)
                if (File.Exists(path)) return File.ReadAllText(path);
            return null;
        }

        private static Activity MakeActivity(int userId, string userName, string action, string targetType, int targetId, string targetName) =>
            new Activity
            {
                UserId = userId,
                UserName = userName,
                Action = action,
                TargetType = targetType,
                TargetId = targetId,
                TargetName = targetName,
                Timestamp = AppClock.Now
            };

        private static string UserName(PMSDbContext ctx, Dictionary<int, int> userIdMap, int sourceUserId)
        {
            if (userIdMap.TryGetValue(sourceUserId, out var dbId))
            {
                var u = ctx.Users.Local.FirstOrDefault(x => x.Id == dbId) ?? ctx.Users.Find(dbId);
                if (u != null) return u.FullName;
            }
            return "System";
        }

        private static int? NullableResolve(Dictionary<int, int> map, JsonElement el, string prop)
        {
            if (!el.TryGetProperty(prop, out var v)) return null;
            var src = v.GetInt32();
            return map.TryGetValue(src, out var id) ? id : (int?)null;
        }

        private static string? GetString(JsonElement el, string prop) =>
            el.TryGetProperty(prop, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

        private static decimal? GetDecimal(JsonElement el, string prop) =>
            el.TryGetProperty(prop, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetDecimal() : null;

        private static DateTime? ParseDate(string? s) =>
            DateTime.TryParse(s, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var d)
                ? d : (DateTime?)null;

        private static string MapTaskStatus(string? s) => (s ?? "").Trim().ToLowerInvariant() switch
        {
            "completed" => "completed",
            "in progress" or "in-progress" => "in-progress",
            "pending" => "new",
            "new" => "new",
            "paused" => "paused",
            "blocked" => "blocked",
            "under review" or "under-review" => "under-review",
            "issues" => "issues",
            _ => "new"
        };

        private static string MapBugStatus(string? s) => (s ?? "").Trim().ToLowerInvariant() switch
        {
            "fixed" or "resolved" or "closed" or "completed" => "completed",
            "in progress" or "in-progress" => "in-progress",
            "open" or "new" => "new",
            _ => "new"
        };

        private static string MapPriority(string? s) => (s ?? "").Trim().ToLowerInvariant() switch
        {
            "low" => "low",
            "medium" => "medium",
            "high" => "high",
            "critical" => "high", // Priority type only supports low/medium/high
            _ => "medium"
        };

        private static string MapProjectStatus(string? s) => (s ?? "").Trim().ToLowerInvariant() switch
        {
            "active" or "in progress" or "in-progress" => "active",
            "on hold" or "on-hold" or "paused" => "on-hold",
            "completed" or "done" => "completed",
            _ => "active"
        };
    
    */
    }
}
