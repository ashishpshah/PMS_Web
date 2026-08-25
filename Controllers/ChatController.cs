using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TaskManagement.DTOs;
using TaskManagement.Services;

namespace TaskManagement.Controllers
{
    [Authorize]
    [ApiController]
    [Route("api/[controller]")]
    public class ChatController : ControllerBase
    {
        private readonly IChatService _chatService;
        private readonly IWebHostEnvironment _env;

        public ChatController(IChatService chatService, IWebHostEnvironment env)
        {
            _chatService = chatService;
            _env = env;
        }

        [HttpGet("messages")]
        public async Task<IActionResult> GetMessages([FromQuery] int count = 50, [FromQuery] int? beforeId = null, [FromQuery] int? roomId = null)
        {
            var messages = await _chatService.GetRecentMessagesAsync(count, beforeId, roomId);
            return Ok(messages);
        }

        [HttpGet("rooms")]
        public async Task<IActionResult> GetRooms()
        {
            var userId = GetUserId();
            var rooms = await _chatService.GetRoomsForUserAsync(userId);
            return Ok(rooms);
        }

        [HttpPost("rooms")]
        public async Task<IActionResult> CreateRoom([FromBody] CreateChatRoomDto dto)
        {
            var userId = GetUserId();
            var room = await _chatService.CreateRoomAsync(userId, dto);
            return Ok(room);
        }

        [HttpPost("rooms/direct/{otherUserId:int}")]
        public async Task<IActionResult> GetOrCreateDirect(int otherUserId)
        {
            var userId = GetUserId();
            var room = await _chatService.GetOrCreateDirectRoomAsync(userId, otherUserId);
            return Ok(room);
        }

        [HttpPost("upload")]
        [RequestSizeLimit(25_000_000)]
        public async Task<IActionResult> UploadFile(IFormFile file)
        {
            // P2-G: async validate including magic-byte check
            var (valid, error) = await _chatService.ValidateFileAsync(file);
            if (!valid)
                return BadRequest(new { message = error });

            var senderId = GetUserId();
            var placeholderDto = new SendMessageDto { MessageType = "file", Content = null };
            var message = await _chatService.SaveMessageAsync(senderId, placeholderDto);

            var attachment = await _chatService.SaveAttachmentAsync(message.Id, file, _env);
            return Ok(attachment);
        }

        [HttpGet("file/{attachmentId:int}")]
        public async Task<IActionResult> DownloadFile(int attachmentId)
        {
            var attachment = await _chatService.GetAttachmentAsync(attachmentId);
            if (attachment == null) return NotFound();

            // P3-D: prevent path traversal — ensure the resolved path stays within wwwroot
            var wwwRoot  = Path.GetFullPath(_env.WebRootPath);
            var resolved = Path.GetFullPath(Path.Combine(wwwRoot, attachment.FilePath.TrimStart('/').Replace('/', Path.DirectorySeparatorChar)));
            if (!resolved.StartsWith(wwwRoot + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
                return BadRequest(new { message = "Invalid file path." });

            if (!System.IO.File.Exists(resolved))
                return NotFound();

            var stream = System.IO.File.OpenRead(resolved);
            return File(stream, attachment.MimeType, attachment.FileName);
        }

        private int GetUserId()
        {
            var claim = User.FindFirst(ClaimTypes.NameIdentifier)
                        ?? User.FindFirst("sub")
                        ?? User.FindFirst("nameid");
            return int.TryParse(claim?.Value, out var id) ? id : 0;
        }
    }
}
