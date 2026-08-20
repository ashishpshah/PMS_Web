using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Infrastructure;
using TaskManagement.Data;

#nullable disable

namespace TaskManagement.Migrations
{
    [DbContext(typeof(PMSDbContext))]
    [Migration("20260714120000_AddBlockChecklist")]
    public partial class AddBlockChecklist : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "BlockChecklistItems",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    TaskId = table.Column<int>(type: "int", nullable: false),
                    Category = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    Comment = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    ExpectedResolution = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    Status = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false, defaultValue: "active"),
                    ResolvedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ResolvedById = table.Column<int>(type: "int", nullable: true),
                    CreatedById = table.Column<int>(type: "int", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BlockChecklistItems", x => x.Id);
                    table.ForeignKey(
                        name: "FK_BlockChecklistItems_Tasks_TaskId",
                        column: x => x.TaskId,
                        principalTable: "Tasks",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_BlockChecklistItems_Users_CreatedById",
                        column: x => x.CreatedById,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_BlockChecklistItems_Users_ResolvedById",
                        column: x => x.ResolvedById,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_BlockChecklistItems_CreatedById",
                table: "BlockChecklistItems",
                column: "CreatedById");

            migrationBuilder.CreateIndex(
                name: "IX_BlockChecklistItems_ResolvedById",
                table: "BlockChecklistItems",
                column: "ResolvedById");

            migrationBuilder.CreateIndex(
                name: "IX_BlockChecklistItems_TaskId",
                table: "BlockChecklistItems",
                column: "TaskId");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "BlockChecklistItems");
        }
    }
}
