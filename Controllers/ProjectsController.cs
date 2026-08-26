using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TaskManagement.DTOs;
using TaskManagement.Services;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using IAuthorizationService = TaskManagement.Services.IAuthorizationService;

namespace TaskManagement.Controllers
{
    [Authorize]
    [ApiController]
    [Route("api/[controller]")]
    public class ProjectsController : ControllerBase
    {
        private readonly IProjectService _projectService;
        private readonly IAuthorizationService _authService;

        public ProjectsController(IProjectService projectService, IAuthorizationService authService)
        {
            _projectService = projectService;
            _authService = authService;
        }

        [HttpGet]
        public async Task<ActionResult<ApiResponse<List<ProjectDto>>>> GetAll()
        {
            if (!await _authService.CanViewAsync("/projects"))
                return StatusCode(403, new ApiResponse<string> { Success = false, Message = "You do not have permission to view projects" });
            var result = await _projectService.GetAllProjectsAsync();
            return Ok(result);
        }

        [HttpGet("{id}")]
        public async Task<ActionResult<ApiResponse<ProjectDto>>> GetById(int id)
        {
            if (!await _authService.CanViewAsync("/projects"))
                return StatusCode(403, new ApiResponse<string> { Success = false, Message = "You do not have permission to view projects" });
            var result = await _projectService.GetProjectByIdAsync(id);
            if (!result.Success) return NotFound(result);
            return Ok(result);
        }

        [HttpPost]
        public async Task<ActionResult<ApiResponse<ProjectDto>>> Create(ProjectDto projectDto)
        {
            if (!await _authService.IsAdminAsync() || !await _authService.CanCreateAsync("/projects"))
                return StatusCode(403, new ApiResponse<string> { Success = false, Message = "You do not have permission to create projects" });
            var userId = _authService.GetCurrentUserId();
            if (userId <= 0)
                return Unauthorized(new ApiResponse<ProjectDto> { Success = false, Message = "Unable to determine current user" });
            var result = await _projectService.CreateProjectAsync(projectDto, userId);
            if (!result.Success) return BadRequest(result);
            return CreatedAtAction(nameof(GetById), new { id = result.Data?.Id }, result);
        }

        [HttpPut("{id}")]
        public async Task<ActionResult<ApiResponse<ProjectDto>>> Update(int id, ProjectDto projectDto)
        {
            if (!await _authService.IsAdminAsync() || !await _authService.CanUpdateAsync("/projects"))
                return StatusCode(403, new ApiResponse<string> { Success = false, Message = "You do not have permission to update projects" });
            var result = await _projectService.UpdateProjectAsync(id, projectDto);
            if (!result.Success)
                return result.Message == "Project not found" ? NotFound(result) : BadRequest(result);
            return Ok(result);
        }

        // Live "as-you-type" duplicate-name check used by the create/edit modal — always
        // Success = true, the boolean Available is the actual signal (mirrors
        // AuthController.CheckAvailability). A conflict only counts against another project that
        // isn't already Completed.
        [HttpGet("check-name")]
        public async Task<ActionResult<ApiResponse<ProjectNameAvailabilityDto>>> CheckName(
            [FromQuery] string name, [FromQuery] int? excludeProjectId)
        {
            if (!await _authService.CanViewAsync("/projects"))
                return StatusCode(403, new ApiResponse<string> { Success = false, Message = "You do not have permission to view projects" });
            var available = await _projectService.IsProjectNameAvailableAsync(name, excludeProjectId);
            return Ok(new ApiResponse<ProjectNameAvailabilityDto> { Success = true, Data = new ProjectNameAvailabilityDto { Available = available } });
        }

        [HttpDelete("{id}")]
        public async Task<ActionResult<ApiResponse<bool>>> Delete(int id)
        {
            if (!await _authService.IsAdminAsync() || !await _authService.CanDeleteAsync("/projects"))
                return StatusCode(403, new ApiResponse<string> { Success = false, Message = "You do not have permission to delete projects" });
            var result = await _projectService.DeleteProjectAsync(id);
            if (!result.Success) return NotFound(result);
            return Ok(result);
        }

        [HttpPut("{id}/reassign")]
        public async Task<ActionResult<ApiResponse<ProjectDto>>> Reassign(int id, [FromBody] ReassignProjectDto dto)
        {
            if (!await _authService.IsAdminAsync())
                return StatusCode(403, new ApiResponse<string> { Success = false, Message = "You do not have permission to reassign projects" });
            var changedById = _authService.GetCurrentUserId();
            if (changedById <= 0)
                return Unauthorized(new ApiResponse<ProjectDto> { Success = false, Message = "Unable to determine current user" });
            var result = await _projectService.ReassignProjectAsync(id, dto.NewOwnerId, dto.ReasonTag, changedById);
            if (!result.Success) return NotFound(result);
            return Ok(result);
        }

        [HttpGet("{id}/assignment-history")]
        public async Task<ActionResult<ApiResponse<List<ProjectAssignmentHistoryDto>>>> GetAssignmentHistory(int id)
        {
            if (!await _authService.CanViewAsync("/projects"))
                return StatusCode(403, new ApiResponse<string> { Success = false, Message = "You do not have permission to view projects" });
            var result = await _projectService.GetProjectAssignmentHistoryAsync(id);
            return Ok(result);
        }

        [HttpPost("{id}/assign")]
        public async Task<ActionResult<ApiResponse<bool>>> AssignUser(int id, [FromBody] int userId, [FromQuery] string role = "Developer")
        {
            if (!await _authService.IsAdminAsync())
                return StatusCode(403, new ApiResponse<string> { Success = false, Message = "You do not have permission to assign users to projects" });
            var result = await _projectService.AssignUserToProjectAsync(id, userId, role);
            if (!result.Success) return BadRequest(result);
            return Ok(result);
        }

        [HttpDelete("{id}/members/{userId}")]
        public async Task<ActionResult<ApiResponse<bool>>> RemoveMember(int id, int userId)
        {
            if (!await _authService.IsAdminAsync())
                return StatusCode(403, new ApiResponse<string> { Success = false, Message = "You do not have permission to remove members from projects" });
            var result = await _projectService.RemoveUserFromProjectAsync(id, userId);
            if (!result.Success) return BadRequest(result);
            return Ok(result);
        }

        [HttpPut("{id}/members")]
        public async Task<ActionResult<ApiResponse<ProjectDto>>> SetMembers(int id, [FromBody] List<int> userIds)
        {
            if (!await _authService.IsAdminAsync())
                return StatusCode(403, new ApiResponse<string> { Success = false, Message = "You do not have permission to update project members" });
            var result = await _projectService.SetProjectMembersAsync(id, userIds);
            if (!result.Success) return BadRequest(result);
            return Ok(result);
        }
    }
}

