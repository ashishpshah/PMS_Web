using FluentValidation;
using TaskManagement.DTOs;

namespace TaskManagement.Validators
{
    // ProjectDto (used directly for both Create and Update — no separate Create/Update DTOs
    // exist) had ZERO backend validation prior to this; the frontend only enforced HTML5
    // `required` on Name and Description, with no length caps and no start<=end date check.
    public class ProjectDtoValidator : AbstractValidator<ProjectDto>
    {
        public ProjectDtoValidator()
        {
            RuleFor(x => x.Name).RequiredText(200, 2);
            RuleFor(x => x.Description).RequiredText(4000, 1);
            RuleFor(x => x.Status).MustBeOneOf(ValidationConstants.ValidProjectStatuses);
            RuleFor(x => x.OwnerId).GreaterThan(0).WithMessage("An owner must be selected.");
            RuleFor(x => x.EndDate).MustBeOnOrAfter(x => x.StartDate, "the start date");
            RuleForEach(x => x.Modules).OptionalText(100);
        }
    }

    public class ReassignProjectDtoValidator : AbstractValidator<ReassignProjectDto>
    {
        public ReassignProjectDtoValidator()
        {
            RuleFor(x => x.NewOwnerId).GreaterThan(0).WithMessage("A new owner must be selected.");
            RuleFor(x => x.ReasonTag).MustBeOneOf(ValidationConstants.ValidReasonTags);
        }
    }
}
