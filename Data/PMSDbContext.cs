using System;
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore;
using TaskManagement.Services;

namespace TaskManagement.Data
{
    public class PMSDbContext : DbContext
    {
        public PMSDbContext(DbContextOptions<PMSDbContext> options)
            : base(options)
        {
        }

        public DbSet<Role> Roles => Set<Role>();
        public DbSet<User> Users => Set<User>();
        public DbSet<Project> Projects => Set<Project>();
        public DbSet<ProjectMember> ProjectMembers => Set<ProjectMember>();
        public DbSet<ProjectModule> ProjectModules => Set<ProjectModule>();
        public DbSet<TaskEntity> Tasks => Set<TaskEntity>();
        public DbSet<TaskTag> TaskTags => Set<TaskTag>();
        public DbSet<TaskComment> TaskComments => Set<TaskComment>();
        public DbSet<Attachment> Attachments => Set<Attachment>();
        public DbSet<Activity> Activities => Set<Activity>();
        public DbSet<PageModule> PageModules => Set<PageModule>();
        public DbSet<RolePagePermission> RolePagePermissions => Set<RolePagePermission>();
        public DbSet<UserPagePermission> UserPagePermissions => Set<UserPagePermission>();
        public DbSet<ProjectAssignmentHistory> ProjectAssignmentHistories => Set<ProjectAssignmentHistory>();
        public DbSet<TaskAssignmentHistory> TaskAssignmentHistories => Set<TaskAssignmentHistory>();
        public DbSet<ChecklistItem> ChecklistItems => Set<ChecklistItem>();
        public DbSet<TaskBlockEntry> TaskBlockEntries => Set<TaskBlockEntry>();
        public DbSet<TaskStatusHistory> TaskStatusHistories => Set<TaskStatusHistory>();
        public DbSet<ChatMessage> ChatMessages => Set<ChatMessage>();
        public DbSet<ChatAttachment> ChatAttachments => Set<ChatAttachment>();
        public DbSet<ChatRoom> ChatRooms => Set<ChatRoom>();
        public DbSet<ChatRoomMember> ChatRoomMembers => Set<ChatRoomMember>();
        public DbSet<WorkDiary> WorkDiaries => Set<WorkDiary>();
        public DbSet<TaskConditionHistory> TaskConditionHistories => Set<TaskConditionHistory>();
        public DbSet<TaskIssueEntry> TaskIssueEntries => Set<TaskIssueEntry>();
        public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();
        public DbSet<EmailOtp> EmailOtps => Set<EmailOtp>();

        // Task Template module
        public DbSet<TaskTemplate>                 TaskTemplates                 => Set<TaskTemplate>();
        public DbSet<TaskTemplateItem>             TaskTemplateItems             => Set<TaskTemplateItem>();
        public DbSet<TaskTemplateItemChecklist>    TaskTemplateItemChecklists    => Set<TaskTemplateItemChecklist>();
        public DbSet<TaskTemplateItemTag>          TaskTemplateItemTags          => Set<TaskTemplateItemTag>();
        public DbSet<TaskTemplateItemDependency>   TaskTemplateItemDependencies  => Set<TaskTemplateItemDependency>();
        public DbSet<TaskTemplateItemAttachment>   TaskTemplateItemAttachments   => Set<TaskTemplateItemAttachment>();
        public DbSet<TaskTemplateItemReviewCriteria> TaskTemplateItemReviewCriteria => Set<TaskTemplateItemReviewCriteria>();
        public DbSet<TaskTemplateAssignee>         TaskTemplateAssignees         => Set<TaskTemplateAssignee>();
        public DbSet<TaskTemplateGeneration>       TaskTemplateGenerations       => Set<TaskTemplateGeneration>();
        public DbSet<TaskTemplateGeneratedTask>    TaskTemplateGeneratedTasks    => Set<TaskTemplateGeneratedTask>();
        public DbSet<TaskReviewIssue>              TaskReviewIssues              => Set<TaskReviewIssue>();
        public DbSet<ReviewChecklistItem>          ReviewChecklistItems          => Set<ReviewChecklistItem>();
        public DbSet<BlockChecklistItem>           BlockChecklistItems           => Set<BlockChecklistItem>();

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            // Unique role code (filtered so multiple legacy NULLs are allowed)
            modelBuilder.Entity<Role>()
                .HasIndex(r => r.Code)
                .IsUnique()
                .HasFilter("[Code] IS NOT NULL");

            modelBuilder.Entity<ProjectMember>()
                .HasKey(pm => new { pm.ProjectId, pm.UserId });

            modelBuilder.Entity<ProjectMember>()
                .HasOne(pm => pm.Project)
                .WithMany(p => p.Members)
                .HasForeignKey(pm => pm.ProjectId)
                .OnDelete(DeleteBehavior.Restrict);

            modelBuilder.Entity<ProjectMember>()
                .HasOne(pm => pm.User)
                .WithMany()
                .HasForeignKey(pm => pm.UserId)
                .OnDelete(DeleteBehavior.Restrict);

            modelBuilder.Entity<TaskTag>()
                .HasKey(tt => new { tt.TaskId, tt.Tag });

            modelBuilder.Entity<TaskTag>()
                .HasOne<TaskEntity>()
                .WithMany(t => t.Tags)
                .HasForeignKey(tt => tt.TaskId);

            modelBuilder.Entity<ProjectModule>()
                .HasKey(pm => new { pm.ProjectId, pm.Name });

            modelBuilder.Entity<ProjectModule>()
                .HasOne(pm => pm.Project)
                .WithMany(p => p.Modules)
                .HasForeignKey(pm => pm.ProjectId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<TaskComment>()
                .HasOne<TaskEntity>()
                .WithMany(t => t.Comments)
                .HasForeignKey(tc => tc.TaskId);

            modelBuilder.Entity<TaskComment>()
                .HasOne(tc => tc.User)
                .WithMany()
                .HasForeignKey(tc => tc.UserId)
                .OnDelete(DeleteBehavior.Restrict);

            modelBuilder.Entity<Attachment>()
                .HasOne<TaskEntity>()
                .WithMany(t => t.Attachments)
                .HasForeignKey(a => a.TaskId);

            modelBuilder.Entity<Attachment>()
                .HasOne(a => a.UploadedBy)
                .WithMany()
                .HasForeignKey(a => a.UploadedById)
                .OnDelete(DeleteBehavior.Restrict);

            modelBuilder.Entity<User>()
                .HasOne(u => u.Role)
                .WithMany()
                .HasForeignKey(u => u.RoleId)
                .OnDelete(DeleteBehavior.Restrict);

            // Unique username/email (case-insensitive via SQL Server's default CI collation).
            modelBuilder.Entity<User>().Property(u => u.UserName).HasMaxLength(50);
            modelBuilder.Entity<User>().Property(u => u.Email).HasMaxLength(256);
            modelBuilder.Entity<User>().Property(u => u.FirstName).HasMaxLength(100);
            modelBuilder.Entity<User>().Property(u => u.LastName).HasMaxLength(100);
            modelBuilder.Entity<User>().HasIndex(u => u.UserName).IsUnique();
            modelBuilder.Entity<User>().HasIndex(u => u.Email).IsUnique();
            modelBuilder.Entity<User>().HasIndex(u => u.ContactNoNormalized);

            modelBuilder.Entity<Project>()
                .HasOne(p => p.CreatedBy)
                .WithMany()
                .HasForeignKey(p => p.CreatedById)
                .OnDelete(DeleteBehavior.Restrict);

            modelBuilder.Entity<Project>()
                .HasOne(p => p.Owner)
                .WithMany()
                .HasForeignKey(p => p.OwnerId)
                .OnDelete(DeleteBehavior.Restrict);

            // Configure decimal precision
            modelBuilder.Entity<TaskEntity>()
                .Property(t => t.EstimatedHours)
                .HasColumnType("decimal(18,2)");

            modelBuilder.Entity<TaskEntity>()
                .Property(t => t.ActualHours)
                .HasColumnType("decimal(18,2)");

            modelBuilder.Entity<TaskStatusHistory>()
                .Property(h => h.ActualHours)
                .HasColumnType("decimal(18,2)");

            // Self-referencing parent/child task link
            modelBuilder.Entity<TaskEntity>()
                .HasOne(t => t.ParentTask)
                .WithMany(t => t.ChildTasks)
                .HasForeignKey(t => t.ParentTaskId)
                .OnDelete(DeleteBehavior.Restrict);

            // Unique hierarchy codes (filtered so multiple legacy NULLs are allowed)
            modelBuilder.Entity<Project>()
                .HasIndex(p => p.Code)
                .IsUnique()
                .HasFilter("[Code] IS NOT NULL");
            modelBuilder.Entity<TaskEntity>()
                .HasIndex(t => t.Code)
                .IsUnique()
                .HasFilter("[Code] IS NOT NULL");

            modelBuilder.Entity<TaskEntity>()
                .HasOne(t => t.StartedBy)
                .WithMany()
                .HasForeignKey(t => t.StartedById)
                .OnDelete(DeleteBehavior.Restrict);

            modelBuilder.Entity<TaskEntity>()
                .HasOne(t => t.QaAssignee)
                .WithMany()
                .HasForeignKey(t => t.QaAssigneeId)
                .OnDelete(DeleteBehavior.Restrict);

            // Task status change history
            modelBuilder.Entity<TaskStatusHistory>()
                .Property(h => h.Id).ValueGeneratedOnAdd();
            modelBuilder.Entity<TaskStatusHistory>()
                .Property(h => h.Action).HasMaxLength(50);
            modelBuilder.Entity<TaskStatusHistory>()
                .HasOne(h => h.Task)
                .WithMany(t => t.StatusHistory)
                .HasForeignKey(h => h.TaskId)
                .OnDelete(DeleteBehavior.Cascade);
            modelBuilder.Entity<TaskStatusHistory>()
                .HasOne(h => h.ChangedBy)
                .WithMany()
                .HasForeignKey(h => h.ChangedById)
                .OnDelete(DeleteBehavior.Restrict);

            // Configure auto-increment for all primary keys
            modelBuilder.Entity<Role>().Property(r => r.Id).ValueGeneratedOnAdd();
            modelBuilder.Entity<User>().Property(u => u.Id).ValueGeneratedOnAdd();
            modelBuilder.Entity<Project>().Property(p => p.Id).ValueGeneratedOnAdd();
            modelBuilder.Entity<TaskEntity>().Property(t => t.Id).ValueGeneratedOnAdd();
            modelBuilder.Entity<TaskComment>().Property(c => c.Id).ValueGeneratedOnAdd();
            modelBuilder.Entity<Attachment>().Property(a => a.Id).ValueGeneratedOnAdd();
            modelBuilder.Entity<Activity>().Property(a => a.Id).ValueGeneratedOnAdd();

            // ProjectAssignmentHistory
            modelBuilder.Entity<ProjectAssignmentHistory>()
                .Property(h => h.Id).ValueGeneratedOnAdd();
            modelBuilder.Entity<ProjectAssignmentHistory>()
                .HasOne(h => h.Project)
                .WithMany(p => p.AssignmentHistory)
                .HasForeignKey(h => h.ProjectId)
                .OnDelete(DeleteBehavior.Restrict);
            modelBuilder.Entity<ProjectAssignmentHistory>()
                .HasOne(h => h.PreviousOwner)
                .WithMany()
                .HasForeignKey(h => h.PreviousOwnerId)
                .OnDelete(DeleteBehavior.Restrict);
            modelBuilder.Entity<ProjectAssignmentHistory>()
                .HasOne(h => h.NewOwner)
                .WithMany()
                .HasForeignKey(h => h.NewOwnerId)
                .OnDelete(DeleteBehavior.Restrict);
            modelBuilder.Entity<ProjectAssignmentHistory>()
                .HasOne(h => h.ChangedBy)
                .WithMany()
                .HasForeignKey(h => h.ChangedById)
                .OnDelete(DeleteBehavior.Restrict);
            modelBuilder.Entity<ProjectAssignmentHistory>()
                .Property(h => h.ReasonTag).HasMaxLength(50);

            // TaskAssignmentHistory
            modelBuilder.Entity<TaskAssignmentHistory>()
                .Property(h => h.Id).ValueGeneratedOnAdd();
            modelBuilder.Entity<TaskAssignmentHistory>()
                .HasOne(h => h.Task)
                .WithMany(t => t.AssignmentHistory)
                .HasForeignKey(h => h.TaskId)
                .OnDelete(DeleteBehavior.Restrict);
            modelBuilder.Entity<TaskAssignmentHistory>()
                .HasOne(h => h.PreviousAssignee)
                .WithMany()
                .HasForeignKey(h => h.PreviousAssigneeId)
                .OnDelete(DeleteBehavior.Restrict);
            modelBuilder.Entity<TaskAssignmentHistory>()
                .HasOne(h => h.NewAssignee)
                .WithMany()
                .HasForeignKey(h => h.NewAssigneeId)
                .OnDelete(DeleteBehavior.Restrict);
            modelBuilder.Entity<TaskAssignmentHistory>()
                .HasOne(h => h.ChangedBy)
                .WithMany()
                .HasForeignKey(h => h.ChangedById)
                .OnDelete(DeleteBehavior.Restrict);
            modelBuilder.Entity<TaskAssignmentHistory>()
                .Property(h => h.ReasonTag).HasMaxLength(50);

            // ChecklistItem
            modelBuilder.Entity<ChecklistItem>()
                .Property(c => c.Id).ValueGeneratedOnAdd();
            modelBuilder.Entity<ChecklistItem>()
                .HasOne<TaskEntity>()
                .WithMany(t => t.ChecklistItems)
                .HasForeignKey(c => c.TaskId)
                .OnDelete(DeleteBehavior.Cascade);
            modelBuilder.Entity<ChecklistItem>()
                .HasOne(c => c.CompletedBy)
                .WithMany()
                .HasForeignKey(c => c.CompletedById)
                .OnDelete(DeleteBehavior.Restrict);
            modelBuilder.Entity<ChecklistItem>()
                .Property(c => c.Title).HasMaxLength(500);

            // TaskBlockEntry
            modelBuilder.Entity<TaskBlockEntry>()
                .Property(b => b.Id).ValueGeneratedOnAdd();
            modelBuilder.Entity<TaskBlockEntry>()
                .HasOne(b => b.Task)
                .WithMany(t => t.BlockEntries)
                .HasForeignKey(b => b.TaskId)
                .OnDelete(DeleteBehavior.Cascade);
            modelBuilder.Entity<TaskBlockEntry>()
                .HasOne(b => b.BlockedBy)
                .WithMany()
                .HasForeignKey(b => b.BlockedById)
                .OnDelete(DeleteBehavior.Restrict);
            modelBuilder.Entity<TaskBlockEntry>()
                .Property(b => b.Reason).HasMaxLength(1000);
            // One active block per user per task
            modelBuilder.Entity<TaskBlockEntry>()
                .HasIndex(b => new { b.TaskId, b.BlockedById })
                .IsUnique();

            // ChatMessage
            modelBuilder.Entity<ChatMessage>()
                .Property(m => m.Id).ValueGeneratedOnAdd();
            modelBuilder.Entity<ChatMessage>()
                .HasOne(m => m.Sender)
                .WithMany()
                .HasForeignKey(m => m.SenderId)
                .OnDelete(DeleteBehavior.Restrict);
            modelBuilder.Entity<ChatMessage>()
                .HasOne(m => m.ReplyTo)
                .WithMany()
                .HasForeignKey(m => m.ReplyToId)
                .OnDelete(DeleteBehavior.Restrict);
            modelBuilder.Entity<ChatMessage>()
                .HasOne(m => m.Attachment)
                .WithOne(a => a.Message)
                .HasForeignKey<ChatAttachment>(a => a.MessageId)
                .OnDelete(DeleteBehavior.Cascade);
            modelBuilder.Entity<ChatMessage>()
                .Property(m => m.MessageType).HasMaxLength(20);
            modelBuilder.Entity<ChatMessage>()
                .HasOne(m => m.Room)
                .WithMany(r => r.Messages)
                .HasForeignKey(m => m.RoomId)
                .OnDelete(DeleteBehavior.Cascade);

            // ChatAttachment
            modelBuilder.Entity<ChatAttachment>()
                .Property(a => a.Id).ValueGeneratedOnAdd();

            // ChatRoom
            modelBuilder.Entity<ChatRoom>()
                .Property(r => r.Id).ValueGeneratedOnAdd();
            modelBuilder.Entity<ChatRoom>()
                .HasOne(r => r.CreatedBy)
                .WithMany()
                .HasForeignKey(r => r.CreatedById)
                .OnDelete(DeleteBehavior.Restrict);
            modelBuilder.Entity<ChatRoom>()
                .Property(r => r.RoomType).HasMaxLength(20);

            // ChatRoomMember
            modelBuilder.Entity<ChatRoomMember>()
                .HasKey(m => new { m.RoomId, m.UserId });
            modelBuilder.Entity<ChatRoomMember>()
                .HasOne(m => m.Room)
                .WithMany(r => r.Members)
                .HasForeignKey(m => m.RoomId)
                .OnDelete(DeleteBehavior.Cascade);
            modelBuilder.Entity<ChatRoomMember>()
                .HasOne(m => m.User)
                .WithMany()
                .HasForeignKey(m => m.UserId)
                .OnDelete(DeleteBehavior.Restrict);

            // WorkDiary
            modelBuilder.Entity<WorkDiary>()
                .HasOne(wd => wd.User).WithMany()
                .HasForeignKey(wd => wd.UserId).OnDelete(DeleteBehavior.Restrict);
            modelBuilder.Entity<WorkDiary>()
                .HasOne(wd => wd.Project).WithMany()
                .HasForeignKey(wd => wd.ProjectId).OnDelete(DeleteBehavior.Restrict);
            modelBuilder.Entity<WorkDiary>()
                .HasOne(wd => wd.Task).WithMany()
                .HasForeignKey(wd => wd.TaskId).OnDelete(DeleteBehavior.SetNull);
            modelBuilder.Entity<WorkDiary>()
                .Property(wd => wd.HoursSpent).HasColumnType("decimal(5,2)");

            // TaskConditionHistory
            modelBuilder.Entity<TaskConditionHistory>()
                .Property(h => h.Id).ValueGeneratedOnAdd();
            modelBuilder.Entity<TaskConditionHistory>()
                .HasOne(h => h.Task)
                .WithMany(t => t.ConditionHistory)
                .HasForeignKey(h => h.TaskId)
                .OnDelete(DeleteBehavior.Cascade);
            modelBuilder.Entity<TaskConditionHistory>()
                .HasOne(h => h.ChangedBy)
                .WithMany()
                .HasForeignKey(h => h.ChangedById)
                .OnDelete(DeleteBehavior.Restrict);
            modelBuilder.Entity<TaskConditionHistory>()
                .Property(h => h.ConditionName).HasMaxLength(50);
            modelBuilder.Entity<TaskConditionHistory>()
                .Property(h => h.Notes).HasMaxLength(1000);
            modelBuilder.Entity<TaskEntity>()
                .Property(t => t.PauseReason).HasMaxLength(500);

            // TaskIssueEntry
            modelBuilder.Entity<TaskIssueEntry>()
                .Property(e => e.Id).ValueGeneratedOnAdd();
            modelBuilder.Entity<TaskIssueEntry>()
                .HasOne(e => e.Task)
                .WithMany(t => t.IssueEntries)
                .HasForeignKey(e => e.TaskId)
                .OnDelete(DeleteBehavior.Cascade);
            modelBuilder.Entity<TaskIssueEntry>()
                .HasOne(e => e.CreatedBy)
                .WithMany()
                .HasForeignKey(e => e.CreatedById)
                .OnDelete(DeleteBehavior.Restrict);
            modelBuilder.Entity<TaskIssueEntry>()
                .HasOne(e => e.ResolvedBy)
                .WithMany()
                .HasForeignKey(e => e.ResolvedById)
                .OnDelete(DeleteBehavior.Restrict);
            modelBuilder.Entity<TaskIssueEntry>()
                .Property(e => e.Description).HasMaxLength(500);

            // RefreshToken
            modelBuilder.Entity<RefreshToken>(b =>
            {
                b.Property(r => r.Id).ValueGeneratedOnAdd();
                b.HasOne(r => r.User).WithMany().HasForeignKey(r => r.UserId).OnDelete(DeleteBehavior.Cascade);
                b.Property(r => r.Token).HasMaxLength(128).IsRequired();
                b.HasIndex(r => r.Token).IsUnique();
            });

            // EmailOtp
            modelBuilder.Entity<EmailOtp>(b =>
            {
                b.Property(o => o.Email).HasMaxLength(256).IsRequired();
                b.Property(o => o.OtpHash).HasMaxLength(128).IsRequired();
                b.Property(o => o.Purpose).HasMaxLength(32).IsRequired();
                b.HasIndex(o => new { o.Email, o.Purpose });
            });

            // ── Task Template module ─────────────────────────────────────────────

            modelBuilder.Entity<TaskTemplate>(b =>
            {
                b.Property(t => t.Id).ValueGeneratedOnAdd();
                b.Property(t => t.Name).HasMaxLength(200).IsRequired();
                b.Property(t => t.Description).HasMaxLength(1000);
                b.Property(t => t.RecurrenceType).HasMaxLength(20).IsRequired();
                b.Property(t => t.DaysOfMonth).HasMaxLength(100);
                b.Property(t => t.SkipDaysOfWeek).HasMaxLength(20);
                b.Property(t => t.SkipDates).HasMaxLength(2000);
                b.Property(t => t.SkipDaysOfMonth).HasMaxLength(100);
                b.HasOne(t => t.Project).WithMany().HasForeignKey(t => t.ProjectId).OnDelete(DeleteBehavior.Restrict);
                b.HasOne(t => t.CreatedBy).WithMany().HasForeignKey(t => t.CreatedById).OnDelete(DeleteBehavior.Restrict);
            });

            modelBuilder.Entity<TaskTemplateItem>(b =>
            {
                b.Property(i => i.Id).ValueGeneratedOnAdd();
                b.Property(i => i.Title).HasMaxLength(200).IsRequired();
                b.Property(i => i.Description).HasMaxLength(2000);
                b.Property(i => i.Priority).HasMaxLength(20);
                b.Property(i => i.EstimatedHours).HasColumnType("decimal(6,2)");
                b.HasOne(i => i.Template).WithMany(t => t.Items).HasForeignKey(i => i.TemplateId).OnDelete(DeleteBehavior.Cascade);
                b.HasOne(i => i.DefaultAssignee).WithMany().HasForeignKey(i => i.DefaultAssigneeId).OnDelete(DeleteBehavior.Restrict);
                b.HasOne(i => i.QaReviewer).WithMany().HasForeignKey(i => i.QaReviewerId).OnDelete(DeleteBehavior.Restrict);
            });

            modelBuilder.Entity<TaskTemplateItemChecklist>(b =>
            {
                b.Property(c => c.Id).ValueGeneratedOnAdd();
                b.Property(c => c.Text).HasMaxLength(500).IsRequired();
                b.HasOne(c => c.TemplateItem).WithMany(i => i.Checklists).HasForeignKey(c => c.TemplateItemId).OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<TaskTemplateItemTag>(b =>
            {
                b.Property(t => t.Id).ValueGeneratedOnAdd();
                b.Property(t => t.Tag).HasMaxLength(100).IsRequired();
                b.HasOne(t => t.TemplateItem).WithMany(i => i.Tags).HasForeignKey(t => t.TemplateItemId).OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<TaskTemplateItemDependency>(b =>
            {
                b.Property(d => d.Id).ValueGeneratedOnAdd();
                b.HasOne(d => d.TemplateItem).WithMany(i => i.Dependencies).HasForeignKey(d => d.TemplateItemId).OnDelete(DeleteBehavior.Cascade);
                b.HasOne(d => d.DependsOnItem).WithMany().HasForeignKey(d => d.DependsOnItemId).OnDelete(DeleteBehavior.Restrict);
            });

            modelBuilder.Entity<TaskTemplateItemAttachment>(b =>
            {
                b.Property(a => a.Id).ValueGeneratedOnAdd();
                b.Property(a => a.FileName).HasMaxLength(260).IsRequired();
                b.Property(a => a.StoredPath).HasMaxLength(500).IsRequired();
                b.Property(a => a.ContentType).HasMaxLength(100);
                b.HasOne(a => a.TemplateItem).WithMany(i => i.Attachments).HasForeignKey(a => a.TemplateItemId).OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<TaskTemplateItemReviewCriteria>(b =>
            {
                b.Property(r => r.Id).ValueGeneratedOnAdd();
                b.Property(r => r.Text).HasMaxLength(500).IsRequired();
                b.HasOne(r => r.TemplateItem).WithMany(i => i.ReviewCriteria).HasForeignKey(r => r.TemplateItemId).OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<TaskTemplateAssignee>(b =>
            {
                b.Property(a => a.Id).ValueGeneratedOnAdd();
                b.HasOne(a => a.Template).WithMany(t => t.Assignees).HasForeignKey(a => a.TemplateId).OnDelete(DeleteBehavior.Cascade);
                b.HasOne(a => a.User).WithMany().HasForeignKey(a => a.UserId).OnDelete(DeleteBehavior.Restrict);
                b.HasIndex(a => new { a.TemplateId, a.UserId }).IsUnique();
            });

            modelBuilder.Entity<TaskTemplateGeneration>(b =>
            {
                b.Property(g => g.Id).ValueGeneratedOnAdd();
                b.Property(g => g.PeriodKey).HasMaxLength(30).IsRequired();
                b.Property(g => g.Notes).HasMaxLength(500);
                b.HasOne(g => g.Template).WithMany(t => t.Generations).HasForeignKey(g => g.TemplateId).OnDelete(DeleteBehavior.Restrict);
                b.HasOne(g => g.GeneratedBy).WithMany().HasForeignKey(g => g.GeneratedById).OnDelete(DeleteBehavior.Restrict);
                b.HasIndex(g => new { g.TemplateId, g.PeriodKey }).IsUnique();
            });

            modelBuilder.Entity<TaskTemplateGeneratedTask>(b =>
            {
                b.Property(gt => gt.Id).ValueGeneratedOnAdd();
                b.HasOne(gt => gt.Generation).WithMany(g => g.GeneratedTasks).HasForeignKey(gt => gt.GenerationId).OnDelete(DeleteBehavior.Cascade);
                b.HasOne(gt => gt.Task).WithMany().HasForeignKey(gt => gt.TaskId).OnDelete(DeleteBehavior.Restrict);
                b.HasOne(gt => gt.TemplateItem).WithMany().HasForeignKey(gt => gt.TemplateItemId).OnDelete(DeleteBehavior.Restrict);
                b.HasOne(gt => gt.Assignee).WithMany().HasForeignKey(gt => gt.AssigneeId).OnDelete(DeleteBehavior.Restrict);
            });

            // TaskReviewIssue
            modelBuilder.Entity<TaskReviewIssue>(b =>
            {
                b.Property(r => r.Id).ValueGeneratedOnAdd();
                b.Property(r => r.Description).HasMaxLength(500).IsRequired();
                b.HasOne(r => r.Task).WithMany(t => t.ReviewIssues).HasForeignKey(r => r.TaskId).OnDelete(DeleteBehavior.Cascade);
                b.HasOne(r => r.CreatedBy).WithMany().HasForeignKey(r => r.CreatedById).OnDelete(DeleteBehavior.Restrict);
                b.HasOne(r => r.ResolvedBy).WithMany().HasForeignKey(r => r.ResolvedById).OnDelete(DeleteBehavior.Restrict);
            });

            // BlockChecklistItem (Phase 3: structured block reasons per task)
            modelBuilder.Entity<BlockChecklistItem>(b =>
            {
                b.Property(i => i.Id).ValueGeneratedOnAdd();
                b.Property(i => i.Category).HasMaxLength(100).IsRequired();
                b.Property(i => i.Description).HasMaxLength(500).IsRequired();
                b.Property(i => i.Comment).HasMaxLength(1000);
                b.Property(i => i.ExpectedResolution).HasMaxLength(500);
                b.Property(i => i.Status).HasMaxLength(20).IsRequired();
                b.HasOne(i => i.Task).WithMany(t => t.BlockChecklistItems).HasForeignKey(i => i.TaskId).OnDelete(DeleteBehavior.Cascade);
                b.HasOne(i => i.CreatedBy).WithMany().HasForeignKey(i => i.CreatedById).OnDelete(DeleteBehavior.Restrict);
                b.HasOne(i => i.ResolvedBy).WithMany().HasForeignKey(i => i.ResolvedById).OnDelete(DeleteBehavior.Restrict);
            });

            // ReviewChecklistItem (Phase 2: per-task QA review checklist)
            modelBuilder.Entity<ReviewChecklistItem>(b =>
            {
                b.Property(r => r.Id).ValueGeneratedOnAdd();
                b.Property(r => r.Title).HasMaxLength(500).IsRequired();
                b.Property(r => r.Description).HasMaxLength(2000);
                b.Property(r => r.Status).HasMaxLength(20).IsRequired();
                b.Property(r => r.ReviewerComment).HasMaxLength(2000);
                b.Property(r => r.DeveloperResolutionComment).HasMaxLength(2000);
                b.HasOne(r => r.Task).WithMany(t => t.ReviewChecklistItems).HasForeignKey(r => r.TaskId).OnDelete(DeleteBehavior.Cascade);
                b.HasOne(r => r.CreatedBy).WithMany().HasForeignKey(r => r.CreatedById).OnDelete(DeleteBehavior.Restrict);
                b.HasOne(r => r.ReviewedBy).WithMany().HasForeignKey(r => r.ReviewedById).OnDelete(DeleteBehavior.Restrict);
            });
        }
    }

    public class Role
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string? Code { get; set; }          // unique, admin-supplied (e.g. ADMIN, SRDEV)
        public int Level { get; set; } = 0;          // integer rank, 1 = highest
        public string? Description { get; set; }
        public bool IsAdmin { get; set; } = false;
        public bool IsActive { get; set; } = true;
    }

    public class User
    {
        public int Id { get; set; }
        public string UserName { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string FirstName { get; set; } = string.Empty;
        public string LastName { get; set; } = string.Empty;
        // Derived display name (FirstName + " " + LastName); kept for the many
        // denormalized consumers (activities, history, notifications, chat).
        public string FullName { get; set; } = string.Empty;
        public string PasswordHash { get; set; } = string.Empty;
        public int RoleId { get; set; }              // the user's single role (1:1)
        public Role? Role { get; set; }
        public string? AvatarUrl { get; set; }
        public string? ContactNo { get; set; }
        public string? ContactNoNormalized { get; set; }
        public bool IsActive { get; set; } = true;
        public bool IsDeleted { get; set; } = false;
        public DateTime CreatedAt { get; set; } = AppClock.Now;
        public DateTime? UpdatedAt { get; set; }
    }

    public class Project
    {
        public int Id { get; set; }
        public string? Code { get; set; }          // e.g. PRJ-01
        public int SeqNumber { get; set; }          // 1-based position used to build Code (PP)
        public string Name { get; set; } = string.Empty;
        public string? Description { get; set; }
        public string Status { get; set; } = "Active";
        public DateTime? StartDate { get; set; }
        public DateTime? EndDate { get; set; }
        public int CreatedById { get; set; }
        public User? CreatedBy { get; set; }
        public int OwnerId { get; set; }
        public User? Owner { get; set; }
        public DateTime CreatedAt { get; set; } = AppClock.Now;
        public DateTime? UpdatedAt { get; set; }
        public ICollection<ProjectMember> Members { get; set; } = new List<ProjectMember>();
        public ICollection<TaskEntity> Tasks { get; set; } = new List<TaskEntity>();
        public ICollection<ProjectAssignmentHistory> AssignmentHistory { get; set; } = new List<ProjectAssignmentHistory>();
        public ICollection<ProjectModule> Modules { get; set; } = new List<ProjectModule>();
    }

    public class ProjectMember
    {
        public int ProjectId { get; set; }
        public Project? Project { get; set; }
        public int UserId { get; set; }
        public User? User { get; set; }
        public string? RoleInProject { get; set; }
        public DateTime JoinedAt { get; set; } = AppClock.Now;
    }

    public class ProjectModule
    {
        public int ProjectId { get; set; }
        public Project? Project { get; set; }
        public string Name { get; set; } = string.Empty;
    }

    public class TaskEntity
    {
        public int Id { get; set; }
        public string? Code { get; set; }          // TSK-PP-TT for top-level, SUB-PP-TT-SS for subtasks
        public int SeqNumber { get; set; }          // 1-based position within its scope (TT for tasks, SS for subtasks)
        public string Title { get; set; } = string.Empty;
        public string? Description { get; set; }
        public string Status { get; set; } = "new";
        public string Priority { get; set; } = "Medium";
        public int ProjectId { get; set; }
        public Project? Project { get; set; }
        public int? AssignedToId { get; set; }
        public User? AssignedTo { get; set; }
        public int CreatedById { get; set; }
        public User? CreatedBy { get; set; }
        public decimal? EstimatedHours { get; set; }
        public decimal? ActualHours { get; set; }
        public int Progress { get; set; } = 0;
        public string? Module { get; set; }
        public DateTime CreatedAt { get; set; } = AppClock.Now;
        public DateTime? UpdatedAt { get; set; }
        public DateTime? StartedAt { get; set; }
        public int? StartedById { get; set; }
        public User? StartedBy { get; set; }
        public int? ParentTaskId { get; set; }
        public TaskEntity? ParentTask { get; set; }
        public bool RequiresQA { get; set; } = false;
        public int? QaAssigneeId { get; set; }
        public User? QaAssignee { get; set; }
        public bool HasIssues { get; set; } = false;
        public bool IsPaused  { get; set; } = false;
        public string? PauseReason { get; set; }
        public ICollection<TaskEntity> ChildTasks { get; set; } = new List<TaskEntity>();
        public ICollection<TaskTag> Tags { get; set; } = new List<TaskTag>();
        public ICollection<TaskComment> Comments { get; set; } = new List<TaskComment>();
        public ICollection<Attachment> Attachments { get; set; } = new List<Attachment>();
        public ICollection<TaskAssignmentHistory> AssignmentHistory { get; set; } = new List<TaskAssignmentHistory>();
        public ICollection<ChecklistItem> ChecklistItems { get; set; } = new List<ChecklistItem>();
        public ICollection<TaskBlockEntry> BlockEntries { get; set; } = new List<TaskBlockEntry>();
        public ICollection<TaskStatusHistory> StatusHistory { get; set; } = new List<TaskStatusHistory>();
        public ICollection<TaskConditionHistory> ConditionHistory { get; set; } = new List<TaskConditionHistory>();
        public ICollection<TaskIssueEntry> IssueEntries { get; set; } = new List<TaskIssueEntry>();
        public ICollection<TaskReviewIssue> ReviewIssues { get; set; } = new List<TaskReviewIssue>();
        public ICollection<ReviewChecklistItem> ReviewChecklistItems { get; set; } = new List<ReviewChecklistItem>();
        public ICollection<BlockChecklistItem> BlockChecklistItems { get; set; } = new List<BlockChecklistItem>();
        public int? SourceTemplateItemId { get; set; }  // set when task was generated from a template
    }

    public class TaskStatusHistory
    {
        public int Id { get; set; }
        public int TaskId { get; set; }
        public TaskEntity? Task { get; set; }
        public string FromStatus { get; set; } = string.Empty;
        public string ToStatus { get; set; } = string.Empty;
        public string? Action { get; set; }   // named transition action, e.g. "Submit for Review"
        public int ChangedById { get; set; }
        public User? ChangedBy { get; set; }
        public string? Reason { get; set; }
        // Hours the user reports for the status being entered (ToStatus).
        // Compulsory except when entering new / paused / blocked / issues.
        public decimal? ActualHours { get; set; }
        public DateTime ChangedAt { get; set; } = AppClock.Now;
    }

    public class TaskTag
    {
        public int TaskId { get; set; }
        public string Tag { get; set; } = string.Empty;
    }

    public class TaskComment
    {
        public int Id { get; set; }
        public int TaskId { get; set; }
        public int UserId { get; set; }
        public User? User { get; set; }
        public string Content { get; set; } = string.Empty;
        public DateTime CreatedAt { get; set; } = AppClock.Now;
    }

    public class Attachment
    {
        public int Id { get; set; }
        public int TaskId { get; set; }
        public string FileName { get; set; } = string.Empty;
        public string FilePath { get; set; } = string.Empty;
        public string FileType { get; set; } = string.Empty;
        public long FileSize { get; set; }
        public int UploadedById { get; set; }
        public User? UploadedBy { get; set; }
        public DateTime UploadedAt { get; set; } = AppClock.Now;
    }

    public class Activity
    {
        public int Id { get; set; }
        public int UserId { get; set; }
        public string UserName { get; set; } = string.Empty;
        public string Action { get; set; } = string.Empty;
        public string TargetType { get; set; } = string.Empty;
        public int TargetId { get; set; }
        public string TargetName { get; set; } = string.Empty;
        public DateTime Timestamp { get; set; } = AppClock.Now;
    }

    public class PageModule
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string Route { get; set; } = string.Empty;
        public string? Description { get; set; }
    }

    public class RolePagePermission
    {
        public int Id { get; set; }
        public int RoleId { get; set; }
        public Role? Role { get; set; }
        public int PageModuleId { get; set; }
        public PageModule? PageModule { get; set; }
        public int Permissions { get; set; }
    }

    public class UserPagePermission
    {
        public int Id { get; set; }
        public int UserId { get; set; }
        public User? User { get; set; }
        public int PageModuleId { get; set; }
        public PageModule? PageModule { get; set; }
        public int Permissions { get; set; }
    }

    public class ProjectAssignmentHistory
    {
        public int Id { get; set; }
        public int ProjectId { get; set; }
        public Project? Project { get; set; }
        public int PreviousOwnerId { get; set; }
        public User? PreviousOwner { get; set; }
        public int NewOwnerId { get; set; }
        public User? NewOwner { get; set; }
        public int ChangedById { get; set; }
        public User? ChangedBy { get; set; }
        public DateTime ChangedAt { get; set; } = AppClock.Now;
        public string ReasonTag { get; set; } = string.Empty;
    }

    public class TaskAssignmentHistory
    {
        public int Id { get; set; }
        public int TaskId { get; set; }
        public TaskEntity? Task { get; set; }
        public int? PreviousAssigneeId { get; set; }
        public User? PreviousAssignee { get; set; }
        public int? NewAssigneeId { get; set; }
        public User? NewAssignee { get; set; }
        public int ChangedById { get; set; }
        public User? ChangedBy { get; set; }
        public DateTime ChangedAt { get; set; } = AppClock.Now;
        public string ReasonTag { get; set; } = string.Empty;
    }

    public class ChecklistItem
    {
        public int Id { get; set; }
        public int TaskId { get; set; }
        public string Title { get; set; } = string.Empty;
        public bool IsCompleted { get; set; }
        public DateTime? CompletedAt { get; set; }
        public int? CompletedById { get; set; }
        public User? CompletedBy { get; set; }
        public int OrderIndex { get; set; }
        public DateTime CreatedAt { get; set; } = AppClock.Now;
    }

    public class TaskBlockEntry
    {
        public int Id { get; set; }
        public int TaskId { get; set; }
        public TaskEntity? Task { get; set; }
        public int BlockedById { get; set; }
        public User? BlockedBy { get; set; }
        public string BlockedByName { get; set; } = string.Empty;
        public string Reason { get; set; } = string.Empty;
        public bool IsActive { get; set; } = true;
        public DateTime BlockedAt { get; set; } = AppClock.Now;
        public DateTime? ResolvedAt { get; set; }
    }

    public class TaskConditionHistory
    {
        public int Id { get; set; }
        public int TaskId { get; set; }
        public TaskEntity? Task { get; set; }
        public string ConditionName { get; set; } = string.Empty; // "HasIssues" | "IsPaused"
        public bool NewValue { get; set; }
        public string? Notes { get; set; }
        public DateTime ChangedAt { get; set; } = AppClock.Now;
        public int ChangedById { get; set; }
        public User? ChangedBy { get; set; }
    }

    public class TaskIssueEntry
    {
        public int Id { get; set; }
        public int TaskId { get; set; }
        public TaskEntity? Task { get; set; }
        public string Description { get; set; } = string.Empty;
        public bool IsResolved { get; set; } = false;
        public DateTime CreatedAt { get; set; } = AppClock.Now;
        public int CreatedById { get; set; }
        public User? CreatedBy { get; set; }
        public DateTime? ResolvedAt { get; set; }
        public int? ResolvedById { get; set; }
        public User? ResolvedBy { get; set; }
    }

    public class ChatMessage
    {
        public int Id { get; set; }
        public string? Content { get; set; }
        public int SenderId { get; set; }
        public User Sender { get; set; } = null!;
        public DateTime SentAt { get; set; } = AppClock.Now;
        public string MessageType { get; set; } = "text";
        public bool IsDeleted { get; set; } = false;
        public int? ReplyToId { get; set; }
        public ChatMessage? ReplyTo { get; set; }
        public ChatAttachment? Attachment { get; set; }
        // null = global public channel
        public int? RoomId { get; set; }
        public ChatRoom? Room { get; set; }
    }

    public class ChatRoom
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        // "public" | "private" | "direct"
        public string RoomType { get; set; } = "public";
        public int CreatedById { get; set; }
        public User CreatedBy { get; set; } = null!;
        public DateTime CreatedAt { get; set; } = AppClock.Now;
        public ICollection<ChatRoomMember> Members { get; set; } = new List<ChatRoomMember>();
        public ICollection<ChatMessage> Messages { get; set; } = new List<ChatMessage>();
    }

    public class ChatRoomMember
    {
        public int RoomId { get; set; }
        public ChatRoom Room { get; set; } = null!;
        public int UserId { get; set; }
        public User User { get; set; } = null!;
        public DateTime JoinedAt { get; set; } = AppClock.Now;
    }

    public class ChatAttachment
    {
        public int Id { get; set; }
        public int MessageId { get; set; }
        public ChatMessage Message { get; set; } = null!;
        public string FileName { get; set; } = string.Empty;
        public string StoredFileName { get; set; } = string.Empty;
        public string FilePath { get; set; } = string.Empty;
        public string FileType { get; set; } = string.Empty;
        public long FileSize { get; set; }
        public string MimeType { get; set; } = string.Empty;
    }

    public class WorkDiary
    {
        public int Id { get; set; }
        public int UserId { get; set; }
        public User? User { get; set; }
        public DateTime Date { get; set; }
        public string Description { get; set; } = string.Empty;
        public string? Category { get; set; }
        public decimal? HoursSpent { get; set; }
        public int? ProjectId { get; set; }
        public Project? Project { get; set; }
        public int? TaskId { get; set; }
        public TaskEntity? Task { get; set; }
        public DateTime CreatedAt { get; set; } = AppClock.Now;
        public DateTime UpdatedAt { get; set; } = AppClock.Now;
    }

    public class RefreshToken
    {
        public int Id { get; set; }
        public int UserId { get; set; }
        public User? User { get; set; }
        public string Token { get; set; } = string.Empty;
        public DateTime ExpiresAt { get; set; }
        public DateTime CreatedAt { get; set; } = AppClock.Now;
        public bool IsRevoked { get; set; } = false;
        public DateTime? RevokedAt { get; set; }
    }

    public class EmailOtp
    {
        public int      Id        { get; set; }
        public string   Email     { get; set; } = string.Empty;
        public string   OtpHash   { get; set; } = string.Empty;
        public string   Purpose   { get; set; } = string.Empty; // "register" | "reset"
        public string?  Payload   { get; set; }                 // JSON for pending register data
        public DateTime ExpiresAt { get; set; }
        public bool     IsUsed    { get; set; } = false;
        public DateTime CreatedAt { get; set; } = AppClock.Now;
    }

    // ── Task Template module ─────────────────────────────────────────────────────

    public class TaskTemplate
    {
        public int       Id                  { get; set; }
        public string    Name                { get; set; } = string.Empty;
        public string?   Description         { get; set; }
        public int?      ProjectId           { get; set; }
        public Project?  Project             { get; set; }
        public string?   Module              { get; set; }
        public string    RecurrenceType      { get; set; } = "weekly"; // daily|weekly|monthly|custom
        public int?      DayOfWeek           { get; set; } // 0=Sun…6=Sat
        public int?      DayOfMonth          { get; set; } // 1–28
        public int?      CustomIntervalDays  { get; set; }
        public string?   TriggerTime         { get; set; } // "HH:mm" e.g. "09:00"
        public string?   DaysOfMonth         { get; set; } // CSV: "1,15,28" — multi-day monthly, overrides DayOfMonth
        public string?   SkipDaysOfWeek      { get; set; } // CSV: "0,6" — suppress on these DayOfWeek values
        public string?   SkipDates           { get; set; } // CSV: "2026-12-25,2026-01-01" — blackout dates
        public string?   SkipDaysOfMonth     { get; set; } // CSV: "1,15" — suppress on these days of the month
        public DateTime  StartDate           { get; set; }
        public DateTime? EndDate             { get; set; }
        public bool      IsActive            { get; set; } = true;
        public int       CreatedById         { get; set; }
        public User?     CreatedBy           { get; set; }
        public DateTime  CreatedAt           { get; set; } = AppClock.Now;
        public DateTime  UpdatedAt           { get; set; } = AppClock.Now;
        public ICollection<TaskTemplateItem>       Items       { get; set; } = new List<TaskTemplateItem>();
        public ICollection<TaskTemplateAssignee>   Assignees   { get; set; } = new List<TaskTemplateAssignee>();
        public ICollection<TaskTemplateGeneration> Generations { get; set; } = new List<TaskTemplateGeneration>();
    }

    public class TaskTemplateItem
    {
        public int      Id                { get; set; }
        public int      TemplateId        { get; set; }
        public TaskTemplate? Template     { get; set; }
        public int      Position          { get; set; }
        public string   Title             { get; set; } = string.Empty;
        public string?  Description       { get; set; }
        public decimal  EstimatedHours    { get; set; }
        public string   Priority          { get; set; } = "medium";
        public int?     DefaultAssigneeId { get; set; }
        public User?    DefaultAssignee   { get; set; }
        public int?     QaReviewerId      { get; set; }
        public User?    QaReviewer        { get; set; }
        public ICollection<TaskTemplateItemChecklist>      Checklists      { get; set; } = new List<TaskTemplateItemChecklist>();
        public ICollection<TaskTemplateItemTag>            Tags            { get; set; } = new List<TaskTemplateItemTag>();
        public ICollection<TaskTemplateItemDependency>     Dependencies    { get; set; } = new List<TaskTemplateItemDependency>();
        public ICollection<TaskTemplateItemAttachment>     Attachments     { get; set; } = new List<TaskTemplateItemAttachment>();
        public ICollection<TaskTemplateItemReviewCriteria> ReviewCriteria  { get; set; } = new List<TaskTemplateItemReviewCriteria>();
    }

    public class TaskTemplateItemChecklist
    {
        public int    Id             { get; set; }
        public int    TemplateItemId { get; set; }
        public TaskTemplateItem? TemplateItem { get; set; }
        public string Text           { get; set; } = string.Empty;
        public int    Position       { get; set; }
    }

    public class TaskTemplateItemTag
    {
        public int    Id             { get; set; }
        public int    TemplateItemId { get; set; }
        public TaskTemplateItem? TemplateItem { get; set; }
        public string Tag            { get; set; } = string.Empty;
    }

    public class TaskTemplateItemDependency
    {
        public int    Id               { get; set; }
        public int    TemplateItemId   { get; set; }  // the dependent item
        public TaskTemplateItem? TemplateItem  { get; set; }
        public int    DependsOnItemId  { get; set; }  // prerequisite item
        public TaskTemplateItem? DependsOnItem { get; set; }
    }

    public class TaskTemplateItemAttachment
    {
        public int    Id             { get; set; }
        public int    TemplateItemId { get; set; }
        public TaskTemplateItem? TemplateItem { get; set; }
        public string FileName       { get; set; } = string.Empty;
        public string StoredPath     { get; set; } = string.Empty;
        public string ContentType    { get; set; } = string.Empty;
    }

    public class TaskTemplateItemReviewCriteria
    {
        public int    Id             { get; set; }
        public int    TemplateItemId { get; set; }
        public TaskTemplateItem? TemplateItem { get; set; }
        public string Text           { get; set; } = string.Empty;
        public int    Position       { get; set; }
    }

    public class TaskTemplateAssignee
    {
        public int    Id         { get; set; }
        public int    TemplateId { get; set; }
        public TaskTemplate? Template { get; set; }
        public int    UserId     { get; set; }
        public User?  User       { get; set; }
    }

    public class TaskTemplateGeneration
    {
        public int       Id              { get; set; }
        public int       TemplateId      { get; set; }
        public TaskTemplate? Template    { get; set; }
        public string    PeriodKey       { get; set; } = string.Empty;
        public DateTime  GeneratedAt     { get; set; } = AppClock.Now;
        public int?      GeneratedById   { get; set; }
        public User?     GeneratedBy     { get; set; }
        public int       TaskCount       { get; set; }
        public string?   Notes           { get; set; }
        public ICollection<TaskTemplateGeneratedTask> GeneratedTasks { get; set; } = new List<TaskTemplateGeneratedTask>();
    }

    public class TaskTemplateGeneratedTask
    {
        public int    Id             { get; set; }
        public int    GenerationId   { get; set; }
        public TaskTemplateGeneration? Generation { get; set; }
        public int    TaskId         { get; set; }
        public TaskEntity? Task      { get; set; }
        public int    TemplateItemId { get; set; }
        public TaskTemplateItem? TemplateItem { get; set; }
        public int    AssigneeId     { get; set; }
        public User?  Assignee       { get; set; }
    }

    public class TaskReviewIssue
    {
        public int       Id            { get; set; }
        public int       TaskId        { get; set; }
        public TaskEntity? Task        { get; set; }
        public string    Description   { get; set; } = string.Empty;
        public bool      IsResolved    { get; set; } = false;
        public DateTime  CreatedAt     { get; set; } = AppClock.Now;
        public int       CreatedById   { get; set; }
        public User?     CreatedBy     { get; set; }
        public DateTime? ResolvedAt    { get; set; }
        public int?      ResolvedById  { get; set; }
        public User?     ResolvedBy    { get; set; }
    }

    // Phase 3: structured block reason items (replace plain-text block reason).
    public class BlockChecklistItem
    {
        public int       Id                  { get; set; }
        public int       TaskId              { get; set; }
        public TaskEntity? Task              { get; set; }
        public string    Category            { get; set; } = string.Empty;
        public string    Description         { get; set; } = string.Empty;
        public string?   Comment             { get; set; }
        public string?   ExpectedResolution  { get; set; }
        // "active" | "resolved" | "removed"
        public string    Status              { get; set; } = "active";
        public DateTime? ResolvedAt          { get; set; }
        public int?      ResolvedById        { get; set; }
        public User?     ResolvedBy          { get; set; }
        public int       CreatedById         { get; set; }
        public User?     CreatedBy           { get; set; }
        public DateTime  CreatedAt           { get; set; } = AppClock.Now;
        public DateTime? UpdatedAt           { get; set; }
    }

    // Phase 2: per-task QA review checklist item with persistent result state.
    public class ReviewChecklistItem
    {
        public int       Id                         { get; set; }
        public int       TaskId                     { get; set; }
        public TaskEntity? Task                     { get; set; }
        public string    Title                      { get; set; } = string.Empty;
        public string?   Description                { get; set; }
        public int       Sequence                   { get; set; }
        public bool      IsRequired                 { get; set; } = true;
        // "pending" | "passed" | "failed" | "na"
        public string    Status                     { get; set; } = "pending";
        public string?   ReviewerComment            { get; set; }
        public DateTime? ReviewedAt                 { get; set; }
        public int?      ReviewedById               { get; set; }
        public User?     ReviewedBy                 { get; set; }
        public string?   DeveloperResolutionComment { get; set; }
        public DateTime? DeveloperResolutionAt      { get; set; }
        public int       CreatedById                { get; set; }
        public User?     CreatedBy                  { get; set; }
        public DateTime  CreatedAt                  { get; set; } = AppClock.Now;
        public DateTime? UpdatedAt                  { get; set; }
    }
}
