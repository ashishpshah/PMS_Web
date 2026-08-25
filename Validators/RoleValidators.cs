using FluentValidation;
using TaskManagement.DTOs;

namespace TaskManagement.Validators
{
    // RoleDto (used for both create AND update via RolesController.Save) had ZERO validation
    // on either the frontend (Roles.tsx has no HTML5 or JS validation attributes at all) or the
    // backend prior to this — the weakest surface found in the audit. Name/Code/Level are now
    // enforced server-side even though the frontend still lets them through unchecked.
    public class RoleDtoValidator : AbstractValidator<RoleDto>
    {
        public RoleDtoValidator()
        {
            RuleFor(x => x.Name).RequiredText(100, 2);
            RuleFor(x => x.Code)
                .OptionalText(20)
                .Matches(@"^[A-Za-z0-9_-]*$").WithMessage("Code may only contain letters, numbers, hyphens, and underscores.");
            RuleFor(x => x.Level).InclusiveBetween(1, 100).WithMessage("Level must be between 1 and 100.");
            RuleFor(x => x.Description).OptionalText(500);
        }
    }
}
