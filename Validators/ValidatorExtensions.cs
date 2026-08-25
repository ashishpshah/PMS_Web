using System;
using System.Collections.Generic;
using System.Linq;
using FluentValidation;

namespace TaskManagement.Validators
{
    /// <summary>
    /// Shared FluentValidation rule-builder extensions so common checks (required-and-trimmed
    /// text, "must be one of a known set", Indian-format-agnostic contact numbers, etc.) are
    /// written once and reused across every validator instead of being re-implemented per DTO.
    /// </summary>
    public static class ValidatorExtensions
    {
        /// <summary>Required, non-whitespace-only, trimmed length between min/max.</summary>
        public static IRuleBuilderOptions<T, string?> RequiredText<T>(
            this IRuleBuilder<T, string?> ruleBuilder, int maxLength, int minLength = 1)
        {
            // {PropertyName} is resolved through Program.cs's ValidatorOptions.Global.
            // DisplayNameResolver, which turns "FirstName" into "First name" — so each message
            // reads as one natural, standalone sentence with no separate field-name prefix
            // needed anywhere downstream (see ValidationFilter.FormatFailure).
            return ruleBuilder
                .Must(v => !string.IsNullOrWhiteSpace(v))
                    .WithMessage("{PropertyName} is required and cannot be blank or whitespace-only.")
                .Must(v => string.IsNullOrEmpty(v) || v.Trim().Length >= minLength)
                    .WithMessage($"{{PropertyName}} must be at least {minLength} character(s).")
                .Must(v => string.IsNullOrEmpty(v) || v.Trim().Length <= maxLength)
                    .WithMessage($"{{PropertyName}} must not exceed {maxLength} characters.");
        }

        /// <summary>Optional text — if present (non-null, non-whitespace), enforce a max length.</summary>
        public static IRuleBuilderOptions<T, string?> OptionalText<T>(
            this IRuleBuilder<T, string?> ruleBuilder, int maxLength)
        {
            return ruleBuilder
                .Must(v => v == null || v.Trim().Length <= maxLength)
                .WithMessage($"{{PropertyName}} must not exceed {maxLength} characters.");
        }

        /// <summary>Case-insensitive membership check against a known set of valid values.</summary>
        public static IRuleBuilderOptions<T, string?> MustBeOneOf<T>(
            this IRuleBuilder<T, string?> ruleBuilder, IEnumerable<string> allowed, string? fieldLabel = null)
        {
            var allowedList = allowed.ToList();
            return ruleBuilder.Must(v => v != null && allowedList.Contains(v, StringComparer.OrdinalIgnoreCase))
                .WithMessage(v => $"{fieldLabel ?? "{PropertyName}"} must be one of: {string.Join(", ", allowedList)}.");
        }

        /// <summary>Optional membership check — null/empty is allowed, but a non-empty value must match.</summary>
        public static IRuleBuilderOptions<T, string?> MustBeOneOfOrEmpty<T>(
            this IRuleBuilder<T, string?> ruleBuilder, IEnumerable<string> allowed, string? fieldLabel = null)
        {
            var allowedList = allowed.ToList();
            return ruleBuilder.Must(v => string.IsNullOrWhiteSpace(v) || allowedList.Contains(v, StringComparer.OrdinalIgnoreCase))
                .WithMessage(v => $"{fieldLabel ?? "{PropertyName}"} must be one of: {string.Join(", ", allowedList)}.");
        }

        /// <summary>
        /// Mirrors ClientApp/src/lib/validation.ts validateContact(): optional field, but if
        /// present must match the allowed character set and normalize to 7-15 digits.
        /// </summary>
        public static IRuleBuilderOptions<T, string?> MustBeValidContactNumber<T>(this IRuleBuilder<T, string?> ruleBuilder)
        {
            return ruleBuilder
                .Must(v => string.IsNullOrWhiteSpace(v) || System.Text.RegularExpressions.Regex.IsMatch(v, ValidationConstants.ContactAllowedPattern))
                .WithMessage("Contact number contains invalid characters.")
                .Must(v =>
                {
                    if (string.IsNullOrWhiteSpace(v)) return true;
                    var digits = new string(v.Where(char.IsDigit).ToArray());
                    return digits.Length >= ValidationConstants.ContactMinDigits && digits.Length <= ValidationConstants.ContactMaxDigits;
                })
                .WithMessage($"Contact number must contain {ValidationConstants.ContactMinDigits}-{ValidationConstants.ContactMaxDigits} digits.");
        }

        /// <summary>Positive decimal within a sane upper bound (used for EstimatedHours/ActualHours).</summary>
        public static IRuleBuilderOptions<T, decimal?> MustBeValidHours<T>(this IRuleBuilder<T, decimal?> ruleBuilder, decimal max = ValidationConstants.MaxEstimatedHours)
        {
            return ruleBuilder
                .Must(v => v == null || (v > 0 && v <= max))
                .WithMessage($"Hours must be greater than 0 and at most {max}.");
        }

        /// <summary>End date must not be before start date (both optional/nullable-safe).</summary>
        public static IRuleBuilderOptions<T, DateTime?> MustBeOnOrAfter<T>(
            this IRuleBuilder<T, DateTime?> ruleBuilder, Func<T, DateTime?> start, string startFieldLabel)
        {
            return ruleBuilder.Must((instance, end) =>
            {
                var s = start(instance);
                if (s == null || end == null) return true;
                return end.Value.Date >= s.Value.Date;
            }).WithMessage($"End date must be on or after {startFieldLabel}.");
        }
    }
}
