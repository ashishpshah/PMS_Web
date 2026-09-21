using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Collections.Generic;
using System.Threading.Tasks;
using TaskManagement.DTOs;
using TaskManagement.Services;
using IAuthorizationService = TaskManagement.Services.IAuthorizationService;

namespace TaskManagement.Controllers
{
    [Authorize]
    [ApiController]
    [Route("api/[controller]")]
    public class WorkDiaryController : ControllerBase
    {
        private readonly IWorkDiaryService _service;
        private readonly IAuthorizationService _authService;

        public WorkDiaryController(IWorkDiaryService service, IAuthorizationService authService)
        {
            _service = service;
            _authService = authService;
        }

        [HttpGet]
        public async Task<ActionResult<ApiResponse<List<WorkDiaryDto>>>> GetMine(
            [FromQuery] int? month, [FromQuery] int? year,
            [FromQuery] string? from, [FromQuery] string? to,
            [FromQuery] int page = 1, [FromQuery] int pageSize = 25)
        {
            var userId = _authService.GetCurrentUserId();
            if (userId <= 0) return Unauthorized();
            DateTime? fromDate = null, toDate = null;
            if (!string.IsNullOrWhiteSpace(from) && DateTime.TryParse(from, out var fd)) fromDate = fd;
            if (!string.IsNullOrWhiteSpace(to)   && DateTime.TryParse(to,   out var td)) toDate   = td;
            return Ok(await _service.GetMyDiaryAsync(userId, month, year, fromDate, toDate, page, pageSize));
        }

        [HttpGet("all")]
        public async Task<ActionResult<ApiResponse<List<WorkDiaryDto>>>> GetAll(
            [FromQuery] int? userId,
            [FromQuery] int? month, [FromQuery] int? year,
            [FromQuery] string? from, [FromQuery] string? to,
            [FromQuery] int page = 1, [FromQuery] int pageSize = 25)
        {
            if (!await _authService.IsAdminAsync())
                return Forbid();
            DateTime? fromDate = null, toDate = null;
            if (!string.IsNullOrWhiteSpace(from) && DateTime.TryParse(from, out var fd)) fromDate = fd;
            if (!string.IsNullOrWhiteSpace(to)   && DateTime.TryParse(to,   out var td)) toDate   = td;
            return Ok(await _service.GetAllDiaryAsync(userId, month, year, fromDate, toDate, page, pageSize));
        }

        [HttpGet("categories")]
        public ActionResult<ApiResponse<string[]>> GetCategories() =>
            Ok(new ApiResponse<string[]> { Success = true, Data = _service.Categories });

        // Any authenticated user may pick any project in the work diary — no permission/membership check.
        [HttpGet("projects")]
        public async Task<ActionResult<ApiResponse<List<WorkDiaryProjectOptionDto>>>> GetProjects() =>
            Ok(new ApiResponse<List<WorkDiaryProjectOptionDto>> { Success = true, Data = await _service.GetProjectOptionsAsync() });

        [HttpPost]
        public async Task<ActionResult<ApiResponse<WorkDiaryDto>>> Create([FromBody] CreateWorkDiaryDto dto)
        {
            var userId = _authService.GetCurrentUserId();
            if (userId <= 0) return Unauthorized();
            var result = await _service.AddEntryAsync(userId, dto);
            return result.Success ? Ok(result) : BadRequest(result);
        }

        [HttpPut("{id}")]
        public async Task<ActionResult<ApiResponse<WorkDiaryDto>>> Update(int id, [FromBody] UpdateWorkDiaryDto dto)
        {
            var userId = _authService.GetCurrentUserId();
            if (userId <= 0) return Unauthorized();
            var result = await _service.UpdateEntryAsync(userId, id, dto);
            if (!result.Success && result.ErrorCode == "NOT_FOUND") return NotFound(result);
            return result.Success ? Ok(result) : BadRequest(result);
        }

        [HttpDelete("{id}")]
        public async Task<ActionResult<ApiResponse<bool>>> Delete(int id)
        {
            var userId = _authService.GetCurrentUserId();
            if (userId <= 0) return Unauthorized();
            var result = await _service.DeleteEntryAsync(userId, id);
            if (!result.Success && result.ErrorCode == "NOT_FOUND") return NotFound(result);
            return Ok(result);
        }
    }
}
