using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using TaskManagement.Data;
using TaskManagement.DTOs;

namespace TaskManagement.Services
{
    public interface IActivityService
    {
        Task<ApiResponse<List<ActivityDto>>> GetAllActivitiesAsync();
        Task<ApiResponse<ActivityDto>> CreateActivityAsync(CreateActivityDto activityDto);
    }

    public class ActivityService : IActivityService
    {
        private readonly PMSDbContext _context;

        public ActivityService(PMSDbContext context)
        {
            _context = context;
        }

        public async Task<ApiResponse<List<ActivityDto>>> GetAllActivitiesAsync()
        {
            var activities = await _context.Activities
                .OrderByDescending(a => a.Timestamp)
                .Take(100)
                .ToListAsync();

            var activityDtos = activities.Select(a => new ActivityDto
            {
                Id = a.Id,
                UserId = a.UserId,
                UserName = a.UserName,
                Action = a.Action,
                TargetType = a.TargetType,
                TargetId = a.TargetId,
                TargetName = a.TargetName,
                Timestamp = a.Timestamp
            }).ToList();

            return new ApiResponse<List<ActivityDto>> { Success = true, Data = activityDtos };
        }

        public async Task<ApiResponse<ActivityDto>> CreateActivityAsync(CreateActivityDto activityDto)
        {
            var activity = new Activity
            {
                UserId = activityDto.UserId,
                UserName = activityDto.UserName,
                Action = activityDto.Action,
                TargetType = activityDto.TargetType,
                TargetId = activityDto.TargetId,
                TargetName = activityDto.TargetName,
                Timestamp = AppClock.Now
            };

            _context.Activities.Add(activity);
            await _context.SaveChangesAsync();

            return new ApiResponse<ActivityDto>
            {
                Success = true,
                Data = new ActivityDto
                {
                    Id = activity.Id,
                    UserId = activity.UserId,
                    UserName = activity.UserName,
                    Action = activity.Action,
                    TargetType = activity.TargetType,
                    TargetId = activity.TargetId,
                    TargetName = activity.TargetName,
                    Timestamp = activity.Timestamp
                }
            };
        }
    }
}