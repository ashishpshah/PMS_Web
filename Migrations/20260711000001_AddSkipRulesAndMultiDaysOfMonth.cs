using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Infrastructure;
using TaskManagement.Data;

#nullable disable

namespace TaskManagement.Migrations
{
    [DbContext(typeof(PMSDbContext))]
    [Migration("20260711000001_AddSkipRulesAndMultiDaysOfMonth")]
    public partial class AddSkipRulesAndMultiDaysOfMonth : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "DaysOfMonth",
                table: "TaskTemplates",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SkipDaysOfWeek",
                table: "TaskTemplates",
                type: "nvarchar(20)",
                maxLength: 20,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SkipDates",
                table: "TaskTemplates",
                type: "nvarchar(2000)",
                maxLength: 2000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SkipDaysOfMonth",
                table: "TaskTemplates",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "DaysOfMonth",    table: "TaskTemplates");
            migrationBuilder.DropColumn(name: "SkipDaysOfWeek", table: "TaskTemplates");
            migrationBuilder.DropColumn(name: "SkipDates",      table: "TaskTemplates");
            migrationBuilder.DropColumn(name: "SkipDaysOfMonth", table: "TaskTemplates");
        }
    }
}
