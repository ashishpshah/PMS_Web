using FluentValidation;
using TaskManagement.DTOs;

namespace TaskManagement.Validators
{
    // Mirrors ClientApp/src/lib/utils.ts MAX_HOURS_PER_ENTRY (24h/day cap) and
    // Diary.tsx's per-row required description/hours/category checks.
    public class CreateWorkDiaryDtoValidator : AbstractValidator<CreateWorkDiaryDto>
    {
        public CreateWorkDiaryDtoValidator()
        {
            RuleFor(x => x.Description).RequiredText(2000, 1);
            RuleFor(x => x.Category).OptionalText(100);
            RuleFor(x => x.HoursSpent).MustBeValidHours(24);
            RuleFor(x => x.ProjectId).GreaterThan(0).When(x => x.ProjectId.HasValue)
                .WithMessage("Invalid project.");
            RuleFor(x => x.Date).LessThanOrEqualTo(System.DateTime.UtcNow.AddDays(1))
                .WithMessage("Date cannot be in the future.");
        }
    }

    public class UpdateWorkDiaryDtoValidator : AbstractValidator<UpdateWorkDiaryDto>
    {
        public UpdateWorkDiaryDtoValidator()
        {
            RuleFor(x => x.Description).RequiredText(2000, 1);
            RuleFor(x => x.Category).OptionalText(100);
            RuleFor(x => x.HoursSpent).MustBeValidHours(24);
            RuleFor(x => x.ProjectId).GreaterThan(0).When(x => x.ProjectId.HasValue)
                .WithMessage("Invalid project.");
        }
    }
}
