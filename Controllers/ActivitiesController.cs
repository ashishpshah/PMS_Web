using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TaskManagement.DTOs;
using TaskManagement.Services;
using System.Threading.Tasks;

namespace TaskManagement.Controllers
{
    [Authorize]
    [ApiController]
    [Route("api/[controller]")]
    public class ActivitiesController : ControllerBase
    {
        private readonly IActivityService _activityService;

        public ActivitiesController(IActivityService activityService)
        {
            _activityService = activityService;
        }

        [HttpGet]
        public async Task<ActionResult<ApiResponse<List<ActivityDto>>>> GetAll()
        {
            var result = await _activityService.GetAllActivitiesAsync();
            return Ok(result);
        }

        [HttpPost]
        public async Task<ActionResult<ApiResponse<ActivityDto>>> Create([FromBody] CreateActivityDto dto)
        {
            var result = await _activityService.CreateActivityAsync(dto);
            return Ok(result);
        }
    }
}