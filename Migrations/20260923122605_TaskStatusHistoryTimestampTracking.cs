using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TaskManagement.Migrations
{
    public partial class TaskStatusHistoryTimestampTracking : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ChangedAt",
                table: "TaskStatusHistories");

            migrationBuilder.AddColumn<DateTime>(
                name: "EndTimestamp",
                table: "TaskStatusHistories",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "SpentHours",
                table: "TaskStatusHistories",
                type: "decimal(18,2)",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "StartTimestamp",
                table: "TaskStatusHistories",
                type: "datetime2",
                nullable: false,
                defaultValueSql: "GETUTCDATE()");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "EndTimestamp",
                table: "TaskStatusHistories");

            migrationBuilder.DropColumn(
                name: "SpentHours",
                table: "TaskStatusHistories");

            migrationBuilder.DropColumn(
                name: "StartTimestamp",
                table: "TaskStatusHistories");

            migrationBuilder.AddColumn<DateTime>(
                name: "ChangedAt",
                table: "TaskStatusHistories",
                type: "datetime2",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));
        }
    }
}
