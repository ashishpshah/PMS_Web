using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Infrastructure;
using TaskManagement.Data;

#nullable disable

namespace TaskManagement.Migrations
{
    [DbContext(typeof(PMSDbContext))]
    [Migration("20260714100000_WorkflowStatusOverhaul")]
    public partial class WorkflowStatusOverhaul : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Add Action audit column to TaskStatusHistories
            migrationBuilder.AddColumn<string>(
                name: "Action",
                table: "TaskStatusHistories",
                type: "nvarchar(50)",
                maxLength: 50,
                nullable: true);

            // Rename in-review → under-review in Tasks
            migrationBuilder.Sql("UPDATE Tasks SET Status = 'under-review' WHERE Status = 'in-review';");

            // Rename in-review → under-review in history tables
            migrationBuilder.Sql("UPDATE TaskStatusHistories SET FromStatus = 'under-review' WHERE FromStatus = 'in-review';");
            migrationBuilder.Sql("UPDATE TaskStatusHistories SET ToStatus   = 'under-review' WHERE ToStatus   = 'in-review';");

            // Promote IsPaused flag → paused status (tasks currently in-progress with IsPaused=1)
            migrationBuilder.Sql("UPDATE Tasks SET Status = 'paused' WHERE IsPaused = 1 AND Status = 'in-progress';");

            // Promote HasIssues flag → issues status (tasks currently in-progress with HasIssues=1)
            migrationBuilder.Sql("UPDATE Tasks SET Status = 'issues' WHERE HasIssues = 1 AND Status = 'in-progress';");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Revert issues → in-progress and restore HasIssues flag
            migrationBuilder.Sql("UPDATE Tasks SET Status = 'in-progress', HasIssues = 1 WHERE Status = 'issues';");

            // Revert paused → in-progress and restore IsPaused flag
            migrationBuilder.Sql("UPDATE Tasks SET Status = 'in-progress', IsPaused = 1 WHERE Status = 'paused';");

            // Revert under-review → in-review
            migrationBuilder.Sql("UPDATE Tasks SET Status = 'in-review' WHERE Status = 'under-review';");
            migrationBuilder.Sql("UPDATE TaskStatusHistories SET FromStatus = 'in-review' WHERE FromStatus = 'under-review';");
            migrationBuilder.Sql("UPDATE TaskStatusHistories SET ToStatus   = 'in-review' WHERE ToStatus   = 'under-review';");

            migrationBuilder.DropColumn(
                name: "Action",
                table: "TaskStatusHistories");
        }
    }
}
