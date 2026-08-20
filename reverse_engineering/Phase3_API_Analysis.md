# Phase 3 – API Analysis

**Source evidence:** `Controllers/AuthController.cs`, `Controllers/TasksController.cs`, `Controllers/ProjectsController.cs`, `Controllers/UsersController.cs`, `Controllers/RolesController.cs`, `Controllers/ActivitiesController.cs`, `Controllers/ChatController.cs`, `Controllers/ReportsController.cs`, `Controllers/PermissionsController.cs`, `Controllers/BackupController.cs`

All responses are wrapped in `ApiResponse<T> { Success, Message, Data, TotalCount?, Page?, PageSize?, TotalPages? }` unless noted.

Base URL: `/api`

---

## 3.1 Controller Summary

| Controller | Route Prefix | Auth Required | Endpoints |
|---|---|---|---|
| `AuthController` | `/api/auth` | Mixed | 4 |
| `TasksController` | `/api/tasks` | `[Authorize]` on class | 24 |
| `ProjectsController` | `/api/projects` | `[Authorize]` on class | 8 |
| `UsersController` | `/api/users` | `[Authorize]` on class | 7 |
| `RolesController` | `/api/roles` | `[Authorize]` on class | 4 |
| `ActivitiesController` | `/api/activities` | `[Authorize]` on class | 2 |
| `ChatController` | `/api/chat` | `[Authorize]` on class | 6 |
| `ReportsController` | `/api/reports` | `[Authorize]` on class | 5 |
| `PermissionsController` | `/api/permissions` | `[Authorize]` on class | 9 |
| `BackupController` | `/api/backup` | — | **DISABLED** (entirely commented out) |

---

## 3.2 Auth Endpoints

### POST `/api/auth/login`
| Property | Value |
|---|---|
| Authorization | `[AllowAnonymous]` |
| Request Body | `LoginDto { UsernameOrEmail?, Email, Password }` |
| Response | `ApiResponse<LoginResponseDto { Token, User: UserDto }>` |
| Success | 200 OK |
| Failure | 401 Unauthorized |
| Logic | Calls `AuthService.LoginAsync`. Username = case-sensitive; Email = case-insensitive. Blocks inactive accounts with same generic error. |

---

### POST `/api/auth/register`
| Property | Value |
|---|---|
| Authorization | `[AllowAnonymous]` |
| Request Body | `RegisterDto { FirstName, LastName, UserName, Email, ContactNo?, Password }` |
| Response | `ApiResponse<LoginResponseDto>` |
| Success | 200 OK |
| Failure | 400 Bad Request |
| Logic | Self-registration assigns lowest-privilege non-admin role. Never auto-assigns System Administrator (RoleId=1). Validates email format, unique username/email, password ≥ 6 chars. |

---

### GET `/api/auth/check-availability`
| Property | Value |
|---|---|
| Authorization | `[Authorize]` |
| Query Params | `userName?`, `email?`, `excludeUserId?` |
| Response | `ApiResponse<AvailabilityDto { UserNameChecked, UserNameAvailable, EmailChecked, EmailAvailable }>` |
| Logic | Used in registration form for live username/email uniqueness check. |

---

### GET `/api/auth/validate`
| Property | Value |
|---|---|
| Authorization | `[Authorize]` |
| Response | `ApiResponse<UserDto>` |
| Logic | Validates JWT, returns fresh user profile from DB. Used on app startup to hydrate AuthContext. Blocks if `IsActive = false`. |

---

## 3.3 Tasks Endpoints

### GET `/api/tasks`
| Property | Value |
|---|---|
| Authorization | `[Authorize]` + CanView(`/tasks`) |
| Query Params | `status?`, `priority?`, `projectId?`, `assigneeId?`, `page=1`, `pageSize=100` |
| Response | `ApiResponse<List<TaskDto>>` with pagination fields (`TotalCount`, `Page`, `PageSize`, `TotalPages`) |
| Logic | Paginated. `pageSize` clamped 1–500. Returns tasks ordered by `CreatedAt` DESC. |

---

### GET `/api/tasks/{id}`
| Property | Value |
|---|---|
| Authorization | `[Authorize]` + CanView(`/tasks`) |
| Response | `ApiResponse<TaskDto>` |
| Failure | 404 Not Found |

---

### POST `/api/tasks`
| Property | Value |
|---|---|
| Authorization | `[Authorize]` + (CanCreate(`/tasks`) OR project creator/owner) |
| Request Body | `CreateTaskDto` |
| Response | 201 Created + `ApiResponse<TaskDto>` |
| Logic | Creates task, generates code via `CodeGenerator`. UserId taken from JWT — not from request body. |

---

### PUT `/api/tasks/{id}`
| Property | Value |
|---|---|
| Authorization | `[Authorize]` + (CanUpdate(`/tasks`) OR task creator OR project owner/creator) |
| Request Body | `CreateTaskDto` |
| Response | `ApiResponse<TaskDto>` |
| Failure | 400 / 403 |

---

### DELETE `/api/tasks/{id}`
| Property | Value |
|---|---|
| Authorization | `[Authorize]` + (CanDelete(`/tasks`) OR task creator OR project owner/creator) |
| Response | `ApiResponse<bool>` |
| Failure | 404 Not Found |

---

### POST `/api/tasks/{id}/comments`
| Property | Value |
|---|---|
| Authorization | `[Authorize]` — task creator, assignee, or project owner/creator only |
| Request Body | `CreateTaskCommentDto` |
| Response | `ApiResponse<TaskCommentDto>` |
| Logic | Author ID taken from JWT. Only task creator, current assignee, or project owner/creator can comment. |

---

### GET `/api/tasks/{id}/comments`
| Property | Value |
|---|---|
| Authorization | `[Authorize]` + CanView(`/tasks`) |
| Query Params | `userId?`, `from?`, `to?` |
| Response | `ApiResponse<List<TaskCommentDto>>` |

---

### GET `/api/tasks/dashboard-stats`
| Property | Value |
|---|---|
| Authorization | `[Authorize]` |
| Response | `ApiResponse<DashboardStatsDto>` |
| Logic | Returns org-wide task counts by status, priority, project. No permission gate beyond JWT. |

---

### PUT `/api/tasks/{id}/assign`
| Property | Value |
|---|---|
| Authorization | `[Authorize]` — task creator only |
| Request Body | `int? assigneeId` (null = unassign) |
| Response | `ApiResponse<TaskDto>` |

---

### PUT `/api/tasks/{id}/reassign`
| Property | Value |
|---|---|
| Authorization | `[Authorize]` — business logic in service enforces who can reassign |
| Request Body | `ReassignTaskDto { NewAssigneeId?, ReasonTag }` |
| Response | `ApiResponse<TaskDto>` |

---

### POST `/api/tasks/{id}/start`
| Property | Value |
|---|---|
| Authorization | `[Authorize]` |
| Response | `ApiResponse<TaskDto>` |
| Logic | Sets `StartedAt`, `StartedById`, transitions status to `in_progress`. Only assignee can start. |

---

### PUT `/api/tasks/{id}/status`
| Property | Value |
|---|---|
| Authorization | `[Authorize]` |
| Request Body | `ChangeStatusDto { ToStatus, Reason?, ActualHours? }` |
| Response | `ApiResponse<TaskDto>` |
| Logic | Enforces `AllowedEdges` state machine. `ActualHours` required for certain transitions. 100% checklist gate before `completed`. Manager-only `reopened`. |

---

### GET `/api/tasks/{id}/status-history`
| Property | Value |
|---|---|
| Authorization | `[Authorize]` + CanView(`/tasks`) |
| Response | `ApiResponse<List<TaskStatusHistoryDto>>` |

---

### GET `/api/tasks/{id}/effort`
| Property | Value |
|---|---|
| Authorization | `[Authorize]` + CanView(`/tasks`) |
| Response | `ApiResponse<TaskEffortDto>` |
| Logic | Returns hours breakdown for a single task. Filters to 10:00–19:00 IST window via `EffortHelpers`. |

---

### GET `/api/tasks/effort-stats`
| Property | Value |
|---|---|
| Authorization | `[Authorize]` |
| Query Params | `from?`, `to?` (UTC) |
| Response | `ApiResponse<DashboardEffortDto>` |
| Logic | Org-wide effort summary; optional UTC date window. |

---

### POST `/api/tasks/{id}/qa/pass`
| Property | Value |
|---|---|
| Authorization | `[Authorize]` |
| Response | `ApiResponse<TaskDto>` |
| Logic | QA reviewer approves — transitions to `completed`. No `ActualHours` required (reviewer, not assignee). |

---

### POST `/api/tasks/{id}/qa/fail`
| Property | Value |
|---|---|
| Authorization | `[Authorize]` |
| Request Body | `ChangeStatusDto { Reason? }` |
| Response | `ApiResponse<TaskDto>` |
| Logic | QA reviewer rejects — transitions to `issues` (`qa_failed`). No `ActualHours` required. |

---

### GET `/api/tasks/{id}/assignment-history`
| Property | Value |
|---|---|
| Authorization | `[Authorize]` + CanView(`/tasks`) |
| Response | `ApiResponse<List<TaskAssignmentHistoryDto>>` |

---

### POST `/api/tasks/{id}/checklist`
| Property | Value |
|---|---|
| Authorization | `[Authorize]` — task creator or project owner |
| Request Body | `CreateChecklistItemDto` |
| Response | `ApiResponse<ChecklistItemDto>` |

---

### PUT `/api/tasks/{id}/checklist/{itemId}/toggle`
| Property | Value |
|---|---|
| Authorization | `[Authorize]` — assignee or task creator |
| Request Body | `ToggleChecklistItemDto { IsCompleted }` |
| Response | `ApiResponse<ChecklistItemDto>` |

---

### PUT `/api/tasks/{id}/checklist/{itemId}`
| Property | Value |
|---|---|
| Authorization | `[Authorize]` — task creator or project owner |
| Request Body | `UpdateChecklistItemDto` |
| Response | `ApiResponse<ChecklistItemDto>` |

---

### DELETE `/api/tasks/{id}/checklist/{itemId}`
| Property | Value |
|---|---|
| Authorization | `[Authorize]` — task creator or project owner |
| Response | `ApiResponse<bool>` |

---

### POST `/api/tasks/{id}/checklist/mark-all-complete`
| Property | Value |
|---|---|
| Authorization | `[Authorize]` — service enforces assignee-only |
| Response | `ApiResponse<bool>` |

---

### PUT `/api/tasks/{id}/block`
| Property | Value |
|---|---|
| Authorization | `[Authorize]` |
| Request Body | `SetTaskBlockDto` |
| Response | `ApiResponse<TaskDto>` |
| Logic | Adds or resolves a task block entry. Unique constraint: one active block per user per task. |

---

### GET `/api/tasks/{id}/block-entries`
| Property | Value |
|---|---|
| Authorization | `[Authorize]` + CanView(`/tasks`) |
| Response | `ApiResponse<List<TaskBlockEntryDto>>` |

---

## 3.4 Projects Endpoints

### GET `/api/projects`
| Property | Value |
|---|---|
| Authorization | `[Authorize]` + CanView(`/projects`) |
| Response | `ApiResponse<List<ProjectDto>>` |

---

### GET `/api/projects/{id}`
| Property | Value |
|---|---|
| Authorization | `[Authorize]` + CanView(`/projects`) |
| Response | `ApiResponse<ProjectDto>` |
| Failure | 404 Not Found |

---

### POST `/api/projects`
| Property | Value |
|---|---|
| Authorization | `[Authorize]` + IsAdmin AND CanCreate(`/projects`) |
| Request Body | `ProjectDto` |
| Response | 201 Created + `ApiResponse<ProjectDto>` |

---

### PUT `/api/projects/{id}`
| Property | Value |
|---|---|
| Authorization | `[Authorize]` + IsAdmin AND CanUpdate(`/projects`) |
| Request Body | `ProjectDto` |
| Response | `ApiResponse<ProjectDto>` |

---

### DELETE `/api/projects/{id}`
| Property | Value |
|---|---|
| Authorization | `[Authorize]` + IsAdmin AND CanDelete(`/projects`) |
| Response | `ApiResponse<bool>` |

---

### PUT `/api/projects/{id}/reassign`
| Property | Value |
|---|---|
| Authorization | `[Authorize]` + CanUpdate(`/projects`) |
| Request Body | `ReassignProjectDto { NewOwnerId, ReasonTag }` |
| Response | `ApiResponse<ProjectDto>` |
| Logic | Records history entry in `ProjectAssignmentHistories`. |

---

### GET `/api/projects/{id}/assignment-history`
| Property | Value |
|---|---|
| Authorization | `[Authorize]` + CanView(`/projects`) |
| Response | `ApiResponse<List<ProjectAssignmentHistoryDto>>` |

---

### POST `/api/projects/{id}/assign`
| Property | Value |
|---|---|
| Authorization | `[Authorize]` + CanUpdate(`/projects`) |
| Request Body | `int userId` |
| Query Params | `role` (default: `"Developer"`) |
| Response | `ApiResponse<bool>` |

---

### DELETE `/api/projects/{id}/members/{userId}`
| Property | Value |
|---|---|
| Authorization | `[Authorize]` + CanUpdate(`/projects`) |
| Response | `ApiResponse<bool>` |

---

### PUT `/api/projects/{id}/members`
| Property | Value |
|---|---|
| Authorization | `[Authorize]` + CanUpdate(`/projects`) |
| Request Body | `List<int> userIds` |
| Response | `ApiResponse<ProjectDto>` |
| Logic | Replaces the full member list in one call. |

---

## 3.5 Users Endpoints

### GET `/api/users`
| Property | Value |
|---|---|
| Authorization | `[Authorize]` + CanView(`/users`) |
| Response | `ApiResponse<List<UserDto>>` |
| Logic | Excludes SystemAdmin user (`Id <= 1`) from the returned list. |

---

### GET `/api/users/assignable`
| Property | Value |
|---|---|
| Authorization | `[Authorize]` + CanView(`/users`) |
| Response | `ApiResponse<List<UserDto>>` |
| Logic | Returns only active users excluding those with `RoleId=1` (SystemAdmin). Used in task/project assignment dropdowns. |

---

### GET `/api/users/{id}`
| Property | Value |
|---|---|
| Authorization | `[Authorize]` + CanView(`/users`) |
| Response | `ApiResponse<UserDto>` |
| Logic | `id <= 1` returns 403 (protected user guard). |

---

### POST `/api/users`
| Property | Value |
|---|---|
| Authorization | `[Authorize]` + CanCreate(`/users`) |
| Request Body | `CreateUserDto` |
| Response | 201 Created + `ApiResponse<UserDto>` |

---

### PUT `/api/users/{id}`
| Property | Value |
|---|---|
| Authorization | `[Authorize]` + CanUpdate(`/users`) |
| Request Body | `UpdateUserDto` |
| Response | `ApiResponse<UserDto>` |

---

### DELETE `/api/users/{id}`
| Property | Value |
|---|---|
| Authorization | `[Authorize]` + CanDelete(`/users`) |
| Response | `ApiResponse<bool>` |

---

### POST `/api/users/{id}/reset-password`
| Property | Value |
|---|---|
| Authorization | `[Authorize]` — SystemAdmin role only |
| Response | `ApiResponse<string>` (returns temp password in message) |
| Logic | Generates cryptographically random 12-char base64 temp password via `RandomNumberGenerator`. Cannot reset SystemAdmin (`id <= 1`). |

---

## 3.6 Roles Endpoints

### GET `/api/roles`
| Property | Value |
|---|---|
| Authorization | `[Authorize]` + CanView(`/roles`) |
| Response | `ApiResponse<List<RoleDto>>` |

---

### GET `/api/roles/{id}`
| Property | Value |
|---|---|
| Authorization | `[Authorize]` + CanView(`/roles`) |
| Logic | `id <= 1` returns 403 (protected role guard). |

---

### POST `/api/roles` (Create or Update)
| Property | Value |
|---|---|
| Authorization | `[Authorize]` + CanCreate(`/roles`) for new; CanUpdate(`/roles`) for existing (`Id > 0`) |
| Request Body | `RoleDto` |
| Logic | Single endpoint handles both create and update — discriminated by `Id > 0`. |

---

### DELETE `/api/roles/{id}`
| Property | Value |
|---|---|
| Authorization | `[Authorize]` + CanDelete(`/roles`) |
| Response | `ApiResponse<bool>` |

---

## 3.7 Activities Endpoints

### GET `/api/activities`
| Property | Value |
|---|---|
| Authorization | `[Authorize]` (no permission gate — any authenticated user) |
| Response | `ApiResponse<List<ActivityDto>>` |

---

### POST `/api/activities`
| Property | Value |
|---|---|
| Authorization | `[Authorize]` (no permission gate) |
| Request Body | `CreateActivityDto` |
| Response | `ApiResponse<ActivityDto>` |
| Logic | Client-driven activity creation. No server-side actor validation. |

---

## 3.8 Chat Endpoints

### GET `/api/chat/messages`
| Property | Value |
|---|---|
| Authorization | `[Authorize]` |
| Query Params | `count=50`, `beforeId?`, `roomId?` |
| Response | `List<ChatMessageDto>` (no `ApiResponse` wrapper) |
| Logic | Cursor-based pagination (before ID). `roomId=null` = global channel. |

---

### GET `/api/chat/rooms`
| Property | Value |
|---|---|
| Authorization | `[Authorize]` |
| Response | Room list for current user |

---

### POST `/api/chat/rooms`
| Property | Value |
|---|---|
| Authorization | `[Authorize]` |
| Request Body | `CreateChatRoomDto { Name, RoomType, MemberIds }` |
| Response | Created room |

---

### POST `/api/chat/rooms/direct/{otherUserId}`
| Property | Value |
|---|---|
| Authorization | `[Authorize]` |
| Response | Existing or new direct room between current user and `otherUserId` |
| Logic | Idempotent — returns existing DM room if one already exists. |

---

### POST `/api/chat/upload`
| Property | Value |
|---|---|
| Authorization | `[Authorize]` |
| Request Body | `multipart/form-data` — field name `file` |
| Max Size | 25 MB |
| Response | `ChatAttachment` object |
| Logic | Validates via magic-byte check. Saves to `wwwroot/chat-uploads/`. Creates placeholder message then attaches. |

---

### GET `/api/chat/file/{attachmentId}`
| Property | Value |
|---|---|
| Authorization | `[Authorize]` |
| Response | File stream with original MIME type |
| Security | Path-traversal guard — resolves path and verifies it stays within `wwwroot/`. |

---

## 3.9 Reports Endpoints

### GET `/api/reports/user-effort`
| Property | Value |
|---|---|
| Authorization | `[Authorize]` |
| Query Params | `from?`, `to?` |
| Response | `ApiResponse<UserEffortReportDto>` |
| Logic | Non-admin sees own effort only. Admin sees all users. |

---

### GET `/api/reports/user-transitions`
| Property | Value |
|---|---|
| Authorization | `[Authorize]` |
| Query Params | `from?`, `to?` |
| Response | `ApiResponse<UserTransitionReportDto>` |
| Logic | Status-transition frequency report. Admin vs self scoping. |

---

### GET `/api/reports/user-task-effort`
| Property | Value |
|---|---|
| Authorization | `[Authorize]` |
| Query Params | `userId`, `from?`, `to?` |
| Response | `ApiResponse<UserTaskEffortReportDto>` |
| Logic | Non-admin can only view own data — 403 otherwise. |

---

### GET `/api/reports/user-daily-effort`
| Property | Value |
|---|---|
| Authorization | `[Authorize]` |
| Query Params | `userId`, `from?`, `to?` |
| Response | `ApiResponse<UserDailyEffortReportDto>` |
| Logic | Daily breakdown of effort hours. Admin vs self scoping. |

---

### GET `/api/reports/hours-summary`
| Property | Value |
|---|---|
| Authorization | `[Authorize]` |
| Query Params | `from?`, `to?`, `userId?`, `projectId?` |
| Response | `ApiResponse<HoursSummaryDto>` |
| Logic | Filterable aggregated hours. Admin can filter by any user; non-admin scoped to self. |

---

## 3.10 Permissions Endpoints

### GET `/api/permissions/my`
| Property | Value |
|---|---|
| Authorization | `[Authorize]` |
| Response | `[{ pageModuleId, route, permissions }]` |
| Logic | Returns effective permission bitmap per page for the authenticated user. User-level overrides role-level. `IsAdmin` roles always get `15` (full access). |

---

### GET `/api/permissions/pages`
| Property | Value |
|---|---|
| Authorization | `[Authorize]` + IsSystemAdmin |
| Response | `List<PageModule>` |

---

### GET `/api/permissions/roles`
| Property | Value |
|---|---|
| Authorization | `[Authorize]` + IsSystemAdmin |
| Response | `List<Role>` |

---

### GET `/api/permissions/role/{roleId}`
| Property | Value |
|---|---|
| Authorization | `[Authorize]` + IsSystemAdmin |
| Response | `List<RolePagePermission>` with `PageModule` included |

---

### PUT `/api/permissions/role/{roleId}`
| Property | Value |
|---|---|
| Authorization | `[Authorize]` + IsSystemAdmin |
| Request Body | `List<PermissionUpdateDto { PageModuleId, Permissions }>` |
| Logic | Upserts — updates existing row or creates new one. |

---

### GET `/api/permissions/user/{userId}`
| Property | Value |
|---|---|
| Authorization | `[Authorize]` + IsSystemAdmin |
| Response | `List<UserPagePermission>` with `PageModule` included |

---

### PUT `/api/permissions/user/{userId}`
| Property | Value |
|---|---|
| Authorization | `[Authorize]` + IsSystemAdmin |
| Request Body | `List<PermissionUpdateDto>` |
| Logic | Full replace — removes all existing user permissions then inserts new ones (only non-zero values stored). |

---

### DELETE `/api/permissions/user/{userId}`
| Property | Value |
|---|---|
| Authorization | `[Authorize]` + IsSystemAdmin |
| Logic | Removes all user-level overrides — falls back to role permissions. |

---

## 3.11 Disabled Endpoints

| Controller | Reason |
|---|---|
| `BackupController` (`POST /api/backup`) | Entire class commented out. `IDatabaseBackupService` also commented out of DI in `Program.cs`. |

---

## 3.12 Common Error Response Patterns

| Scenario | HTTP Status |
|---|---|
| Missing/invalid JWT | 401 Unauthorized |
| Permission denied | 403 Forbidden |
| Resource not found | 404 Not Found |
| Validation failure | 400 Bad Request |
| Custom error code `"FORBIDDEN"` in service | 403 via `StatusCode(403, result)` |
| File path traversal attempt | 400 Bad Request |
| Chat file > 25MB | 413 (enforced by `[RequestSizeLimit]`) |
