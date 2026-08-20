# Phase 5 – Functional Module Discovery

**Source evidence:** All `Controllers/`, `Services/`, `Data/PMSDbContext.cs`, `DTOs/GeneralDtos.cs`, `ClientApp/src/pages/`, `ClientApp/src/context/`, `ClientApp/src/services/`

Modules are discovered from source code only. No functionality is inferred.

---

## Module Index

| # | Module | Confidence |
|---|---|---|
| 1 | Authentication | High |
| 2 | User Management | High |
| 3 | Role Management | High |
| 4 | Project Management | High |
| 5 | Task Management | High |
| 6 | Task Checklist | High |
| 7 | Task Blocking | High |
| 8 | Task Effort & Time Tracking | High |
| 9 | Real-Time Chat | High |
| 10 | Activity Log | High |
| 11 | Reports & Analytics | High |
| 12 | Permission Administration | High |
| 13 | Dashboard | High |
| 14 | File Attachments | High |

---

## Module 1 – Authentication

| Property | Value |
|---|---|
| **Purpose** | User identity verification and session establishment |
| **Description** | Handles login, self-registration, token validation, availability checking, and password reset. |
| **User Roles** | All roles (login/register), SystemAdmin (reset password) |
| **API Endpoints** | `POST /api/auth/login`, `POST /api/auth/register`, `GET /api/auth/validate`, `GET /api/auth/check-availability` |
| **Database Entities** | `Users`, `Roles` |
| **UI Screens** | `/auth` (Auth.tsx) |
| **Evidence** | `Controllers/AuthController.cs`, `Services/AuthService.cs`, `ClientApp/src/pages/Auth.tsx`, `ClientApp/src/context/AuthContext.tsx` |
| **Confidence** | High |

### Features
- Login with username (case-sensitive) or email (case-insensitive)
- Self-registration with auto-role assignment
- JWT token issuance (7-hour lifetime)
- Token validation on app load (`GET /api/auth/validate`)
- Live availability check for username/email during registration
- Inactive account blocking (same error as wrong password to avoid info leak)
- SystemAdmin can reset any user's password to a random 12-char temp password

### Business Rules
- `BR-AUTH-01`: Username comparison is case-sensitive; Email comparison is case-insensitive
- `BR-AUTH-02`: Inactive accounts cannot log in; error message is identical to wrong password
- `BR-AUTH-03`: Self-registration never assigns SystemAdmin role (RoleId=1)
- `BR-AUTH-04`: Password minimum length: 6 characters
- `BR-AUTH-05`: Password reset is restricted to SystemAdmin role only
- `BR-AUTH-06`: SystemAdmin account itself cannot be reset via the endpoint (`id <= 1` guard)

---

## Module 2 – User Management

| Property | Value |
|---|---|
| **Purpose** | Lifecycle management of user accounts |
| **Description** | CRUD operations for users; assignable user listing; avatar management; active/inactive toggling. |
| **User Roles** | Requires `CanCreate/Update/Delete(/users)` permission; SystemAdmin for password reset |
| **API Endpoints** | `GET /api/users`, `GET /api/users/assignable`, `GET /api/users/{id}`, `POST /api/users`, `PUT /api/users/{id}`, `DELETE /api/users/{id}`, `POST /api/users/{id}/reset-password` |
| **Database Entities** | `Users`, `Roles` |
| **UI Screens** | `/users` (Users.tsx), `/users/:id` (UserDetails.tsx) |
| **Evidence** | `Controllers/UsersController.cs`, `Services/UserService.cs`, `ClientApp/src/pages/Users.tsx`, `ClientApp/src/pages/UserDetails.tsx` |
| **Confidence** | High |

### Features
- List all users (SystemAdmin excluded from management list)
- Get assignable users (active, non-admin roles only)
- Create user with role assignment, avatar, contact number
- Update user profile (name, email, role, active status)
- Soft-delete user
- Password reset by SystemAdmin (generates random temp password)

### Business Rules
- `BR-USR-01`: SystemAdmin user (`Id <= 1`) is excluded from user lists and protected from modification via API
- `BR-USR-02`: Username must be 3–50 chars, unique; Email must be 1–256 chars, unique
- `BR-USR-03`: `GET /api/users/assignable` excludes RoleId=1 users from task/project assignment
- `BR-USR-04`: Deactivating a user blocks login but does not invalidate existing JWT tokens

---

## Module 3 – Role Management

| Property | Value |
|---|---|
| **Purpose** | Define organizational roles and their privilege levels |
| **Description** | Manages role definitions. Roles are assigned to users and linked to page permissions. |
| **User Roles** | Requires `CanCreate/Update/Delete(/roles)` permission |
| **API Endpoints** | `GET /api/roles`, `GET /api/roles/{id}`, `POST /api/roles` (create+update), `DELETE /api/roles/{id}` |
| **Database Entities** | `Roles`, `Users`, `RolePagePermissions` |
| **UI Screens** | `/roles` (Roles.tsx) |
| **Evidence** | `Controllers/RolesController.cs`, `Services/RoleService.cs`, `ClientApp/src/pages/Roles.tsx` |
| **Confidence** | High |

### Features
- List all roles
- Create or update role (single endpoint, discriminated by `Id > 0`)
- Delete role
- Role has: `Name`, `Code` (unique short code), `Level` (hierarchy rank), `Description`, `IsAdmin`, `IsActive`

### Business Rules
- `BR-ROLE-01`: System Administrator role (`Id <= 1`) is protected — cannot be fetched or modified via API (403 guard)
- `BR-ROLE-02`: `Role.Code` is unique (filtered unique index allows multiple NULL values)
- `BR-ROLE-03`: `IsAdmin = true` on any role grants full permissions equivalent to SystemAdmin
- `BR-ROLE-04`: `Level` field defines hierarchy rank (lower number = higher authority)

---

## Module 4 – Project Management

| Property | Value |
|---|---|
| **Purpose** | Organize work into discrete projects with ownership and membership |
| **Description** | Full lifecycle management of projects: create, update, archive, membership management, and ownership transfer with history. |
| **User Roles** | Admin required for create/update/delete; CanUpdate for membership and reassignment |
| **API Endpoints** | `GET /api/projects`, `GET /api/projects/{id}`, `POST /api/projects`, `PUT /api/projects/{id}`, `DELETE /api/projects/{id}`, `PUT /api/projects/{id}/reassign`, `GET /api/projects/{id}/assignment-history`, `POST /api/projects/{id}/assign`, `DELETE /api/projects/{id}/members/{userId}`, `PUT /api/projects/{id}/members` |
| **Database Entities** | `Projects`, `ProjectMembers`, `ProjectModules`, `ProjectAssignmentHistories` |
| **UI Screens** | `/projects` (Projects.tsx), `/projects/:id` (ProjectDetails.tsx) |
| **Evidence** | `Controllers/ProjectsController.cs`, `Services/ProjectService.cs`, `ClientApp/src/pages/Projects.tsx`, `ClientApp/src/pages/ProjectDetails.tsx` |
| **Confidence** | High |

### Features
- List all projects with member count, task count, progress
- Project detail with members, modules, assignment history
- Create project (admin only) — auto-generates `Code` (e.g. `PRJ-01`)
- Update project (admin only)
- Delete project (admin only)
- Transfer project ownership with reason tag and history entry
- Add/remove individual members
- Bulk set members (replaces full list)
- Project modules (sub-areas like "Backend", "Frontend")

### Business Rules
- `BR-PRJ-01`: Only admins can create, update, or delete projects
- `BR-PRJ-02`: Project ownership transfer requires a `ReasonTag` from the valid `ReasonTags` set
- `BR-PRJ-03`: Every ownership transfer is recorded in `ProjectAssignmentHistories`
- `BR-PRJ-04`: Project `Code` is auto-generated (`PRJ-{SeqNumber:D2}`) and unique
- `BR-PRJ-05`: Project `Status` values: `Active`, `Archived`, `Completed`

---

## Module 5 – Task Management

| Property | Value |
|---|---|
| **Purpose** | Core work-item lifecycle from creation to completion |
| **Description** | Task CRUD, status workflow state machine, assignment, QA review path, subtask hierarchy, comments, and tags. |
| **User Roles** | All roles with appropriate permissions; specific sub-rules per action |
| **API Endpoints** | 24 endpoints on `/api/tasks/**` |
| **Database Entities** | `Tasks`, `TaskTags`, `TaskComments`, `TaskAssignmentHistories`, `TaskStatusHistories` |
| **UI Screens** | `/tasks` (Tasks.tsx), `/projects/:id` (includes task board), QuickView panel |
| **Evidence** | `Controllers/TasksController.cs`, `Services/TaskService.cs`, `ClientApp/src/pages/Tasks.tsx` |
| **Confidence** | High |

### Features
- Paginated task listing with filters (status, priority, project, assignee)
- Create task with estimated hours, due date, tags, module, QA flag, subtask parent
- Auto-generated task code (`TSK-PP-TT` or `SUB-PP-TT-SS`)
- Status workflow with enforced state machine transitions
- Task assignment (by creator) and reassignment (with reason)
- Start task (sets `StartedAt`, `StartedById`)
- QA review path: `under_review` → `completed` (pass) or `qa_failed` (fail)
- Status history tracking on every transition
- Parent/child task hierarchy (subtasks)
- Comments (restricted to task creator, assignee, project owner/creator)
- Tags (free-text, multiple)
- Assignment history

### Status Workflow State Machine

```
new ──────────────────────────────────► in_progress
                                              │
                                    ┌─────────┼─────────┐
                                    ▼         ▼         ▼
                                 paused    blocked   under_review
                                    │                    │
                                    ▼                    ├─► completed (QA pass)
                                in_progress              └─► qa_failed (QA fail)
                                                              │
                                                              ▼
                                                          in_progress
completed ──► reopened (manager only) ──► in_progress
```

### Business Rules
- `BR-TASK-01`: Only the task creator can initially assign a task via `PUT /assign`
- `BR-TASK-02`: Only the assignee can start a task (`POST /start`)
- `BR-TASK-03`: `EstimatedHours > 0` required on task creation (`[Range(0.01, 100000)]`)
- `BR-TASK-04`: `ActualHours` required when transitioning into `in_progress`, `paused`, `completed`, `under_review`; not required for `new`, `blocked`, or QA reviewer actions
- `BR-TASK-05`: 100% checklist completion required before `completed` status
- `BR-TASK-06`: Only managers/admins can reopen a completed task (`reopened` status)
- `BR-TASK-07`: Task reassignment requires a `ReasonTag` from the valid set
- `BR-TASK-08`: State machine transitions are enforced via `AllowedEdges` dictionary in `TaskService`
- `BR-TASK-09`: Task code auto-generated; top-level: `TSK-{ProjSeq}-{TaskSeq}`, subtask: `SUB-{ProjSeq}-{ParentSeq}-{ChildSeq}`
- `BR-TASK-10`: Only task creator, current assignee, or project owner/creator can comment

---

## Module 6 – Task Checklist

| Property | Value |
|---|---|
| **Purpose** | Sub-items within a task that gate completion |
| **Description** | Ordered checklist items per task. Must be 100% complete before task can be marked completed. |
| **User Roles** | Task creator / project owner (add/edit/delete); assignee (toggle) |
| **API Endpoints** | `POST /api/tasks/{id}/checklist`, `PUT /api/tasks/{id}/checklist/{itemId}`, `DELETE /api/tasks/{id}/checklist/{itemId}`, `PUT /api/tasks/{id}/checklist/{itemId}/toggle`, `POST /api/tasks/{id}/checklist/mark-all-complete` |
| **Database Entities** | `ChecklistItems` |
| **UI Screens** | Task detail panel (ChecklistPanel.tsx) |
| **Evidence** | `Controllers/TasksController.cs`, `Services/TaskService.cs`, `ClientApp/src/components/ui/ChecklistPanel.tsx` |
| **Confidence** | High |

### Business Rules
- `BR-CHK-01`: 100% checklist completion is a hard gate — task cannot be completed if any item is unchecked
- `BR-CHK-02`: Only the assignee can mark items complete (`toggle`)
- `BR-CHK-03`: Only task creator or project owner can add, edit, or delete items
- `BR-CHK-04`: Items have an `OrderIndex` for display sorting

---

## Module 7 – Task Blocking

| Property | Value |
|---|---|
| **Purpose** | Track and manage blockers that prevent task progress |
| **Description** | Any user can raise a block on a task. Each block has a reason. Blocks must be resolved to unblock. Unique constraint: one active block per user per task. |
| **API Endpoints** | `PUT /api/tasks/{id}/block`, `GET /api/tasks/{id}/block-entries` |
| **Database Entities** | `TaskBlockEntries` |
| **UI Screens** | Task detail panel (TaskBlockPanel.tsx) |
| **Evidence** | `Controllers/TasksController.cs`, `Services/TaskService.cs`, `ClientApp/src/components/ui/TaskBlockPanel.tsx` |
| **Confidence** | High |

### Business Rules
- `BR-BLK-01`: One active block per user per task (enforced by unique index on `TaskId + BlockedById`)
- `BR-BLK-02`: Block has `IsActive` flag; resolving sets `ResolvedAt` and `IsActive = false`
- `BR-BLK-03`: Block reason is required (`nvarchar(1000)`)

---

## Module 8 – Task Effort & Time Tracking

| Property | Value |
|---|---|
| **Purpose** | Measure time spent in each task status; drive productivity reports |
| **Description** | Effort is calculated from status history timestamps, filtered to working hours (10:00–19:00 IST). `ActualHours` is self-reported per status transition. Org-wide and per-task breakdowns available. |
| **API Endpoints** | `GET /api/tasks/{id}/effort`, `GET /api/tasks/effort-stats`, `GET /api/reports/user-effort`, `GET /api/reports/user-transitions`, `GET /api/reports/user-task-effort`, `GET /api/reports/user-daily-effort`, `GET /api/reports/hours-summary` |
| **Database Entities** | `TaskStatusHistories`, `Tasks` |
| **UI Screens** | `/reports` (Reports.tsx), task effort panel (TaskEffortPanel.tsx) |
| **Evidence** | `Services/EffortHelpers.cs`, `Services/ReportService.cs`, `Controllers/ReportsController.cs`, `appsettings.json WorkingHours` |
| **Confidence** | High |

### Features
- Per-task effort: productive, paused, blocked, under-review seconds
- Timeline of status segments per task
- Per-user effort breakdown per task
- Org-wide effort summary with top productive users
- Working-hours filter: only counts time between 10:00–19:00 (configurable via `appsettings.json`)
- Date-range filters on all report endpoints

### Business Rules
- `BR-EFF-01`: Only time within the working-hours window (default 10:00–19:00) is counted as productive
- `BR-EFF-02`: `in_progress` time = productive; `paused` time = non-productive
- `BR-EFF-03`: Non-admin users can only view their own effort data
- `BR-EFF-04`: `ActualHours` is self-reported by the user on each status transition and stored in `TaskStatusHistories`

---

## Module 9 – Real-Time Chat

| Property | Value |
|---|---|
| **Purpose** | Team communication via real-time messaging |
| **Description** | SignalR-powered chat with a global channel and private/public/direct rooms. Supports text messages, file attachments, threading (replies), typing indicators, and online presence. |
| **User Roles** | All authenticated users |
| **API Endpoints** | `GET /api/chat/messages`, `GET /api/chat/rooms`, `POST /api/chat/rooms`, `POST /api/chat/rooms/direct/{otherUserId}`, `POST /api/chat/upload`, `GET /api/chat/file/{attachmentId}` |
| **SignalR Hub** | `/hubs/chat` |
| **Database Entities** | `ChatMessages`, `ChatRooms`, `ChatRoomMembers`, `ChatAttachments` |
| **UI Screens** | `/chat` (Chat.tsx) |
| **Evidence** | `Controllers/ChatController.cs`, `Services/ChatService.cs`, `Hubs/ChatHub.cs`, `ClientApp/src/pages/Chat.tsx`, `ClientApp/src/context/ChatContext.tsx` |
| **Confidence** | High |

### Features
- Global public channel (`RoomId = null`)
- Named public/private rooms
- Direct message rooms (1:1, idempotent creation)
- Message threading (reply-to)
- File upload and download (max 25 MB, magic-byte validation)
- Cursor-based message pagination (`beforeId`)
- Typing indicators
- Online presence (connected users list)
- In-app browser notifications via Web Notifications API
- Unread message count badge

### Business Rules
- `BR-CHAT-01`: File uploads validated by magic-byte check (not just extension)
- `BR-CHAT-02`: Max file size: 25 MB (enforced by `[RequestSizeLimit]`)
- `BR-CHAT-03`: File download has path-traversal guard (resolved path must stay within `wwwroot/`)
- `BR-CHAT-04`: Direct message room creation is idempotent — returns existing room if one exists
- `BR-CHAT-05`: `IsDeleted = true` flag for soft-deleted messages (UI behavior not verified)

---

## Module 10 – Activity Log

| Property | Value |
|---|---|
| **Purpose** | Immutable audit trail of user actions |
| **Description** | Records who did what to which entity. Denormalized (stores username snapshot). No FK on `UserId`. |
| **User Roles** | All authenticated users can read; any authenticated user can write |
| **API Endpoints** | `GET /api/activities`, `POST /api/activities` |
| **Database Entities** | `Activities` |
| **UI Screens** | Dashboard widget (Dashboard.tsx) |
| **Evidence** | `Controllers/ActivitiesController.cs`, `Services/ActivityService.cs`, `Data/PMSDbContext.cs` |
| **Confidence** | High |

### Business Rules
- `BR-ACT-01`: Activity records are denormalized — `UserId` has no FK, `UserName` is a name snapshot at write time
- `BR-ACT-02`: No permission gate beyond JWT — any authenticated user can read all activities
- `BR-ACT-03`: Any authenticated user can POST activities (client-driven, no server-side actor enforcement) — **Requires Business Validation**

---

## Module 11 – Reports & Analytics

| Property | Value |
|---|---|
| **Purpose** | Productivity and effort analytics for individuals and the organisation |
| **Description** | Multiple report types: user effort, daily breakdown, task-level effort, status transitions, and hours summaries. All scoped by role (admin sees all, others see own). |
| **User Roles** | All authenticated; non-admins see own data only |
| **API Endpoints** | 5 endpoints under `/api/reports/**` |
| **Database Entities** | `TaskStatusHistories`, `Tasks`, `Users` |
| **UI Screens** | `/reports` (Reports.tsx) |
| **Evidence** | `Controllers/ReportsController.cs`, `Services/ReportService.cs`, `ClientApp/src/pages/Reports.tsx` |
| **Confidence** | High |

### Report Types
| Report | Endpoint | Description |
|---|---|---|
| User Effort | `GET /reports/user-effort` | Productive vs paused seconds per user |
| User Transitions | `GET /reports/user-transitions` | Status change frequency |
| Task-Level Effort | `GET /reports/user-task-effort` | Per-task hours for a user |
| Daily Effort | `GET /reports/user-daily-effort` | Day-by-day hours breakdown |
| Hours Summary | `GET /reports/hours-summary` | Aggregated hours with project/user filter |

---

## Module 12 – Permission Administration

| Property | Value |
|---|---|
| **Purpose** | Control what each role and individual user can do in each page module |
| **Description** | SystemAdmin can view and modify role-level and user-level permission bitmaps. Non-admins can only query their own effective permissions. |
| **User Roles** | SystemAdmin for management; all authenticated for `/my` |
| **API Endpoints** | 9 endpoints under `/api/permissions/**` |
| **Database Entities** | `PageModules`, `RolePagePermissions`, `UserPagePermissions` |
| **UI Screens** | `/roles` (Roles.tsx — permissions editor) |
| **Evidence** | `Controllers/PermissionsController.cs`, `ClientApp/src/pages/Roles.tsx` |
| **Confidence** | High |

### Business Rules
- `BR-PERM-01`: User-level permissions override role-level permissions
- `BR-PERM-02`: SystemAdmin (RoleId=1) and IsAdmin roles always get `15` (full access) — no DB lookup
- `BR-PERM-03`: `PUT /permissions/user/{userId}` is a full replace: removes all existing, inserts new (zero values not stored)
- `BR-PERM-04`: Only `IsSystemAdmin` (RoleId=1 specifically) can manage permissions — not just any IsAdmin role

---

## Module 13 – Dashboard

| Property | Value |
|---|---|
| **Purpose** | At-a-glance operational overview for authenticated users |
| **Description** | Aggregated stats: total projects, tasks by status, active users, completed tasks, recent activities, effort summary. |
| **User Roles** | All authenticated users |
| **API Endpoints** | `GET /api/tasks/dashboard-stats`, `GET /api/tasks/effort-stats`, `GET /api/activities` |
| **Database Entities** | `Tasks`, `Projects`, `Users`, `Activities` |
| **UI Screens** | `/` (Dashboard.tsx) |
| **Evidence** | `Controllers/TasksController.cs`, `ClientApp/src/pages/Dashboard.tsx` |
| **Confidence** | High |

### Widgets (inferred from DTOs)
- Total projects count
- Total tasks count
- Active users count
- Completed tasks count
- Tasks by status breakdown
- Org-wide effort stats (productive/paused seconds, top productive users)
- Recent activity feed

---

## Module 14 – File Attachments (Task)

| Property | Value |
|---|---|
| **Purpose** | Attach files to tasks |
| **Description** | File upload and storage for task-related documents. Stored on filesystem within `wwwroot/`. |
| **User Roles** | Authenticated users with task access |
| **Database Entities** | `Attachments` |
| **UI Screens** | Task detail panel (FileUploader.tsx) |
| **Evidence** | `Data/PMSDbContext.cs` Attachment entity, `ClientApp/src/components/ui/FileUploader.tsx` |
| **Confidence** | Medium — endpoint for task file upload not found in controller scan; logic likely embedded in TaskService or handled via direct DB write |

### Notes
- Separate from Chat file attachments (which use `ChatAttachments` table and `POST /api/chat/upload`)
- Task `Attachments` table exists in DB with `FileName`, `FilePath`, `FileType`, `FileSize`, `UploadedById`
- No dedicated REST endpoint confirmed for task file upload — **Requires Business Validation**
