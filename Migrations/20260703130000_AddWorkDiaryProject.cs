using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Infrastructure;
using TaskManagement.Data;

#nullable disable

namespace TaskManagement.Migrations
{
    [DbContext(typeof(PMSDbContext))]
    [Migration("20260703130000_AddWorkDiaryProject")]
    public partial class AddWorkDiaryProject : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "ProjectId",
                table: "WorkDiaries",
                type: "int",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_WorkDiaries_ProjectId",
                table: "WorkDiaries",
                column: "ProjectId");

            migrationBuilder.AddForeignKey(
                name: "FK_WorkDiaries_Projects_ProjectId",
                table: "WorkDiaries",
                column: "ProjectId",
                principalTable: "Projects",
                principalColumn: "Id",
                onDelete: ReferentialAction.NoAction);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_WorkDiaries_Projects_ProjectId",
                table: "WorkDiaries");

            migrationBuilder.DropIndex(
                name: "IX_WorkDiaries_ProjectId",
                table: "WorkDiaries");

            migrationBuilder.DropColumn(
                name: "ProjectId",
                table: "WorkDiaries");
        }
    }
}
