using System;
using System.Collections.Generic;
using TaskManagement.Data;
using TaskManagement.DTOs;

namespace TaskManagement.Services
{
    internal static class EffortHelpers
    {
        // Productive statuses: all statuses where time spent counts as effort
        // Configure as needed — currently all statuses except "completed" are productive
        internal static readonly HashSet<string> ProductiveStatuses = new(StringComparer.OrdinalIgnoreCase)
        {
            "new",
            "in-progress",
            "paused",
            "blocked",
            "under-review",
            "issues"
        };

        internal static bool IsProductiveStatus(string status) =>
            ProductiveStatuses.Contains(status);

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
                var seconds = Overlap(segStart, endClamped);
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

        // Raw overlap (no working-hours filter) — used for all calculations.
        internal static long Overlap(DateTime aStart, DateTime aEnd, DateTime bStart, DateTime bEnd)
        {
            var start = aStart > bStart ? aStart : bStart;
            var end = aEnd < bEnd ? aEnd : bEnd;
            return (long)Math.Max(0, (end - start).TotalSeconds);
        }

        // Returns total seconds of [start, end) — no office-hours clipping.
        internal static long Overlap(DateTime start, DateTime end)
        {
            if (end <= start) return 0;
            return (long)(end - start).TotalSeconds;
        }
    }
}