using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TaskManagement.DTOs;
using TaskManagement.Services;
using IAuthorizationService = TaskManagement.Services.IAuthorizationService;
using System;
using System.Threading;
using System.Threading.Tasks;

namespace TaskManagement.Controllers
{
    [Authorize]
    [ApiController]
    [Route("api/[controller]")]
    public class ReportsController : ControllerBase
    {
        private readonly IReportService _reportService;
        private readonly IAuthorizationService _authService;

        public ReportsController(IReportService reportService, IAuthorizationService authService)
        {
            _reportService = reportService;
            _authService = authService;
        }

        [HttpGet("user-effort")]
        public async Task<ActionResult<ApiResponse<UserEffortReportDto>>> GetUserEffort(
            [FromQuery] DateTime? from, [FromQuery] DateTime? to)
        {
            var userId = _authService.GetCurrentUserId();
            if (userId <= 0)
                return Unauthorized(new ApiResponse<UserEffortReportDto> { Success = false, Message = "Unauthorized" });
            var isAdmin = await _authService.IsAdminAsync();
            var result = await _reportService.GetUserEffortReportAsync(from, to, userId, isAdmin, HttpContext.RequestAborted);
            return Ok(result);
        }

        [HttpGet("user-transitions")]
        public async Task<ActionResult<ApiResponse<UserTransitionReportDto>>> GetUserTransitions(
            [FromQuery] DateTime? from, [FromQuery] DateTime? to)
        {
            var userId = _authService.GetCurrentUserId();
            if (userId <= 0)
                return Unauthorized(new ApiResponse<UserTransitionReportDto> { Success = false, Message = "Unauthorized" });
            var isAdmin = await _authService.IsAdminAsync();
            var result = await _reportService.GetUserTransitionReportAsync(from, to, userId, isAdmin, HttpContext.RequestAborted);
            return Ok(result);
        }

        [HttpGet("user-task-effort")]
        public async Task<ActionResult<ApiResponse<UserTaskEffortReportDto>>> GetUserTaskEffort(
            [FromQuery] int userId, [FromQuery] DateTime? from, [FromQuery] DateTime? to)
        {
            var requestingUserId = _authService.GetCurrentUserId();
            if (requestingUserId <= 0)
                return Unauthorized(new ApiResponse<UserTaskEffortReportDto> { Success = false, Message = "Unauthorized" });
            var isAdmin = await _authService.IsAdminAsync();
            var result = await _reportService.GetUserTaskEffortAsync(userId, from, to, requestingUserId, isAdmin, HttpContext.RequestAborted);
            if (!result.Success) return StatusCode(403, result);
            return Ok(result);
        }

        [HttpGet("user-daily-effort")]
        public async Task<ActionResult<ApiResponse<UserDailyEffortReportDto>>> GetUserDailyEffort(
            [FromQuery] int userId, [FromQuery] DateTime? from, [FromQuery] DateTime? to)
        {
            var requestingUserId = _authService.GetCurrentUserId();
            if (requestingUserId <= 0)
                return Unauthorized(new ApiResponse<UserDailyEffortReportDto> { Success = false, Message = "Unauthorized" });
            var isAdmin = await _authService.IsAdminAsync();
            var result = await _reportService.GetUserDailyEffortAsync(userId, from, to, requestingUserId, isAdmin, HttpContext.RequestAborted);
            if (!result.Success) return StatusCode(403, result);
            return Ok(result);
        }

        [HttpGet("daily-utilization")]
        public async Task<ActionResult<ApiResponse<UserDailyUtilizationReportDto>>> GetDailyUtilization(
            [FromQuery] int userId, [FromQuery] int month, [FromQuery] int year, CancellationToken ct)
        {
            var requestingUserId = _authService.GetCurrentUserId();
            if (requestingUserId <= 0)
                return Unauthorized(new ApiResponse<UserDailyUtilizationReportDto> { Success = false, Message = "Unauthorized" });
            if (month < 1 || month > 12 || year < 2000 || year > 2100)
                return BadRequest(new ApiResponse<UserDailyUtilizationReportDto> { Success = false, Message = "Invalid month or year." });
            var isAdmin = await _authService.IsAdminAsync();
            var result = await _reportService.GetDailyUtilizationAsync(userId, month, year, requestingUserId, isAdmin, ct);
            if (!result.Success) return StatusCode(403, result);
            return Ok(result);
        }

        [HttpGet("hours-summary")]
        public async Task<ActionResult<ApiResponse<HoursSummaryDto>>> GetHoursSummary(
            [FromQuery] DateTime? from, [FromQuery] DateTime? to,
            [FromQuery] int? userId, [FromQuery] int? projectId)
        {
            var requestingUserId = _authService.GetCurrentUserId();
            if (requestingUserId <= 0)
                return Unauthorized(new ApiResponse<HoursSummaryDto> { Success = false, Message = "Unauthorized" });
            var isAdmin = await _authService.IsAdminAsync();
            var result = await _reportService.GetHoursSummaryAsync(from, to, userId, projectId, requestingUserId, isAdmin, HttpContext.RequestAborted);
            return Ok(result);
        }
    }
}
