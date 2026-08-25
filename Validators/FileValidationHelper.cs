using System;
using System.Collections.Generic;
using System.IO;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;

namespace TaskManagement.Validators
{
    /// <summary>
    /// Centralized file-upload validation (size, extension allow-list, magic-byte content
    /// verification) shared by every upload surface in the app. Previously this exact logic
    /// (minus the magic-byte check) was duplicated between Services/ChatService.cs and
    /// Services/TaskService.cs's attachment upload — and only ChatService had the magic-byte
    /// check, meaning a renamed executable with an allowed extension (e.g. "virus.exe" renamed
    /// to "virus.pdf") would pass server-side validation on a task attachment. Both call sites
    /// now share this one implementation.
    /// </summary>
    public static class FileValidationHelper
    {
        // Maps an allowed extension to the magic bytes expected at offset 0 of the file.
        // A null value means "no magic-byte check for this type" (plain text / legacy OLE
        // formats that don't have a reliable fixed signature).
        public static readonly IReadOnlyDictionary<string, byte[]?> MagicBytes = new Dictionary<string, byte[]?>(StringComparer.OrdinalIgnoreCase)
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
            { ".doc",  null },  // Legacy OLE — no reliable fixed signature, skip
            { ".xls",  null },
            { ".ppt",  null },
            { ".txt",  null },
            { ".csv",  null },
            { ".json", null },
            { ".xml",  null },
        };

        public static async Task<(bool valid, string error)> ValidateFileAsync(
            IFormFile? file, IReadOnlyCollection<string> allowedExtensions, long maxSizeBytes)
        {
            if (file == null || file.Length == 0)
                return (false, "No file provided.");

            if (file.Length > maxSizeBytes)
                return (false, $"File exceeds the {maxSizeBytes / (1024 * 1024)} MB limit.");

            var ext = Path.GetExtension(file.FileName);
            if (string.IsNullOrEmpty(ext) || !Contains(allowedExtensions, ext))
                return (false, $"File type '{ext}' is not allowed.");

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

        private static bool Contains(IReadOnlyCollection<string> allowed, string ext)
        {
            foreach (var a in allowed)
                if (string.Equals(a, ext, StringComparison.OrdinalIgnoreCase)) return true;
            return false;
        }
    }
}
