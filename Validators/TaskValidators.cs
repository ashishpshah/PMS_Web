using System.Linq;
using FluentValidation;
using TaskManagement.DTOs;

namespace TaskManagement.Validators
{
    // CreateTaskDto is reused for BOTH Create and Update (TasksController.cs:59,76 both bind
    // it) — rules here apply to both. The one frontend rule intentionally NOT duplicated here
    // is "≥1 checklist item required" (Tasks.tsx:830-834), because the DTO's own comment states
    // it's "ignored on updates" — since Create and Update share this exact DTO type with no
    // action-aware RuleSet split, enforcing it here would incorrectly block updates too. It
    // remains a service-layer/create-path concern (see report "Remaining validation gaps").
    public class CreateTaskDtoValidator : AbstractValidator<CreateTaskDto>
    {
        public CreateTaskDtoValidator()
        {
            RuleFor(x => x.Title).RequiredText(ValidationConstants.TitleMaxLength, 2);
            RuleFor(x => x.Description).RequiredText(4000, 1);
            RuleFor(x => x.ProjectId).GreaterThan(0).WithMessage("A project must be selected.");
            RuleFor(x => x.Status).MustBeOneOfOrEmpty(ValidationConstants.ValidTaskStatuses);
            RuleFor(x => x.Priority).MustBeOneOfOrEmpty(ValidationConstants.ValidPriorities);
            // Mirrors Tasks.tsx:823-827 — every task must carry a positive estimate. The
            // existing [Range(0.01, 100000)] only fires when a value IS supplied (Range does
            // not enforce presence on a nullable decimal), so a request omitting the field
            // entirely previously slipped through — closed here with NotNull.
            RuleFor(x => x.EstimatedHours).NotNull().WithMessage("Estimated hours are required.");
            RuleFor(x => x.EstimatedHours).MustBeValidHours();
            RuleFor(x => x.ActualHours).MustBeValidHours();
            RuleFor(x => x.Module).OptionalText(100);
            RuleForEach(x => x.Tags).OptionalText(50);
            RuleFor(x => x.ParentTaskId).GreaterThan(0).When(x => x.ParentTaskId.HasValue)
                .WithMessage("Invalid parent task.");
            RuleFor(x => x.QaAssigneeId).GreaterThan(0).When(x => x.QaAssigneeId.HasValue)
                .WithMessage("Invalid QA reviewer.");
            // Cross-field rule: a QA reviewer must be selected whenever QA review is required.
            RuleFor(x => x.QaAssigneeId)
                .NotNull()
                .When(x => x.RequiresQA)
                .WithMessage("A QA reviewer must be selected when QA review is required.");
        }
    }

    public class ChangeStatusDtoValidator : AbstractValidator<ChangeStatusDto>
    {
        public ChangeStatusDtoValidator()
        {
            RuleFor(x => x.ToStatus).RequiredText(30, 1).MustBeOneOf(ValidationConstants.ValidTaskStatuses);
            RuleFor(x => x.Reason).OptionalText(1000);
            // The precise "which edges require ActualHours" matrix is a business rule owned
            // by Services/TaskService.cs (AllowedEdges / ValidateStatusTransition) — duplicating
            // it here risks the two definitions drifting apart, so only a basic positivity
            // sanity-check is applied at this layer; the per-edge requirement itself stays the
            // single source of truth in TaskService.
            RuleFor(x => x.ActualHours).MustBeValidHours(ValidationConstants.MaxActualHours);
            // Mirrors TaskService.cs ChangeStatusAsync (documented in CLAUDE.md): moving to
            // "blocked" requires ≥1 block item, each with a valid category and non-blank
            // description — this rule IS static/unconditional-on-edge, so it's safe to mirror.
            When(x => x.ToStatus != null && x.ToStatus.Equals("blocked", System.StringComparison.OrdinalIgnoreCase), () =>
            {
                RuleFor(x => x.BlockItems)
                    .NotNull().WithMessage("At least one block reason is required.")
                    .Must(items => items != null && items.Count > 0).WithMessage("At least one block reason is required.");
                RuleForEach(x => x.BlockItems).SetValidator(new AddBlockChecklistItemDtoValidator());
            });
        }
    }

    public class ReassignTaskDtoValidator : AbstractValidator<ReassignTaskDto>
    {
        public ReassignTaskDtoValidator()
        {
            RuleFor(x => x.NewAssigneeId).GreaterThan(0).When(x => x.NewAssigneeId.HasValue)
                .WithMessage("Invalid assignee.");
            RuleFor(x => x.ReasonTag).MustBeOneOf(ValidationConstants.ValidReasonTags);
        }
    }

    public class CreateTaskCommentDtoValidator : AbstractValidator<CreateTaskCommentDto>
    {
        public CreateTaskCommentDtoValidator()
        {
            RuleFor(x => x.Text).RequiredText(4000, 1);
        }
    }

    public class CreateChecklistItemDtoValidator : AbstractValidator<CreateChecklistItemDto>
    {
        public CreateChecklistItemDtoValidator()
        {
            RuleFor(x => x.Title).RequiredText(ValidationConstants.TitleMaxLength, 1);
            RuleFor(x => x.OrderIndex).GreaterThanOrEqualTo(0);
        }
    }

    public class UpdateChecklistItemDtoValidator : AbstractValidator<UpdateChecklistItemDto>
    {
        public UpdateChecklistItemDtoValidator()
        {
            RuleFor(x => x.Title).RequiredText(ValidationConstants.TitleMaxLength, 1);
            RuleFor(x => x.OrderIndex).GreaterThanOrEqualTo(0);
        }
    }

    public class ReorderChecklistItemDtoValidator : AbstractValidator<ReorderChecklistItemDto>
    {
        public ReorderChecklistItemDtoValidator()
        {
            RuleFor(x => x.ItemId).GreaterThan(0);
            RuleFor(x => x.OrderIndex).GreaterThanOrEqualTo(0);
        }
    }

    public class SetTaskBlockDtoValidator : AbstractValidator<SetTaskBlockDto>
    {
        public SetTaskBlockDtoValidator()
        {
            RuleFor(x => x.Reason).OptionalText(1000);
            When(x => x.IsBlocked, () =>
            {
                RuleFor(x => x.BlockItems)
                    .NotNull().WithMessage("At least one block reason is required.")
                    .Must(items => items != null && items.Count > 0).WithMessage("At least one block reason is required.");
                RuleForEach(x => x.BlockItems).SetValidator(new AddBlockChecklistItemDtoValidator());
            });
        }
    }

    public class ToggleConditionDtoValidator : AbstractValidator<ToggleConditionDto>
    {
        public ToggleConditionDtoValidator()
        {
            // [Required] already covers presence; this closes the "must be one of X" gap that
            // DataAnnotations can't express — mirrors the "HasIssues" | "IsPaused" comment on
            // the DTO itself (GeneralDtos.cs:592).
            RuleFor(x => x.ConditionName).MustBeOneOf(new[] { "HasIssues", "IsPaused" });
            RuleFor(x => x.Reason).OptionalText(500);
        }
    }

    // AddIssueEntryDto / ResolveIssueEntryDto / AddReviewIssueDto / ResolveReviewIssueDto
    // already have adequate [Required]/[MaxLength] DataAnnotations (GeneralDtos.cs) with no
    // "must be one of a set" fields — intentionally not duplicated into FluentValidation here.

    public class SetReviewChecklistItemResultDtoValidator : AbstractValidator<SetReviewChecklistItemResultDto>
    {
        public SetReviewChecklistItemResultDtoValidator()
        {
            // Closes the same DataAnnotations gap as ToggleConditionDto above.
            RuleFor(x => x.Status).MustBeOneOf(ValidationConstants.ValidReviewChecklistStatuses);
        }
    }

    public class AddBlockChecklistItemDtoValidator : AbstractValidator<AddBlockChecklistItemDto>
    {
        public AddBlockChecklistItemDtoValidator()
        {
            RuleFor(x => x.Category).MustBeOneOf(ValidationConstants.ValidBlockCategories);
            // Description/Comment/ExpectedResolution length caps already enforced via
            // [Required]/[MaxLength] DataAnnotations on this DTO.
        }
    }
}
