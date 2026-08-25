using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using TaskManagement.Data;
using TaskManagement.DTOs;

namespace TaskManagement.Services
{
    public interface IWorkDiaryService
    {
        string[] Categories { get; }
        Task<List<WorkDiaryProjectOptionDto>> GetProjectOptionsAsync();
        Task<ApiResponse<List<WorkDiaryDto>>> GetMyDiaryAsync(int userId, int? month, int? year, DateTime? from = null, DateTime? to = null);
        Task<ApiResponse<List<WorkDiaryDto>>> GetAllDiaryAsync(int? filterUserId, int? month, int? year, DateTime? from = null, DateTime? to = null);
        Task<ApiResponse<WorkDiaryDto>> AddEntryAsync(int userId, CreateWorkDiaryDto dto);
        Task<ApiResponse<WorkDiaryDto>> UpdateEntryAsync(int userId, int id, UpdateWorkDiaryDto dto);
        Task<ApiResponse<bool>> DeleteEntryAsync(int userId, int id);
    }

    public class WorkDiaryService : IWorkDiaryService
    {
        private readonly PMSDbContext _context;
        private readonly IConfiguration _configuration;
        private readonly INotificationService _notifications;

        public WorkDiaryService(PMSDbContext context, IConfiguration configuration, INotificationService notifications)
        {
            _context = context;
            _configuration = configuration;
            _notifications = notifications;
        }

        // Notify the linked project's owner/creator (excluding the diary author) about a diary entry.
        private async Task NotifyDiaryAsync(WorkDiary entry, int authorId, string verb)
        {
            if (!entry.ProjectId.HasValue) return;
            var project = await _context.Projects.FindAsync(entry.ProjectId.Value);
            if (project == null) return;

            var author = await _context.Users.FindAsync(authorId);
            var recipients = new List<int> { project.OwnerId, project.CreatedById };
            recipients.RemoveAll(id => id <= 0 || id == authorId);
            if (recipients.Count == 0) return;

            await _notifications.NotifyUsersAsync(recipients, new NotificationDto
            {
                Title = $"Work diary {verb}",
                Body  = $"{author?.FullName ?? "A user"} {verb} a diary entry ({entry.HoursSpent}h, {entry.Category}) on {project.Name}.",
                Type  = "diary",
            });
        }

        public string[] Categories
        {
            get
            {
                var raw = _configuration["DiaryCategories"]
                    ?? "Development,Meeting,Review,Testing,Documentation,Other";
                return raw.Split(',', StringSplitOptions.RemoveEmptyEntries)
                          .Select(c => c.Trim())
                          .ToArray();
            }
        }

        internal static bool IsWorkingDay(DateTime d)
        {
            if (d.DayOfWeek == DayOfWeek.Sunday) return false;
            if (d.DayOfWeek == DayOfWeek.Saturday)
            {
                int week = (int)Math.Ceiling(d.Day / 7.0);
                if (week == 2 || week == 4) return false;
            }
            return true;
        }

        private static bool IsAllowedDate(DateTime date)
        {
            var today = AppClock.Today;
            var d = date.Date;
            if (d > today) return false;
            if (d == today) return true;
            return IsWorkingDay(d);
        }

        private static readonly Regex DatePrefixRegex = new(@"^\s*(\d{2}-\d{2}-\d{4})\s*:\s*", RegexOptions.Compiled);

        private const int MaxBackdatedEntriesPerDay = 3;
        private const int MaxPastWorkingDays = 10;

        // If the description starts with "dd-MM-yyyy : ", that date should be used for the entry's Date column instead of the submitted Date.
        private static bool TryGetDatePrefix(string? description, out DateTime date)
        {
            var match = DatePrefixRegex.Match(description ?? string.Empty);
            if (match.Success &&
                DateTime.TryParseExact(match.Groups[1].Value, "dd-MM-yyyy", CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed))
            {
                date = parsed.Date;
                return true;
            }
            date = default;
            return false;
        }

        // Number of working days between date (inclusive) and today (exclusive).
        private static int CountPastWorkingDays(DateTime date, DateTime today)
        {
            var count = 0;
            for (var d = date.Date; d < today; d = d.AddDays(1))
            {
                if (IsWorkingDay(d)) count++;
            }
            return count;
        }

        // All projects, unfiltered by permission/membership — work diary lets any user log against any project.
        public async Task<List<WorkDiaryProjectOptionDto>> GetProjectOptionsAsync()
        {
            return await _context.Projects
                .OrderBy(p => p.Name)
                .Select(p => new WorkDiaryProjectOptionDto { Id = p.Id, Code = p.Code, Name = p.Name })
                .ToListAsync();
        }

        public async Task<ApiResponse<List<WorkDiaryDto>>> GetMyDiaryAsync(int userId, int? month, int? year, DateTime? from = null, DateTime? to = null)
        {
            var query = _context.WorkDiaries
                .Include(wd => wd.User)
                .Include(wd => wd.Project)
                .Where(wd => wd.UserId == userId);

            query = ApplyDateFilter(query, month, year, from, to);

            var list = await query
                .OrderByDescending(wd => wd.Date)
                .ThenByDescending(wd => wd.CreatedAt)
                .ToListAsync();

            return new ApiResponse<List<WorkDiaryDto>> { Success = true, Data = list.Select(ToDto).ToList() };
        }

        public async Task<ApiResponse<List<WorkDiaryDto>>> GetAllDiaryAsync(int? filterUserId, int? month, int? year, DateTime? from = null, DateTime? to = null)
        {
            var query = _context.WorkDiaries.Include(wd => wd.User).Include(wd => wd.Project).AsQueryable();

            if (filterUserId.HasValue)
                query = query.Where(wd => wd.UserId == filterUserId.Value);

            query = ApplyDateFilter(query, month, year, from, to);

            var list = await query
                .OrderByDescending(wd => wd.Date)
                .ThenByDescending(wd => wd.CreatedAt)
                .ToListAsync();

            return new ApiResponse<List<WorkDiaryDto>> { Success = true, Data = list.Select(ToDto).ToList() };
        }

        private static IQueryable<WorkDiary> ApplyDateFilter(IQueryable<WorkDiary> query, int? month, int? year, DateTime? from, DateTime? to)
        {
            if (from.HasValue) query = query.Where(wd => wd.Date >= from.Value.Date);
            if (to.HasValue)   query = query.Where(wd => wd.Date <= to.Value.Date);
            if (!from.HasValue && !to.HasValue)
            {
                if (month.HasValue) query = query.Where(wd => wd.Date.Month == month.Value);
                if (year.HasValue)  query = query.Where(wd => wd.Date.Year  == year.Value);
            }
            return query;
        }

        public async Task<ApiResponse<WorkDiaryDto>> AddEntryAsync(int userId, CreateWorkDiaryDto dto)
        {
            var hasDatePrefix = TryGetDatePrefix(dto.Description, out var prefixDate);
            var entryDate = hasDatePrefix ? prefixDate : dto.Date.Date;

            if (hasDatePrefix)
            {
                var today = AppClock.Today;
                if (entryDate >= today)
                    return new ApiResponse<WorkDiaryDto>
                    {
                        Success = false,
                        Message = "Date prefix must reference a previous date."
                    };

                if (CountPastWorkingDays(entryDate, today) > MaxPastWorkingDays)
                    return new ApiResponse<WorkDiaryDto>
                    {
                        Success = false,
                        Message = $"Backdated entries are only allowed up to {MaxPastWorkingDays} past working days."
                    };

                var countForDay = await _context.WorkDiaries
                    .CountAsync(wd => wd.UserId == userId && wd.Date == entryDate);
                if (countForDay >= MaxBackdatedEntriesPerDay)
                    return new ApiResponse<WorkDiaryDto>
                    {
                        Success = false,
                        Message = $"Maximum {MaxBackdatedEntriesPerDay} entries allowed per day."
                    };
            }
            else if (!IsAllowedDate(entryDate))
            {
                return new ApiResponse<WorkDiaryDto>
                {
                    Success = false,
                    Message = "Date must be today or a past working day (Mon–Sat, excl. 2nd/4th Saturdays)."
                };
            }

            var entry = new WorkDiary
            {
                UserId = userId,
                Date = entryDate,
                Description = hasDatePrefix
                    ? DatePrefixRegex.Replace(dto.Description, string.Empty, 1)
                    : dto.Description,
                Category = dto.Category,
                HoursSpent = dto.HoursSpent,
                ProjectId = dto.ProjectId,
                CreatedAt = AppClock.Now,
                UpdatedAt = AppClock.Now
            };

            _context.WorkDiaries.Add(entry);
            await _context.SaveChangesAsync();

            if (entry.ProjectId.HasValue)
                await _context.Entry(entry).Reference(e => e.Project).LoadAsync();

            await NotifyDiaryAsync(entry, userId, "created");

            return new ApiResponse<WorkDiaryDto> { Success = true, Data = ToDto(entry) };
        }

        public async Task<ApiResponse<WorkDiaryDto>> UpdateEntryAsync(int userId, int id, UpdateWorkDiaryDto dto)
        {
            var entry = await _context.WorkDiaries
                .FirstOrDefaultAsync(wd => wd.Id == id && wd.UserId == userId);

            if (entry == null)
                return ApiResponse<WorkDiaryDto>.NotFound("Entry not found or not yours.");

            entry.Description = dto.Description;
            entry.Category = dto.Category;
            entry.HoursSpent = dto.HoursSpent;
            entry.ProjectId = dto.ProjectId;
            entry.UpdatedAt = AppClock.Now;

            await _context.SaveChangesAsync();

            await _context.Entry(entry).Reference(e => e.Project).LoadAsync();

            await NotifyDiaryAsync(entry, userId, "updated");

            return new ApiResponse<WorkDiaryDto> { Success = true, Data = ToDto(entry) };
        }

        public async Task<ApiResponse<bool>> DeleteEntryAsync(int userId, int id)
        {
            var entry = await _context.WorkDiaries
                .FirstOrDefaultAsync(wd => wd.Id == id && wd.UserId == userId);

            if (entry == null)
                return ApiResponse<bool>.NotFound("Entry not found or not yours.");

            _context.WorkDiaries.Remove(entry);
            await _context.SaveChangesAsync();

            return new ApiResponse<bool> { Success = true, Data = true };
        }

        private static WorkDiaryDto ToDto(WorkDiary w) => new()
        {
            Id            = w.Id,
            UserId        = w.UserId,
            UserFullName  = w.User?.FullName ?? string.Empty,
            UserAvatarUrl = w.User?.AvatarUrl,
            Date          = w.Date,
            Description   = w.Description,
            Category      = w.Category,
            HoursSpent    = w.HoursSpent,
            ProjectId     = w.ProjectId,
            ProjectName   = w.Project?.Name,
            CreatedAt     = w.CreatedAt,
            UpdatedAt     = w.UpdatedAt,
        };
    }
}
