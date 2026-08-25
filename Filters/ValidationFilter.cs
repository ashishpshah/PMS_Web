using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using FluentValidation;
using FluentValidation.Results;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using TaskManagement.DTOs;

namespace TaskManagement.Filters
{
    /// <summary>
    /// Global action filter that is the single point through which every request must pass
    /// before a controller action runs. It:
    ///   1. Trims every writable string property on every action argument (except properties
    ///      whose name contains "password" — trimming a password could silently change what
    ///      the user intended). Centralizes "Trim input" instead of repeating it per DTO.
    ///   2. Surfaces any ModelState errors already produced by model binding / DataAnnotations
    ///      (malformed JSON, wrong types, [Required]/[StringLength]/etc. failures) — this still
    ///      populates even though the framework's own automatic 400 response is suppressed
    ///      (see Program.cs ApiBehaviorOptions.SuppressModelStateInvalidFilter).
    ///   3. Resolves and runs a FluentValidation IValidator&lt;T&gt; for every action argument
    ///      whose type has one registered in DI.
    /// Both error sources are merged into a single ApiResponse&lt;object&gt; (the app's one
    /// response envelope — see DTOs/GeneralDtos.cs): Message is the space-joined, natural-
    /// language text ("First name is required. Last name is required.") that the app's
    /// showError(err.message) call sites actually display, and Errors carries the same
    /// messages as a list for callers that want to map them back to individual fields.
    /// </summary>
    public class ValidationFilter : IAsyncActionFilter
    {
        private readonly IServiceProvider _serviceProvider;

        public ValidationFilter(IServiceProvider serviceProvider)
        {
            _serviceProvider = serviceProvider;
        }

        public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
        {
            var errors = new List<string>();

            foreach (var arg in context.ActionArguments.Values)
            {
                if (arg == null) continue;
                TrimStringProperties(arg);
            }

            if (!context.ModelState.IsValid)
            {
                foreach (var kvp in context.ModelState)
                {
                    foreach (var err in kvp.Value.Errors)
                    {
                        // err.Exception is populated for JSON/type-conversion failures (e.g. a
                        // string sent where the DTO expects a number) and its .Message is a raw
                        // System.Text.Json/.NET message ("The JSON value could not be converted
                        // to System.Int32. Path: $.roleId ...") — not something to show a client.
                        // Only err.ErrorMessage (set for genuine ModelState/DataAnnotations
                        // failures) is ever client-facing; anything else gets a plain fallback.
                        // err.ErrorMessage (DataAnnotations/model-binding messages) already
                        // reads as a complete, field-aware sentence on its own (e.g. "The
                        // RoleId field is required.") — only the exception fallback needs the
                        // field name built in manually, since it has no subject otherwise.
                        var msg = !string.IsNullOrWhiteSpace(err.ErrorMessage)
                            ? err.ErrorMessage
                            : string.IsNullOrEmpty(kvp.Key)
                                ? "One of the submitted values has an invalid or incorrectly formatted value."
                                : $"{HumanizeFieldPath(kvp.Key)} has an invalid or incorrectly formatted value.";
                        errors.Add(msg);
                    }
                }
            }

            foreach (var arg in context.ActionArguments.Values)
            {
                if (arg == null) continue;
                var argType = arg.GetType();
                var validatorType = typeof(IValidator<>).MakeGenericType(argType);
                if (_serviceProvider.GetService(validatorType) is IValidator validator)
                {
                    var validationContext = new ValidationContext<object>(arg);
                    ValidationResult result = await validator.ValidateAsync(validationContext);
                    if (!result.IsValid)
                    {
                        errors.AddRange(result.Errors.Select(FormatFailure));
                    }
                }
            }

            if (errors.Count > 0)
            {
                var distinctErrors = errors.Distinct().ToList();
                var response = new ApiResponse<object>
                {
                    Success = false,
                    // The app's own error-handling convention (lib/api.ts + the near-universal
                    // showError(err.message) call sites across the frontend) surfaces this
                    // top-level Message, not the structured Errors list below — so Message
                    // itself needs to be the actual, readable validation text ("First name is
                    // required. Last name is required."), not a generic placeholder that hides
                    // the real reason behind a second field almost nothing reads.
                    Message = string.Join(" ", distinctErrors),
                    Errors = distinctErrors,
                    ErrorCode = "VALIDATION_ERROR"
                };
                context.Result = new BadRequestObjectResult(response);
                return;
            }

            await next();
        }

        // FluentValidation messages are self-contained sentences (the shared RequiredText/
        // OptionalText/MustBeOneOf helpers in ValidatorExtensions.cs embed {PropertyName}
        // themselves, resolved to a human label via Program.cs's DisplayNameResolver; explicit
        // per-rule WithMessage(...) calls elsewhere already read fine on their own, e.g. "An
        // owner must be selected.") — so no extra field-name prefix belongs here.
        private static string FormatFailure(ValidationFailure failure) => failure.ErrorMessage;

        /// <summary>
        /// Turns a raw model-binding/FluentValidation field path (C# property names, dotted for
        /// nesting, "[n]" for collection indices — e.g. "Items[0].AssigneeId") into something a
        /// client can actually read ("Items[1] > Assignee Id"), by PascalCase-splitting each
        /// segment and switching indices to a friendly 1-based number.
        /// </summary>
        private static string HumanizeFieldPath(string fieldPath)
        {
            var segments = fieldPath.Split('.', StringSplitOptions.RemoveEmptyEntries);
            var humanized = segments.Select(segment =>
            {
                var indexStart = segment.IndexOf('[');
                var name = indexStart >= 0 ? segment[..indexStart] : segment;
                var suffix = indexStart >= 0 ? segment[indexStart..] : string.Empty;
                if (int.TryParse(suffix.Trim('[', ']'), out var zeroBasedIndex))
                    suffix = $"[{zeroBasedIndex + 1}]";

                var spaced = System.Text.RegularExpressions.Regex.Replace(name, "(?<=[a-z0-9])(?=[A-Z])", " ");
                return string.IsNullOrEmpty(spaced) ? segment : spaced + suffix;
            });
            return string.Join(" > ", humanized);
        }

        /// <summary>
        /// Shallow, one-level string trim over the argument's own writable string properties.
        /// Deliberately shallow (does not recurse into nested objects/collections) to keep this
        /// cheap and predictable — nested DTOs (e.g. SaveTaskTemplateDto.Items) are trimmed by
        /// their own validators' RequiredText/OptionalText rules instead, which already compare
        /// against the trimmed length.
        /// </summary>
        private static void TrimStringProperties(object target)
        {
            var type = target.GetType();
            if (!type.IsClass || type == typeof(string)) return;

            foreach (var prop in type.GetProperties())
            {
                if (prop.PropertyType != typeof(string)) continue;
                if (!prop.CanRead || !prop.CanWrite) continue;
                if (prop.Name.Contains("Password", StringComparison.OrdinalIgnoreCase)) continue;

                if (prop.GetValue(target) is string value)
                {
                    var trimmed = value.Trim();
                    if (trimmed != value) prop.SetValue(target, trimmed);
                }
            }
        }
    }
}
