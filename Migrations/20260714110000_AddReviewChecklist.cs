using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Infrastructure;
using TaskManagement.Data;

#nullable disable

namespace TaskManagement.Migrations
{
    [DbContext(typeof(PMSDbContext))]
    [Migration("20260714110000_AddReviewChecklist")]
    public partial class AddReviewChecklist : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ReviewChecklistItems",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    TaskId = table.Column<int>(type: "int", nullable: false),
                    Title = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    Sequence = table.Column<int>(type: "int", nullable: false),
                    IsRequired = table.Column<bool>(type: "bit", nullable: false, defaultValue: true),
                    Status = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false, defaultValue: "pending"),
                    ReviewerComment = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    ReviewedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ReviewedById = table.Column<int>(type: "int", nullable: true),
                    DeveloperResolutionComment = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    DeveloperResolutionAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    CreatedById = table.Column<int>(type: "int", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ReviewChecklistItems", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ReviewChecklistItems_Tasks_TaskId",
                        column: x => x.TaskId,
                        principalTable: "Tasks",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ReviewChecklistItems_Users_CreatedById",
                        column: x => x.CreatedById,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ReviewChecklistItems_Users_ReviewedById",
                        column: x => x.ReviewedById,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ReviewChecklistItems_CreatedById",
                table: "ReviewChecklistItems",
                column: "CreatedById");

            migrationBuilder.CreateIndex(
                name: "IX_ReviewChecklistItems_ReviewedById",
                table: "ReviewChecklistItems",
                column: "ReviewedById");

            migrationBuilder.CreateIndex(
                name: "IX_ReviewChecklistItems_TaskId",
                table: "ReviewChecklistItems",
                column: "TaskId");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "ReviewChecklistItems");
        }
    }
}
