using System;
using FluentValidation;
using TaskManagement.DTOs;

namespace TaskManagement.Validators
{
    // Mirrors CLAUDE.md's documented recurrence rules (RecurrenceType + DayOfWeek/DayOfMonth/
    // CustomIntervalDays/StartDate/EndDate) and TemplateForm.tsx:477-495's validateStep1/2.
    public class SaveTaskTemplateDtoValidator : AbstractValidator<SaveTaskTemplateDto>
    {
        public SaveTaskTemplateDtoValidator()
        {
            // Name already [Required, MaxLength(200)] via DataAnnotations — RequiredText adds
            // the whitespace-only rejection DataAnnotations can't express.
            RuleFor(x => x.Name).RequiredText(200, 1);
            RuleFor(x => x.Description).OptionalText(2000);
            RuleFor(x => x.Module).OptionalText(100);
            RuleFor(x => x.RecurrenceType).MustBeOneOf(ValidationConstants.ValidRecurrenceTypes);
            RuleFor(x => x.StartDate).NotEqual(default(DateTime)).WithMessage("A start date is required.");
            RuleFor(x => x.EndDate).GreaterThanOrEqualTo(x => x.StartDate)
                .When(x => x.EndDate.HasValue)
                .WithMessage("End date must be on or after the start date.");
            RuleFor(x => x.DayOfWeek).InclusiveBetween(0, 6).When(x => x.DayOfWeek.HasValue)
                .WithMessage("Day of week must be between 0 (Sunday) and 6 (Saturday).");
            RuleFor(x => x.DayOfMonth).InclusiveBetween(1, 31).When(x => x.DayOfMonth.HasValue)
                .WithMessage("Day of month must be between 1 and 31.");
            RuleForEach(x => x.DaysOfMonth).InclusiveBetween(1, 31)
                .WithMessage("Day of month must be between 1 and 31.");
            RuleFor(x => x.CustomIntervalDays).GreaterThan(0).When(x => x.CustomIntervalDays.HasValue)
                .WithMessage("Custom interval must be a positive number of days.");
            // Cross-field: weekly recurrence needs a day-of-week; monthly needs a day (or
            // days)-of-month; custom needs an interval.
            RuleFor(x => x.DayOfWeek).NotNull()
                .When(x => string.Equals(x.RecurrenceType, "weekly", StringComparison.OrdinalIgnoreCase))
                .WithMessage("Day of week is required for weekly recurrence.");
            RuleFor(x => x)
                .Must(x => x.DayOfMonth.HasValue || (x.DaysOfMonth != null && x.DaysOfMonth.Count > 0))
                .When(x => string.Equals(x.RecurrenceType, "monthly", StringComparison.OrdinalIgnoreCase))
                .WithMessage("At least one day of month is required for monthly recurrence.")
                .WithName("DayOfMonth");
            RuleFor(x => x.CustomIntervalDays).NotNull()
                .When(x => string.Equals(x.RecurrenceType, "custom", StringComparison.OrdinalIgnoreCase))
                .WithMessage("A custom interval is required for custom recurrence.");
            RuleFor(x => x.Items).NotEmpty().WithMessage("A template needs at least one item.");
            RuleForEach(x => x.Items).SetValidator(new SaveTemplateItemDtoValidator());
        }
    }

    public class SaveTemplateItemDtoValidator : AbstractValidator<SaveTemplateItemDto>
    {
        public SaveTemplateItemDtoValidator()
        {
            RuleFor(x => x.Title).RequiredText(200, 1);
            RuleFor(x => x.Description).OptionalText(2000);
            RuleFor(x => x.EstimatedHours).GreaterThan(0)
                .WithMessage("Estimated hours must be greater than 0.")
                .LessThanOrEqualTo(ValidationConstants.MaxEstimatedHours);
            RuleFor(x => x.Priority).MustBeOneOf(ValidationConstants.ValidPriorities);
            RuleFor(x => x.DefaultAssigneeId).NotNull().GreaterThan(0)
                .WithMessage("A default assignee must be selected for every item.");
            RuleFor(x => x.QaReviewerId).GreaterThan(0).When(x => x.QaReviewerId.HasValue)
                .WithMessage("Invalid QA reviewer.");
            RuleFor(x => x.DueDateOffsetDays).GreaterThanOrEqualTo(0)
                .WithMessage("Due-date offset cannot be negative.");
            RuleForEach(x => x.Tags).OptionalText(50);
            RuleForEach(x => x.ChecklistItems).RequiredText(ValidationConstants.TitleMaxLength, 1);
        }
    }

    public class ManualGenerateDtoValidator : AbstractValidator<ManualGenerateDto>
    {
        public ManualGenerateDtoValidator()
        {
            RuleFor(x => x.Notes).OptionalText(1000);
        }
    }
}
