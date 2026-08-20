# Phase 8 – Business Rule Extraction

**Source evidence:** `Services/TaskService.cs`, `Services/AuthService.cs`, `Services/AuthorizationService.cs`, `Services/ProjectService.cs`, `Services/ChatService.cs`, `Controllers/TasksController.cs`, `Controllers/UsersController.cs`, `Controllers/ProjectsController.cs`, `Data/PMSDbContext.cs`, `DTOs/GeneralDtos.cs`

Every rule is traced to its code location. Confidence: High unless marked otherwise.

---

## Authentication Rules

| Rule ID | Description | Code Location | Confidence |
|---|---|---|---|
| BR-001 | Username login is case-sensitive; Email login is case-insensitive | `AuthService.LoginAsync` | High |
| BR-002 | Inactive accounts (`IsActive = false`) receive the same error as wrong credentials (prevents account enumeration) | `AuthService.LoginAsync:43` | High |
| BR-003 | Self-registration never assigns SystemAdmin role (`RoleId = 1`). Auto-assigns the lowest-level non-admin role ordered by `Level ASC` | `AuthService.RegisterAsync:76-81` | High |
| BR-004 | If no non-admin role exists, registration is rejected with an explicit error | `AuthService.RegisterAsync:80-81` | High |
| BR-005 | Password minimum length is 6 characters | `AuthService.RegisterAsync:66` | High |
| BR-006 | Email format is validated via `System.Net.Mail.MailAddress` constructor | `AuthService.RegisterAsync:63` | High |
| BR-007 | JWT token lifetime is 420 minutes (7 hours) | `appsettings.json JwtSettings:ExpiryMinutes` | High |
| BR-008 | Token validation on every app load via `GET /api/auth/validate`; deactivated users are blocked even with a valid token | `Controllers/AuthController.cs:54-88` | High |
| BR-009 | Password reset generates a cryptographically random 12-char Base64 temp password (`RandomNumberGenerator`) | `Controllers/UsersController.cs:123-125` | High |
| BR-010 | Only users whose role name is `"systemadmin"` or `"admin"` can reset passwords | `Controllers/UsersController.cs:110` | High |
| BR-011 | SystemAdmin account (`id <= 1`) cannot be password-reset via API | `Controllers/UsersController.cs:114-115` | High |

---

## User Management Rules

| Rule ID | Description | Code Location | Confidence |
|---|---|---|---|
| BR-020 | `GET /api/users` excludes SystemAdmin (`Id <= 1`) from the management list | `Controllers/UsersController.cs:39-44` | High |
| BR-021 | `GET /api/users/assignable` returns only active users with `RoleId != 1` | `Controllers/UsersController.cs:54-55` | High |
| BR-022 | Viewing, modifying, or deleting `Id <= 1` via API returns 403 | `Controllers/UsersController.cs:63` | High |
| BR-023 | Username must be 3–50 chars; Email must be valid format, max 256 chars | `DTOs/GeneralDtos.cs CreateUserDto` | High |
| BR-024 | Deactivating a user blocks future logins but does not invalidate existing JWT tokens | `AuthService.LoginAsync:38-43` + no revocation | High |

---

## Role Management Rules

| Rule ID | Description | Code Location | Confidence |
|---|---|---|---|
| BR-030 | System Administrator role (`Id <= 1`) cannot be viewed or modified via API (403 guard) | `Controllers/RolesController.cs:37` | High |
| BR-031 | `Role.Code` is unique per the filtered unique index (multiple NULLs allowed) | `Data/PMSDbContext.cs:41-44` | High |
| BR-032 | Any role with `IsAdmin = true` receives the same full-access treatment as SystemAdmin | `Services/AuthorizationService.cs:74-78` | High |
| BR-033 | `POST /api/roles` handles both create and update, discriminated by `Id > 0` | `Controllers/RolesController.cs:47-58` | High |

---

## Project Management Rules

| Rule ID | Description | Code Location | Confidence |
|---|---|---|---|
| BR-040 | Only admins (`IsAdmin AND CanCreate/Update/Delete`) can create, update, or delete projects | `Controllers/ProjectsController.cs:48,60,71` | High |
| BR-041 | Project ownership transfer requires a `ReasonTag` from `ReasonTags.Valid` set | `DTOs/GeneralDtos.cs:8-14` | High |
| BR-042 | Every ownership transfer creates a row in `ProjectAssignmentHistories` | `Services/ProjectService.cs` | High |
| BR-043 | Project `Code` is auto-generated (`PRJ-{SeqNumber:D2}`) and is immutable after creation | `Services/CodeGenerator.cs` | High |
| BR-044 | `PUT /api/projects/{id}/members` replaces the full member list atomically | `Services/ProjectService.SetProjectMembersAsync` | High |

---

## Task Management Rules

### Creation & Update

| Rule ID | Description | Code Location | Confidence |
|---|---|---|---|
| BR-050 | `EstimatedHours` must be > 0 on every task create and update | `Services/TaskService.cs:198-199, 236-237` | High |
| BR-051 | Task `Code` is auto-generated (top-level: `TSK-PP-TT`; subtask: `SUB-PP-TT-SS`) and immutable | `Services/TaskService.cs:216-218` | High |
| BR-052 | Parent task must exist and belong to the same project as the child | `Services/TaskService.cs:202-208` | High |
| BR-053 | `UpdateTaskAsync` preserves `Status`, `StartedAt`, `StartedById`, `Code`, `SeqNumber` (cannot be changed via generic update) | `Services/TaskService.cs:246-257` | High |
| BR-054 | A task with child tasks cannot be deleted — must remove or relink children first | `Services/TaskService.cs:402-403` | High |
| BR-055 | Task creator, project owner, or project creator can create tasks even without `CanCreate(/tasks)` permission | `Controllers/TasksController.cs:58-63` | High |

### Status Workflow

| Rule ID | Description | Code Location | Confidence |
|---|---|---|---|
| BR-060 | Status transitions are enforced via `AllowedEdges` dictionary — invalid edges are rejected | `Services/TaskService.cs:276-286` | High |
| BR-061 | Valid statuses: `new`, `in-progress`, `paused`, `blocked`, `under-review`, `issues`, `completed` | `Services/TaskService.cs:270-272` | High |
| BR-062 | `ActualHours > 0` is required when entering any status except `new` (exempt list) | `Services/TaskService.cs:305-307` | High |
| BR-063 | A task with any active block entry cannot change status unless the actor is an admin | `Services/TaskService.cs:317-318` | High |
| BR-064 | Blocking a task requires a non-empty `reason` string | `Services/TaskService.cs:321-322` | High |
| BR-065 | Submitting for review (`under-review`) requires 100% checklist progress | `Services/TaskService.cs:325-326` | High |
| BR-066 | Completing a task (`completed`) requires 100% checklist progress if checklist items exist | `Services/TaskService.cs:329-331` | High |
| BR-067 | Completing from `under-review`: if `RequiresQA`, only the QA assignee or manager can approve; otherwise only manager | `Services/TaskService.cs:337-354` | High |
| BR-068 | Direct completion (not from `under-review`): only the assignee, task creator, or project owner | `Services/TaskService.cs:353-355` | High |
| BR-069 | Sending `issues` (QA fail): only manager or QA reviewer | `Services/TaskService.cs:358-361` | High |
| BR-070 | Submitting `under-review`: only the assignee or manager | `Services/TaskService.cs:364-366` | High |
| BR-071 | Reopening from `completed` → `in-progress`: manager only | `Services/TaskService.cs:371-372` | High |
| BR-072 | Sending back from `under-review` → `in-progress`: manager only | `Services/TaskService.cs:373-374` | High |
| BR-073 | `paused`, `blocked` transitions: only assignee or manager | `Services/TaskService.cs:379-381` | High |

### Assignment Rules

| Rule ID | Description | Code Location | Confidence |
|---|---|---|---|
| BR-080 | Initial task assignment (`PUT /assign`) is restricted to the task creator | `Controllers/TasksController.cs:152-153` | High |
| BR-081 | Every initial assignment creates a row in `TaskAssignmentHistories` with `ReasonTag = "initial-assignment"` | `Services/TaskService.cs:455-463` | High |
| BR-082 | Task reassignment requires a valid `ReasonTag` from `ReasonTags.Valid` | `DTOs/GeneralDtos.cs:8-14` | High |
| BR-083 | Only the assignee can start a task (`POST /start`; enforced in service) | `Services/TaskService.StartTaskAsync` | High |
| BR-084 | Only task creator, current assignee, or project owner/creator can comment on a task | `Controllers/TasksController.cs:119-120` | High |

### Checklist Rules

| Rule ID | Description | Code Location | Confidence |
|---|---|---|---|
| BR-090 | Only the current assignee can toggle checklist items | `Services/TaskService.ToggleChecklistItemAsync` | High |
| BR-091 | Only the task creator or project owner can add, edit, or delete checklist items | `Controllers/TasksController.cs:269, 293, 307` | High |
| BR-092 | 100% checklist completion gates `under-review` and `completed` status transitions | `Services/TaskService.cs:325-331` | High |
| BR-093 | Checklist items are ordered by `OrderIndex` | `Services/TaskService.cs:156, 103` | High |

### Blocking Rules

| Rule ID | Description | Code Location | Confidence |
|---|---|---|---|
| BR-100 | Maximum one active block per user per task (enforced by unique DB index on `TaskId + BlockedById`) | `Data/PMSDbContext.cs:275-277` | High |
| BR-101 | Resolving a block sets `ResolvedAt` and `IsActive = false` | `Services/TaskService.SetTaskBlockAsync` | High |
| BR-102 | Block reason is mandatory and limited to 1000 chars | `Data/PMSDbContext.cs:273` | High |

---

## Permission Rules

| Rule ID | Description | Code Location | Confidence |
|---|---|---|---|
| BR-110 | SystemAdmin (`RoleId = 1`) always gets full access — no DB permission lookup | `Services/AuthorizationService.cs:68-72` | High |
| BR-111 | Any `IsAdmin = true` role gets full access — no DB permission lookup | `Services/AuthorizationService.cs:74-78` | High |
| BR-112 | User-level permission (`UserPagePermissions`) overrides role-level (`RolePagePermissions`) | `Services/AuthorizationService.cs:93-98` | High |
| BR-113 | Dashboard route (`/` and `dashboard`) always returns `CanView = true` | `Services/AuthorizationService.cs:82-83` | High |
| BR-114 | Only `IsSystemAdmin` (RoleId=1 specifically) can manage permission tables via `/api/permissions/**` | `Controllers/PermissionsController.cs:74,84,95` | High |
| BR-115 | `PUT /api/permissions/user/{userId}` replaces all user overrides (full replace, zero-value rows not stored) | `Controllers/PermissionsController.cs:155-169` | High |
| BR-116 | Per-request user cache in `AuthorizationService` prevents repeated DB queries within one HTTP request | `Services/AuthorizationService.cs:38-66` | High |

---

## Chat Rules

| Rule ID | Description | Code Location | Confidence |
|---|---|---|---|
| BR-120 | Room message sender must be a member of the room (membership check in hub) | `Hubs/ChatHub.cs:65-68` | High |
| BR-121 | Chat file uploads are validated via magic-byte check (not just file extension) | `Controllers/ChatController.cs:59` | High |
| BR-122 | Maximum chat file size: 25 MB | `Controllers/ChatController.cs:55` | High |
| BR-123 | Chat file downloads have a path-traversal guard (resolved path must stay within `wwwroot/`) | `Controllers/ChatController.cs:78-81` | High |
| BR-124 | Direct message rooms are created idempotently — returns existing room if one exists between two users | `Services/ChatService.GetOrCreateDirectRoomAsync` | High |
| BR-125 | Online user presence is tracked per-connection in a static `ConcurrentDictionary` (in-memory, not shared across instances) | `Hubs/ChatHub.cs:14` | High |

---

## Effort & Working Hours Rules

| Rule ID | Description | Code Location | Confidence |
|---|---|---|---|
| BR-130 | Effort calculations only count time within working hours (default 10:00–19:00, configurable via `appsettings.json WorkingHours`) | `Services/EffortHelpers.cs`, `appsettings.json` | High |
| BR-131 | `ActualHours` is self-reported per status transition and stored in `TaskStatusHistories` | `DTOs/GeneralDtos.cs:129`, `Data/PMSDbContext.cs:458` | High |
| BR-132 | Non-admin users can only view their own effort/report data | `Controllers/ReportsController.cs:34,47,55` | High |

---

## Valid Reason Tags

Defined in `DTOs/GeneralDtos.cs` as a `HashSet<string>` (case-insensitive):

| Tag |
|---|
| `Resignation` |
| `Workload Balancing` |
| `Management Decision` |
| `Unavailability` |
| `No Resource` |
| `Unable to Complete` |
| `Admin Decision` |
| `Other` |

Used by: project ownership transfer, task reassignment.

---

## Task Status Transition Matrix

| From → | new | in-progress | paused | blocked | under-review | issues | completed |
|---|---|---|---|---|---|---|---|
| **new** | — | ✅ | — | — | — | — | ✅ |
| **in-progress** | — | — | ✅ | ✅ | ✅ | — | ✅ |
| **paused** | — | ✅ | — | — | — | — | ✅ |
| **blocked** | — | ✅ | — | — | — | — | ✅ |
| **under-review** | — | ✅ | — | — | — | ✅ | ✅ |
| **issues** | — | ✅ | — | — | — | — | ✅ |
| **completed** | — | ✅ (reopen: manager only) | — | — | — | — | — |

Source: `Services/TaskService.cs:276-286`
