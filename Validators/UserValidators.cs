using FluentValidation;
using TaskManagement.DTOs;

namespace TaskManagement.Validators
{
    // CreateUserDto/UpdateUserDto already carry DataAnnotations (see GeneralDtos.cs) — left in
    // place as defense-in-depth. These FluentValidation validators add what DataAnnotations
    // can't express cleanly: whitespace-only rejection, password complexity parity with
    // Auth.tsx (see ValidationConstants.PasswordComplexityPattern — Users.tsx's admin
    // create-user form previously only enforced length >= 6, not complexity), and RoleId
    // sanity.

    public class CreateUserDtoValidator : AbstractValidator<CreateUserDto>
    {
        public CreateUserDtoValidator()
        {
            RuleFor(x => x.FirstName).RequiredText(ValidationConstants.NameMaxLength, ValidationConstants.NameMinLength);
            RuleFor(x => x.LastName).RequiredText(ValidationConstants.NameMaxLength, ValidationConstants.NameMinLength);
            RuleFor(x => x.Email)
                .RequiredText(ValidationConstants.EmailMaxLength)
                .Matches(ValidationConstants.EmailPattern).WithMessage("Enter a valid email address.");
            RuleFor(x => x.UserName).OptionalText(ValidationConstants.UserNameMaxLength);
            RuleFor(x => x.ContactNo).MustBeValidContactNumber();
            RuleFor(x => x.Password)
                .RequiredText(200, ValidationConstants.PasswordMinLength)
                .Matches(ValidationConstants.PasswordComplexityPattern)
                    .WithMessage("Password must contain at least one uppercase letter, one lowercase letter, and one digit.");
            RuleFor(x => x.RoleId).GreaterThan(0).WithMessage("A role must be selected.");
        }
    }

    public class UpdateUserDtoValidator : AbstractValidator<UpdateUserDto>
    {
        public UpdateUserDtoValidator()
        {
            RuleFor(x => x.FirstName).RequiredText(ValidationConstants.NameMaxLength, ValidationConstants.NameMinLength);
            RuleFor(x => x.LastName).RequiredText(ValidationConstants.NameMaxLength, ValidationConstants.NameMinLength);
            RuleFor(x => x.Email)
                .RequiredText(ValidationConstants.EmailMaxLength)
                .Matches(ValidationConstants.EmailPattern).WithMessage("Enter a valid email address.");
            RuleFor(x => x.UserName).OptionalText(ValidationConstants.UserNameMaxLength);
            RuleFor(x => x.ContactNo).MustBeValidContactNumber();
            RuleFor(x => x.RoleId).GreaterThan(0).WithMessage("A role must be selected.");
        }
    }

    public class SetUserActiveDtoValidator : AbstractValidator<SetUserActiveDto>
    {
        // No fields need validation beyond model binding (bool always binds), but the
        // validator is registered so the pipeline is consistent/extensible if this DTO
        // grows a reason/comment field later.
    }
}
