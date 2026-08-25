using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Extensions.Configuration;
using MimeKit;
using System.Threading.Tasks;

namespace TaskManagement.Services
{
    public interface IEmailService
    {
        Task SendAsync(string to, string subject, string htmlBody);
    }

    public class EmailService : IEmailService
    {
        private readonly IConfiguration _config;

        public EmailService(IConfiguration config) => _config = config;

        public async Task SendAsync(string to, string subject, string htmlBody)
        {
            var host     = _config["Email:SmtpHost"]    ?? "smtp.gmail.com";
            var port     = int.Parse(_config["Email:SmtpPort"] ?? "587");
            var username = _config["Email:Username"]    ?? string.Empty;
            var password = _config["Email:Password"]    ?? string.Empty;
            var fromAddr = _config["Email:FromAddress"] ?? username;
            var fromName = _config["Email:FromName"]    ?? "PMS";

            var message = new MimeMessage();
            message.From.Add(new MailboxAddress(fromName, fromAddr));
            message.To.Add(MailboxAddress.Parse(to));
            message.Subject = subject;
            message.Body = new TextPart("html") { Text = htmlBody };

            using var client = new SmtpClient();
            await client.ConnectAsync(host, port, SecureSocketOptions.StartTls);
            await client.AuthenticateAsync(username, password);
            await client.SendAsync(message);
            await client.DisconnectAsync(true);
        }

        // ── HTML template helpers ─────────────────────────────────────────────

        public static string BuildOtpEmail(string otp, string purpose, string recipientName = "", int expiryMinutes = 2)
        {
            var heading = purpose == "register"
                ? "Verify your account"
                : "Reset your password";

            var bodyText = purpose == "register"
                ? "You requested to create a new account on PMS. Use the one-time code below to complete your registration."
                : "You requested a password reset on PMS. Use the one-time code below to set a new password.";

            var greeting = string.IsNullOrWhiteSpace(recipientName)
                ? "Hello,"
                : $"Hello {recipientName},";

            return $@"<!DOCTYPE html>
<html lang=""en"">
<head>
  <meta charset=""UTF-8"" />
  <meta name=""viewport"" content=""width=device-width, initial-scale=1.0"" />
  <title>{heading}</title>
</head>
<body style=""margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',Arial,sans-serif;"">
  <table width=""100%"" cellpadding=""0"" cellspacing=""0"" style=""background:#f3f4f6;padding:32px 0;"">
    <tr>
      <td align=""center"">
        <table width=""560"" cellpadding=""0"" cellspacing=""0"" style=""max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.07);"">

          <!-- Header -->
          <tr>
            <td style=""background:linear-gradient(135deg,#4f46e5 0%,#6366f1 100%);padding:28px 32px;"">
              <p style=""margin:0;font-size:11px;font-weight:900;letter-spacing:0.15em;text-transform:uppercase;color:rgba(255,255,255,0.7);"">
                Padhya Software Technologies
              </p>
              <p style=""margin:6px 0 0;font-size:20px;font-weight:700;color:#ffffff;letter-spacing:0.01em;"">
                Project Management System &mdash; PMS
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style=""padding:36px 32px 28px;"">
              <p style=""margin:0 0 6px;font-size:22px;font-weight:700;color:#111827;"">{heading}</p>
              <p style=""margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.6;"">{greeting}</p>
              <p style=""margin:0 0 28px;font-size:14px;color:#374151;line-height:1.7;"">{bodyText}</p>

              <!-- OTP Box -->
              <table width=""100%"" cellpadding=""0"" cellspacing=""0"" style=""margin-bottom:28px;"">
                <tr>
                  <td align=""center"">
                    <div style=""display:inline-block;background:#eef2ff;border:2px dashed #818cf8;border-radius:12px;padding:20px 40px;"">
                      <p style=""margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#6366f1;"">Your one-time code</p>
                      <p style=""margin:0;font-size:40px;font-weight:900;letter-spacing:0.25em;color:#4f46e5;font-family:'Courier New',monospace;"">{otp}</p>
                    </div>
                  </td>
                </tr>
              </table>

              <table width=""100%"" cellpadding=""0"" cellspacing=""0"" style=""background:#fef9c3;border-radius:8px;margin-bottom:24px;"">
                <tr>
                  <td style=""padding:12px 16px;"">
                    <p style=""margin:0;font-size:13px;color:#854d0e;"">
                      &#9200;&nbsp; This code expires in <strong>{expiryMinutes} {(expiryMinutes == 1 ? "minute" : "minutes")}</strong>. Do not share it with anyone.
                    </p>
                  </td>
                </tr>
              </table>

              <p style=""margin:0;font-size:13px;color:#9ca3af;line-height:1.6;"">
                If you did not request this, you can safely ignore this email. No account changes will be made.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style=""background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 32px;"">
              <p style=""margin:0;font-size:12px;color:#9ca3af;text-align:center;"">
                &copy; 2026 Padhya Software Technologies &bull; Project Management System &mdash; PMS<br/>
                This is an automated message. Please do not reply to this email.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>";
        }
    }
}
