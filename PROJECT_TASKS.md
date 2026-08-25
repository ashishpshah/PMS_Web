# PMS Enterprise System — Realistic Project & Task Plan

A complete, end-to-end project seeded into the running stack. Includes proper modules, users, roles, hierarchy codes, and a full task list from kickoff through UAT and launch.

> **Pre-reqs:** backend on `http://localhost:5178`, frontend on `http://localhost:3000`, sign in as `admin / admin@123`. All commands below target the running backend unless noted. Use the [USE_CASES.md](USE_CASES.md) guide for the exact API shape for each verb.

---

## 1. Project Overview

| | |
|---|---|
| **Name** | PMS Enterprise System |
| **Code** | `PRJ-01` (auto) |
| **Status** | Active |
| **Start** | 2026-04-01 |
| **End** | 2026-12-31 |
| **Owner** | Rajesh Kumar (Project Manager) |
| **Goal** | Build a full-stack project & task management system (the one you're testing) with Kanban, role-based permissions, status workflow, derived effort tracking, and real-time chat. |
| **Modules** | Frontend, Backend, Database, DevOps, QA, UI/UX, Documentation |

---

## 2. Roles (seed beyond the auto-seeded `SystemAdmin`)

Create these with the admin token via `POST /api/roles`. They are needed for permission tests in section 3.

| Code | Name | Level | IsAdmin | Notes |
|---|---|---:|:---:|---|
| `SA` | SystemAdmin | 1 | ✅ | Seeded (`Id = 1`) — full access everywhere. Hidden from `/api/roles` and `/api/users`. |
| `PM` | Project Manager | 2 | ❌ | Owns projects, can reassign tasks across the team, can QA-pass/fail, can reopen completed tasks. |
| `TL` | Team Lead | 3 | ❌ | Manages a module within a project. Can create/update tasks, can QA on tasks flagged `RequiresQA`. |
| `SD` | Senior Developer | 4 | ❌ | Builds features end-to-end. Can be a sub-task owner. |
| `DEV` | Developer | 5 | ❌ | Picks up assigned tasks, completes them, logs actual hours. |
| `QA` | QA Engineer | 6 | ❌ | Only sees tasks where they're the assignee or QA reviewer. Can pass/fail QA on assigned tasks. |
| `DOC` | Technical Writer | 7 | ❌ | Owns documentation tickets. Has view-only on the rest. |

> **Tip:** create them in this order, then assign `RolePagePermission` bitmaps so the `TL`, `SD`, `DEV`, `QA`, `DOC` have different views of the app (use cases 10.2 / 10.3 / 10.4 in the use-case guide).

---

## 3. Users (seed alongside the admin)

Create them via `POST /api/users`. All passwords are `Pms@123`. These four cover all the workflow tests below.

| # | Username | Full Name | Email | Role | Module | Phone |
|---:|---|---|---|---|---|---|
| 2 | `rajesh.k` | Rajesh Kumar | rajesh.k@pms.com | `PM` (Project Manager) | Backend (overall owner) | +91 9876500002 |
| 3 | `priya.k` | Priya Krishnan | priya.k@pms.com | `TL` (Team Lead — Frontend) | Frontend | +91 9876500003 |
| 4 | `aarav.s` | Aarav Sharma | aarav.s@pms.com | `SD` (Senior Developer) | Backend | +91 9876500004 |
| 5 | `neha.v` | Neha Verma | neha.v@pms.com | `DEV` (Developer) | Frontend | +91 9876500005 |
| 6 | `vikram.j` | Vikram Joshi | vikram.j@pms.com | `QA` (QA Engineer) | QA | +91 9876500006 |
| 7 | `isha.r` | Isha Rao | isha.r@pms.com | `DOC` (Technical Writer) | Documentation | +91 9876500007 |

> **Note:** the seeded `SystemAdmin` (`id = 1`, `admin / admin@123`) is the project creator and ultimate owner. Rajesh is the day-to-day owner.

After creating them, set the project members:

```
PUT /api/projects/1/members
[2, 3, 4, 5, 6, 7]
```

---

## 4. Project Setup

### 4.1 Create project
```
POST /api/projects
{
  "name": "PMS Enterprise System",
  "description": "Full-stack project & task management platform with Kanban, role-based access, derived effort tracking, and real-time chat.",
  "status": "Active",
  "startDate": "2026-04-01",
  "endDate": "2026-12-31",
  "ownerId": 2,                  // Rajesh (Project Manager)
  "modules": [
    "Frontend", "Backend", "Database",
    "DevOps", "QA", "UI/UX", "Documentation"
  ]
}
```
Expected: `code = "PRJ-01"`, `seqNumber = 1`, `modules = [...]` (trimmed/distinct).

### 4.2 Module glossary (for the task list below)
- **Frontend** — React 19 + Vite 6 + Tailwind 4, served from the ASP.NET host.
- **Backend** — ASP.NET Core 6 controllers/services + EF Core 6 + SignalR hub.
- **Database** — SQL Server schema, migrations, seed data.
- **DevOps** — Build, publish, deployment, monitoring.
- **QA** — Test plans, manual + exploratory, QA pass/fail workflow.
- **UI/UX** — Wireframes, design tokens, motion guidelines.
- **Documentation** — User guide, API reference, architecture notes.

---

## 5. Epic Breakdown

The project is split into **5 epics**. Each epic is a set of tasks created in the order below. Codes are auto-assigned by the backend (shown for reference).

| Epic | Title | Owner Module | Outcome |
|---|---|---|---|
| **E1** | Foundation | Backend | Auth, roles, permissions, project & user CRUD working end-to-end. |
| **E2** | Task Management Core | Backend | Tasks, status workflow, checklist, comments, derived effort. |
| **E3** | Frontend Shell & Kanban | Frontend | App shell, theming, Kanban board with drag-and-drop and QuickView. |
| **E4** | Real-time Chat | Backend | SignalR hub, rooms, file upload, in-app notifications. |
| **E5** | Hardening & Launch | DevOps + QA + Documentation | CI/CD, performance, UAT, docs, cutover. |

---

## 6. Tasks (full list, in creation order)

> **How to read this:** every task is a `POST /api/tasks`. Subtasks are nested under their parent. The format is:
> - Title · Module · Assignee · Estimate · Due · Subtasks
> - Suggested tags + checklist items.
> - Acceptance notes / how to verify after creation.
>
> **Convention:** unless stated, every task is created with `status = "new"`, `priority = "Medium"`, `requiresQA = false`. The full happy path (start → work → review → complete) is the verification.

### Epic 1 — Foundation (tasks 1–12)

#### 1. `TSK-01-01` — Bootstrap solution & EF Core scaffold  · Backend · Aarav · 6h · 2026-04-03
- Tags: `["setup", "dotnet"]`
- Checklist: `["Create solution + projects", "Add EF Core 6 + SQL Server provider", "Wire DbContext in Program.cs", "First migration created and applied"]`
- Verify: project compiles, `dotnet ef migrations list` shows the initial migration.

#### 2. `TSK-01-02` — Define core entities & relationships  · Backend · Aarav · 8h · 2026-04-05
- Tags: `["data-model"]`
- Subtasks:
  - `SUB-01-02-01` — User, Role, PageModule, RolePagePermission, UserPagePermission  · 3h
  - `SUB-01-02-02` — Project, ProjectMember, ProjectModule  · 2h
  - `SUB-01-02-03` — TaskEntity, TaskTag, TaskComment, Attachment, ChecklistItem  · 3h
- Verify: relations match the schema in section 2 of the codebase map; FK cascades match (Restrict for users, Cascade for comments/checklist).

#### 3. `TSK-01-03` — Implement PBKDF2 password hashing & JWT issuance  · Backend · Aarav · 4h · 2026-04-07
- Tags: `["auth", "security"]`
- Checklist: `["PasswordHasher: 100k iterations + 16-byte salt", "JwtService: 7-day expiry, HS256, validates issuer/audience", "AuthController /login + /register + /validate"]`
- Verify: `POST /api/auth/login` with the seeded admin returns a valid JWT.

#### 4. `TSK-01-04` — Implement AuthorizationService bitmap checks  · Backend · Aarav · 5h · 2026-04-09
- Tags: `["auth", "permissions"]`
- Verify: `CanView/CanCreate/CanUpdate/CanDelete` follow the priority chain (user > role > admin bypass) per section 7 of the codebase map.

#### 5. `TSK-01-05` — Project CRUD + module reconciliation  · Backend · Aarav · 6h · 2026-04-11
- Verify: `PUT /api/projects/1` with a module removed that has tasks using it → 400 with the conflicting task codes.

#### 6. `TSK-01-06` — User CRUD with SystemAdmin protection  · Backend · Aarav · 4h · 2026-04-12
- Verify: `POST /api/users` with `roleId = 1` → 400. `DELETE /api/users/1` → 403.

#### 7. `TSK-01-07` — Frontend Vite + React 19 scaffold  · Frontend · Neha · 4h · 2026-04-08
- Subtasks:
  - `SUB-01-07-01` — Vite + TS config + dev proxy  · 1h
  - `SUB-01-07-02` — Tailwind 4 + theme tokens  · 2h
  - `SUB-01-07-03` — Layout shell (Sidebar + Navbar)  · 1h

#### 8. `TSK-01-08` — AuthContext + login/register UI  · Frontend · Neha · 6h · 2026-04-10
- Verify: `/auth` page accepts `admin / admin@123`; user lands on `/` with `pagePermissions` loaded.

#### 9. `TSK-01-09` — Global loader + ErrorBoundary  · Frontend · Neha · 3h · 2026-04-10
- Verify: every `apiRequest` drives the loader counter; an uncaught render error shows the recovery page.

#### 10. `TSK-01-10` — Permission hook + sidebar gating  · Frontend · Priya · 3h · 2026-04-11
- Verify: assign a non-admin role with `permissions: 0` for `/users` and the link is hidden for them.

#### 11. `TSK-01-11` — Theme + SweetAlert providers  · Frontend · Neha · 2h · 2026-04-12

#### 12. `TSK-01-12` — E1 release build + smoke test  · DevOps · Aarav · 3h · 2026-04-14
- Tags: `["release"]`
- Verify: `dotnet publish` ships the React bundle under `wwwroot`, app serves at `http://localhost:5178`.

---

### Epic 2 — Task Management Core (tasks 13–24)

#### 13. `TSK-01-13` — Task CRUD + hierarchy codes  · Backend · Aarav · 8h · 2026-04-18
- Tags: `["tasks", "data-model"]`
- Subtasks:
  - `SUB-01-13-01` — TSK-PP-TT / SUB-PP-TT-SS code generator  · 3h
  - `SUB-01-13-02` — Create / update / delete with field validation  · 3h
  - `SUB-01-13-03` — Subtask linkage (parent must be same project)  · 2h
- Verify: creating task A, then B as a child of A → B's code is `SUB-01-13-01`. EstimatedHours is required.

#### 14. `TSK-01-14` — Status workflow engine  · Backend · Aarav · 8h · 2026-04-22
- Subtasks:
  - `SUB-01-14-01` — AllowedEdges + ActualHoursExemptStatuses  · 3h
  - `SUB-01-14-02` — Mandatory actual hours on every non-`new` transition  · 2h
  - `SUB-01-14-03` — QA reviewer path (qa/pass → completed, qa/fail → issues, no hours)  · 3h
- Verify: all use case 4.x scenarios pass. Trying to `paused` from `new` → 400. Trying to `in-progress` from `new` without `actualHours` is allowed (it's the first start, see 4.3).

#### 15. `TSK-01-15` — Checklist panel + auto `in-progress ↔ under-review`  · Backend · Aarav · 4h · 2026-04-24
- Verify: mark all checklist items complete while in `in-progress` → task auto-transitions to `under-review` (use case 4.5).

#### 16. `TSK-01-16` — Task comments + activity log  · Backend · Aarav · 3h · 2026-04-25
- Verify: comments are gated to creator/assignee/project owner/creator; activity feed surfaces all status changes.

#### 17. `TSK-01-17` — Task block lifecycle  · Backend · Aarav · 5h · 2026-04-28
- Verify: `PUT /api/tasks/{id}/block` with no reason → 400. Status change while blocked → 400 (admin bypass).

#### 18. `TSK-01-18` — Task reassignment with reason tags  · Backend · Aarav · 3h · 2026-04-29
- Verify: invalid reason → 400 with the list of valid tags. Reassign on a `completed` task → 400.

#### 19. `TSK-01-19` — EffortHelpers: status segments + assignment windows  · Backend · Aarav · 6h · 2026-05-02
- Subtasks:
  - `SUB-01-19-01` — `BuildStatusSegments` + `BuildAssignmentWindows`  · 3h
  - `SUB-01-19-02` — Working-hours filter (IST 10:00–19:00)  · 3h
- Verify: unit-style smoke — call `GET /api/tasks/{id}/effort` on a task that has been in `in-progress` for 2 working days → `productiveSeconds ≈ 18 * 3600`.

#### 20. `TSK-01-20` — Per-task effort endpoint + by-user attribution  · Backend · Aarav · 5h · 2026-05-05
- Verify: a task that switched assignees mid-flight has two `byUser` rows whose seconds sum to the segment totals.

#### 21. `TSK-01-21` — Dashboard effort-stats endpoint  · Backend · Aarav · 4h · 2026-05-07
- Verify: `from`/`to` windowed totals; `usersCurrentlyWorking` reflects live `Status = "in-progress"` (not windowed).

#### 22. `TSK-01-22` — Frontend Tasks page (Kanban)  · Frontend · Neha · 10h · 2026-05-12
- Subtasks:
  - `SUB-01-22-01` — 7-column layout with status filter chips  · 3h
  - `SUB-01-22-02` — Drag-and-drop with permission gating  · 4h
  - `SUB-01-22-03` — Status transition prompt (ActualHours)  · 3h
- Verify: dragging a card from `in-progress → paused` opens the hours prompt; drag while blocked is disabled for non-admins.

#### 23. `TSK-01-23` — QuickView side panel  · Frontend · Priya · 12h · 2026-05-18
- Subtasks:
  - `SUB-01-23-01` — Project / Task / User frames + back-stack navigation  · 5h
  - `SUB-01-23-02` — Effort tile + dedicated `effort` frame with status history  · 4h
  - `SUB-01-23-03` — Reassign / block / status switcher inside the panel  · 3h

#### 24. `TSK-01-24` — E2 release build  · DevOps · Aarav · 2h · 2026-05-20

---

### Epic 3 — Frontend Shell & Kanban (tasks 25–34)

#### 25. `TSK-01-25` — DataContext + bulk fetch + per-entity mutators  · Frontend · Priya · 8h · 2026-05-25
- Subtasks:
  - `SUB-01-25-01` — Bulk fetch on `currentUser` change  · 3h
  - `SUB-01-25-02` — Mutators (add/update/delete) for projects, tasks, users  · 3h
  - `SUB-01-25-03` — In-app notification system (due-date reminders)  · 2h

#### 26. `TSK-01-26` — Notifications dropdown + popup  · Frontend · Priya · 4h · 2026-05-27
- Verify: a task due in 2 days raises a reminder; an overdue task raises a "TASK OVERDUE" alert; the popup shows once per day per task.

#### 27. `TSK-01-27` — Projects list + create/edit modal  · Frontend · Neha · 6h · 2026-05-29
- Verify: a non-admin role with `CanView("/projects") = false` is redirected/empty.

#### 28. `TSK-01-28` — Project Details page  · Frontend · Neha · 6h · 2026-06-02
- Subtasks:
  - `SUB-01-28-01` — Member list + add/remove  · 3h
  - `SUB-01-28-02` — Module list with in-use warning  · 3h

#### 29. `TSK-01-29` — Users list + create/edit (with availability check)  · Frontend · Priya · 8h · 2026-06-05
- Subtasks:
  - `SUB-01-29-01` — Live username/email availability via `useAvailability`  · 3h
  - `SUB-01-29-02` — Avatar, role, active/inactive toggle  · 3h
  - `SUB-01-29-03` — Password reset action (admin only)  · 2h

#### 30. `TSK-01-30` — User Details page  · Frontend · Neha · 4h · 2026-06-08

#### 31. `TSK-01-31` — Roles page + permission grid  · Frontend · Priya · 8h · 2026-06-12
- Subtasks:
  - `SUB-01-31-01` — Create/edit/delete roles  · 3h
  - `SUB-01-31-02` — Per-role page permission editor  · 3h
  - `SUB-01-31-03` — Per-user permission override  · 2h

#### 32. `TSK-01-32` — Dashboard widgets (period filter)  · Frontend · Priya · 8h · 2026-06-16
- Verify: switching the period filter calls `GET /api/tasks/effort-stats?from=&to=` with the correct ISO bounds.

#### 33. `TSK-01-33` — Settings + Reports pages  · Frontend · Neha · 6h · 2026-06-19
- Subtasks:
  - `SUB-01-33-01` — Personal preferences (reminder threshold, theme)  · 2h
  - `SUB-01-33-02` — Reports with same period filter  · 4h

#### 34. `TSK-01-34` — E3 release build  · DevOps · Aarav · 2h · 2026-06-22

---

### Epic 4 — Real-time Chat (tasks 35–40)

#### 35. `TSK-01-35` — ChatHub: connection lifecycle + presence  · Backend · Aarav · 5h · 2026-06-26
- Verify: `OnConnectedAsync` returns the current `OnlineUsers` list and broadcasts `UserJoined` to others; `OnDisconnectedAsync` broadcasts `UserLeft`.

#### 36. `TSK-01-36` — Chat service: rooms + messages  · Backend · Aarav · 6h · 2026-06-29
- Subtasks:
  - `SUB-01-36-01` — `GetOrCreateDirectRoomAsync` (idempotent 2-member direct)  · 2h
  - `SUB-01-36-02` — `GetRecentMessagesAsync` with `beforeId` cursor  · 2h
  - `SUB-01-36-03` — `SaveMessageAsync` with reply-to + attachment link  · 2h
- Verify: sending in a private room the user isn't a member of is silently dropped (`IsMemberAsync` check).

#### 37. `TSK-01-37` — File upload + download  · Backend · Aarav · 4h · 2026-07-01
- Verify: 20 MB limit enforced; disallowed extensions rejected; files written under `wwwroot/chat-uploads/yyyy/mm/<guid.ext>`.

#### 38. `TSK-01-38` — Frontend ChatContext (SignalR)  · Frontend · Priya · 8h · 2026-07-05
- Subtasks:
  - `SUB-01-38-01` — Connection setup with JWT via `accessTokenFactory`  · 2h
  - `SUB-01-38-02` — Subscribe to `ReceiveMessage` / `ReceiveNotification` / presence / typing  · 3h
  - `SUB-01-38-03` — Send message + send file (uploads then sends)  · 3h

#### 39. `TSK-01-39` — Chat UI (rooms list + message list + input)  · Frontend · Neha · 10h · 2026-07-10
- Subtasks:
  - `SUB-01-39-01` — `ChatSidebar` with unread counts  · 3h
  - `SUB-01-39-02` — `MessageList` with file previews + reply-to  · 4h
  - `SUB-01-39-03` — `MessageInput` with typing indicator  · 3h

#### 40. `TSK-01-40` — E4 release build  · DevOps · Aarav · 2h · 2026-07-12

---

### Epic 5 — Hardening & Launch (tasks 41–52)

#### 41. `TSK-01-41` — Effort reports: per-user, per-task, per-day, hours summary  · Backend · Aarav · 8h · 2026-07-17
- Subtasks:
  - `SUB-01-41-01` — `GetUserEffortReportAsync` (admin = all users, non-admin = self)  · 2h
  - `SUB-01-41-02` — `GetUserTaskEffortAsync` (per-task breakdown)  · 2h
  - `SUB-01-41-03` — `GetUserDailyEffortAsync` (per-day)  · 2h
  - `SUB-01-41-04` — `GetHoursSummaryAsync` (3-way by user/task/project)  · 2h
- Verify: non-admin calling `user-task-effort?userId=other` → 403.

#### 42. `TSK-01-42` — Status transition report  · Backend · Aarav · 3h · 2026-07-19
- Verify: `GET /api/reports/user-transitions` returns `fromStatus → toStatus` counts per user, `mostCommonTransition` populated.

#### 43. `TSK-01-43` — Security hardening  · Backend · Aarav · 6h · 2026-07-24
- Checklist: `["Rate-limit /auth/login", "JWT replay protection (validate lifetime)", "CORS allowlist", "XSS-safe rendering in chat"]`

#### 44. `TSK-01-44` — Frontend perf: code splitting + lazy routes  · Frontend · Priya · 4h · 2026-07-26
- Verify: `App.tsx` uses `React.lazy` for every page; first paint covers only Auth + Dashboard chunks.

#### 45. `TSK-01-45` — Dark mode polish  · Frontend · Neha · 4h · 2026-07-29
- Verify: every component uses `dark:` variants; no white-flash on route change.

#### 46. `TSK-01-46` — QA test plan + exploratory testing  · QA · Vikram · 12h · 2026-08-05
- Tags: `["qa"]`
- Subtasks:
  - `SUB-01-46-01` — Test plan doc (use the [USE_CASES.md](USE_CASES.md) as the seed)  · 4h
  - `SUB-01-46-02` — Manual happy path per module  · 6h
  - `SUB-01-46-03` — Exploratory: drag edge cases, status edge cases  · 2h

#### 47. `TSK-01-47` — Bug bash + triage  · QA · Vikram · 8h · 2026-08-10
- Every bug found becomes a task with `Priority = "High"`, `RequiresQA = true`, `QaAssigneeId = <vikram.id>`, `Tags = ["bug"]`. Track via the Kanban Issues column.

#### 48. `TSK-01-48` — User guide  · Documentation · Isha · 10h · 2026-08-18
- Subtasks:
  - `SUB-01-48-01` — Getting started (sign-in, navigation)  · 3h
  - `SUB-01-48-02` — Task lifecycle (start → review → complete)  · 4h
  - `SUB-01-48-03` — Effort & reports  · 3h

#### 49. `TSK-01-49` — API reference  · Documentation · Isha · 8h · 2026-08-22
- Tags: `["docs", "api"]`
- Verify: every controller in [Codebase Map § 4](CLAUDE.md#api-endpoints) is documented with at least one example request/response.

#### 50. `TSK-01-50` — Production deployment  · DevOps · Aarav · 6h · 2026-08-28
- Checklist: `["Backup DB before deploy", "Apply migrations to production", "Deploy via `dotnet publish`", "Smoke test on production URL"]`

#### 51. `TSK-01-51` — UAT with stakeholders  · QA · Vikram · 8h · 2026-09-05
- Subtasks:
  - `SUB-01-51-01` — Project Manager walkthrough  · 3h
  - `SUB-01-51-02` — Team Lead walkthrough  · 3h
  - `SUB-01-51-03` — Sign-off  · 2h

#### 52. `TSK-01-52` — Project closeout  · Documentation · Isha · 4h · 2026-09-10
- Tags: `["docs"]`
- Verify: `PUT /api/projects/1` → set `status = "Completed"`. Mark all open tasks as completed or carried-over.

---

## 7. Sprint Schedule (synthesised from the dates above)

| Sprint | Window | Theme | Tasks |
|---|---|---|---|
| S1 | 2026-04-01 → 2026-04-14 | Foundation | 1–12 |
| S2 | 2026-04-15 → 2026-04-30 | Tasks backend | 13–18 |
| S3 | 2026-05-01 → 2026-05-20 | Effort + E2 | 19–24 |
| S4 | 2026-05-21 → 2026-06-22 | Frontend shell | 25–34 |
| S5 | 2026-06-23 → 2026-07-12 | Chat | 35–40 |
| S6 | 2026-07-13 → 2026-07-29 | Reports + perf | 41–45 |
| S7 | 2026-07-30 → 2026-08-10 | QA + bug bash | 46–47 |
| S8 | 2026-08-11 → 2026-08-28 | Docs + deploy | 48–50 |
| S9 | 2026-08-29 → 2026-09-10 | UAT + closeout | 51–52 |

---

## 8. Status Workflow Cheat-Sheet (matches the backend `AllowedEdges`)

```
new ──→ in-progress ──→ paused ──→ in-progress ──→ under-review ──→ completed
  └────────────────── completed    └─→ completed       └─→ issues ──→ in-progress
       (any active stage can go to completed)                (manager/QA)
                              blocked ──→ in-progress (admin override)
                              in-progress (reopen — manager only)
```

- **Mandatory `ActualHours` on every transition** except `to = "new"` (`ActualHoursExemptStatuses = { "new" }`).
- **Checklist gate** — 100% items required for `under-review` and `completed` (when checklist items exist).
- **QA pass/fail** are reviewer actions — `requireActualHours: false`.
- **Reopen** of a completed task is manager/admin only.

---

## 9. Permission Matrix (per route)

| Role | `/` | `/projects` | `/tasks` | `/users` | `/roles` | `/chat` | `/reports` |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| SystemAdmin | full | full | full | full | full | full | full |
| Project Manager | view | full | full | view-only | view-only | view | view |
| Team Lead | view | view + create/update | full | view-only | view-only | view | view (own) |
| Senior Developer | view | view (own + member) | view + update (assigned) | view-only | view-only | view | view (own) |
| Developer | view | view (member) | view + update (assigned) | view-only | — | view | view (own) |
| QA | view | view (member) | view + update (QA-assigned) | view-only | — | view | view (own) |
| Technical Writer | view | view | view | view-only | — | view | — |

> Adjust bitmaps via `PUT /api/permissions/role/{id}` (use case 10.2) and `PUT /api/permissions/user/{id}` (use case 10.3) until the matrix above is reproduced.

---

## 10. Sample Sprint Flow (one realistic week)

A Friday in the middle of Sprint 2. Rajesh (PM) is reviewing progress.

1. **Aarav (SD)** starts `TSK-01-14` "Status workflow engine" and works through subtask `SUB-01-14-01` AllowedEdges. He clocks `03:30` actual hours when moving to `in-progress` and `04:15` when moving to `paused` for the night.
2. **Priya (TL — Frontend)** is pulled into a bug: `TSK-01-22` drag-and-drop miscounts columns on the Issues lane. She reopens the task, reassigns it to herself with reason "Workload Balancing", and starts work.
3. **Vikram (QA)** reviews `TSK-01-15` (checklist auto-transition) and marks the test case "Mark all checklist items complete while in-progress → status auto-changes to under-review" as `qa/pass`. No hours prompt fires (reviewer action).
4. **Neha (DEV)** is blocked on `TSK-01-25` because DataContext needs an apiRequest for `/users/assignable` that doesn't exist yet. She uses the Block panel: `Block → "Waiting for /users/assignable endpoint"`. The card freezes in the Blocked column. The dashboard's "Blocked Tasks" widget now shows 1.
5. **Rajesh** opens `/reports` → "Hours Summary" → "This week". He sees Aarav at the top with 18h productive, Priya at 6h, Neha at 1.5h paused, Vikram at 0.5h productive (QA pass). He clicks Aarav's row to drill into the task list.
6. End of day, the chat (Epic 4 preview) has a few messages: the team uses the global room to coordinate.

This is the rhythm the system is designed for: short, time-boxed tasks with explicit ownership, status history that can be reconstructed, and effort that rolls up automatically.

---

## 11. Acceptance Criteria (per Epic)

- **E1:** admin can sign in, create a project, add members, create a user, and the role bitmap is editable from the Roles page. No `/api/users` listing returns the SystemAdmin.
- **E2:** a task can be created, started, moved through every allowed status with the right gating (hours prompt, checklist gate, QA path), and the status timeline is auditable. Block → unblock round-trip works. Derived effort rolls up correctly.
- **E3:** all pages render in dark + light theme; permission-gated links disappear for users without the bit; Kanban drag respects role + block state; QuickView stack navigation works.
- **E4:** two browsers can chat in real time; file upload + download work; in-app notifications fire for task status changes from other users; typing indicators appear.
- **E5:** reports show real data with non-admin users seeing only their own; perf is acceptable (initial Dashboard paint < 2 s on the seeded dataset); UAT is signed off; documentation is published; project status is `Completed`.

---

## 12. How to Apply This to the Running Stack

1. Sign in as `admin / admin@123`.
2. Create the project (use case 3.1) — name it `PMS Enterprise System`. Capture the new project id (1).
3. Create the 6 users in section 3 (use case 1.5).
4. Set project members (use case 3.3) to all 6 user ids.
5. Open the Tasks page and create tasks 1 through 12 in order. Add subtasks where indicated. Use the QuickView to add checklist items and watch auto-transitions fire.
6. Continue through the rest of the sections, sprint by sprint. At the end of each epic, the dashboard's "Effort & Productivity" widgets will start showing real numbers; the reports page will start populating.
7. Once task 52 is `completed`, run `PUT /api/projects/1` with `status = "Completed"` to close the project.

The end result is a fully-populated, audit-rich dataset that exercises every code path in the system.
