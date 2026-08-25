# PMS — User Journeys by Role

Step-by-step journeys through the app, one per "angle" (authorization posture), grounded in the actual gates enforced in `AuthorizationService`, `TaskService.ValidateStatusTransition`, and the frontend routes in `App.tsx`. These aren't fixed named roles (roles are admin-configurable) — they're the seven distinct capability sets the code actually checks for. See [CLAUDE.md](CLAUDE.md) for architecture and [USE_CASES.md](USE_CASES.md) for the request/response detail behind each step.

| # | Angle | Who this is | Defined by |
|---|---|---|---|
| 1 | New / Prospective User | Not yet authenticated | No token |
| 2 | SystemAdmin | The seeded root account | `User.RoleId == 1` |
| 3 | Admin (non-root) | A role flagged as admin (e.g. Project Manager) | `Role.IsAdmin == true` |
| 4 | Project Owner / Task Creator | "Manager" authority without the admin flag | `Project.OwnerId`, `Project.CreatedById`, or `Task.CreatedById == userId` |
| 5 | Assignee / Developer | The person doing the work | `Task.AssignedToId == userId` |
| 6 | QA Reviewer | Assigned to review a gated task | `Task.QaAssigneeId == userId` |
| 7 | Limited / View-Only User | A role with a restrictive page-permission bitmap | `RolePagePermission` / `UserPagePermission` bits |

Every authenticated angle shares the same shell: `DashboardLayout` → sidebar nav filtered by `GET /api/permissions/my` → `ProtectedRoute` on every non-`/auth` route.

---

## 1. New / Prospective User (unauthenticated)

- Navigate to the app → `ProtectedRoute` has no token → redirected to `/auth`.
- **Register:**
  - Fill first name, last name, username, email, contact no, password.
  - As the username field loses focus, the frontend debounces a `GET /api/auth/check-availability?userName=...` call and shows a live "taken / available" indicator.
  - Submit → backend auto-assigns the **lowest-privilege non-admin role** (never `SystemAdmin`); if no such role is configured, registration is refused with a message telling the user to contact an administrator.
  - An email OTP is issued (`OtpService`); the user enters the code on the confirm screen — `ConfirmRegister` validates and consumes it (one-time; expired rows are purged hourly by `OtpCleanupService`).
  - On success, land on `/auth` to log in (or auto-login, depending on the flow the form triggers).
- **Forgot password:**
  - Enter the account email → an OTP is emailed.
  - Enter the OTP + new password → validated and consumed against the `password-reset` purpose; password is rehashed with PBKDF2.
- **Log in:**
  - Enter username-or-email + password.
  - Username matching is **case-sensitive**; email matching is **case-insensitive**.
  - On success, JWT (7-day) is stored client-side, a refresh token is set as an httpOnly `pms_rt` cookie, and the user lands on `/` (Dashboard).
  - Wrong credentials → 401 toast, no redirect. Repeated failures are throttled by `LoginRateLimitMiddleware`.

---

## 2. SystemAdmin (`RoleId = 1`, seeded `admin` account)

Full, unrestricted authority — every `CanView/Create/Update/Delete` check short-circuits true, plus a set of operations gated specifically to this one account.

- Log in as `admin` → lands on `/` with every dashboard widget visible (org-wide, not self-filtered).
- **Org setup (first-run angle):**
  - `/roles` → define roles (name, code, level, `isAdmin` flag). `SystemAdmin` itself (id 1) never appears in this list or in `/users` — it's filtered out everywhere as protected.
  - For each role, open the permission grid → `PUT /api/permissions/role/{id}` sets the 4-bit View/Create/Update/Delete bitmap per page module.
  - `/users` → create accounts, assign a role (id 1 is rejected with a 400 if attempted). Optionally set a **user-level permission override** that supersedes the role's bitmap for that one person.
  - `/projects` → create the project(s), set owner, define modules, add members via the replace-all members endpoint.
- **Ongoing platform administration:**
  - `POST /users/{id}/reset-password` — reset anyone's password to a known default (refused on the protected admin account itself and on non-SystemAdmin callers).
  - `/templates` (admin-only route, gated by `IsAdminAsync()` not the page bitmap) — build recurring `TaskTemplate`s: items, checklists, tags, review criteria, dependency links, and a recurrence schedule (daily/weekly/monthly/custom + trigger time). `TaskTemplateSchedulerService` fires these hourly; SystemAdmin can also trigger a manual "generate now."
  - Full task authority everywhere: create/edit/delete any task, override blocks (the only account that can change a blocked task's status without unblocking first), reopen completed tasks, complete non-QA tasks directly, approve/fail QA-gated tasks even without being the assigned reviewer.
  - `/reports` — org-wide effort, transitions, and hours-summary views (never self-restricted).
  - `/settings` → theme + reminder threshold (personal, same as any user).
  - Can access `GET /permissions/pages` (the raw page-module catalog) — the one read gated to `IsSystemAdminAsync()` specifically, not just `IsAdminAsync()`.
- Sign out → redirected to `/auth`; refresh-token cookie cleared.

---

## 3. Admin, non-root (`Role.IsAdmin = true`, e.g. a Project Manager role)

Same day-to-day power as SystemAdmin for projects/tasks/reports, but cannot touch the protected root account or role/user records reserved for SystemAdmin-only calls (e.g. still subject to normal `/users` and `/roles` permission checks rather than the hardcoded id-1 bypasses).

- Log in → dashboard shows org-wide widgets (admin flag, not self-filtered).
- **Projects:** create projects (`IsAdmin()` gate on `POST /projects`), set members, edit modules (blocked with a 400 listing task codes if a module is still in use), reassign project ownership with a reason tag, view assignment history.
- **Tasks:** create tasks/subtasks (auto-coded `TSK-PP-TT` / `SUB-PP-TT-SS`), set QA requirement + reviewer, edit any task, delete tasks (blocked with a 400 if the task has linked subtasks), reassign with a reason tag, complete non-QA tasks directly, reopen completed tasks, approve/fail QA tasks, bypass an active block to force a status change.
- **Templates:** same admin-gated `/templates` access as SystemAdmin.
- **Reports & Effort:** org-wide `/reports`, dashboard effort stats, hours summary — unrestricted by self.
- Cannot: assign the `SystemAdmin` role to a user, reset another admin's password unless also SystemAdmin-checked, view `/permissions/pages` (SystemAdmin-only read).
- Sign out.

---

## 4. Project Owner / Task Creator (manager authority, no admin flag)

A regular role (no `IsAdmin`) that still qualifies as "manager" for the specific project it owns or the specific tasks it created — this is the everyday **Team Lead** posture: elevated inside their own project, ordinary everywhere else.

- Log in → dashboard is scoped like a normal user's (no org-wide `IsAdmin` bypass), but their owned project's stats surface via `OwnerId`/`Members` filters.
- On a project they own:
  - Add/edit checklist items on tasks in the project (`HasTaskEditAccess` — creator or project owner only).
  - Comment on any task in the project.
  - Approve non-QA tasks and complete them directly from `under-review`.
  - Send a task back to `issues` even without being the QA reviewer.
  - Reopen a completed task (`in-progress ← completed` is otherwise manager-only).
  - Block/unblock any task in the project (not just tasks they're assigned to).
  - Reassign tasks with a reason tag (refused with a 400 if the task is currently `completed` — must reopen first).
- On a task they personally created (even outside a project they own): same completion/reopen/block authority for that one task.
- Outside their own projects/tasks: behaves exactly like a plain Assignee/Developer (angle 5) — no special power on someone else's project.
- Sign out.

---

## 5. Assignee / Developer (the person doing the work)

The most common day-to-day journey — everything gated to "only the assignee."

- Log in → dashboard's "My Work" / "Recent Tasks" / "Blocked Tasks" rows show only what's assigned to them.
- `/tasks` → toggle between **Kanban (Grid)** and **List** view; click a card to open the **QuickView** side panel.
- **Start work:** click "Start Task" (only the assignee can — a manager clicking this on someone else's task is rejected) → status → `in-progress`, `startedAt`/`startedById` stamped.
- **Log progress:**
  - Check off checklist items one by one, or "mark all complete" — only the current assignee can toggle them, and only after the task has been started.
  - When the last item is checked while `in-progress`, the task **auto-transitions to `under-review`** — no manual submit needed.
  - Drag the card between Kanban columns to change status manually; a modal prompts for **Actual Hours** on every transition except entering `new` (submitting without hours is rejected with a 400).
- **Pause / block:** pause the task, or block it with a mandatory reason (empty reason is rejected) — this also requires being the assignee, an admin, or the project owner.
- **While blocked:** cannot change status at all until someone with unblock authority (assignee's own block, creator, project owner, or admin) clears it — attempting anyway returns "must be unblocked before its status can be changed."
- **Respond to QA feedback:** if a QA reviewer sends the task to `issues`, move it back to `in-progress` (with actual hours), fix the checklist item(s) that failed, re-complete the checklist to auto-return to `under-review`.
- **Comment:** post/read comments on tasks they're the creator, assignee, or project owner/creator of — commenting on an unrelated task is rejected with a 403.
- **Cannot:** complete a QA-gated task themselves (only the QA reviewer or a manager can), reopen a completed task, reassign a task, add checklist items to a task they don't own/manage.
- `/diary` → log their own daily work-diary hours (self-scoped).
- `/reports` → their own effort/transitions/hours only — `userId` query params for another user return a 403 unless the caller is an admin.
- `/chat` → send/receive messages in the global room, private rooms they're a member of, or start a 1:1 direct message; typing indicators; upload/download attached files (rejected over 20 MB or disallowed extensions).
- `/settings` → personal theme + reminder threshold.
- Sign out.

---

## 6. QA Reviewer (`Task.QaAssigneeId == userId`)

A task-scoped angle layered on top of whatever base role the reviewer has — most tasks they touch as a plain assignee/developer, but on tasks where they're named `QaAssigneeId` and `RequiresQA = true`, they gain a gate no one else (except a manager) has.

- Receives a notification when a task they're the QA reviewer for reaches `under-review`.
- Open the task in QuickView → review the work against the checklist/review criteria.
- **Pass:** approve the task → status → `completed`, no actual-hours prompt (QA actions are hours-exempt).
- **Fail:** send it back with a required reason → status → `issues`, no actual-hours prompt; the assignee is notified and must rework it.
- Cannot approve/fail a task they are *not* the named reviewer for (unless they separately qualify as a manager on it) — that call is rejected.
- Everything else in their day (starting their own assigned tasks, diary, chat, reports) follows the Assignee/Developer journey above.

---

## 7. Limited / View-Only User (restrictive page-permission bitmap)

Same login flow as any user, but the sidebar and available actions shrink to whatever their role's (or personal override's) 4-bit bitmap allows per page module — e.g. a Technical Writer role scoped to `View` only on Tasks and no access at all to Users/Roles.

- Log in → `GET /api/permissions/my` returns per-route bitmaps; the frontend nav renders only routes with `View` set, and hides Create/Edit/Delete controls where those bits are 0.
- Pages with `permissions = 0` for their role are simply absent from the sidebar; navigating to the URL directly still gets a 403 from the backend (the frontend guard isn't the real enforcement — the controller check is).
- On a page with `View`-only access (e.g. Tasks): can open QuickView and read everything (comments, checklist, status history, effort) but action buttons that require Update/Create/Delete are disabled or hidden.
- If they are also the *assignee* of a specific task despite a restrictive role bitmap, task-level ownership checks (start/toggle checklist/block) still apply independently of the page bitmap — assignment-based authority and page-permission authority are two separate gates, and either can grant access the other denies.
- Dashboard (`/`) always returns `CanView = true` regardless of bitmap — every authenticated user sees it.
- Cannot reach `/permissions/pages`, `/templates`, or any SystemAdmin-only action regardless of how generous their bitmap is — those are hard-coded to the admin flags, not the page-permission table.
- Sign out.

---

## Shared mechanics that appear in every journey

- **Session:** JWT in `localStorage.pms_token`, silently attached by `apiRequest()`; refresh token rotates via the httpOnly `pms_rt` cookie on `/auth/refresh`.
- **Notifications:** task assignment, reassignment, QA pass/fail, and block/unblock events all fire through `NotificationService` to the affected users.
- **Real-time chat:** the SignalR connection at `/hubs/chat` authenticates via `?access_token=` on the WebSocket upgrade, independent of the REST JWT header.
- **Working-hours accounting:** all effort numbers shown anywhere (task effort, dashboard, reports) are clipped to the **10:00–19:00 IST working window**, regardless of which angle is viewing them.
