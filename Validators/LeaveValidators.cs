using System;
using System.Globalization;
using System.Linq;
using FluentValidation;
using TaskManagement.DTOs;

namespace TaskManagement.Validators
{
    // Format/shape/cross-field rules only — DB-dependent business rules (leave-type existence,
    // overlap, no-past-dates, request state) live in Services/LeaveService.cs, matching this
    // app's existing split (e.g. TaskValidators vs TaskService). Note: there is deliberately no
    // balance-sufficiency gate — a request can still be submitted after the annual allocation is
    // fully used; it's the approver's call.
    public class CreateLeaveRequestDtoValidator : AbstractValidator<CreateLeaveRequestDto>
    {
        public CreateLeaveRequestDtoValidator()
        {
            RuleFor(x => x.LeaveTypeId).GreaterThan(0).WithMessage("Leave type is required.");
            RuleFor(x => x.StartDate).NotNull().WithMessage("Start date is required.");
            RuleFor(x => x.EndDate).NotNull().WithMessage("End date is required.")
                .MustBeOnOrAfter(x => x.StartDate, "the start date");
            RuleFor(x => x.Reason).RequiredText(1000, 3);
        }
    }

    // Same rules as CreateLeaveRequestDtoValidator — kept separate since the two DTOs are
    // separate types (see DTOs/GeneralDtos.cs UpdateLeaveRequestDto).
    public class UpdateLeaveRequestDtoValidator : AbstractValidator<UpdateLeaveRequestDto>
    {
        public UpdateLeaveRequestDtoValidator()
        {
            RuleFor(x => x.LeaveTypeId).GreaterThan(0).WithMessage("Leave type is required.");
            RuleFor(x => x.StartDate).NotNull().WithMessage("Start date is required.");
            RuleFor(x => x.EndDate).NotNull().WithMessage("End date is required.")
                .MustBeOnOrAfter(x => x.StartDate, "the start date");
            RuleFor(x => x.Reason).RequiredText(1000, 3);
        }
    }

    public class DecideLeaveRequestDtoValidator : AbstractValidator<DecideLeaveRequestDto>
    {
        public DecideLeaveRequestDtoValidator()
        {
            // A rejection must explain why; an approval note is optional.
            RuleFor(x => x.DecisionNote).RequiredText(1000, 3).When(x => !x.Approve);
            RuleFor(x => x.DecisionNote).OptionalText(1000).When(x => x.Approve);
        }
    }

    public class SetHolidayOverrideDtoValidator : AbstractValidator<SetHolidayOverrideDto>
    {
        private static readonly string[] ValidDayTypes = { "Holiday", "WorkingDay" };

        public SetHolidayOverrideDtoValidator()
        {
            RuleFor(x => x.Name).RequiredText(200, 1);
            RuleFor(x => x.DayType).MustBeOneOf(ValidDayTypes);
        }
    }

    public class SaveLeaveTypeDtoValidator : AbstractValidator<SaveLeaveTypeDto>
    {
        public SaveLeaveTypeDtoValidator()
        {
            RuleFor(x => x.Name).RequiredText(100, 2);
        }
    }

    public class UpdateAnnualLeaveAllocationDtoValidator : AbstractValidator<UpdateAnnualLeaveAllocationDto>
    {
        public UpdateAnnualLeaveAllocationDtoValidator()
        {
            RuleFor(x => x.LeaveDays).GreaterThan(0).LessThanOrEqualTo(365)
                .WithMessage("Leave days must be greater than 0 and at most 365.");
        }
    }

    public class UpdateWorkweekRulesDtoValidator : AbstractValidator<UpdateWorkweekRulesDto>
    {
        private static readonly int[] ValidOccurrences = { 1, 2, 3, 4, 5 };

        public UpdateWorkweekRulesDtoValidator()
        {
            RuleFor(x => x.WorkStartTime).Must(BeAValidTime).WithMessage("Work start time must be in HH:mm format.");
            RuleFor(x => x.WorkEndTime).Must(BeAValidTime).WithMessage("Work end time must be in HH:mm format.");
            RuleFor(x => x)
                .Must(x => ParseTime(x.WorkStartTime) < ParseTime(x.WorkEndTime))
                .WithMessage("Work end time must be after work start time.")
                .When(x => BeAValidTime(x.WorkStartTime) && BeAValidTime(x.WorkEndTime));

            RuleFor(x => x.BreakMinMinutes).InclusiveBetween(0, 240);
            RuleFor(x => x.BreakMaxMinutes).InclusiveBetween(0, 240);
            RuleFor(x => x)
                .Must(x => x.BreakMinMinutes <= x.BreakMaxMinutes)
                .WithMessage("Break minimum must not exceed break maximum.");

            RuleFor(x => x.HolidaySaturdayOccurrences)
                .Must(l => l != null && l.All(v => ValidOccurrences.Contains(v)) && l.Distinct().Count() == l.Count)
                .WithMessage("Holiday Saturday occurrences must be unique values between 1 and 5.");
        }

        private static bool BeAValidTime(string? s) => TimeSpan.TryParseExact(s, "hh\\:mm", CultureInfo.InvariantCulture, out _)
            || TimeSpan.TryParse(s, CultureInfo.InvariantCulture, out _);

        private static TimeSpan ParseTime(string? s) =>
            TimeSpan.TryParseExact(s, "hh\\:mm", CultureInfo.InvariantCulture, out var t) ? t
            : TimeSpan.TryParse(s, CultureInfo.InvariantCulture, out t) ? t
            : TimeSpan.Zero;
    }
}
