using System;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using TaskManagement.Data;

namespace TaskManagement.Services
{
    public interface IOtpService
    {
        /// <summary>
        /// Generates and sends an OTP. Always sends a fresh code.
        /// Returns (Sent=false) when the 60-second resend cooldown is active (forceResend=true only).
        /// </summary>
        Task<(bool Sent, string Message)> GenerateAndSendAsync(
            string email, string purpose, string? payload = null, string recipientName = "", bool forceResend = false);

        /// <summary>Validates the OTP. Returns the record (with Payload) on success, null on failure/expiry.</summary>
        Task<EmailOtp?> ValidateAndConsumeAsync(string email, string otp, string purpose);
    }

    public class OtpService : IOtpService
    {
        private readonly PMSDbContext          _context;
        private readonly IEmailService         _email;
        private readonly ILogger<OtpService>   _logger;
        private readonly int                   _expiryMinutes;

        public OtpService(PMSDbContext context, IEmailService email, IConfiguration config, ILogger<OtpService> logger)
        {
            _context       = context;
            _email         = email;
            _logger        = logger;
            _expiryMinutes = int.TryParse(config["OTPExpiresAt"], out var m) ? m : 2;
        }

        public async Task<(bool Sent, string Message)> GenerateAndSendAsync(
            string email, string purpose, string? payload = null, string recipientName = "", bool forceResend = false)
        {
            var now = AppClock.Now;

            // Enforce 60-second cooldown on resend requests to prevent email flooding
            if (forceResend)
            {
                var recent = await _context.EmailOtps
                    .Where(o => o.Email == email && o.Purpose == purpose && o.CreatedAt > now.AddSeconds(-60))
                    .OrderByDescending(o => o.CreatedAt)
                    .FirstOrDefaultAsync();
                if (recent != null)
                    return (false, "Please wait 60 seconds before requesting a new code.");
            }

            // Invalidate any existing OTPs for same email+purpose
            var existing = await _context.EmailOtps
                .Where(o => o.Email == email && o.Purpose == purpose && !o.IsUsed)
                .ToListAsync();
            foreach (var old in existing) old.IsUsed = true;

            // Generate 6-digit OTP
            var code = RandomNumberGenerator.GetInt32(100000, 1000000).ToString();
            var hash = HashOtp(code);

            _context.EmailOtps.Add(new EmailOtp
            {
                Email     = email,
                OtpHash   = hash,
                Purpose   = purpose,
                Payload   = payload,
                ExpiresAt = now.AddMinutes(_expiryMinutes),
                CreatedAt = now,
            });

            await _context.SaveChangesAsync();

            var subject = purpose == "register"
                ? "PMS — Verify your account"
                : "PMS — Password reset code";

            var html = EmailService.BuildOtpEmail(code, purpose, recipientName, _expiryMinutes);

            try
            {
                await _email.SendAsync(email, subject, html, purpose);
            }
            catch (Exception ex)
            {
                // Roll back the OTP so the next request generates a fresh code and retries sending
                var failed = await _context.EmailOtps
                    .Where(o => o.Email == email && o.Purpose == purpose && !o.IsUsed && o.ExpiresAt > AppClock.Now)
                    .OrderByDescending(o => o.CreatedAt)
                    .FirstOrDefaultAsync();
                if (failed != null) { failed.IsUsed = true; await _context.SaveChangesAsync(); }

                _logger.LogError(ex, "OTP email delivery failed for {Email} (purpose={Purpose})", email, purpose);
                return (false, "Failed to send the verification email. Please try again.");
            }

            return (true, "OTP sent successfully.");
        }

        public async Task<EmailOtp?> ValidateAndConsumeAsync(string email, string otp, string purpose)
        {
            var now  = AppClock.Now;
            var hash = HashOtp(otp);

            var record = await _context.EmailOtps
                .Where(o => o.Email == email && o.Purpose == purpose && !o.IsUsed && o.ExpiresAt > now && o.OtpHash == hash)
                .OrderByDescending(o => o.CreatedAt)
                .FirstOrDefaultAsync();

            if (record == null) return null;

            record.IsUsed = true;
            await _context.SaveChangesAsync();
            return record;
        }

        private static string HashOtp(string code)
        {
            var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(code));
            return Convert.ToHexString(bytes);
        }
    }
}
