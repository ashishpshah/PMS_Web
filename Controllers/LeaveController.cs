using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TaskManagement.DTOs;
using TaskManagement.Services;
using IAuthorizationService = TaskManagement.Services.IAuthorizationService;

namespace TaskManagement.Controllers
{
    // Self-service actions (requests/mine, balances/mine, cancel, viewing rules/holidays) are
    // open to any authenticated user, mirroring WorkDiaryController. Admin-only actions
    // (approvals, holiday overrides, rules editing, leave-type CRUD) are gated by
    // IsAdminAsync() directly, the same way TaskTemplatesController is — not the
    // page-permission bitmap. No PageModule row is registered for this route.
    [Authorize]
    [ApiController]
    [Route("api/[controller]")]
    public class LeaveController : ControllerBase
    {
        private readonly ILeaveService _leaveService;
        private readonly ILeaveTypeService _leaveTypeService;
        private readonly IHolidayService _holidayService;
        private readonly IWorkweekRulesService _rulesService;
        private readonly IAnnualLeaveAllocationService _allocationService;
        private readonly IAuthorizationService _authService;

        public LeaveController(
            ILeaveService leaveService,
            ILeaveTypeService leaveTypeService,
            IHolidayService holidayService,
            IWorkweekRulesService rulesService,
            IAnnualLeaveAllocationService allocationService,
            IAuthorizationService authService)
        {
            _leaveService = leaveService;
            _leaveTypeService = leaveTypeService;
            _holidayService = holidayService;
            _rulesService = rulesService;
            _allocationService = allocationService;
            _authService = authService;
        }

        // ── Leave requests ──────────────────────────────────────────────────

        [HttpGet("requests/mine")]
        public async Task<ActionResult<ApiResponse<List<LeaveRequestDto>>>> GetMyRequests()
        {
            var userId = _authService.GetCurrentUserId();
            if (userId <= 0) return Unauthorized();
            return Ok(await _leaveService.GetMyRequestsAsync(userId));
        }

        [HttpGet("requests/all")]
        public async Task<ActionResult<ApiResponse<List<LeaveRequestDto>>>> GetAllRequests([FromQuery] int? userId, [FromQuery] string? status)
        {
            if (!await _authService.IsAdminAsync()) return Forbid();
            return Ok(await _leaveService.GetAllRequestsAsync(userId, status));
        }

        [HttpGet("requests/preview")]
        public async Task<ActionResult<ApiResponse<decimal>>> PreviewDayCount([FromQuery] DateTime start, [FromQuery] DateTime end)
        {
            var result = await _leaveService.PreviewDayCountAsync(start, end);
            return result.Success ? Ok(result) : BadRequest(result);
        }

        [HttpPost("requests")]
        public async Task<ActionResult<ApiResponse<LeaveRequestDto>>> CreateRequest([FromBody] CreateLeaveRequestDto dto)
        {
            var userId = _authService.GetCurrentUserId();
            if (userId <= 0) return Unauthorized();
            var result = await _leaveService.RequestAsync(userId, dto);
            return result.Success ? Ok(result) : BadRequest(result);
        }

        [HttpPut("requests/{id}")]
        public async Task<ActionResult<ApiResponse<LeaveRequestDto>>> UpdateRequest(int id, [FromBody] UpdateLeaveRequestDto dto)
        {
            var userId = _authService.GetCurrentUserId();
            if (userId <= 0) return Unauthorized();
            var result = await _leaveService.UpdateAsync(userId, id, dto);
            if (!result.Success && result.ErrorCode == "NOT_FOUND") return NotFound(result);
            return result.Success ? Ok(result) : BadRequest(result);
        }

        [HttpPost("requests/{id}/decide")]
        public async Task<ActionResult<ApiResponse<LeaveRequestDto>>> Decide(int id, [FromBody] DecideLeaveRequestDto dto)
        {
            if (!await _authService.IsAdminAsync()) return Forbid();
            var approverId = _authService.GetCurrentUserId();
            var result = await _leaveService.DecideAsync(approverId, id, dto);
            if (!result.Success && result.ErrorCode == "NOT_FOUND") return NotFound(result);
            return result.Success ? Ok(result) : BadRequest(result);
        }

        [HttpPut("requests/{id}/permissions")]
        public async Task<ActionResult<ApiResponse<LeaveRequestDto>>> SetPermissions(int id, [FromBody] SetLeaveRequestPermissionsDto dto)
        {
            if (!await _authService.IsAdminAsync()) return Forbid();
            var result = await _leaveService.SetPermissionsAsync(id, dto);
            if (!result.Success && result.ErrorCode == "NOT_FOUND") return NotFound(result);
            return result.Success ? Ok(result) : BadRequest(result);
        }

        [HttpDelete("requests/{id}")]
        public async Task<ActionResult<ApiResponse<bool>>> DeleteRequest(int id)
        {
            var userId = _authService.GetCurrentUserId();
            if (userId <= 0) return Unauthorized();
            var result = await _leaveService.DeleteAsync(userId, id);
            if (!result.Success && result.ErrorCode == "NOT_FOUND") return NotFound(result);
            return result.Success ? Ok(result) : BadRequest(result);
        }

        // ── Balances ─────────────────────────────────────────────────────────

        [HttpGet("balances/mine")]
        public async Task<ActionResult<ApiResponse<LeaveBalanceDto>>> GetMyBalance()
        {
            var userId = _authService.GetCurrentUserId();
            if (userId <= 0) return Unauthorized();
            return Ok(await _leaveService.GetMyBalanceAsync(userId));
        }

        // ── Leave types (admin CRUD) ────────────────────────────────────────

        [HttpGet("types")]
        public async Task<ActionResult<ApiResponse<List<LeaveTypeDto>>>> GetTypes() =>
            Ok(new ApiResponse<List<LeaveTypeDto>> { Success = true, Data = await _leaveTypeService.GetAllAsync() });

        [HttpPost("types")]
        public async Task<ActionResult<ApiResponse<LeaveTypeDto>>> CreateType([FromBody] SaveLeaveTypeDto dto)
        {
            if (!await _authService.IsAdminAsync()) return Forbid();
            var result = await _leaveTypeService.CreateAsync(dto);
            return result.Success ? Ok(result) : BadRequest(result);
        }

        [HttpPut("types/{id}")]
        public async Task<ActionResult<ApiResponse<LeaveTypeDto>>> UpdateType(int id, [FromBody] SaveLeaveTypeDto dto)
        {
            if (!await _authService.IsAdminAsync()) return Forbid();
            var result = await _leaveTypeService.UpdateAsync(id, dto);
            if (!result.Success && result.ErrorCode == "NOT_FOUND") return NotFound(result);
            return result.Success ? Ok(result) : BadRequest(result);
        }

        [HttpDelete("types/{id}")]
        public async Task<ActionResult<ApiResponse<bool>>> DeleteType(int id)
        {
            if (!await _authService.IsAdminAsync()) return Forbid();
            var result = await _leaveTypeService.DeleteAsync(id);
            if (!result.Success && result.ErrorCode == "NOT_FOUND") return NotFound(result);
            return Ok(result);
        }

        // ── Holidays ─────────────────────────────────────────────────────────

        [HttpGet("holidays")]
        public async Task<ActionResult<ApiResponse<List<HolidayDto>>>> GetHolidays([FromQuery] DateTime from, [FromQuery] DateTime to) =>
            Ok(new ApiResponse<List<HolidayDto>> { Success = true, Data = await _holidayService.GetHolidaysAsync(from, to) });

        [HttpPost("holidays/override")]
        public async Task<ActionResult<ApiResponse<HolidayDto>>> SetHolidayOverride([FromBody] SetHolidayOverrideDto dto)
        {
            if (!await _authService.IsAdminAsync()) return Forbid();
            var userId = _authService.GetCurrentUserId();
            var result = await _holidayService.SetOverrideAsync(userId, dto);
            return result.Success ? Ok(result) : BadRequest(result);
        }

        [HttpDelete("holidays/{id}")]
        public async Task<ActionResult<ApiResponse<bool>>> DeleteHoliday(int id)
        {
            if (!await _authService.IsAdminAsync()) return Forbid();
            var result = await _holidayService.DeleteAsync(id);
            if (!result.Success && result.ErrorCode == "NOT_FOUND") return NotFound(result);
            return Ok(result);
        }

        // ── Annual Leave Allocation ──────────────────────────────────────────
        // The full year-by-year list is admin-only (drives the "Leave Type" management screen);
        // only the current year's row is ever editable (enforced in the service).

        [HttpGet("allocations")]
        public async Task<ActionResult<ApiResponse<List<AnnualLeaveAllocationDto>>>> GetAllocations()
        {
            if (!await _authService.IsAdminAsync()) return Forbid();
            return Ok(new ApiResponse<List<AnnualLeaveAllocationDto>> { Success = true, Data = await _allocationService.GetAllAsync() });
        }

        [HttpPut("allocations/current")]
        public async Task<ActionResult<ApiResponse<AnnualLeaveAllocationDto>>> UpdateCurrentAllocation([FromBody] UpdateAnnualLeaveAllocationDto dto)
        {
            if (!await _authService.IsAdminAsync()) return Forbid();
            var result = await _allocationService.UpdateCurrentYearAsync(dto);
            return result.Success ? Ok(result) : BadRequest(result);
        }

        // ── Rules Settings ───────────────────────────────────────────────────
        // Viewable by anyone (self-service pages may want to display working hours); editable
        // by any IsAdmin-flagged role only.

        [HttpGet("rules")]
        public async Task<ActionResult<ApiResponse<WorkweekRulesDto>>> GetRules() =>
            Ok(new ApiResponse<WorkweekRulesDto> { Success = true, Data = await _rulesService.GetRulesAsync() });

        [HttpPut("rules")]
        public async Task<ActionResult<ApiResponse<WorkweekRulesDto>>> UpdateRules([FromBody] UpdateWorkweekRulesDto dto)
        {
            if (!await _authService.IsAdminAsync()) return Forbid();
            var userId = _authService.GetCurrentUserId();
            var result = await _rulesService.UpdateRulesAsync(userId, dto);
            if (result.Success)
            {
                // UpdateRulesAsync already wiped every non-manual Saturday row (past and future)
                // for the new pattern to regenerate against — but regeneration is otherwise lazy
                // (HolidayService only (re)materializes whatever date range something actually
                // queries). Without this, only whichever month someone happens to view next picks
                // up the new pattern, leaving every other month blank until it's individually
                // viewed. Eagerly regenerate the whole current year — Jan through Dec, not just
                // today onward — right now so it's correct everywhere immediately.
                var year = AppClock.Today.Year;
                await _holidayService.RegenerateSaturdayHolidaysAsync(new DateTime(year, 1, 1), new DateTime(year, 12, 31));
            }
            return result.Success ? Ok(result) : BadRequest(result);
        }
    }
}
