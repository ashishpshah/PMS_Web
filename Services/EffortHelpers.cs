using System;
using System.Collections.Generic;
using TaskManagement.Data;
using TaskManagement.DTOs;

namespace TaskManagement.Services
{
    /// <summary>Binds to "WorkingHours" config section.</summary>
    public class WorkingHoursOptions
    {
        public int WorkStartHour { get; set; } = 10;
        public int WorkEndHour   { get; set; } = 19;
    }

    internal static class EffortHelpers
    {
        // Called once at app startup from Program.cs with values from appsettings.
        internal static void Configure(WorkingHoursOptions opts)
        {
            WorkStart = new TimeSpan(opts.WorkStartHour, 0, 0);
            WorkEnd   = new TimeSpan(opts.WorkEndHour,   0, 0);
        }

        internal const string ProductiveStatus = "in-progress";

        internal static bool IsProductiveStatus(string status) =>
            string.Equals(status, ProductiveStatus, StringComparison.OrdinalIgnoreCase);

        internal readonly struct AssignmentWindow
        {
            public AssignmentWindow(int userId, DateTime start, DateTime end) { UserId = userId; Start = start; End = end; }
            public int UserId { get; }
            public DateTime Start { get; }
            public DateTime End { get; }
        }

        // Builds [start,end) status segments for one task.
        internal static List<EffortTimelineSegmentDto> BuildStatusSegments(
            DateTime createdAt, string currentStatus, IReadOnlyList<TaskStatusHistory> statusRows, DateTime now)
        {
            var segments = new List<EffortTimelineSegmentDto>();
            var segStatus = (statusRows.Count > 0 ? statusRows[0].FromStatus : currentStatus) ?? currentStatus ?? string.Empty;
            var segStart = createdAt;

            void Close(DateTime end, string? nextStatus)
            {
                var endClamped = end < segStart ? segStart : end;
                var seconds = WorkingOverlap(segStart, endClamped);
                if (seconds > 0)
                {
                    segments.Add(new EffortTimelineSegmentDto
                    {
                        Status = segStatus,
                        StartAt = segStart,
                        EndAt = endClamped,
                        Seconds = seconds,
                        IsProductive = IsProductiveStatus(segStatus)
                    });
                }
                segStart = endClamped;
                segStatus = nextStatus ?? string.Empty;
            }

            foreach (var row in statusRows)
                Close(row.ChangedAt, row.ToStatus);

            if (!string.Equals(currentStatus, "completed", StringComparison.OrdinalIgnoreCase))
                Close(now, currentStatus);

            return segments;
        }

        internal static List<AssignmentWindow> BuildAssignmentWindows(
            DateTime createdAt, IReadOnlyList<TaskAssignmentHistory> assignRows, int? currentAssigneeId, DateTime now)
        {
            var windows = new List<AssignmentWindow>();
            var initialAssignee = assignRows.Count > 0 ? assignRows[0].PreviousAssigneeId : currentAssigneeId;
            var winStart = createdAt;
            var winUser = initialAssignee ?? 0;

            foreach (var row in assignRows)
            {
                var end = row.ChangedAt < winStart ? winStart : row.ChangedAt;
                windows.Add(new AssignmentWindow(winUser, winStart, end));
                winStart = end;
                winUser = row.NewAssigneeId ?? 0;
            }
            windows.Add(new AssignmentWindow(winUser, winStart, now < winStart ? winStart : now));
            return windows;
        }

        // Raw overlap (no working-hours filter) — used only for assignment window intersection.
        internal static long Overlap(DateTime aStart, DateTime aEnd, DateTime bStart, DateTime bEnd)
        {
            var start = aStart > bStart ? aStart : bStart;
            var end = aEnd < bEnd ? aEnd : bEnd;
            return (long)Math.Max(0, (end - start).TotalSeconds);
        }

        // Office hours (default 10:00–19:00). Timestamps are stored as IST wall-clock
        // (DateTimeKind.Unspecified via AppClock.Now), so no tz conversion is needed.
        // Overridden at startup via Configure(WorkingHoursOptions) → appsettings "WorkingHours".
        private static TimeSpan WorkStart = new TimeSpan(10, 0, 0);
        private static TimeSpan WorkEnd   = new TimeSpan(19, 0, 0);

        // Returns working-hour seconds of [start, end) clipped to a single calendar day.
        internal static long WorkingOverlapForDay(DateTime start, DateTime end, DateTime day)
        {
            var dayWork0 = day.Date + WorkStart;
            var dayWork1 = day.Date + WorkEnd;
            var sliceStart = start > dayWork0 ? start : dayWork0;
            var sliceEnd   = end   < dayWork1 ? end   : dayWork1;
            return sliceEnd > sliceStart ? (long)(sliceEnd - sliceStart).TotalSeconds : 0;
        }

        // Returns total seconds of [start, end) that fall within office hours across all days.
        internal static long WorkingOverlap(DateTime start, DateTime end)
        {
            if (end <= start) return 0;
            long total = 0;
            var day = start.Date;
            var lastDay = end.Date;
            while (day <= lastDay)
            {
                var dayWork0 = day + WorkStart;
                var dayWork1 = day + WorkEnd;
                var sliceStart = start > dayWork0 ? start : dayWork0;
                var sliceEnd   = end   < dayWork1 ? end   : dayWork1;
                if (sliceEnd > sliceStart)
                    total += (long)(sliceEnd - sliceStart).TotalSeconds;
                day = day.AddDays(1);
            }
            return total;
        }
    }
}
