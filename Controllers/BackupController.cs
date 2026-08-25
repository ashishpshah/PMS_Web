// using Microsoft.AspNetCore.Mvc;
// using TaskManagement.Services;
// using System;
// using System.Threading.Tasks;

// namespace TaskManagement.Controllers
// {
//     [ApiController]
//     [Route("api/[controller]")]
//     public class BackupController : ControllerBase
//     {
//         private readonly IDatabaseBackupService _backupService;

//         public BackupController(IDatabaseBackupService backupService)
//         {
//             _backupService = backupService;
//         }

//         [HttpPost]
//         public async Task<ActionResult<string>> CreateBackup()
//         {
//             try
//             {
//                 var result = await _backupService.CreateBackupAsync();
//                 return Ok(new { message = result });
//             }
//             catch (Exception ex)
//             {
//                 return StatusCode(500, new { error = $"Backup failed: {ex.Message}" });
//             }
//         }
//     }
// }