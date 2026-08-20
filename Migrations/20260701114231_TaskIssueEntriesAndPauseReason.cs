using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TaskManagement.Migrations
{
    public partial class TaskIssueEntriesAndPauseReason : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "PauseReason",
                table: "Tasks",
                type: "nvarchar(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Notes",
                table: "TaskConditionHistories",
                type: "nvarchar(1000)",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "TaskIssueEntries",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    TaskId = table.Column<int>(type: "int", nullable: false),
                    Description = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    IsResolved = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedById = table.Column<int>(type: "int", nullable: false),
                    ResolvedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ResolvedById = table.Column<int>(type: "int", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TaskIssueEntries", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TaskIssueEntries_Tasks_TaskId",
                        column: x => x.TaskId,
                        principalTable: "Tasks",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_TaskIssueEntries_Users_CreatedById",
                        column: x => x.CreatedById,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_TaskIssueEntries_Users_ResolvedById",
                        column: x => x.ResolvedById,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_TaskIssueEntries_CreatedById",
                table: "TaskIssueEntries",
                column: "CreatedById");

            migrationBuilder.CreateIndex(
                name: "IX_TaskIssueEntries_ResolvedById",
                table: "TaskIssueEntries",
                column: "ResolvedById");

            migrationBuilder.CreateIndex(
                name: "IX_TaskIssueEntries_TaskId",
                table: "TaskIssueEntries",
                column: "TaskId");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "TaskIssueEntries");

            migrationBuilder.DropColumn(
                name: "PauseReason",
                table: "Tasks");

            migrationBuilder.DropColumn(
                name: "Notes",
                table: "TaskConditionHistories");
        }
    }
}
