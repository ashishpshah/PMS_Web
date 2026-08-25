# Phase 10 – Software Requirements Specification (SRS)

**Document type:** Reverse-engineered SRS (IEEE 830 style)
**Source:** Full codebase analysis, Phases 1–9
**Version:** 1.0 (derived, 2026-06-29)

---

## 1. Introduction

### 1.1 Purpose

This document specifies the functional and non-functional requirements for the **Project & Task Management System (PMS)**, as reverse-engineered from the production codebase. It serves as an authoritative reference for feature audits, regression testing, and future development.

### 1.2 Scope

PMS is a full-stack SaaS-style work management application providing:
- Project and task lifecycle management with role-gated workflows
- Real-time team chat with direct messaging, rooms, and file attachments
- Analytics and effort-tracking reports
- Role-based and user-based permission management
- Team collaboration with online presence and in-app notifications

**Not in scope:** Mobile app, external API integrations, billing, multi-tenancy.

### 1.3 Definitions

| Term | Definition |
|---|---|
| SystemAdmin | Special role (`Id = 1`, `RoleId = 1`). Full access, cannot be modified via API |
| Admin | Any role with `IsAdmin = true`. Full access |
| Manager | Task creator, project owner, or project creator |
| Assignee | User currently assigned to a task |
| QA Reviewer | User set as `QaAssigneeId` on a task |
| Permission bitmap | 4-bit integer: View(1) + Create(2) + Update(4) + Delete(8) |
| JWT | JSON Web Token — stateless authentication credential |
| ActualHours | Self-reported hours entered by the user during status transitions |

---

## 2. Overall Description

### 2.1 System Architecture

- **Backend:** ASP.NET Core 6 Web API, Entity Framework Core 6
- **Frontend:** React 19 SPA (TypeScript, Vite, TailwindCSS 4)
- **Database:** SQL Server (remote shared hosting)
- **Real-time:** ASP.NET Core SignalR at `/hubs/chat`
- **Authentication:** JWT Bearer (HMAC-SHA256, 420 min lifetime)
- **Deployment:** Single-server; SPA compiled into `wwwroot/` and served as static files

### 2.2 User Classes

| Class | Description |
|---|---|
| SystemAdmin | One super-user; manages roles, permissions, and all users |
| Admin Role | Users in roles with `IsAdmin = true`; full page access |
| Project Manager | Users with project management permissions |
| Developer / Team Member | Users with task-level access |
| QA Reviewer | Users assigned QA review duties per task |
| Unauthenticated | Access only to `/auth` registration and login |

---

## 3. Functional Requirements

### FR-01: Authentication

| ID | Requirement |
|---|---|
| FR-01.1 | The system shall authenticate users by username (case-sensitive) or email (case-insensitive) |
| FR-01.2 | The system shall hash passwords using PBKDF2 / HMACSHA256 with 100,000 iterations |
| FR-01.3 | The system shall issue a JWT token valid for 420 minutes on successful login |
| FR-01.4 | The system shall reject login for inactive accounts without revealing account status |
| FR-01.5 | The system shall validate the token on every frontend app load via `GET /api/auth/validate` |
| FR-01.6 | The system shall allow self-registration, auto-assigning the lowest non-admin role |
| FR-01.7 | The system shall not allow self-registration to assign the SystemAdmin role |
| FR-01.8 | Password reset shall generate a cryptographically random 12-char temporary password |
| FR-01.9 | Password reset shall be restricted to SystemAdmin and Admin role users |
| FR-01.10 | The system shall not implement refresh tokens; users re-authenticate after expiry |

---

### FR-02: User Management

| ID | Requirement |
|---|---|
| FR-02.1 | The system shall list all users, excluding SystemAdmin (`Id ≤ 1`) |
| FR-02.2 | The system shall allow admins to create, update, and deactivate users |
| FR-02.3 | The system shall provide an assignable user list: active users with `RoleId ≠ 1` |
| FR-02.4 | The system shall allow users to update their own profile and change their password |
| FR-02.5 | Deactivating a user shall block future logins but not invalidate existing JWT tokens |
| FR-02.6 | The system shall not permit modification of the SystemAdmin account via the users API |

---

### FR-03: Role & Permission Management

| ID | Requirement |
|---|---|
| FR-03.1 | Roles shall have a name, code (unique where not null), level, and IsAdmin flag |
| FR-03.2 | Roles with `IsAdmin = true` shall receive full access to all pages without DB permission lookup |
| FR-03.3 | Non-admin role permissions shall be configurable per page module using a 4-bit bitmap |
| FR-03.4 | User-level permission overrides shall take priority over role-level permissions |
| FR-03.5 | The Dashboard page shall always be accessible regardless of permission configuration |
| FR-03.6 | Only SystemAdmin shall manage permission tables via `/api/permissions/**` |
| FR-03.7 | The system shall seed the System Administrator role and 10 team roles on first run |

---

### FR-04: Project Management

| ID | Requirement |
|---|---|
| FR-04.1 | Only admin users can create, update, or delete projects |
| FR-04.2 | Each project shall have an auto-generated code (`PRJ-{NN}`) that is immutable |
| FR-04.3 | Projects shall support member management (full-replace member list) |
| FR-04.4 | Project ownership transfer shall require a valid reason tag |
| FR-04.5 | Every ownership transfer shall be recorded in `ProjectAssignmentHistories` |
| FR-04.6 | Projects shall support modules as organizational groupings |

---

### FR-05: Task Management

| ID | Requirement |
|---|---|
| FR-05.1 | Every task must have an estimated hours value greater than zero |
| FR-05.2 | Tasks shall be assigned an auto-generated code: top-level `TSK-PP-TT`, subtask `SUB-PP-TT-SS` |
| FR-05.3 | A task's status can only change through the defined allowed edges |
| FR-05.4 | `ActualHours > 0` shall be required for all status transitions except `new` |
| FR-05.5 | Blocking a task shall require a non-empty reason string |
| FR-05.6 | Submitting a task for review shall require 100% checklist completion |
| FR-05.7 | Completing a task shall require 100% checklist completion (if checklist items exist) |
| FR-05.8 | Completing from under-review: QA assignee or manager (if RequiresQA); else manager only |
| FR-05.9 | Sending a task back with issues shall be restricted to manager or QA reviewer |
| FR-05.10 | Reopening a completed task shall be restricted to the manager |
| FR-05.11 | A task with active blocks cannot change status unless the actor is an admin |
| FR-05.12 | Task reassignment shall require a valid reason tag and shall auto-resolve active blocks |
| FR-05.13 | A task with child tasks cannot be deleted |
| FR-05.14 | Parent tasks must belong to the same project as their children |
| FR-05.15 | Tasks shall support subtask hierarchies (parent–child relationship) |
| FR-05.16 | Tasks shall support tags, comments, attachments, checklist items, and block entries |
| FR-05.17 | The system shall record all status transitions in `TaskStatusHistories` |

---

### FR-06: Checklist

| ID | Requirement |
|---|---|
| FR-06.1 | Only the current task assignee can toggle checklist items |
| FR-06.2 | Only the task creator or project owner can add, edit, or delete checklist items |
| FR-06.3 | Task progress shall be calculated as: completed checklist items / total × 100 |
| FR-06.4 | When progress reaches 100% and task status is `issues`, the system shall auto-advance to `under-review` |

---

### FR-07: Block Management

| ID | Requirement |
|---|---|
| FR-07.1 | A task can have multiple block entries, but only one active block per user |
| FR-07.2 | Block reason is mandatory (max 1000 characters) |
| FR-07.3 | Resolving a block shall set `ResolvedAt` and `IsActive = false` |
| FR-07.4 | Task reassignment shall automatically resolve all active blocks |

---

### FR-08: Chat

| ID | Requirement |
|---|---|
| FR-08.1 | The system shall provide a global chat channel available to all authenticated users |
| FR-08.2 | The system shall support private rooms (direct messages and group rooms) |
| FR-08.3 | Room messages shall only be delivered to room members |
| FR-08.4 | The system shall display real-time online presence for connected users |
| FR-08.5 | The system shall display typing indicators per channel |
| FR-08.6 | File attachments in chat shall be validated by magic byte (not only extension) |
| FR-08.7 | Maximum file size for chat attachments shall be 25 MB |
| FR-08.8 | Chat file downloads shall be protected against path traversal attacks |
| FR-08.9 | Direct message rooms shall be created idempotently |
| FR-08.10 | Chat history shall support cursor-based scroll-up pagination |

---

### FR-09: Notifications

| ID | Requirement |
|---|---|
| FR-09.1 | The system shall push in-app notifications to specific users via SignalR |
| FR-09.2 | Notifications shall include title, body, type (`task` or `system`), optional taskId, and timestamp |
| FR-09.3 | The frontend shall display notifications as toasts and optionally as Web Push notifications |

---

### FR-10: Reports & Effort

| ID | Requirement |
|---|---|
| FR-10.1 | The system shall track effort per task per status transition (self-reported ActualHours) |
| FR-10.2 | The system shall filter effort data to working hours (default 10:00–19:00 IST) |
| FR-10.3 | Non-admin users shall only view their own effort and report data |
| FR-10.4 | The system shall provide dashboard statistics: total projects, tasks, active users, tasks by status |
| FR-10.5 | The system shall generate effort reports with daily breakdowns and user summaries |

---

### FR-11: Activity Log

| ID | Requirement |
|---|---|
| FR-11.1 | The system shall record activity events for significant domain actions |
| FR-11.2 | Activity logs shall be filterable by date range and user |
| FR-11.3 | Non-admin users shall see only their own activities |

---

## 4. Non-Functional Requirements

### NFR-01: Security

| ID | Requirement |
|---|---|
| NFR-01.1 | All API endpoints except `/api/auth/*` and `/api/users/check-availability` shall require a valid JWT |
| NFR-01.2 | Password hashing shall use PBKDF2 with at least 100,000 HMACSHA256 iterations |
| NFR-01.3 | JWT signing key shall be at least 32 characters |
| NFR-01.4 | File downloads shall prevent path traversal by resolving and checking the canonical path |
| NFR-01.5 | Chat file uploads shall be validated by magic byte |
| NFR-01.6 | Account enumeration shall be prevented by returning identical error messages for wrong credentials and inactive accounts |

### NFR-02: Performance

| ID | Requirement |
|---|---|
| NFR-02.1 | Task list API shall support server-side pagination (max 500 per page) |
| NFR-02.2 | Dashboard statistics shall be computed in parallel (multiple DB queries run concurrently) |
| NFR-02.3 | All task list queries shall use `AsSplitQuery()` for multi-include EF Core queries |
| NFR-02.4 | The frontend shall load all tasks using parallel page requests via `Promise.all` |

### NFR-03: Reliability

| ID | Requirement |
|---|---|
| NFR-03.1 | The system shall use EF Core migrations to ensure schema consistency on startup |
| NFR-03.2 | The database shall be seeded with SystemAdmin role and page modules on first run |
| NFR-03.3 | The SignalR connection shall auto-reconnect with backoff `[0, 2s, 5s, 10s, 30s]` |

### NFR-04: Usability

| ID | Requirement |
|---|---|
| NFR-04.1 | The login form shall support tabIndex navigation (email:1, password:2, button:3, forgot:4) |
| NFR-04.2 | The system shall display a loading spinner during API requests |
| NFR-04.3 | The system shall display toast notifications for 403 errors |
| NFR-04.4 | The system shall support dark and light themes, persisted in localStorage |

### NFR-05: Maintainability

| ID | Requirement |
|---|---|
| NFR-05.1 | All API responses shall be wrapped in `ApiResponse<T>` envelope |
| NFR-05.2 | UTC time shall be accessed via `AppClock.Now` (not `DateTime.UtcNow` directly) |
| NFR-05.3 | Frontend API calls shall go through the central `apiRequest()` function |

---

## 5. Constraints

| ID | Constraint |
|---|---|
| C-01 | Database is hosted on `sql.bsite.net` (shared hosting) — no DDL outside EF migrations |
| C-02 | JWT signing key is hardcoded in `appsettings.json` (development default) |
| C-03 | Swagger UI is unconditionally enabled (including production) |
| C-04 | HTTPS redirection is disabled |
| C-05 | No refresh token mechanism — users must re-login after token expiry |
| C-06 | Online presence is in-memory — not shared across multiple server instances |
| C-07 | Working hours are configurable but default to 10:00–19:00 IST |

---

## 6. External Interface Requirements

### 6.1 API Interface

| Property | Value |
|---|---|
| Protocol | HTTP/1.1 |
| Base path | `/api` |
| Format | JSON |
| Auth | `Authorization: Bearer <JWT>` |
| Response envelope | `{ "success": bool, "message": string, "data": T }` |
| Pagination fields | `totalCount`, `page`, `pageSize`, `totalPages` |

### 6.2 WebSocket Interface

| Property | Value |
|---|---|
| Protocol | WebSocket (SignalR) |
| Endpoint | `/hubs/chat` |
| Auth | `?access_token=<JWT>` query string |
| Reconnect | Automatic with exponential-ish backoff |

### 6.3 Frontend Interface

| Property | Value |
|---|---|
| Entry | `index.html` served from `/` |
| API base | `VITE_API_URL` env var, defaults to `/api` |
| Auth storage | `localStorage.pms_token` (JWT), `localStorage.pms_user` (user object) |
| Theme storage | `localStorage` (theme preference) |

---

## 7. Appendix: Valid Reason Tags

Used for task reassignment and project ownership transfer:

`Resignation` · `Workload Balancing` · `Management Decision` · `Unavailability` · `No Resource` · `Unable to Complete` · `Admin Decision` · `Other`

## 8. Appendix: Task Status Allowed Transitions

| From | Allowed To |
|---|---|
| new | in-progress, completed |
| in-progress | paused, blocked, under-review, completed |
| paused | in-progress, completed |
| blocked | in-progress, completed |
| under-review | issues, in-progress, completed |
| issues | in-progress, completed |
| completed | in-progress (manager only) |
