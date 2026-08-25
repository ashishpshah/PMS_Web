using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TaskManagement.DTOs;
using TaskManagement.Services;
using System.Collections.Generic;
using System.Threading.Tasks;
using IAuthorizationService = TaskManagement.Services.IAuthorizationService;

namespace TaskManagement.Controllers
{
    [Authorize]
    [ApiController]
    [Route("api/[controller]")]
    public class RolesController : ControllerBase
    {
        private readonly IRoleService _roleService;
        private readonly IAuthorizationService _authService;

        public RolesController(IRoleService roleService, IAuthorizationService authService)
        {
            _roleService = roleService;
            _authService = authService;
        }

        [HttpGet]
        public async Task<ActionResult<ApiResponse<List<RoleDto>>>> GetAll()
        {
            if (!await _authService.IsAdminAsync())
                return StatusCode(403, new ApiResponse<string> { Success = false, Message = "You do not have permission to view roles" });
            var result = await _roleService.GetAllRolesAsync();
            return Ok(result);
        }

        [HttpGet("{id}")]
        public async Task<ActionResult<ApiResponse<RoleDto>>> GetById(int id)
        {
            if (id <= 1) return StatusCode(403, new ApiResponse<string> { Success = false, Message = "Operation not allowed on protected role" });
            if (!await _authService.IsAdminAsync())
                return StatusCode(403, new ApiResponse<string> { Success = false, Message = "You do not have permission to view roles" });
            var result = await _roleService.GetRoleByIdAsync(id);
            if (!result.Success) return NotFound(result);
            return Ok(result);
        }

        [HttpPost]
        public async Task<ActionResult<ApiResponse<RoleDto>>> Save(RoleDto roleDto)
        {
            if (!await _authService.IsAdminAsync())
                return StatusCode(403, new ApiResponse<string> { Success = false, Message = "You do not have permission to manage roles" });
            var result = await _roleService.SaveRoleAsync(roleDto);
            if (!result.Success) return NotFound(result);
            return Ok(result);
        }

        [HttpDelete("{id}")]
        public async Task<ActionResult<ApiResponse<bool>>> Delete(int id)
        {
            if (!await _authService.IsAdminAsync())
                return StatusCode(403, new ApiResponse<string> { Success = false, Message = "You do not have permission to delete roles" });
            var result = await _roleService.DeleteRoleAsync(id);
            if (!result.Success) return NotFound(result);
            return Ok(result);
        }
    }
}

