using System;
using FluentValidation;
using TaskManagement.DTOs;

namespace TaskManagement.Validators
{
    // SendMessageDto/CreateChatRoomDto had zero validation prior to this — Content had no
    // length cap at all despite being persisted and rendered to every room member.
    public class SendMessageDtoValidator : AbstractValidator<SendMessageDto>
    {
        public SendMessageDtoValidator()
        {
            RuleFor(x => x.Content).OptionalText(5000);
            RuleFor(x => x.MessageType).MustBeOneOf(ValidationConstants.ValidChatMessageTypes);
            // A message needs some payload — either text content or an attachment.
            RuleFor(x => x)
                .Must(x => !string.IsNullOrWhiteSpace(x.Content) || x.AttachmentId.HasValue)
                .WithMessage("A message must have text content or an attachment.")
                .WithName("Content");
            RuleFor(x => x.ReplyToId).GreaterThan(0).When(x => x.ReplyToId.HasValue)
                .WithMessage("Invalid reply target.");
            RuleFor(x => x.AttachmentId).GreaterThan(0).When(x => x.AttachmentId.HasValue)
                .WithMessage("Invalid attachment.");
            RuleFor(x => x.RoomId).GreaterThan(0).When(x => x.RoomId.HasValue)
                .WithMessage("Invalid chat room.");
        }
    }

    public class CreateChatRoomDtoValidator : AbstractValidator<CreateChatRoomDto>
    {
        public CreateChatRoomDtoValidator()
        {
            RuleFor(x => x.RoomType).MustBeOneOf(ValidationConstants.ValidChatRoomTypes);
            // Direct-message rooms are typically named automatically from the two members;
            // group/public rooms need an explicit name.
            RuleFor(x => x.Name)
                .RequiredText(100, 1)
                .When(x => !string.Equals(x.RoomType, "direct", StringComparison.OrdinalIgnoreCase));
            RuleFor(x => x.MemberIds).NotEmpty().WithMessage("At least one member is required.");
        }
    }
}
