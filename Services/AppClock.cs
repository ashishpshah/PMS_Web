using System;

namespace TaskManagement.Services
{
    /// <summary>
    /// Single source of truth for "now" across the app. All saved/updated timestamps use
    /// India Standard Time (IST, UTC+05:30) as a bare wall-clock value (DateTimeKind.Unspecified)
    /// so they persist as IST in the datetime2 columns and serialize WITHOUT a 'Z'/offset —
    /// letting the frontend render them as-is (browser-local) and show IST.
    ///
    /// NOTE: JWT token expiry must stay UTC (handled directly with DateTime.UtcNow at the
    /// token-generation sites) — do not use AppClock for token lifetimes.
    /// </summary>
    public static class AppClock
    {
        private static readonly TimeZoneInfo Ist = ResolveIst();

        private static TimeZoneInfo ResolveIst()
        {
            // Windows uses "India Standard Time"; Linux/macOS use the IANA id "Asia/Kolkata".
            try { return TimeZoneInfo.FindSystemTimeZoneById("India Standard Time"); }
            catch
            {
                try { return TimeZoneInfo.FindSystemTimeZoneById("Asia/Kolkata"); }
                catch { return TimeZoneInfo.CreateCustomTimeZone("IST", TimeSpan.FromHours(5.5), "IST", "IST"); }
            }
        }

        /// <summary>Current IST wall-clock as DateTimeKind.Unspecified.</summary>
        public static DateTime Now
        {
            get
            {
                var ist = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, Ist);
                return DateTime.SpecifyKind(ist, DateTimeKind.Unspecified);
            }
        }

        /// <summary>Current IST calendar date (time component zeroed).</summary>
        public static DateTime Today => Now.Date;
    }
}
