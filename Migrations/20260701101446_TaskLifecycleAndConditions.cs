using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TaskManagement.Migrations
{
    public partial class TaskLifecycleAndConditions : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "HasIssues",
                table: "Tasks",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "IsPaused",
                table: "Tasks",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateTable(
                name: "TaskConditionHistories",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    TaskId = table.Column<int>(type: "int", nullable: false),
                    ConditionName = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    NewValue = table.Column<bool>(type: "bit", nullable: false),
                    ChangedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    ChangedById = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TaskConditionHistories", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TaskConditionHistories_Tasks_TaskId",
                        column: x => x.TaskId,
                        principalTable: "Tasks",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_TaskConditionHistories_Users_ChangedById",
                        column: x => x.ChangedById,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_TaskConditionHistories_ChangedById",
                table: "TaskConditionHistories",
                column: "ChangedById");

            migrationBuilder.CreateIndex(
                name: "IX_TaskConditionHistories_TaskId",
                table: "TaskConditionHistories",
                column: "TaskId");

            // Data migration: convert legacy statuses to the new lifecycle + conditions model.
            migrationBuilder.Sql("UPDATE Tasks SET Status = 'in-review'    WHERE Status = 'under-review'");
            migrationBuilder.Sql("UPDATE Tasks SET Status = 'in-progress', IsPaused  = 1 WHERE Status = 'paused'");
            migrationBuilder.Sql("UPDATE Tasks SET Status = 'in-progress', HasIssues = 1 WHERE Status = 'issues'");
            migrationBuilder.Sql("UPDATE TaskStatusHistories SET FromStatus = 'in-review' WHERE FromStatus = 'under-review'");
            migrationBuilder.Sql("UPDATE TaskStatusHistories SET ToStatus   = 'in-review' WHERE ToStatus   = 'under-review'");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "TaskConditionHistories");

            migrationBuilder.DropColumn(
                name: "HasIssues",
                table: "Tasks");

            migrationBuilder.DropColumn(
                name: "IsPaused",
                table: "Tasks");
        }
    }
}
