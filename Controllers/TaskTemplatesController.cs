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
    [Route("api/task-templates")]
    public class TaskTemplatesController : ControllerBase
    {
        private readonly ITaskTemplateService  _templateService;
        private readonly IAuthorizationService _authService;

        public TaskTemplatesController(ITaskTemplateService templateService, IAuthorizationService authService)
        {
            _templateService = templateService;
            _authService     = authService;
        }

        [HttpGet]
        public async Task<ActionResult<ApiResponse<List<TaskTemplateDto>>>> GetAll()
        {
            if (!await _authService.IsAdminAsync())
                return StatusCode(403, Forbidden());
            return Ok(await _templateService.GetAllAsync());
        }

        [HttpGet("{id:int}")]
        public async Task<ActionResult<ApiResponse<TaskTemplateDto>>> GetById(int id)
        {
            if (!await _authService.IsAdminAsync())
                return StatusCode(403, Forbidden());
            var result = await _templateService.GetByIdAsync(id);
            return result.Success ? Ok(result) : NotFound(result);
        }

        [HttpPost]
        public async Task<ActionResult<ApiResponse<TaskTemplateDto>>> Create([FromBody] SaveTaskTemplateDto dto)
        {
            if (!await _authService.IsAdminAsync())
                return StatusCode(403, Forbidden());
            var userId = _authService.GetCurrentUserId();
            var result = await _templateService.CreateAsync(dto, userId);
            return result.Success ? Ok(result) : BadRequest(result);
        }

        [HttpPut("{id:int}")]
        public async Task<ActionResult<ApiResponse<TaskTemplateDto>>> Update(int id, [FromBody] SaveTaskTemplateDto dto)
        {
            if (!await _authService.IsAdminAsync())
                return StatusCode(403, Forbidden());
            var userId = _authService.GetCurrentUserId();
            var result = await _templateService.UpdateAsync(id, dto, userId);
            return result.Success ? Ok(result) : BadRequest(result);
        }

        [HttpPatch("{id:int}/active")]
        public async Task<ActionResult<ApiResponse<bool>>> SetActive(int id, [FromBody] SetUserActiveDto dto)
        {
            if (!await _authService.IsAdminAsync())
                return StatusCode(403, Forbidden());
            var result = await _templateService.SetActiveAsync(id, dto.IsActive);
            return result.Success ? Ok(result) : BadRequest(result);
        }

        [HttpPost("{id:int}/duplicate")]
        public async Task<ActionResult<ApiResponse<TaskTemplateDto>>> Duplicate(int id)
        {
            if (!await _authService.IsAdminAsync())
                return StatusCode(403, Forbidden());
            var userId = _authService.GetCurrentUserId();
            var result = await _templateService.DuplicateAsync(id, userId);
            return result.Success ? Ok(result) : BadRequest(result);
        }

        [HttpDelete("{id:int}")]
        public async Task<ActionResult<ApiResponse<bool>>> Delete(int id)
        {
            if (!await _authService.IsAdminAsync())
                return StatusCode(403, Forbidden());
            var result = await _templateService.DeleteAsync(id);
            return result.Success ? Ok(result) : BadRequest(result);
        }

        [HttpPost("{id:int}/generate")]
        public async Task<ActionResult<ApiResponse<TaskTemplateGenerationDto>>> Generate(int id, [FromBody] ManualGenerateDto dto)
        {
            if (!await _authService.IsAdminAsync())
                return StatusCode(403, Forbidden());
            var userId = _authService.GetCurrentUserId();
            var result = await _templateService.GenerateAsync(id, userId, dto.Notes, dto.ForDate);
            return result.Success ? Ok(result) : BadRequest(result);
        }

        [HttpGet("{id:int}/history")]
        public async Task<ActionResult<ApiResponse<List<TaskTemplateGenerationDto>>>> GetHistory(int id)
        {
            if (!await _authService.IsAdminAsync())
                return StatusCode(403, Forbidden());
            return Ok(await _templateService.GetHistoryAsync(id));
        }

        private static ApiResponse<string> Forbidden() =>
            new() { Success = false, Message = "You do not have permission to manage templates." };
    }
}
