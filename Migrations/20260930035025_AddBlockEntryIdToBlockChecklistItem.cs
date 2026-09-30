using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TaskManagement.Migrations
{
    public partial class AddBlockEntryIdToBlockChecklistItem : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "BlockEntryId",
                table: "BlockChecklistItems",
                type: "int",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_BlockChecklistItems_BlockEntryId",
                table: "BlockChecklistItems",
                column: "BlockEntryId");

            migrationBuilder.AddForeignKey(
                name: "FK_BlockChecklistItems_TaskBlockEntries_BlockEntryId",
                table: "BlockChecklistItems",
                column: "BlockEntryId",
                principalTable: "TaskBlockEntries",
                principalColumn: "Id");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_BlockChecklistItems_TaskBlockEntries_BlockEntryId",
                table: "BlockChecklistItems");

            migrationBuilder.DropIndex(
                name: "IX_BlockChecklistItems_BlockEntryId",
                table: "BlockChecklistItems");

            migrationBuilder.DropColumn(
                name: "BlockEntryId",
                table: "BlockChecklistItems");
        }
    }
}
