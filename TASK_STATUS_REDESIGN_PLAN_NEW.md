Update the existing Task Status Management and TaskStatusHistory implementation to correctly track every status transition, including cases where the task enters the same status multiple times.

Task Statuses

The system supports only these statuses:

new
in-progress
paused
blocked
under-review
issues
completed

Use these exact values consistently throughout the entity, database, validation, service layer, DTOs, and UI.

TaskStatusHistory

Each status occurrence must have its own history record. Do not reuse, overwrite, merge, or reopen a previous history record when a task enters the same status again.

The history record must contain:

public string? FromStatus { get; set; }
public string ToStatus { get; set; } = string.Empty;

public DateTime StartTimestamp { get; set; }
public DateTime? EndTimestamp { get; set; }

// System-calculated elapsed status duration
public decimal? SpentHours { get; set; }

// User-reported working effort
public decimal? ActualHours { get; set; }

SpentHours and ActualHours have different meanings:

SpentHours = elapsed time the task remained in ToStatus, calculated from StartTimestamp to EndTimestamp.

ActualHours = working hours explicitly reported by the user.

Never treat these fields as equivalent.

Status Transition Behaviour

When a status transition occurs:

FromStatus → ToStatus

first locate the currently active history record for the task where:

EndTimestamp IS NULL

Close that record by setting:

EndTimestamp = current timestamp
SpentHours = elapsed hours between StartTimestamp and EndTimestamp

Do not modify its previously recorded ActualHours.

Then create a new history record:

FromStatus = previous status
ToStatus = new status
StartTimestamp = current timestamp
EndTimestamp = NULL
SpentHours = NULL
ActualHours = supplied value when required

There must be only one active status-history record per task.

Repeated Status Requirement

A task may enter in all statuses multiple times except new status.

Each status occurrence must have a separate history record.

ActualHours Validation

Keep the business rule:

ActualHours is required when:

FromStatus = 'In Progress'
OR
FromStatus = 'Under Review'

Otherwise:

ActualHours is NOT required.

The validation must apply to the transition being performed.

Do not use SpentHours for this validation.

SpentHours is always system-calculated.