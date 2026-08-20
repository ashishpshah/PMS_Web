using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Infrastructure;
using TaskManagement.Data;

#nullable disable

namespace TaskManagement.Migrations
{
    [DbContext(typeof(PMSDbContext))]
    [Migration("20260703100000_AddContactNoNormalized")]
    public partial class AddContactNoNormalized : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ContactNoNormalized",
                table: "Users",
                type: "nvarchar(20)",
                maxLength: 20,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Users_ContactNoNormalized",
                table: "Users",
                column: "ContactNoNormalized");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Users_ContactNoNormalized",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "ContactNoNormalized",
                table: "Users");
        }
    }
}
