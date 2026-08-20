using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Infrastructure;
using TaskManagement.Data;

#nullable disable

namespace TaskManagement.Migrations
{
    [DbContext(typeof(PMSDbContext))]
    [Migration("20260702120000_AddTaskTemplateModule")]
    public partial class AddTaskTemplateModule : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // TaskTemplates
            migrationBuilder.CreateTable(
                name: "TaskTemplates",
                columns: table => new
                {
                    Id                 = table.Column<int>(nullable: false).Annotation("SqlServer:Identity", "1, 1"),
                    Name               = table.Column<string>(maxLength: 200, nullable: false),
                    Description        = table.Column<string>(maxLength: 1000, nullable: true),
                    ProjectId          = table.Column<int>(nullable: true),
                    Module             = table.Column<string>(maxLength: 200, nullable: true),
                    RecurrenceType     = table.Column<string>(maxLength: 20, nullable: false),
                    DayOfWeek          = table.Column<int>(nullable: true),
                    DayOfMonth         = table.Column<int>(nullable: true),
                    CustomIntervalDays = table.Column<int>(nullable: true),
                    StartDate          = table.Column<DateTime>(nullable: false),
                    EndDate            = table.Column<DateTime>(nullable: true),
                    IsActive           = table.Column<bool>(nullable: false, defaultValue: true),
                    CreatedById        = table.Column<int>(nullable: false),
                    CreatedAt          = table.Column<DateTime>(nullable: false),
                    UpdatedAt          = table.Column<DateTime>(nullable: false),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TaskTemplates", x => x.Id);
                    table.ForeignKey("FK_TaskTemplates_Projects_ProjectId", x => x.ProjectId, "Projects", "Id", onDelete: ReferentialAction.Restrict);
                    table.ForeignKey("FK_TaskTemplates_Users_CreatedById", x => x.CreatedById, "Users", "Id", onDelete: ReferentialAction.Restrict);
                });

            // TaskTemplateItems
            migrationBuilder.CreateTable(
                name: "TaskTemplateItems",
                columns: table => new
                {
                    Id                = table.Column<int>(nullable: false).Annotation("SqlServer:Identity", "1, 1"),
                    TemplateId        = table.Column<int>(nullable: false),
                    Position          = table.Column<int>(nullable: false),
                    Title             = table.Column<string>(maxLength: 200, nullable: false),
                    Description       = table.Column<string>(maxLength: 2000, nullable: true),
                    EstimatedHours    = table.Column<decimal>(type: "decimal(6,2)", nullable: false),
                    Priority          = table.Column<string>(maxLength: 20, nullable: false),
                    DefaultAssigneeId = table.Column<int>(nullable: true),
                    QaReviewerId      = table.Column<int>(nullable: true),
                    DueDateOffsetDays = table.Column<int>(nullable: false),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TaskTemplateItems", x => x.Id);
                    table.ForeignKey("FK_TaskTemplateItems_TaskTemplates_TemplateId", x => x.TemplateId, "TaskTemplates", "Id", onDelete: ReferentialAction.Cascade);
                    table.ForeignKey("FK_TaskTemplateItems_Users_DefaultAssigneeId", x => x.DefaultAssigneeId, "Users", "Id", onDelete: ReferentialAction.Restrict);
                    table.ForeignKey("FK_TaskTemplateItems_Users_QaReviewerId", x => x.QaReviewerId, "Users", "Id", onDelete: ReferentialAction.Restrict);
                });

            // TaskTemplateItemChecklists
            migrationBuilder.CreateTable(
                name: "TaskTemplateItemChecklists",
                columns: table => new
                {
                    Id             = table.Column<int>(nullable: false).Annotation("SqlServer:Identity", "1, 1"),
                    TemplateItemId = table.Column<int>(nullable: false),
                    Text           = table.Column<string>(maxLength: 500, nullable: false),
                    Position       = table.Column<int>(nullable: false),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TaskTemplateItemChecklists", x => x.Id);
                    table.ForeignKey("FK_TaskTemplateItemChecklists_TaskTemplateItems_TemplateItemId", x => x.TemplateItemId, "TaskTemplateItems", "Id", onDelete: ReferentialAction.Cascade);
                });

            // TaskTemplateItemTags
            migrationBuilder.CreateTable(
                name: "TaskTemplateItemTags",
                columns: table => new
                {
                    Id             = table.Column<int>(nullable: false).Annotation("SqlServer:Identity", "1, 1"),
                    TemplateItemId = table.Column<int>(nullable: false),
                    Tag            = table.Column<string>(maxLength: 100, nullable: false),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TaskTemplateItemTags", x => x.Id);
                    table.ForeignKey("FK_TaskTemplateItemTags_TaskTemplateItems_TemplateItemId", x => x.TemplateItemId, "TaskTemplateItems", "Id", onDelete: ReferentialAction.Cascade);
                });

            // TaskTemplateItemDependencies
            migrationBuilder.CreateTable(
                name: "TaskTemplateItemDependencies",
                columns: table => new
                {
                    Id              = table.Column<int>(nullable: false).Annotation("SqlServer:Identity", "1, 1"),
                    TemplateItemId  = table.Column<int>(nullable: false),
                    DependsOnItemId = table.Column<int>(nullable: false),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TaskTemplateItemDependencies", x => x.Id);
                    table.ForeignKey("FK_TaskTemplateItemDependencies_TaskTemplateItems_TemplateItemId",  x => x.TemplateItemId,  "TaskTemplateItems", "Id", onDelete: ReferentialAction.Cascade);
                    table.ForeignKey("FK_TaskTemplateItemDependencies_TaskTemplateItems_DependsOnItemId", x => x.DependsOnItemId, "TaskTemplateItems", "Id", onDelete: ReferentialAction.Restrict);
                });

            // TaskTemplateItemAttachments
            migrationBuilder.CreateTable(
                name: "TaskTemplateItemAttachments",
                columns: table => new
                {
                    Id             = table.Column<int>(nullable: false).Annotation("SqlServer:Identity", "1, 1"),
                    TemplateItemId = table.Column<int>(nullable: false),
                    FileName       = table.Column<string>(maxLength: 260, nullable: false),
                    StoredPath     = table.Column<string>(maxLength: 500, nullable: false),
                    ContentType    = table.Column<string>(maxLength: 100, nullable: false),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TaskTemplateItemAttachments", x => x.Id);
                    table.ForeignKey("FK_TaskTemplateItemAttachments_TaskTemplateItems_TemplateItemId", x => x.TemplateItemId, "TaskTemplateItems", "Id", onDelete: ReferentialAction.Cascade);
                });

            // TaskTemplateItemReviewCriteria
            migrationBuilder.CreateTable(
                name: "TaskTemplateItemReviewCriteria",
                columns: table => new
                {
                    Id             = table.Column<int>(nullable: false).Annotation("SqlServer:Identity", "1, 1"),
                    TemplateItemId = table.Column<int>(nullable: false),
                    Text           = table.Column<string>(maxLength: 500, nullable: false),
                    Position       = table.Column<int>(nullable: false),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TaskTemplateItemReviewCriteria", x => x.Id);
                    table.ForeignKey("FK_TaskTemplateItemReviewCriteria_TaskTemplateItems_TemplateItemId", x => x.TemplateItemId, "TaskTemplateItems", "Id", onDelete: ReferentialAction.Cascade);
                });

            // TaskTemplateAssignees
            migrationBuilder.CreateTable(
                name: "TaskTemplateAssignees",
                columns: table => new
                {
                    Id         = table.Column<int>(nullable: false).Annotation("SqlServer:Identity", "1, 1"),
                    TemplateId = table.Column<int>(nullable: false),
                    UserId     = table.Column<int>(nullable: false),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TaskTemplateAssignees", x => x.Id);
                    table.ForeignKey("FK_TaskTemplateAssignees_TaskTemplates_TemplateId", x => x.TemplateId, "TaskTemplates", "Id", onDelete: ReferentialAction.Cascade);
                    table.ForeignKey("FK_TaskTemplateAssignees_Users_UserId", x => x.UserId, "Users", "Id", onDelete: ReferentialAction.Restrict);
                });
            migrationBuilder.CreateIndex("IX_TaskTemplateAssignees_TemplateId_UserId", "TaskTemplateAssignees", new[] { "TemplateId", "UserId" }, unique: true);

            // TaskTemplateGenerations
            migrationBuilder.CreateTable(
                name: "TaskTemplateGenerations",
                columns: table => new
                {
                    Id            = table.Column<int>(nullable: false).Annotation("SqlServer:Identity", "1, 1"),
                    TemplateId    = table.Column<int>(nullable: false),
                    PeriodKey     = table.Column<string>(maxLength: 30, nullable: false),
                    GeneratedAt   = table.Column<DateTime>(nullable: false),
                    GeneratedById = table.Column<int>(nullable: true),
                    TaskCount     = table.Column<int>(nullable: false),
                    Notes         = table.Column<string>(maxLength: 500, nullable: true),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TaskTemplateGenerations", x => x.Id);
                    table.ForeignKey("FK_TaskTemplateGenerations_TaskTemplates_TemplateId", x => x.TemplateId, "TaskTemplates", "Id", onDelete: ReferentialAction.Restrict);
                    table.ForeignKey("FK_TaskTemplateGenerations_Users_GeneratedById", x => x.GeneratedById, "Users", "Id", onDelete: ReferentialAction.Restrict);
                });
            migrationBuilder.CreateIndex("IX_TaskTemplateGenerations_TemplateId_PeriodKey", "TaskTemplateGenerations", new[] { "TemplateId", "PeriodKey" }, unique: true);

            // TaskTemplateGeneratedTasks
            migrationBuilder.CreateTable(
                name: "TaskTemplateGeneratedTasks",
                columns: table => new
                {
                    Id             = table.Column<int>(nullable: false).Annotation("SqlServer:Identity", "1, 1"),
                    GenerationId   = table.Column<int>(nullable: false),
                    TaskId         = table.Column<int>(nullable: false),
                    TemplateItemId = table.Column<int>(nullable: false),
                    AssigneeId     = table.Column<int>(nullable: false),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TaskTemplateGeneratedTasks", x => x.Id);
                    table.ForeignKey("FK_TaskTemplateGeneratedTasks_TaskTemplateGenerations_GenerationId", x => x.GenerationId, "TaskTemplateGenerations", "Id", onDelete: ReferentialAction.Cascade);
                    table.ForeignKey("FK_TaskTemplateGeneratedTasks_Tasks_TaskId", x => x.TaskId, "Tasks", "Id", onDelete: ReferentialAction.Restrict);
                    table.ForeignKey("FK_TaskTemplateGeneratedTasks_TaskTemplateItems_TemplateItemId", x => x.TemplateItemId, "TaskTemplateItems", "Id", onDelete: ReferentialAction.Restrict);
                    table.ForeignKey("FK_TaskTemplateGeneratedTasks_Users_AssigneeId", x => x.AssigneeId, "Users", "Id", onDelete: ReferentialAction.Restrict);
                });

            // TaskReviewIssues
            migrationBuilder.CreateTable(
                name: "TaskReviewIssues",
                columns: table => new
                {
                    Id           = table.Column<int>(nullable: false).Annotation("SqlServer:Identity", "1, 1"),
                    TaskId       = table.Column<int>(nullable: false),
                    Description  = table.Column<string>(maxLength: 500, nullable: false),
                    IsResolved   = table.Column<bool>(nullable: false, defaultValue: false),
                    CreatedAt    = table.Column<DateTime>(nullable: false),
                    CreatedById  = table.Column<int>(nullable: false),
                    ResolvedAt   = table.Column<DateTime>(nullable: true),
                    ResolvedById = table.Column<int>(nullable: true),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TaskReviewIssues", x => x.Id);
                    table.ForeignKey("FK_TaskReviewIssues_Tasks_TaskId", x => x.TaskId, "Tasks", "Id", onDelete: ReferentialAction.Cascade);
                    table.ForeignKey("FK_TaskReviewIssues_Users_CreatedById", x => x.CreatedById, "Users", "Id", onDelete: ReferentialAction.Restrict);
                    table.ForeignKey("FK_TaskReviewIssues_Users_ResolvedById", x => x.ResolvedById, "Users", "Id", onDelete: ReferentialAction.Restrict);
                });

            // SourceTemplateItemId on Tasks
            migrationBuilder.AddColumn<int>(
                name: "SourceTemplateItemId",
                table: "Tasks",
                nullable: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable("TaskTemplateGeneratedTasks");
            migrationBuilder.DropTable("TaskTemplateGenerations");
            migrationBuilder.DropTable("TaskTemplateAssignees");
            migrationBuilder.DropTable("TaskTemplateItemDependencies");
            migrationBuilder.DropTable("TaskTemplateItemAttachments");
            migrationBuilder.DropTable("TaskTemplateItemReviewCriteria");
            migrationBuilder.DropTable("TaskTemplateItemChecklists");
            migrationBuilder.DropTable("TaskTemplateItemTags");
            migrationBuilder.DropTable("TaskTemplateItems");
            migrationBuilder.DropTable("TaskTemplates");
            migrationBuilder.DropTable("TaskReviewIssues");
            migrationBuilder.DropColumn("SourceTemplateItemId", "Tasks");
        }
    }
}
