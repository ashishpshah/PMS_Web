using Microsoft.EntityFrameworkCore;
using TaskManagement.Data;
using TaskManagement.DTOs;

namespace TaskManagement.Services
{
    public interface IChatService
    {
        Task<List<ChatMessageDto>> GetRecentMessagesAsync(int count = 50, int? beforeId = null, int? roomId = null);
        Task<ChatMessageDto> SaveMessageAsync(int senderId, SendMessageDto dto);
        Task<ChatAttachmentDto> SaveAttachmentAsync(int messageId, IFormFile file, IWebHostEnvironment env);
        Task<ChatAttachment?> GetAttachmentAsync(int attachmentId);
        Task<(bool valid, string error)> ValidateFileAsync(IFormFile file);
        Task<List<ChatRoomDto>> GetRoomsForUserAsync(int userId);
        Task<ChatRoomDto> CreateRoomAsync(int createdById, CreateChatRoomDto dto);
        Task<ChatRoomDto?> GetOrCreateDirectRoomAsync(int userId, int otherUserId);
        Task<bool> IsMemberAsync(int roomId, int userId);
    }

    public class ChatService : IChatService
    {
        private readonly PMSDbContext _db;

        private static readonly HashSet<string> AllowedExtensions = new(StringComparer.OrdinalIgnoreCase)
        {
            ".jpg", ".jpeg", ".png", ".gif", ".webp",
            ".mp4", ".mov", ".webm",
            ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
            ".zip", ".rar", ".7z",
            ".txt", ".csv", ".json", ".xml"
        };

        private const long MaxFileSizeBytes = 20 * 1024 * 1024; // 20 MB

        public ChatService(PMSDbContext db)
        {
            _db = db;
        }

        public async Task<List<ChatMessageDto>> GetRecentMessagesAsync(int count = 50, int? beforeId = null, int? roomId = null)
        {
            var query = _db.ChatMessages
                .Where(m => !m.IsDeleted && m.RoomId == roomId)
                .Include(m => m.Sender)
                .Include(m => m.Attachment)
                .Include(m => m.ReplyTo)
                    .ThenInclude(r => r != null ? r.Sender : null)
                .Include(m => m.ReplyTo)
                    .ThenInclude(r => r != null ? r.Attachment : null)
                .AsQueryable();

            if (beforeId.HasValue)
                query = query.Where(m => m.Id < beforeId.Value);

            var messages = await query
                .OrderByDescending(m => m.SentAt)
                .Take(count)
                .ToListAsync();

            return messages
                .OrderBy(m => m.SentAt)
                .Select(MapToDto)
                .ToList();
        }

        public async Task<List<ChatRoomDto>> GetRoomsForUserAsync(int userId)
        {
            // P4-B: load only the most recent message per room instead of all messages
            var rooms = await _db.ChatRooms
                .Where(r => r.RoomType == "public" || r.Members.Any(m => m.UserId == userId))
                .Include(r => r.Members).ThenInclude(m => m.User)
                .ToListAsync();

            var roomIds = rooms.Select(r => r.Id).ToList();

            // Fetch last message per room in a single query via window-function-friendly sub-select
            var lastMessages = await _db.ChatMessages
                .Where(m => !m.IsDeleted && m.RoomId != null && roomIds.Contains(m.RoomId.Value))
                .Include(m => m.Sender)
                .Include(m => m.Attachment)
                .GroupBy(m => m.RoomId)
                .Select(g => g.OrderByDescending(m => m.SentAt).First())
                .ToListAsync();

            var lastByRoom = lastMessages
                .Where(m => m.RoomId.HasValue)
                .ToDictionary(m => m.RoomId!.Value, m => m);

            return rooms.Select(r =>
            {
                lastByRoom.TryGetValue(r.Id, out var last);
                return new ChatRoomDto
                {
                    Id = r.Id,
                    Name = r.RoomType == "direct"
                        ? r.Members.FirstOrDefault(m => m.UserId != userId)?.User?.FullName ?? r.Name
                        : r.Name,
                    RoomType = r.RoomType,
                    CreatedById = r.CreatedById,
                    CreatedAt = r.CreatedAt,
                    Members = r.Members.Select(m => new ChatRoomMemberDto
                    {
                        UserId = m.UserId,
                        UserName = m.User?.FullName ?? string.Empty,
                        AvatarUrl = m.User?.AvatarUrl
                    }).ToList(),
                    LastMessage = last != null ? MapToDto(last) : null
                };
            }).OrderByDescending(r => r.LastMessage?.SentAt ?? DateTime.MinValue).ToList();
        }

        public async Task<ChatRoomDto> CreateRoomAsync(int createdById, CreateChatRoomDto dto)
        {
            var room = new ChatRoom
            {
                Name = dto.Name,
                RoomType = dto.RoomType,
                CreatedById = createdById,
                CreatedAt = AppClock.Now
            };
            _db.ChatRooms.Add(room);
            await _db.SaveChangesAsync();

            var memberIds = dto.MemberIds.Distinct().ToList();
            if (!memberIds.Contains(createdById)) memberIds.Add(createdById);
            foreach (var uid in memberIds)
                _db.ChatRoomMembers.Add(new ChatRoomMember { RoomId = room.Id, UserId = uid });
            await _db.SaveChangesAsync();

            return await GetRoomDtoAsync(room.Id, createdById);
        }

        public async Task<ChatRoomDto?> GetOrCreateDirectRoomAsync(int userId, int otherUserId)
        {
            // P4-G: use Count() on the sub-table directly (EF Core translates this to SQL correctly)
            var existing = await _db.ChatRooms
                .Where(r => r.RoomType == "direct"
                    && r.Members.Any(m => m.UserId == userId)
                    && r.Members.Any(m => m.UserId == otherUserId)
                    && r.Members.Count(m => m.RoomId == r.Id) == 2)
                .Include(r => r.Members).ThenInclude(m => m.User)
                .FirstOrDefaultAsync();

            if (existing != null)
                return await GetRoomDtoAsync(existing.Id, userId);

            var otherUser = await _db.Users.FindAsync(otherUserId);
            var me = await _db.Users.FindAsync(userId);
            var room = new ChatRoom
            {
                Name = $"{me?.FullName}_{otherUser?.FullName}",
                RoomType = "direct",
                CreatedById = userId,
                CreatedAt = AppClock.Now
            };
            _db.ChatRooms.Add(room);
            await _db.SaveChangesAsync();
            _db.ChatRoomMembers.Add(new ChatRoomMember { RoomId = room.Id, UserId = userId });
            _db.ChatRoomMembers.Add(new ChatRoomMember { RoomId = room.Id, UserId = otherUserId });
            await _db.SaveChangesAsync();
            return await GetRoomDtoAsync(room.Id, userId);
        }

        public async Task<bool> IsMemberAsync(int roomId, int userId)
        {
            // P4-D: check room type and membership with a single targeted query — no entity load
            var roomType = await _db.ChatRooms
                .Where(r => r.Id == roomId)
                .Select(r => (string?)r.RoomType)
                .FirstOrDefaultAsync();

            if (roomType == null) return false;
            if (roomType == "public") return true;

            return await _db.ChatRoomMembers.AnyAsync(m => m.RoomId == roomId && m.UserId == userId);
        }

        private async Task<ChatRoomDto> GetRoomDtoAsync(int roomId, int requestingUserId)
        {
            var room = await _db.ChatRooms
                .Include(r => r.Members).ThenInclude(m => m.User)
                .Include(r => r.Messages.Where(m => !m.IsDeleted)).ThenInclude(m => m.Sender)
                .FirstAsync(r => r.Id == roomId);
            var last = room.Messages.OrderByDescending(m => m.SentAt).FirstOrDefault();
            return new ChatRoomDto
            {
                Id = room.Id,
                Name = room.RoomType == "direct"
                    ? room.Members.FirstOrDefault(m => m.UserId != requestingUserId)?.User?.FullName ?? room.Name
                    : room.Name,
                RoomType = room.RoomType,
                CreatedById = room.CreatedById,
                CreatedAt = room.CreatedAt,
                Members = room.Members.Select(m => new ChatRoomMemberDto
                {
                    UserId = m.UserId,
                    UserName = m.User?.FullName ?? string.Empty,
                    AvatarUrl = m.User?.AvatarUrl
                }).ToList(),
                LastMessage = last != null ? MapToDto(last) : null
            };
        }

        public async Task<ChatMessageDto> SaveMessageAsync(int senderId, SendMessageDto dto)
        {
            var message = new ChatMessage
            {
                Content = dto.Content,
                SenderId = senderId,
                MessageType = dto.MessageType ?? "text",
                SentAt = AppClock.Now,
                ReplyToId = dto.ReplyToId
            };

            _db.ChatMessages.Add(message);
            await _db.SaveChangesAsync();

            // If an attachment was pre-uploaded, link it
            if (dto.AttachmentId.HasValue)
            {
                var attachment = await _db.ChatAttachments.FindAsync(dto.AttachmentId.Value);
                if (attachment != null)
                {
                    attachment.MessageId = message.Id;
                    message.MessageType = "file";
                    await _db.SaveChangesAsync();
                }
            }

            // Reload with all includes
            var saved = await _db.ChatMessages
                .Where(m => m.Id == message.Id)
                .Include(m => m.Sender)
                .Include(m => m.Attachment)
                .Include(m => m.ReplyTo)
                    .ThenInclude(r => r != null ? r.Sender : null)
                .FirstAsync();

            return MapToDto(saved);
        }

        public async Task<ChatAttachmentDto> SaveAttachmentAsync(int messageId, IFormFile file, IWebHostEnvironment env)
        {
            var ext = Path.GetExtension(file.FileName);
            var storedName = $"{Guid.NewGuid()}{ext}";
            var now = AppClock.Now;
            var relativeDir = Path.Combine("chat-uploads", now.Year.ToString(), now.Month.ToString("D2"));
            var absoluteDir = Path.Combine(env.WebRootPath, relativeDir);

            Directory.CreateDirectory(absoluteDir);

            var absolutePath = Path.Combine(absoluteDir, storedName);
            using (var stream = new FileStream(absolutePath, FileMode.Create))
            {
                await file.CopyToAsync(stream);
            }

            var relativeUrl = "/" + relativeDir.Replace('\\', '/') + "/" + storedName;

            var attachment = new ChatAttachment
            {
                MessageId = messageId,
                FileName = file.FileName,
                StoredFileName = storedName,
                FilePath = relativeUrl,
                FileType = GetFileCategory(ext),
                FileSize = file.Length,
                MimeType = file.ContentType
            };

            _db.ChatAttachments.Add(attachment);
            await _db.SaveChangesAsync();

            return new ChatAttachmentDto
            {
                Id = attachment.Id,
                FileName = attachment.FileName,
                FileType = attachment.FileType,
                FileSize = attachment.FileSize,
                MimeType = attachment.MimeType,
                Url = relativeUrl
            };
        }

        public async Task<ChatAttachment?> GetAttachmentAsync(int attachmentId)
        {
            return await _db.ChatAttachments.FindAsync(attachmentId);
        }

        // Maps allowed extensions to the magic bytes we expect at offset 0.
        // A null value means "no magic-byte check required" (plain-text types).
        private static readonly Dictionary<string, byte[]?> MagicBytes = new(StringComparer.OrdinalIgnoreCase)
        {
            { ".jpg",  new byte[] { 0xFF, 0xD8, 0xFF } },
            { ".jpeg", new byte[] { 0xFF, 0xD8, 0xFF } },
            { ".png",  new byte[] { 0x89, 0x50, 0x4E, 0x47 } },
            { ".gif",  new byte[] { 0x47, 0x49, 0x46, 0x38 } },
            { ".webp", new byte[] { 0x52, 0x49, 0x46, 0x46 } },  // RIFF header
            { ".pdf",  new byte[] { 0x25, 0x50, 0x44, 0x46 } },  // %PDF
            { ".zip",  new byte[] { 0x50, 0x4B, 0x03, 0x04 } },
            { ".rar",  new byte[] { 0x52, 0x61, 0x72, 0x21 } },
            { ".7z",   new byte[] { 0x37, 0x7A, 0xBC, 0xAF } },
            { ".docx", new byte[] { 0x50, 0x4B, 0x03, 0x04 } },  // ZIP-based
            { ".xlsx", new byte[] { 0x50, 0x4B, 0x03, 0x04 } },
            { ".pptx", new byte[] { 0x50, 0x4B, 0x03, 0x04 } },
            { ".mp4",  new byte[] { 0x00, 0x00, 0x00 } },        // ftyp box – first 3 bytes
            { ".mov",  new byte[] { 0x00, 0x00, 0x00 } },
            { ".webm", new byte[] { 0x1A, 0x45, 0xDF, 0xA3 } },
            { ".doc",  null },  // Legacy OLE — skip magic check
            { ".xls",  null },
            { ".ppt",  null },
            { ".txt",  null },
            { ".csv",  null },
            { ".json", null },
            { ".xml",  null },
        };

        public async Task<(bool valid, string error)> ValidateFileAsync(IFormFile file)
        {
            if (file == null || file.Length == 0)
                return (false, "No file provided.");

            if (file.Length > MaxFileSizeBytes)
                return (false, "File exceeds 20 MB limit.");

            var ext = Path.GetExtension(file.FileName);
            if (string.IsNullOrEmpty(ext) || !AllowedExtensions.Contains(ext))
                return (false, $"File type '{ext}' is not allowed.");

            // P2-G: validate magic bytes so a renamed executable is rejected
            if (MagicBytes.TryGetValue(ext, out var magic) && magic != null)
            {
                var header = new byte[magic.Length];
                using var stream = file.OpenReadStream();
                var read = await stream.ReadAsync(header, 0, header.Length);
                if (read < header.Length)
                    return (false, "File is too small or corrupt.");
                for (var i = 0; i < magic.Length; i++)
                {
                    if (header[i] != magic[i])
                        return (false, $"File content does not match the declared type '{ext}'.");
                }
            }

            return (true, string.Empty);
        }

        private static string GetFileCategory(string ext) => ext.ToLowerInvariant() switch
        {
            ".jpg" or ".jpeg" or ".png" or ".gif" or ".webp" => "image",
            ".mp4" or ".mov" or ".webm" => "video",
            _ => "document"
        };

        private static ChatMessageDto MapToDto(ChatMessage m) => new()
        {
            Id = m.Id,
            Content = m.Content,
            SenderId = m.SenderId,
            SenderName = m.Sender?.FullName ?? m.Sender?.UserName ?? "Unknown",
            SenderAvatar = m.Sender?.AvatarUrl,
            SentAt = m.SentAt,
            MessageType = m.MessageType,
            RoomId = m.RoomId,
            Attachment = m.Attachment == null ? null : new ChatAttachmentDto
            {
                Id = m.Attachment.Id,
                FileName = m.Attachment.FileName,
                FileType = m.Attachment.FileType,
                FileSize = m.Attachment.FileSize,
                MimeType = m.Attachment.MimeType,
                Url = m.Attachment.FilePath
            },
            ReplyTo = m.ReplyTo == null ? null : new ChatMessageDto
            {
                Id = m.ReplyTo.Id,
                Content = m.ReplyTo.Content,
                SenderId = m.ReplyTo.SenderId,
                SenderName = m.ReplyTo.Sender?.FullName ?? m.ReplyTo.Sender?.UserName ?? "Unknown",
                SentAt = m.ReplyTo.SentAt,
                MessageType = m.ReplyTo.MessageType,
                Attachment = m.ReplyTo.Attachment == null ? null : new ChatAttachmentDto
                {
                    Id = m.ReplyTo.Attachment.Id,
                    FileName = m.ReplyTo.Attachment.FileName,
                    FileType = m.ReplyTo.Attachment.FileType,
                    FileSize = m.ReplyTo.Attachment.FileSize,
                    MimeType = m.ReplyTo.Attachment.MimeType,
                    Url = m.ReplyTo.Attachment.FilePath
                }
            }
        };
    }
}
