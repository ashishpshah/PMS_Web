using FluentValidation;
using TaskManagement.Services;

namespace TaskManagement.Validators
{
    // ── Auth DTOs live in Services/AuthService.cs and previously had zero DataAnnotations —
    // every rule below was, until now, enforced only client-side (Auth.tsx) or ad hoc inline
    // in AuthController.cs. AuthController is [AllowAnonymous], so these are the app's most
    // exposed, most security-sensitive inputs — treated with the strictest rules in this file.

    public class LoginDtoValidator : AbstractValidator<LoginDto>
    {
        public LoginDtoValidator()
        {
            RuleFor(x => x.Password).RequiredText(200, 1);
            // Exactly one of UsernameOrEmail / Email must be supplied — mirrors Auth.tsx's
            // single "identifier" field, which AuthService.LoginAsync splits on '@' itself.
            RuleFor(x => x)
                .Must(x => !string.IsNullOrWhiteSpace(x.UsernameOrEmail) || !string.IsNullOrWhiteSpace(x.Email))
                .WithMessage("Enter your email, username, or mobile number.")
                .WithName("UsernameOrEmail");
        }
    }

    public class RegisterDtoValidator : AbstractValidator<RegisterDto>
    {
        public RegisterDtoValidator()
        {
            RuleFor(x => x.FirstName).RequiredText(ValidationConstants.NameMaxLength, ValidationConstants.NameMinLength);
            RuleFor(x => x.LastName).RequiredText(ValidationConstants.NameMaxLength, ValidationConstants.NameMinLength);
            RuleFor(x => x.UserName).RequiredText(ValidationConstants.UserNameMaxLength, 3);
            RuleFor(x => x.Email)
                .RequiredText(ValidationConstants.EmailMaxLength)
                .Matches(ValidationConstants.EmailPattern).WithMessage("Enter a valid email address.");
            RuleFor(x => x.ContactNo).MustBeValidContactNumber();
            RuleFor(x => x.Password)
                .RequiredText(200, ValidationConstants.PasswordMinLength)
                .Matches(ValidationConstants.PasswordComplexityPattern)
                    .WithMessage("Password must contain at least one uppercase letter, one lowercase letter, and one digit.");
        }
    }

    public class InitiateRegisterDtoValidator : AbstractValidator<InitiateRegisterDto>
    {
        public InitiateRegisterDtoValidator()
        {
            RuleFor(x => x.FirstName).RequiredText(ValidationConstants.NameMaxLength, ValidationConstants.NameMinLength);
            RuleFor(x => x.LastName).RequiredText(ValidationConstants.NameMaxLength, ValidationConstants.NameMinLength);
            // UserName is optional here, unlike RegisterDtoValidator above: the live registration
            // form (Auth.tsx handleInitiateRegister) never sends a userName field at all, and
            // AuthController.InitiateRegister only checks it for uniqueness when non-blank
            // ("if (!string.IsNullOrWhiteSpace(dto.UserName) && ...)") — it's auto-derived from
            // the email when omitted. Requiring it here rejected every real registration attempt.
            RuleFor(x => x.UserName).OptionalText(ValidationConstants.UserNameMaxLength);
            RuleFor(x => x.Email)
                .RequiredText(ValidationConstants.EmailMaxLength)
                .Matches(ValidationConstants.EmailPattern).WithMessage("Enter a valid email address.");
            RuleFor(x => x.ContactNo).MustBeValidContactNumber();
            RuleFor(x => x.Password)
                .RequiredText(200, ValidationConstants.PasswordMinLength)
                .Matches(ValidationConstants.PasswordComplexityPattern)
                    .WithMessage("Password must contain at least one uppercase letter, one lowercase letter, and one digit.");
        }
    }

    public class ConfirmOtpDtoValidator : AbstractValidator<ConfirmOtpDto>
    {
        public ConfirmOtpDtoValidator()
        {
            RuleFor(x => x.Email)
                .RequiredText(ValidationConstants.EmailMaxLength)
                .Matches(ValidationConstants.EmailPattern).WithMessage("Enter a valid email address.");
            RuleFor(x => x.OtpCode)
                .NotEmpty().WithMessage("OTP code is required.")
                .Length(ValidationConstants.OtpLength).WithMessage($"OTP code must be {ValidationConstants.OtpLength} digits.")
                .Matches(@"^\d+$").WithMessage("OTP code must contain digits only.");
        }
    }

    public class ForgotPasswordDtoValidator : AbstractValidator<ForgotPasswordDto>
    {
        public ForgotPasswordDtoValidator()
        {
            RuleFor(x => x.Email)
                .RequiredText(ValidationConstants.EmailMaxLength)
                .Matches(ValidationConstants.EmailPattern).WithMessage("Enter a valid email address.");
        }
    }

    public class ResetPasswordDtoValidator : AbstractValidator<ResetPasswordDto>
    {
        public ResetPasswordDtoValidator()
        {
            RuleFor(x => x.Email)
                .RequiredText(ValidationConstants.EmailMaxLength)
                .Matches(ValidationConstants.EmailPattern).WithMessage("Enter a valid email address.");
            RuleFor(x => x.OtpCode)
                .NotEmpty().WithMessage("OTP code is required.")
                .Length(ValidationConstants.OtpLength).WithMessage($"OTP code must be {ValidationConstants.OtpLength} digits.")
                .Matches(@"^\d+$").WithMessage("OTP code must contain digits only.");
            RuleFor(x => x.NewPassword)
                .RequiredText(200, ValidationConstants.PasswordMinLength)
                .Matches(ValidationConstants.PasswordComplexityPattern)
                    .WithMessage("Password must contain at least one uppercase letter, one lowercase letter, and one digit.");
        }
    }

    public class RefreshTokenRequestDtoValidator : AbstractValidator<RefreshTokenRequestDto>
    {
        public RefreshTokenRequestDtoValidator()
        {
            RuleFor(x => x.RefreshToken).NotEmpty().WithMessage("Refresh token is required.");
        }
    }
}
