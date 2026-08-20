Update the existing Project Management module to enforce the following task workflow. Modify only the task status workflow, validation, permissions, transitions, UI, and related business logic. Do not change unrelated modules, APIs, database structures (unless required for workflow support), authentication, authorization, routing, or existing functionality.

## Standard Task Statuses

Use only these task statuses:

* New
* In Progress
* Paused
* Blocked
* Under Review
* Issues
* Completed

Remove or migrate any obsolete statuses while preserving existing task history.

## Allowed Status Transitions

Only allow the following transitions:

New
→ In Progress

In Progress
→ Paused
→ Blocked
→ Under Review

Paused
→ In Progress

Blocked
→ In Progress

Under Review
→ Completed
→ Issues

Issues
→ In Progress

Completed
→ In Progress (Manager/Admin Reopen only)

Any transition outside this list must be rejected with an appropriate validation message.

## Transition Rules

Paused

* Indicates work is intentionally paused.
* Preserve assignee, estimates, and progress.
* Allow resume only to In Progress.

Blocked

* Indicates work cannot continue because of an external dependency.
* Require a Block Reason before saving.
* Allow resume only through an Unblock action that returns the task to In Progress.

Under Review

* Indicates development is finished and awaiting review or QA.
* Prevent direct editing of task progress while in this status except by authorized reviewers or managers.
* Reviewer may either Complete the task or return it with Issues.

Issues

* Indicates review or QA failed.
* Require an Issue/Review Comment explaining the failure.
* Developer fixes the task by moving it back to In Progress.

Completed

* Indicates all work and review are finished.
* Make the task read-only for normal users.
* Only Manager/Admin may Reopen the task.
* Reopen always changes status to In Progress.
* Capture the reopen reason in history.

## Required Transition Actions

Implement the following named actions:

* Start Work
* Pause
* Resume
* Block
* Unblock
* Submit for Review
* Approve & Complete
* QA Failed / Return Issues
* Reopen

These are transition actions only. They are NOT task statuses.

## Permissions

Developer

* Start Work
* Pause
* Resume
* Block
* Submit for Review
* Fix Issues

Reviewer / QA

* Approve & Complete
* Return Issues

Manager / Admin

* Perform every transition.
* Reopen completed tasks.

## Audit History

Record every status change with:

* Previous Status
* New Status
* Action
* User
* Date & Time
* Comment (if provided)

Do not overwrite previous history.

## Dashboard Calculations

Ensure dashboard statistics correctly count tasks by:

* New
* In Progress
* Paused
* Blocked
* Under Review
* Issues
* Completed

Exclude invalid or obsolete statuses.

## Notifications

Generate notifications for:

* Task Blocked
* Task Unblocked
* Submitted for Review
* Review Approved
* QA Failed
* Task Reopened

## UI Requirements

* Display only valid transition actions based on the current status and user role.
* Hide invalid actions.
* Show confirmation dialogs for:

  * Block
  * Complete
  * Reopen
* Require comments when:

  * Blocking
  * Returning Issues
  * Reopening

## Validation

Prevent:

* New → Completed
* New → Blocked
* Completed → Completed
* Issues → Completed
* Blocked → Completed
* Paused → Completed
* Any transition not explicitly allowed.

## Acceptance Criteria

* Every task follows the defined workflow.
* Invalid transitions are impossible from both UI and backend.
* Permissions are enforced on both frontend and backend.
* Existing task history remains intact.
* Existing functionality outside task workflow is unaffected.
* Workflow is production-ready and fully tested.



## # Task Checklist Workflow Enhancement

The existing project already supports Task Checklist Items. Extend this functionality without breaking existing behavior.

## 1. Development Checklist (Existing)

Keep the current checklist functionality used by developers to track implementation progress.

Completion of items contributes to task progress.

---

# 2. Review / QA Checklist (New)

When creating or editing a Task, allow the creator (Manager/Admin) to define an optional **Review Checklist**.

This checklist represents what the reviewer or QA must verify before approving the task.

Examples:

* UI matches design
* Responsive layout verified
* API response validated
* Business rules verified
* Database migration checked
* Error handling verified
* Performance acceptable
* Security validated
* Accessibility verified
* Documentation updated

Each Review Checklist Item should contain:

* Title
* Description (optional)
* Sequence
* Required (Yes/No)

These checklist items remain locked until the task reaches **Under Review**.

---

# 3. Under Review Behaviour

When a task enters **Under Review**:

Display all Review Checklist Items.

Reviewer/QA must evaluate each checklist item individually.

Each item supports:

* Pending
* Passed
* Failed
* Not Applicable

Reviewer may also add comments for every checklist item.

Example:

✓ UI matches design

✗ Responsive layout verified
Comment:
Horizontal scrolling on tablet.

✓ API response validated

✗ Error handling verified
Comment:
500 error not handled.

---

# 4. Review Decision Rules

Reviewer can only mark the task:

## Completed

Only when:

* Every Required Review Checklist Item is Passed or Not Applicable.
* No Failed Required items remain.

## Issues

If one or more Required Review Checklist Items are Failed.

The task automatically moves to **Issues**.

---

# 5. Issues Screen

Instead of a single Issue Reason textbox, display all Failed Review Checklist Items.

Each failed item should include:

* Checklist Name
* Reviewer Comment
* Status = Failed

Developer clearly sees what must be fixed.

Developer cannot edit reviewer comments.

---

# 6. Fix Process

Developer fixes the issues.

Each failed checklist item can optionally contain:

* Developer Resolution Comment

Example:

Issue:
Responsive layout verified

Reviewer:
Buttons overlap on iPad.

Developer Resolution:
Updated layout constraints and verified on iPad Air.

---

# 7. Return for Review

After fixes:

Issues
→ In Progress

Developer completes fixes.

Then:

In Progress
→ Under Review

The original Review Checklist is reused.

Reviewer verifies only previously failed items while still being able to review all checklist items.

Passed items remain Passed unless manually changed.

---

# 8. Blocked Workflow

When changing status to **Blocked**, do not use only a text reason.

Instead require one or more Blocked Checklist Items.

Each Blocked Item contains:

* Category
* Description
* Comment
* Expected Resolution (optional)

Suggested Categories:

* Waiting for Client
* Waiting for Manager
* Waiting for Design
* Waiting for API
* Waiting for Backend
* Waiting for Frontend
* Waiting for Database
* Waiting for Third-party Service
* Waiting for Approval
* Waiting for Infrastructure
* Waiting for Requirement Clarification
* Other

Multiple blocked reasons are allowed.

Example:

✓ Waiting for API
Comment:
Payment API not available.

✓ Waiting for Client
Comment:
Awaiting logo assets.

The task cannot be Unblocked until all active blocked checklist items are marked Resolved or Removed.

---

# 9. Audit Trail

Record every checklist event:

* Created
* Edited
* Passed
* Failed
* Resolved
* Reopened
* Comment Added

Store:

* User
* Date/Time
* Old Value
* New Value

Do not overwrite history.

---

# 10. Dashboard

Display additional metrics:

Development Checklist

* Total Items
* Completed
* Remaining

Review Checklist

* Pending
* Passed
* Failed

Blocked

* Number of Active Blockers
* Number of Resolved Blockers

Issues

* Open Review Issues
* Resolved Review Issues

---

# 11. Permissions

Developer

* Complete Development Checklist
* Add Resolution Comments
* Resolve Blocked Items

Reviewer / QA

* Complete Review Checklist
* Mark Passed/Failed
* Add Review Comments

Manager/Admin

* Create/Edit Review Checklist
* Create/Edit Blocked Categories
* Override Review Decisions
* Reopen Completed Tasks

---

# 12. Validation Rules

* A task cannot be Completed if any Required Review Checklist Item is Failed or Pending.
* Blocked tasks require at least one active Blocked Checklist Item.
* Issues must always reference one or more Failed Review Checklist Items.
* Existing Review Checklist definitions must persist across review cycles.
* Preserve all checklist history and comments for audit purposes.
