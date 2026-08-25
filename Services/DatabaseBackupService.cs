using System;
using System.Diagnostics;
using System.IO;
using System.Threading.Tasks;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace TaskManagement.Services
{
    public interface IDatabaseBackupService
    {
        Task<string> CreateBackupAsync();
    }

    public class DatabaseBackupService : IDatabaseBackupService
    {
        private readonly string _connectionString;
        private readonly string _backupFolder;

        public DatabaseBackupService(IConfiguration configuration)
        {
            _connectionString = configuration.GetConnectionString("DefaultConnection");
            
            var appDir = AppDomain.CurrentDomain.BaseDirectory;
            _backupFolder = Path.Combine(appDir, "Backups");
            
            if (!Directory.Exists(_backupFolder))
            {
                Directory.CreateDirectory(_backupFolder);
            }
        }

        public async Task<string> CreateBackupAsync()
        {
            var timestamp = AppClock.Now.ToString("ddMMyyHHmm");
            var databaseName = "PMS_20250504";
            var backupFileName = $"{databaseName}_{timestamp}.bak";
            var backupPath = Path.Combine(_backupFolder, backupFileName);

            var query = $@"
                BACKUP DATABASE [{databaseName}] 
                TO DISK = '{backupPath}'
                WITH FORMAT, MEDIANAME = 'PMS_Backup', NAME = 'Full Backup {timestamp}';
            ";

            await using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();

            await using var command = new SqlCommand(query, connection);
            await command.ExecuteNonQueryAsync();

            var fileInfo = new FileInfo(backupPath);
            var fileSizeMB = fileInfo.Length / (1024 * 1024);

            return $"Backup created: {backupPath} ({fileSizeMB:F2} MB)";
        }
    }
}