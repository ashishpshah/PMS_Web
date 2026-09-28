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
            
            // Handle the case where there are no status history records
            if (statusRows.Count == 0)
            {
                // Just one segment from creation to now with current status
                var seconds = Overlap(createdAt, now);
                if (seconds > 0)
                {
                    segments.Add(new EffortTimelineSegmentDto
                    {
                        Status = currentStatus ?? string.Empty,
                        StartAt = createdAt,
                        EndAt = now,
                        Seconds = seconds,
                        IsProductive = IsProductiveStatus(currentStatus ?? string.Empty)
                    });
                }
                return segments;
            }
            
            var segStatus = statusRows[0].FromStatus ?? string.Empty;
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

            // Process each status history record
            for (int i = 0; i < statusRows.Count; i++)
            {
                var row = statusRows[i];
                
                // Determine the end time for this status period
                DateTime endTime;
                if (i < statusRows.Count - 1)
                {
                    // Not the last row - end time is the start time of the next row
                    endTime = statusRows[i + 1].StartTimestamp;
                }
                else
                {
                    // Last row - end time is either EndTimestamp (if set) or now (if still active)
                    endTime = row.EndTimestamp ?? now;
                }
                
                Close(endTime, row.ToStatus);
            }
            
            // If the task is not completed, we need to add a segment from the last status to now
            // But this is already handled in the Close call above when we pass now as the end time for the last segment
            // if the last status record doesn't have an EndTimestamp (meaning it's still active)
            
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