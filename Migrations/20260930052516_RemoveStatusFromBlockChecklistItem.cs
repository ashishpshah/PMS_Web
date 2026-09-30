using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TaskManagement.Migrations
{
    public partial class RemoveStatusFromBlockChecklistItem : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_BlockChecklistItems_Users_ResolvedById",
                table: "BlockChecklistItems");

            migrationBuilder.DropColumn(
                name: "ResolvedAt",
                table: "BlockChecklistItems");

            migrationBuilder.DropColumn(
                name: "ResolvedById",
                table: "BlockChecklistItems");

            migrationBuilder.DropColumn(
                name: "Status",
                table: "BlockChecklistItems");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "ResolvedAt",
                table: "BlockChecklistItems",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ResolvedById",
                table: "BlockChecklistItems",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Status",
                table: "BlockChecklistItems",
                type: "nvarchar(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "");

            migrationBuilder.CreateIndex(
                name: "IX_BlockChecklistItems_ResolvedById",
                table: "BlockChecklistItems",
                column: "ResolvedById");

            migrationBuilder.AddForeignKey(
                name: "FK_BlockChecklistItems_Users_ResolvedById",
                table: "BlockChecklistItems",
                column: "ResolvedById",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }
    }
}
