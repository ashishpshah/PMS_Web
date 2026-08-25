using AutoMapper;
using TaskManagement.Data;
using TaskManagement.DTOs;
using TaskManagement.Services;
using System.Linq;

namespace TaskManagement.Mappings
{
    public class MappingProfile : Profile
    {
        public MappingProfile()
        {
            CreateMap<User, UserDto>()
                .ForMember(dest => dest.RoleName, opt => opt.MapFrom(src => src.Role != null ? src.Role.Name : null))
                .ForMember(dest => dest.IsAdmin, opt => opt.MapFrom(src => src.RoleId == 1 || (src.Role != null && src.Role.IsAdmin)));

            CreateMap<CreateUserDto, User>()
                .ForMember(dest => dest.PasswordHash, opt => opt.Ignore());

            CreateMap<UpdateUserDto, User>();

            CreateMap<Role, RoleDto>()
                .ReverseMap()
                .ForMember(dest => dest.Id, opt => opt.Ignore());

            CreateMap<Project, ProjectDto>()
                .ForMember(dest => dest.OwnerId, opt => opt.MapFrom(src => src.OwnerId))
                .ForMember(dest => dest.OwnerName, opt => opt.MapFrom(src => src.Owner != null ? src.Owner.FullName : null))
                .ForMember(dest => dest.CreatedByName, opt => opt.MapFrom(src => src.CreatedBy != null ? src.CreatedBy.FullName : null))
                .ForMember(dest => dest.MemberCount, opt => opt.MapFrom(src => src.Members.Count))
                .ForMember(dest => dest.MemberIds, opt => opt.MapFrom(src => src.Members.Select(m => m.UserId).ToList()))
                .ForMember(dest => dest.Members, opt => opt.MapFrom(src => src.Members.Select(m => new ProjectMemberDto
                {
                    UserId = m.UserId,
                    FullName = m.User != null ? m.User.FullName : string.Empty,
                    Email = m.User != null ? m.User.Email : null,
                    AvatarUrl = m.User != null ? m.User.AvatarUrl : null,
                    RoleInProject = m.RoleInProject
                }).ToList()))
                .ForMember(dest => dest.TaskCount, opt => opt.MapFrom(src => src.Tasks.Count))
                .ForMember(dest => dest.Modules, opt => opt.MapFrom(src => src.Modules.Select(m => m.Name).ToList()))
                .ForMember(dest => dest.Progress, opt => opt.Ignore())
                .ForMember(dest => dest.AssignmentHistory, opt => opt.Ignore());

            CreateMap<TaskComment, TaskCommentDto>()
                .ForMember(dest => dest.UserName, opt => opt.MapFrom(src => src.User != null ? src.User.FullName : string.Empty))
                .ForMember(dest => dest.AvatarUrl, opt => opt.MapFrom(src => src.User != null ? src.User.AvatarUrl : null))
                .ForMember(dest => dest.Text, opt => opt.MapFrom(src => src.Content))
                .ForMember(dest => dest.Timestamp, opt => opt.MapFrom(src => src.CreatedAt));

            CreateMap<TaskBlockEntry, TaskBlockEntryDto>()
                .ForMember(dest => dest.BlockedByName, opt => opt.MapFrom(src => src.BlockedBy != null ? src.BlockedBy.FullName : src.BlockedByName));

            CreateMap<TaskEntity, TaskDto>()
                .ForMember(dest => dest.ProjectName, opt => opt.MapFrom(src => src.Project != null ? src.Project.Name : null))
                .ForMember(dest => dest.ProjectCode, opt => opt.MapFrom(src => src.Project != null ? src.Project.Code : null))
                .ForMember(dest => dest.AssignedToName, opt => opt.MapFrom(src => src.AssignedTo != null ? src.AssignedTo.FullName : null))
                .ForMember(dest => dest.AssignedToAvatarUrl, opt => opt.MapFrom(src => src.AssignedTo != null ? src.AssignedTo.AvatarUrl : null))
                .ForMember(dest => dest.CreatedByName, opt => opt.MapFrom(src => src.CreatedBy != null ? src.CreatedBy.FullName : null))
                .ForMember(dest => dest.StartedByName, opt => opt.MapFrom(src => src.StartedBy != null ? src.StartedBy.FullName : null))
                .ForMember(dest => dest.QaAssigneeName, opt => opt.MapFrom(src => src.QaAssignee != null ? src.QaAssignee.FullName : null))
                .ForMember(dest => dest.ParentTaskTitle, opt => opt.MapFrom(src => src.ParentTask != null ? src.ParentTask.Title : null))
                .ForMember(dest => dest.ChildTasks, opt => opt.MapFrom(src => src.ChildTasks.Select(c => new LinkedTaskDto {
                    Id = c.Id,
                    Code = c.Code,
                    Title = c.Title,
                    Status = c.Status,
                    AssignedToId = c.AssignedToId,
                    AssignedToName = c.AssignedTo != null ? c.AssignedTo.FullName : null
                }).ToList()))
                .ForMember(dest => dest.Tags, opt => opt.MapFrom(src => src.Tags.Select(t => t.Tag).ToList()))
                .ForMember(dest => dest.CommentCount, opt => opt.MapFrom(src => src.Comments.Count))
                .ForMember(dest => dest.Comments, opt => opt.MapFrom(src => src.Comments))
                .ForMember(dest => dest.ChecklistItems, opt => opt.Ignore())
                .ForMember(dest => dest.AssignmentHistory, opt => opt.Ignore())
                .ForMember(dest => dest.IsBlocked, opt => opt.Ignore())
                .ForMember(dest => dest.BlockEntries, opt => opt.Ignore())
                .ForMember(dest => dest.ConditionHistory, opt => opt.Ignore())
                .ForMember(dest => dest.IssueEntries, opt => opt.Ignore())
                .ForMember(dest => dest.ReviewIssues, opt => opt.Ignore())
                .ForMember(dest => dest.ReviewChecklistItems, opt => opt.Ignore())
                .ForMember(dest => dest.BlockChecklistItems, opt => opt.Ignore())
                .ForMember(dest => dest.HasIssues, opt => opt.MapFrom(src => src.HasIssues))
                .ForMember(dest => dest.IsPaused, opt => opt.MapFrom(src => src.IsPaused))
                .ForMember(dest => dest.PauseReason, opt => opt.MapFrom(src => src.PauseReason))
                .ForMember(dest => dest.IsOverdue, opt => opt.MapFrom(src =>
                    src.DueDate.HasValue && src.DueDate.Value < AppClock.Now
                    && src.Status != "completed"));

            CreateMap<ChecklistItem, ChecklistItemDto>()
                .ForMember(dest => dest.CompletedByName, opt => opt.MapFrom(src => src.CompletedBy != null ? src.CompletedBy.FullName : null));

            CreateMap<CreateTaskDto, TaskEntity>()
                .ForMember(dest => dest.Tags, opt => opt.Ignore())
                .ForMember(dest => dest.Progress, opt => opt.Ignore())
                .ForMember(dest => dest.CreatedAt, opt => opt.Ignore())
                .ForMember(dest => dest.CreatedById, opt => opt.Ignore());
        }
    }
}
