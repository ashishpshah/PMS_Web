# PMS — Use Cases for Testing

Realistic, end-to-end test scenarios against the running stack. Each scenario is self-contained, with proper input data (matching the actual DTO shapes, validation rules, and workflow rules from the codebase) and the expected outcomes you should see. Run the stack first:

```powershell
dotnet run --launch-profile http         # backend on http://localhost:5178
npm run dev                              # frontend on http://localhost:3000
```

The seeded admin is `admin / admin@123` (user id 1, role id 1). All IST timestamps below are produced by `AppClock.Now` server-side.

---

## 1. Authentication & User Management

### 1.1 Login as seeded SystemAdmin

**Request**
```
POST /api/auth/login
Content-Type: application/json

{ "usernameOrEmail": "admin", "password": "admin@123" }
```

**Expected**
- 200 OK
- `success: true`
- `data.token` is a 7-day JWT
- `data.user.id = 1`, `data.user.roleId = 1`, `data.user.isAdmin = true`, `data.user.roleName = "SystemAdmin"`
- `data.user.fullName = "System Admin"`

**Validation failure case — wrong password**
```
POST /api/auth/login
{ "usernameOrEmail": "admin", "password": "wrong" }
```
Expected: 401 with `success: false, message: "Invalid username/email or password"`.

### 1.2 Login with email instead of username

```
POST /api/auth/login
{ "usernameOrEmail": "admin@pms.com", "password": "admin@123" }
```

Expected: 200 OK, same response shape as 1.1. Confirms `LoginAsync` matches by `Email.ToLower() == id` OR `UserName.ToLower() == id`.

### 1.3 Self-registration (no SystemAdmin role assigned)

```
POST /api/auth/register
{
  "firstName": "Aarav",
  "lastName": "Sharma",
  "userName": "aarav",
  "email": "aarav.sharma@pms.com",
  "contactNo": "+91 9876543210",
  "password": "Pms@123"
}
```

**Expected**
- 200 OK
- `data.user.roleId` is the **lowest-privilege non-admin role** (lowest `Level`, `Id != 1`, `!IsAdmin`). If no such role exists, registration fails with `"Registration is not available — no assignable role is configured. Contact an administrator."`
- `data.user.id` is a fresh, auto-generated integer.
- `data.user.fullName = "Aarav Sharma"`.

### 1.4 Live username availability check (frontend debounce)

```
GET /api/auth/check-availability?userName=admin
```

**Expected**
- 200 OK
- `data.userNameChecked: true, userNameAvailable: false` (already taken).

```
GET /api/auth/check-availability?userName=newhire_2026
```

- `data.userNameChecked: true, userNameAvailable: true`.

**Edit form (excludes self)**
```
GET /api/auth/check-availability?userName=aarav&excludeUserId=4
```
If `aarav` belongs to user id 4, returns `userNameAvailable: true` (excluded from the unique check). This is what `useAvailability` in the frontend uses.

### 1.5 Admin creates a new user

```
POST /api/users
Authorization: Bearer <admin token>
{
  "userName": "priya.k",
  "email": "priya.k@pms.com",
  "firstName": "Priya",
  "lastName": "Krishnan",
  "password": "Pms@123",
  "roleId": 2,
  "contactNo": "+91 9123456780",
  "isActive": true
}
```

**Expected**
- 201 Created
- `data.roleName` matches role id 2's name
- `data.isAdmin` is `false` (role 2 is not the SystemAdmin role)

**Negative — try to create with roleId 1**
```
POST /api/users  { ..., "roleId": 1 }
```
Expected: 400 with `"The System Admin role cannot be assigned to additional users."` Enforced by `UserService.CreateUserAsync`.

### 1.6 Validation errors

```
POST /api/users
{ "userName": "ab", "email": "not-an-email", "firstName": "", "lastName": "X", "password": "123", "roleId": 2 }
```

**Expected** — 400 with one or more model-state validation errors from `CreateUserDto`:
- `userName`: min length 3 (`StringLength(50, MinimumLength = 3)`)
- `email`: `EmailAddress`
- `firstName`: `Required, StringLength(100)`
- `password`: `Required, MinLength(6)`

### 1.7 Reset a user's password (SystemAdmin only)

```
POST /api/users/3/reset-password
Authorization: Bearer <admin token>
```

**Expected**
- 200 OK
- `data.message = "Password reset to '123456' for <FullName>"`
- Password is now literally `123456` (PBKDF2 hash rewritten in DB).

**Negative — non-admin attempts**
```
POST /api/users/3/reset-password
Authorization: Bearer <aarav token>  (aarav is role id 2, not SystemAdmin)
```
Expected: 403 with `"Only SystemAdmin can reset user passwords"`.

**Negative — SystemAdmin's own id**
```
POST /api/users/1/reset-password   (target = seeded admin)
```
Expected: 403 with `"Operation not allowed on protected user"`.

---

## 2. Roles

### 2.1 List roles (SystemAdmin role is hidden)

```
GET /api/roles
Authorization: Bearer <admin token>
```

**Expected** — returns the seeded roles with `Id > 1`. The seeded `SystemAdmin` (id 1) is filtered out by `RoleService.GetAllRolesAsync` (`Where(r => r.Id > 1)`).

### 2.2 Create a new role

```
POST /api/roles
Authorization: Bearer <admin token>
{
  "id": 0,
  "name": "Senior Developer",
  "code": "SRDEV",
  "level": 3,
  "description": "Lead contributor",
  "isAdmin": false,
  "isActive": true
}
```

**Expected** — 200 OK, `data.id` is a new integer, `data.code = "SRDEV"`.

### 2.3 Save (update) a role

```
POST /api/roles
{ "id": 3, "name": "Senior Developer", "code": "SRDEV", "level": 2, "isAdmin": false, "isActive": true }
```

**Expected** — 200 OK, persisted with new level.

### 2.4 Code uniqueness collision

```
POST /api/roles  { "id": 0, "name": "Another Senior Dev", "code": "SRDEV", "level": 4, ... }
```

Expected: 400 with `"Role code 'SRDEV' is already in use"`. (Case-insensitive.)

### 2.5 Delete a role

```
DELETE /api/roles/3
Authorization: Bearer <admin token>
```

Expected: 200 OK, `data = true`.

Negative: `DELETE /api/roles/1` → 403 `"Operation not allowed on protected role"`.

---

## 3. Projects

### 3.1 Create a project (admin only)

```
POST /api/projects
Authorization: Bearer <admin token>
{
  "id": 0,
  "name": "PMS Enterprise System",
  "description": "Internal project & task management platform",
  "status": "Active",
  "startDate": "2026-04-01",
  "endDate": "2026-12-31",
  "ownerId": 2,
  "modules": ["Frontend", "Backend", "DevOps", "QA"]
}
```

**Expected**
- 201 Created
- `data.code = "PRJ-01"` (auto-assigned by `CodeGenerator.NextProjectCodeAsync`)
- `data.seqNumber = 1`
- `data.memberCount = 0` (no members yet)
- `data.taskCount = 0`
- `data.modules = ["Frontend", "Backend", "DevOps", "QA"]` (trimmed, distinct, case-insensitive dedup)

### 3.2 Non-admin cannot create a project

```
POST /api/projects
Authorization: Bearer <aarav token>  (role id 2, not admin)
{ "name": "Rogue project", "status": "Active", "ownerId": 2, "modules": [] }
```

Expected: 403 `"You do not have permission to create projects"`. Enforced in `ProjectsController.Create` (`_authService.IsAdmin() && CanCreate("/projects")`).

### 3.3 Set project members (replace-all)

```
PUT /api/projects/1/members
Authorization: Bearer <admin token>
[2, 3, 4]
```

**Expected** — 200 OK, `data.members` is now exactly three rows for users 2, 3, 4. New members default to `RoleInProject = "Developer"`.

### 3.4 Update project modules (with in-use check)

```
PUT /api/projects/1
{
  "id": 1, "name": "PMS Enterprise System",
  "description": "Internal project & task management platform",
  "status": "Active",
  "startDate": "2026-04-01", "endDate": "2026-12-31",
  "ownerId": 2,
  "modules": ["Frontend", "Backend", "DevOps"]   // QA removed
}
```

If at least one task already has `Module = "QA"` (create a task first to reproduce), expected:

- 400 with `"Cannot remove module 'QA' — N task(s) still use it: TSK-01-01, TSK-01-02"` listing the conflicting task codes.

If no task uses "QA", the modules update succeeds.

### 3.5 Reassign project owner

```
PUT /api/projects/1/reassign
Authorization: Bearer <admin token>
{ "newOwnerId": 3, "reasonTag": "Workload Balancing" }
```

**Expected** — 200 OK; `ProjectAssignmentHistory` row written (visible via `GET /api/projects/1/assignment-history`).

### 3.6 Delete a project (cascades)

```
DELETE /api/projects/1
```

**Expected** — 200 OK. Cascade side-effects in `ProjectService.DeleteProjectAsync`:
- `ProjectMembers` removed
- `ProjectAssignmentHistories` removed
- Per-task children (`Tags`, `Comments`, `Attachments`, `TaskAssignmentHistories`, `ChecklistItems`) removed
- `Tasks` removed

---

## 4. Tasks — Happy Path

### 4.1 Create a task (admin / project owner)

```
POST /api/tasks
Authorization: Bearer <admin token>
{
  "title": "Design the authentication flow",
  "description": "Sketch JWT-based login + refresh flow",
  "status": "new",
  "priority": "High",
  "projectId": 1,
  "assignedToId": 2,
  "dueDate": "2026-04-15",
  "module": "Backend",
  "tags": ["auth", "design"],
  "estimatedHours": 4,
  "actualHours": null
}
```

**Expected**
- 201 Created
- `data.code = "TSK-01-01"` (project 1, first top-level task)
- `data.seqNumber = 1`
- `data.estimatedHours = 4`
- `data.checklistItems = []`, `data.comments = []`, `data.assignmentHistory = []`

**Validation** — `estimatedHours <= 0` is rejected:
```
POST /api/tasks { ..., "estimatedHours": 0 }
```
Expected: 400 `"Estimated hours are required and must be greater than zero."` (Enforced in `TaskService.CreateTaskAsync`.)

### 4.2 Create a subtask (with parent)

```
POST /api/tasks
{
  "title": "Token validation middleware",
  "status": "new",
  "priority": "Medium",
  "projectId": 1,
  "assignedToId": 3,
  "estimatedHours": 3,
  "parentTaskId": 1
}
```

**Expected** — `data.code = "SUB-01-01-01"` (parent task 1, project 1, first child).

Parent must be in the same project:
```
POST /api/tasks { ..., "projectId": 1, "parentTaskId": 99 }   (task 99 is in a different project)
```
Expected: 400 `"Parent task must be in the same project"`.

### 4.3 Start a task (assignee only)

```
POST /api/tasks/1/start
Authorization: Bearer <priya token>   (user 2, assigned to task 1)
```

**Expected**
- 200 OK
- `data.status = "in-progress"`
- `data.startedAt` is now (IST, `AppClock.Now`)
- `data.startedById = 2`
- New `TaskStatusHistory` row: `fromStatus = "new", toStatus = "in-progress"`, no `actualHours` (exempt).
- `Activity` row written: `"started task 'Design the authentication flow'"`.

**Negative — non-assignee attempts to start**
```
POST /api/tasks/1/start     (aarav, user 4, not the assignee)
```
Expected: 400 `"Only the assignee can start this task"`.

**Negative — already started**
```
POST /api/tasks/1/start     (priya again)
```
Expected: 400 `"Task already started"`.

### 4.4 Add a checklist item

```
POST /api/tasks/1/checklist
Authorization: Bearer <admin token>
{ "title": "Sketch token-rotation sequence", "orderIndex": 0 }
```

**Expected** — 201 Created, `data.isCompleted = false`. The task's `progress` stays 0 (no items checked yet). **Only the task creator or project owner can add checklist items** (controller `HasTaskEditAccess`).

### 4.5 Toggle the checklist item complete (assignee only)

```
PUT /api/tasks/1/checklist/1/toggle
Authorization: Bearer <priya token>
{ "isCompleted": true }
```

**Expected**
- 200 OK
- `data.isCompleted = true, completedAt = <now>, completedById = 2`
- Task `progress` recomputed to `Math.Round(1/1 * 100) = 100`.
- Because task is in `in-progress` AND checklist is 100% complete, **auto-transitions to `under-review`** via `RecalculateTaskProgressAsync` (writes another `TaskStatusHistory` row with `Reason = "All checklist items completed"`).

**Negative — non-assignee toggles**
```
PUT /api/tasks/1/checklist/1/toggle
Authorization: Bearer <aarav token>  (aarav is not the assignee)
{ "isCompleted": false }
```
Expected: 403 `"No permission: only the current assignee can toggle checklist items"`.

### 4.6 Submit for review (assignee)

```
PUT /api/tasks/1/status
Authorization: Bearer <priya token>
{ "toStatus": "under-review", "actualHours": 3.5 }
```

**Expected**
- 200 OK
- Task stays at `under-review` (already there from auto-transition in 4.5). `TaskStatusHistory` row with `ActualHours = 3.5`.
- Mandatory hours prompt fired on the frontend (only `new` is exempt per `ActualHoursExemptStatuses`).

**Negative — submitted without hours**
```
PUT /api/tasks/1/status
{ "toStatus": "in-progress" }
```
Expected: 400 `"Actual hours are required when moving a task to 'in-progress'."`

### 4.7 QA approval (reviewer action — no hours)

```
POST /api/tasks/1/qa/pass
Authorization: Bearer <qa-reviewer token>   (only valid if task.RequiresQA = true and reviewer is QaAssigneeId)
```

For tasks without `RequiresQA`, the manager approves directly:

```
PUT /api/tasks/1/status
Authorization: Bearer <admin token>
{ "toStatus": "completed", "actualHours": 0.5 }
```

**Expected** — 200 OK, `data.status = "completed"`.

**Negative — assignee is not the manager or QA, tries to complete directly from `under-review`**
```
PUT /api/tasks/1/status
Authorization: Bearer <priya token>
{ "toStatus": "completed", "actualHours": 0.5 }
```
Expected: 400 `"Only the task creator or project owner can complete this task."`

### 4.8 Reopen a completed task (manager only)

```
PUT /api/tasks/1/status
Authorization: Bearer <admin token>
{ "toStatus": "in-progress", "actualHours": 0.25 }
```

**Expected** — 200 OK, `data.status = "in-progress"`. Enforced by `ValidateStatusTransition` (`from = "completed" && !isManager` → error).

Negative as assignee:
```
PUT /api/tasks/1/status
Authorization: Bearer <priya token>
{ "toStatus": "in-progress", "actualHours": 0.25 }
```
Expected: 400 `"Only the manager can reopen a completed task."`

### 4.9 Reassign a task (with reason)

```
PUT /api/tasks/2/reassign
Authorization: Bearer <admin token>
{ "newAssigneeId": 4, "reasonTag": "Workload Balancing" }
```

**Expected** — 200 OK, `data.assigneeId = 4`. `TaskAssignmentHistory` row written. If the task was `blocked`, the active block entries are deactivated and status resumes to `new` (not started) or `in-progress` (started). Reason must be one of:

`Resignation`, `Workload Balancing`, `Management Decision`, `Unavailability`, `No Resource`, `Unable to Complete`, `Admin Decision`, `Other`.

Invalid reason:
```
PUT /api/tasks/2/reassign
{ "newAssigneeId": 5, "reasonTag": "Because I said so" }
```
Expected: 400 `"Invalid reason tag. Must be one of: Resignation, Workload Balancing, ..."`.

---

## 5. Tasks — Block Lifecycle

### 5.1 Block a task (assignee / admin / project owner)

```
PUT /api/tasks/2/block
Authorization: Bearer <aarav token>  (aarav is now the assignee)
{ "isBlocked": true, "reason": "Waiting on UI mockups from design" }
```

**Expected**
- 200 OK
- `data.status = "blocked"`
- `data.isBlocked = true`
- New `TaskBlockEntry` row with `IsActive = true`.

**Negative — no reason**
```
PUT /api/tasks/2/block
{ "isBlocked": true, "reason": "" }
```
Expected: 400 `"A reason is required when blocking a task"`.

**Negative — non-assignee/admin/owner**
```
PUT /api/tasks/2/block
Authorization: Bearer <unrelated user token>
{ "isBlocked": true, "reason": "..." }
```
Expected: 400 `"Only the assignee, an admin, or the project owner can block this task"`.

### 5.2 Cannot change status while blocked (non-admin)

```
PUT /api/tasks/2/status
Authorization: Bearer <aarav token>
{ "toStatus": "in-progress", "actualHours": 0.5 }
```

Expected: 400 `"This task is blocked. It must be unblocked before its status can be changed."`

### 5.3 Admin can bypass the block to change status

```
PUT /api/tasks/2/status
Authorization: Bearer <admin token>
{ "toStatus": "in-progress", "actualHours": 0.5 }
```

Expected: 200 OK. (`isAdmin` is the only escape valve.)

### 5.4 Unblock the task

```
PUT /api/tasks/2/block
Authorization: Bearer <admin token>
{ "isBlocked": false, "reason": "" }
```

**Expected**
- 200 OK
- All active `TaskBlockEntry` rows deactivated with `ResolvedAt = now`.
- `data.status = "in-progress"` (resumes from blocked; if `StartedAt` was null it gets stamped now).

### 5.5 Block a task via status change (with required reason)

```
PUT /api/tasks/2/status
{ "toStatus": "blocked", "reason": "External dependency missing" }
```

Expected: 200 OK. Enforced by `ValidateStatusTransition` — `to == "blocked"` requires a non-empty reason.

---

## 6. Comments

### 6.1 Add a comment to a task

```
POST /api/tasks/1/comments
Authorization: Bearer <priya token>
{ "userId": 2, "userName": "Priya Krishnan", "text": "Sketch attached. Please review by EOD." }
```

Expected: 201 Created, `data.id` is a fresh int. `text` is the comment body (`Content` in the entity).

**Permission failure** — user 3 (not creator, not assignee, not project owner/creator):
```
POST /api/tasks/1/comments
Authorization: Bearer <user-3 token>
{ "userId": 3, ..., "text": "..." }
```
Expected: 403 `"Only the task creator, current assignee, or project owner/creator can comment on this task"`.

### 6.2 Fetch comments (filtered)

```
GET /api/tasks/1/comments?userId=2&from=2026-04-01&to=2026-04-30
```

Expected: 200 OK, returns only Priya's comments in that window.

---

## 7. Status History & Status Logic

### 7.1 Fetch the full status timeline

```
GET /api/tasks/1/status-history
```

Expected: array, ordered by `ChangedAt` desc, including the rows from 4.3, 4.5, 4.6, 4.7 (auto-submit, manual submit, complete), and the `under-review` row. The most recent has the highest `id`.

### 7.2 Invalid transition — `new` cannot go to `paused`

```
PUT /api/tasks/3/status
{ "toStatus": "paused" }
```

Expected: 400 `"Cannot move a task from 'new' to 'paused'."` (Enforced by `AllowedEdges`.)

### 7.3 Invalid target status

```
PUT /api/tasks/3/status
{ "toStatus": "cancelled" }
```

Expected: 400 `"Invalid status 'cancelled'. Allowed: new, in-progress, paused, blocked, under-review, issues, completed"`.

### 7.4 Complete requires 100% checklist (when checklist exists)

After creating a task with one checklist item, leaving it unchecked, then trying to complete:

```
PUT /api/tasks/N/status
{ "toStatus": "completed", "actualHours": 1 }
```

Expected: 400 `"Complete all checklist items before completing the task."`

---

## 8. Effort Tracking

### 8.1 Per-task effort

```
GET /api/tasks/1/effort
```

**Expected** — `TaskEffortDto` with:
- `timeline[]` — every status segment `[start, end, status, seconds, isProductive]`
- `byStatus[]` — totals per status, sorted desc by seconds
- `byUser[]` — per-user productive + paused seconds, attributed via assignment windows
- `isRunning` — `true` if current status is `in-progress`
- `productiveSeconds + pausedSeconds + blockedSeconds + underReviewSeconds + otherSeconds = totalElapsedSeconds`
- All seconds are clipped to **IST 10:00–19:00 working hours** (`EffortHelpers.WorkingOverlap`)

### 8.2 Org-wide effort stats (windowed)

```
GET /api/tasks/effort-stats?from=2026-04-01T00:00:00.000Z&to=2026-05-01T00:00:00.000Z
```

**Expected** — `DashboardEffortDto`:
- `fromUtc` / `toUtc` echoed back
- `productiveSeconds + pausedSeconds` clipped to the window AND working hours
- `usersCurrentlyWorking` — distinct assignees of tasks currently in `in-progress` (live, not windowed)
- `usersInPauseReview` — distinct assignees of tasks currently in `paused`, `under-review`, or `blocked`
- `topProductiveUsers[]` — top 5 by productive seconds, with avatars

### 8.3 "All time" (no window)

```
GET /api/tasks/effort-stats
```

Expected: `fromUtc` / `toUtc` are `null`, totals cover everything since `CreatedAt`.

---

## 9. Reports

### 9.1 User effort report (admin)

```
GET /api/reports/user-effort?from=2026-04-01T00:00:00.000Z&to=2026-05-01T00:00:00.000Z
Authorization: Bearer <admin token>
```

**Expected** — `UserEffortReportDto` with one row per active user, sorted desc by `productiveSeconds`. Each row has `taskCount` (distinct tasks that had effort in the window for that user) and the four time buckets (productive / paused / blocked / under-review).

### 9.2 User effort report (non-admin auto-restricted to self)

```
GET /api/reports/user-effort
Authorization: Bearer <priya token>
```

Expected: `users[]` contains exactly **one** row — Priya. Enforced in `ReportService.GetUserEffortReportAsync`.

### 9.3 User transitions report

```
GET /api/reports/user-transitions
```

Expected: per-user transition counts (`fromStatus → toStatus` → count), `mostCommonTransition` string, sorted by `totalTransitions` desc.

### 9.4 Per-user per-task effort (self only)

```
GET /api/reports/user-task-effort?userId=2
Authorization: Bearer <priya token>
```

Expected: 200 OK, list of tasks Priya was ever assigned to, with per-task effort breakdown.

Cross-user as non-admin:
```
GET /api/reports/user-task-effort?userId=3
Authorization: Bearer <priya token>
```
Expected: 403 `"Forbidden"`.

### 9.5 Per-user per-day effort

```
GET /api/reports/user-daily-effort?userId=2&from=2026-04-01T00:00:00.000Z&to=2026-05-01T00:00:00.000Z
```

Expected: `days[]` — one row per calendar day in range, with `productiveSeconds`, `pausedSeconds`, `blockedSeconds`, `underReviewSeconds`, `totalElapsedSeconds`, `taskCount`. Days with no effort are included so the UI doesn't have gaps.

### 9.6 Hours summary (3-way breakdown)

```
GET /api/reports/hours-summary?userId=2&projectId=1
```

Expected: `HoursSummaryDto` with `byUser[]` (one row for user 2), `byTask[]` (one row per task in project 1 that user 2 ever had), `byProject[]` (one row for project 1 with `userCount = 1`, `taskCount = N`). `totalWorkingSeconds = productive + paused + blocked + under-review`.

---

## 10. Permissions

### 10.1 Fetch my own permissions

```
GET /api/permissions/my
Authorization: Bearer <priya token>
```

**Expected** — `[{ pageModuleId, route: "/", permissions: 15 }, { route: "/projects", permissions: <Priya's role bitmap> }, ...]`. Admin (role id 1) or any `IsAdmin` role → `permissions: 15` for every page.

### 10.2 SystemAdmin updates role permissions

```
PUT /api/permissions/role/2
Authorization: Bearer <admin token>
[
  { "pageModuleId": 1, "permissions": 1 },   // dashboard view only
  { "pageModuleId": 2, "permissions": 15 },  // projects full
  { "pageModuleId": 3, "permissions": 0 },
  { "pageModuleId": 4, "permissions": 0 },
  { "pageModuleId": 5, "permissions": 0 }
]
```

**Expected** — 200 OK, `message: "Permissions updated successfully"`. Subsequent `GET /api/permissions/my` as a user with role 2 reflects the new bitmaps.

### 10.3 User-level override (replaces all)

```
PUT /api/permissions/user/2
Authorization: Bearer <admin token>
[
  { "pageModuleId": 3, "permissions": 15 }   // tasks full
]
```

**Expected** — 200 OK. The implementation deletes all existing `UserPagePermission` rows for user 2 then inserts the non-zero ones (`Permissions > 0` filter). User 2 now gets full tasks access even if their role says otherwise.

### 10.4 Clear user-level override

```
DELETE /api/permissions/user/2
Authorization: Bearer <admin token>
```

Expected: 200 OK, `"User permissions cleared"`. User 2 falls back to their role's bitmaps.

### 10.5 Non-admin cannot view /permissions/pages

```
GET /api/permissions/pages
Authorization: Bearer <priya token>
```

Expected: 403 `"You do not have permission to view page modules"`. Only `_authService.IsSystemAdmin()` (role id 1) may read this.

---

## 11. Activities

### 11.1 List recent activities

```
GET /api/activities
```

**Expected** — last 100 activities, ordered desc by `Timestamp`. Includes the audit rows written during task start, status changes, reassignments, block toggles, and checklist ops performed in earlier scenarios.

---

## 12. Chat

### 12.1 List messages (global room)

```
GET /api/chat/messages?count=50
Authorization: Bearer <priya token>
```

Expected: array of `ChatMessageDto`, `roomId: null` (global), ordered asc by `SentAt`. Empty by default.

### 12.2 Send a text message (SignalR)

**Connection**

```
GET /hubs/chat?access_token=<jwt>
```

`access_token` query string is allowed by `Program.cs` (`OnMessageReceived`).

**Client invokes**
```js
connection.invoke("SendMessage", { content: "Hello team", messageType: "text", roomId: null });
```

**Expected** — `ReceiveMessage` event broadcast to all connected clients. `ChatMessage` row persisted, `messageType = "text"`. Server-side: `SaveMessageAsync` saves, then `ChatHub.SendMessage` calls `Clients.All.SendAsync("ReceiveMessage", saved)`.

### 12.3 Send a message in a private room (membership enforced)

**Setup**
```
POST /api/chat/rooms
{ "name": "Design sync", "roomType": "private", "memberIds": [2, 3] }
```

Expected: 200 OK, `data.id` is the new room id, `data.members` contains users 2 and 3 (creator auto-added).

**Join (server side)**
- On `OnConnectedAsync`, the hub auto-joins all rooms the user is a member of into the `room_{id}` SignalR group.

**Send**
```js
connection.invoke("SendMessage", { content: "Mockups attached", roomId: 1 });
```

**Expected** — `ReceiveMessage` broadcast to `Clients.Group("room_1")` only.

**Negative — non-member tries to send to a private room**
- A user NOT in `memberIds` invoking `SendMessage({ roomId: 1 })` → the hub's `IsMemberAsync` check returns false → message is dropped silently.

### 12.4 Direct message (creates a 2-member direct room if missing)

```
POST /api/chat/rooms/direct/3
Authorization: Bearer <priya token>
```

**Expected** — 200 OK, `data.roomType = "direct"`, `data.members` has exactly 2 entries (Priya + user 3). Calling again returns the **same** room id (idempotent).

### 12.5 File upload

```
POST /api/chat/upload
Content-Type: multipart/form-data
Authorization: Bearer <priya token>

(file=@design.png)
```

**Expected**
- 200 OK
- `data.id` is the new `ChatAttachment` id
- `data.url = "/chat-uploads/2026/04/<guid>.png"`
- File written under `wwwroot/chat-uploads/2026/04/...`
- A placeholder `ChatMessage` row is created (with `RoomId = null`); the client then invokes `SendMessage({ messageType: "file", attachmentId: <id>, roomId: null })` which the server links to the placeholder via `attachment.MessageId = message.Id`.

**Negative — oversize file (>20 MB)** → 400 with `"File exceeds 20 MB limit."`

**Negative — disallowed extension** (e.g. `.exe`) → 400 with `"File type '.exe' is not allowed."`

### 12.6 Download file

```
GET /api/chat/file/1
Authorization: Bearer <priya token>
```

Expected: streams the file with the original `MimeType` (e.g. `image/png`) and filename. 404 if the file is missing on disk.

### 12.7 Typing indicator

```js
connection.invoke("StartTyping", null);  // global
// …user stops typing…
connection.invoke("StopTyping", null);
```

**Expected** — other clients receive `TypingStarted(userId, userName)` / `TypingStopped(userId)`. The chat provider debounces the auto-stop after 2.5s of typing inactivity.

---

## 13. Frontend Smoke Test (Manual)

1. Navigate to `http://localhost:3000` → redirected to `/auth`.
2. Sign in as `admin / admin@123` → land on `/` (Dashboard).
3. Dashboard should show:
   - 4 stat cards (Total Projects, Active Tasks, Team Members, Blocked Tasks) — values are 0/0 on a fresh DB.
   - "Effort & Productivity" section with 5 widgets (Active Users, Working Hours, Productive Hours, Currently Working, In Pause/Review) and a "Top Productive Users" panel (empty initially).
   - Empty "My Work" / "Recent Tasks" / "Blocked Tasks" rows.
4. Visit `/projects` → empty list. Click **Create** (or use use case 3.1) → project appears with code `PRJ-01`.
5. Visit `/tasks` → switch between **Grid (Kanban)** and **List** view. Use case 4.1 creates `TSK-01-01` in the **New** column.
6. Click the card → QuickView opens (the right-side panel). Edit Title, change Status with the buttons, add checklist items, mark them done.
7. Drag the card from **New** to **In Progress** → a modal asks for "Actual Hours". Enter `01:30`. Move to **Completed** from **Under Review** after marking all checklist items done.
8. Open the **Effort** tile in the QuickView → see a "0m productive" figure (working-hours-filtered). Open the arrow → tabbed view: Status History + User Effort Timeline.
9. Open `/chat` → send a message in the global room. Open a second browser as Priya (in another incognito window) → message appears in real time.
10. Open `/roles` → SystemAdmin (id 1) is NOT in the list (filtered out). Create `Senior Developer` and edit its permissions.
11. Open `/users` → SystemAdmin (id 1) is NOT in the list. Create a new user with a non-admin role. Try to give it role id 1 → 400 error toast.
12. Open `/settings` → toggle theme, set reminder threshold.
13. Open `/reports` → pick "Last 7 days" period → see top users bar and per-user / per-task / per-project hours tables (empty until you've generated some effort data).
14. Sign out → redirected to `/auth`.

---

## 14. Negative Authorization Matrix (Backend)

For every endpoint, verify these guardrails:

| Endpoint family | Anonymous | Non-permitted role | Wrong owner |
|---|---|---|---|
| `GET /tasks` | 401 | 403 if `CanView("/tasks")` is false | — |
| `POST /tasks` | 401 | 403 if `CanCreate` false AND not project owner/creator | 403 |
| `PUT /tasks/{id}` | 401 | 403 if `CanUpdate` false AND not creator AND not project owner/creator | 403 |
| `DELETE /tasks/{id}` | 401 | 403 if `CanDelete` false AND not creator AND not project owner/creator | 403 |
| `POST /projects` | 401 | **always** 403 unless `IsAdmin()` | 403 |
| `DELETE /users/{id}` | 401 | 403 unless `CanDelete("/users")` | 403 |
| `POST /users/{id}/reset-password` | 401 | 403 unless role is `systemadmin`/`admin` | 403 (also for `id <= 1`) |
| `POST /auth/login` | 200 (public) | — | — |
| `GET /permissions/pages` | 401 | 403 unless `IsSystemAdmin()` | — |
| `GET /reports/user-task-effort?userId=other` | 401 | 200 for self, 403 for others (unless admin) | 403 |

---

## 15. Data Integrity & Race Conditions

### 15.1 Update a task preserves its code & status

```
PUT /api/tasks/1
{ ..., "title": "Renamed task", "code": "TASK-99-99" }
```

`UpdateTaskAsync` explicitly preserves `task.Code`, `task.SeqNumber`, `task.Status`, `task.StartedAt`, `task.StartedById` — the field in the DTO is ignored. The response's `code` should still be `TSK-01-01` and `status` unchanged.

### 15.2 Cannot delete a task with linked (child) tasks

```
DELETE /api/tasks/1
```

If task 1 has subtasks (e.g. `SUB-01-01-01`):
Expected: 400 `"Cannot delete a task that has linked tasks. Remove or relink the child tasks first."`

Delete the subtasks first, then the parent succeeds.

### 15.3 Unassigning a user preserves the task

```
PUT /api/tasks/1/assign
Authorization: Bearer <admin token>     (only the task creator may assign)
null
```

`AssignTaskAsync` accepts `null` (unassign). `data.assigneeId = 0` (frontend normalizes to 0). Task remains.

### 15.4 Toggle while task not started is blocked

```
PUT /api/tasks/3/checklist/1/toggle
Authorization: Bearer <priya token>
{ "isCompleted": true }
```

If task 3 was never started (`startedAt = null`), expected: 400 `"Press 'Start Task' before completing checklist items"`.

### 15.5 Concurrent checklist auto-transitions

Mark 4 of 4 checklist items complete on a task currently in `in-progress`:
- `RecalculateTaskProgressAsync` sets `Progress = 100`, sees `Status == "in-progress"`, writes a `TaskStatusHistory` row, sets `Status = "under-review"`. Single round trip — no second client needed.

Now uncheck one item while in `under-review`:
- Sets `Progress = 75`, sees `Status == "under-review"`, writes a `TaskStatusHistory` row `under-review → in-progress`, sets status back.

### 15.6 Block via status while already blocked

```
PUT /api/tasks/5/status
{ "toStatus": "blocked", "reason": "..." }
```

`ValidateStatusTransition` rejects with `"This task is blocked. It must be unblocked before its status can be changed."` for non-admins (even though `to == blocked` matches `AllowedEdges` for `in-progress`).

---

## 16. Validation Edge Cases

### 16.1 Username with invalid characters

```
POST /api/users { ..., "userName": "a@b" }
```

Expected: 400 with model-state error (`USERNAME_REGEX = /^[a-zA-Z0-9._-]{3,30}$/`; the frontend `validateUsername` mirrors this; backend `CreateUserDto` requires `StringLength(50, MinimumLength=3)` and uniqueness but does not check the regex — the frontend enforces it).

### 16.2 Email with leading/trailing whitespace

The backend trims email in `UserService.CreateUserAsync`, so `"  aarav.sharma@pms.com  "` is accepted. Confirm the response `data.email` is trimmed.

### 16.3 Contact number optional

```
POST /api/users { ..., "contactNo": "abc" }
```

`CreateUserDto` has `[Phone]`, so this fails model-state validation. Acceptable: `"+91 9876543210"`, `null`, or `""`.

### 16.4 Long task title (>200 chars)

The schema allows it (no `MaxLength` on `TaskEntity.Title`); the response includes the full string. Frontend input may impose its own cap.

### 16.5 Null estimated hours

```
POST /api/tasks { ..., "estimatedHours": null }
```

`CreateTaskDto.EstimatedHours` has `[Range(0.01, 100000)]`. Null is acceptable for the range attribute. BUT `TaskService.CreateTaskAsync` checks:

```csharp
if (!createTaskDto.EstimatedHours.HasValue || createTaskDto.EstimatedHours.Value <= 0)
    return ... "Estimated hours are required ..."
```

Expected: 400 `"Estimated hours are required and must be greater than zero."` (The `[Range]` annotation is bypassed by null, the service catches it.)

---

## 17. Seed & Reset Notes

- The DB is seeded on first run with the `SystemAdmin` role, page modules, role permissions for the admin, and the `admin / admin@123` user.
- The `DatabaseInitializer` has a large commented-out block (`SeedSampleDataAsync`) that previously imported a `SampleData.json` dataset. To use it, uncomment the `await SeedSampleDataAsync(context, env);` line at the bottom of `InitializeAsync` and place `SampleData.json` next to the executable. Note: that import will wipe all existing projects + tasks first.
- To reset everything, drop the database and re-run — `DatabaseInitializer` will re-apply migrations and re-seed. **Confirm the active `DefaultConnection`** in `appsettings.json` before running migrations; it currently points to the remote `sql.bsite.net` DB.

---

## 18. Quick Test Harness Snippets

### Login (PowerShell)
```powershell
$token = (Invoke-RestMethod -Uri "http://localhost:5178/api/auth/login" -Method Post `
  -ContentType "application/json" `
  -Body '{"usernameOrEmail":"admin","password":"admin@123"}').data.token
```

### Reusable header
```powershell
$headers = @{ Authorization = "Bearer $token" }
```

### Sample
```powershell
Invoke-RestMethod -Uri "http://localhost:5178/api/tasks/effort-stats" -Headers $headers
```

### curl equivalent
```bash
TOKEN=$(curl -s -X POST http://localhost:5178/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"usernameOrEmail":"admin","password":"admin@123"}' | jq -r '.data.token')

curl -s -H "Authorization: Bearer $TOKEN" http://localhost:5178/api/tasks/effort-stats | jq
```

---

## 19. End-to-End Scenario (Walkthrough)

This is a single continuous test you can run in order to exercise the major flows:

1. **Sign in** as `admin / admin@123`.
2. **Create** a project `PMS Enterprise System` with modules `["Frontend", "Backend", "QA"]`. (Use case 3.1.) Expected: `code = "PRJ-01"`.
3. **Create users** Priya (role 2), Aarav (role 2), and a QA reviewer (role 2). (Use case 1.5.) Set their passwords to `Pms@123`.
4. **Set project members** to `[priya.id, aarav.id, qa.id]`. (Use case 3.3.)
5. **Create a task** "Build auth flow" assigned to Priya, priority High, 4h estimated, due `2026-04-15`, module "Backend", tags `["auth"]`. (Use case 4.1.) Expected: `code = "TSK-01-01"`.
6. **Start the task** as Priya. (Use case 4.3.) Expected: `status = "in-progress"`, `startedAt` set.
7. **Add 3 checklist items**: "Draw sequence diagram", "Write JWT middleware", "Add unit tests". (Use case 4.4.)
8. **Mark all 3 complete** as Priya. (Use case 4.5; use the "Mark all complete" button.) Expected: `progress = 100`, auto-transitioned to `under-review`.
9. **As admin, set `RequiresQA = true` and `QaAssigneeId = qa.id`** via `PUT /api/tasks/1` with the body.
10. **Submit for review** as Priya. (Use case 4.6.) The status is already `under-review`; the call is essentially a no-op but writes another `TaskStatusHistory` row.
11. **QA fail** as the QA reviewer (use `POST /api/tasks/1/qa/fail` with `{"reason": "Missing rate limit tests"}`). Expected: `status = "issues"`, no `actualHours` prompt.
12. **Fix it**: as Priya, move it back to `in-progress` (`{"toStatus": "in-progress", "actualHours": 1.5}`).
13. **Mark all checklist items complete again** → auto-transitions to `under-review` again.
14. **QA pass** as the QA reviewer (`POST /api/tasks/1/qa/pass`). Expected: `status = "completed"`, no `actualHours` prompt.
15. **Reassign** the task to Aarav (with reason "Workload Balancing"). (Use case 4.9.) Expected: assignment history row, but `ReassignTaskAsync` refuses if the task is `completed`:

```
PUT /api/tasks/1/reassign
{ "newAssigneeId": <aarav id>, "reasonTag": "Workload Balancing" }
```
Expected: 400 `"Cannot reassign a completed task. Move it to In Progress first."`

16. **Reopen** the task (use case 4.8). Then reassign.
17. **Block** the task as Aarav with reason "Need DB migration first" (use case 5.1).
18. **Try to change status as Aarav** (use case 5.2). Expected: 400 blocked-error.
19. **Admin unblocks it** (use case 5.4).
20. **Fetch effort** for the task (use case 8.1). Expected: non-zero `productiveSeconds`, multiple `byUser` rows (Priya, Aarav), status timeline with all transitions including the auto `under-review` ones.
21. **Open the dashboard**, switch period to "Last 7 days" → see the user you generated effort for at the top of "Top Productive Users".
22. **Open Reports → Hours Summary** → see the same data aggregated by user / by task / by project.

This walkthrough covers: auth, role checks, project CRUD, user CRUD, task CRUD, status workflow (including mandatory hours + QA path + admin reopen), checklist auto-transitions, block lifecycle, derived effort, dashboard widgets, and the reports module. If every step matches the expected outcome, the major surfaces of the system are working.
