# Phase 13 – Final Documentation

**Document type:** Master summary and developer onboarding guide
**Source:** Phases 1–12 (full reverse engineering exercise)
**Version:** 1.0 (2026-06-29)

---

## 13.1 Executive Summary

PMS (Project & Task Management System) is a full-stack SaaS-style work management application built on **ASP.NET Core 6** (backend) and **React 19 + Vite** (frontend). It provides project management, task lifecycle tracking, real-time team chat, analytics reporting, and a fine-grained permission system.

The system was reverse-engineered from the production codebase. All 13 phases of analysis are documented in the `/reverse_engineering/` folder. This final document consolidates the most important facts for developers joining the project.

---

## 13.2 Quick Reference

### Endpoints at a Glance

| Base | Description | Auth |
|---|---|---|
| `POST /api/auth/login` | Login | Anonymous |
| `POST /api/auth/register` | Self-register | Anonymous |
| `GET /api/auth/validate` | Validate token + refresh user | JWT |
| `GET /api/projects` | List all projects | JWT |
| `GET /api/tasks` | Paginated task list | JWT |
| `PUT /api/tasks/{id}/status` | Change task status | JWT |
| `GET /api/users` | List users (excl. SystemAdmin) | JWT |
| `GET /api/permissions/my` | Current user's page permissions | JWT |
| `GET /api/reports/effort` | Effort report | JWT |
| `/hubs/chat` | SignalR chat hub | JWT via `?access_token=` |

### Key Ports

| Service | Port |
|---|---|
| ASP.NET Core API | 5178 |
| Vite dev server | 3000 (dev only; auto-proxied) |

### Important Files

| File | Purpose |
|---|---|
| `appsettings.json` | DB connection string, JWT key, working hours config |
| `Data/PMSDbContext.cs` | All 22 DB entities + EF Core configuration |
| `DTOs/GeneralDtos.cs` | All request/response DTOs and `ReasonTags` |
| `Services/TaskService.cs` | Task business logic + status machine |
| `Services/AuthService.cs` | Login, register, JWT issuance, password hashing |
| `Services/AuthorizationService.cs` | Permission bitmap resolution |
| `Hubs/ChatHub.cs` | SignalR hub (chat + notifications) |
| `Program.cs` | DI registration, middleware pipeline, JWT config |
| `ClientApp/src/App.tsx` | Route definitions + provider nesting |
| `ClientApp/src/lib/api.ts` | Centralized HTTP client wrapper |
| `ClientApp/src/context/` | All React context providers |

---

## 13.3 Domain Model Summary

### 22 Database Tables

| Group | Tables |
|---|---|
| Identity | `Roles`, `Users` |
| Projects | `Projects`, `ProjectMembers`, `ProjectAssignmentHistories`, `ProjectModules` |
| Tasks | `Tasks`, `TaskTags`, `TaskComments`, `Attachments`, `ChecklistItems`, `TaskBlockEntries`, `TaskStatusHistories`, `TaskAssignmentHistories` |
| Permissions | `PageModules`, `RolePagePermissions`, `UserPagePermissions` |
| Chat | `ChatMessages`, `ChatAttachments`, `ChatRooms`, `ChatRoomMembers` |
| Activity | `Activities` |

### Core Relationships

- One `Role` → many `Users`
- One `Project` → many `Tasks`, many `ProjectMembers`
- One `TaskEntity` → many `ChecklistItems`, `StatusHistory`, `AssignmentHistory`, `BlockEntries`, `Comments`, `Tags`
- `TaskEntity` → optional `ParentTask` (self-referential hierarchy)
- `PageModule` → `RolePagePermission` (role-level) + `UserPagePermission` (user-level override)

---

## 13.4 Key Business Rules (Critical Path)

1. **Status machine** — task moves only through `AllowedEdges`. Cannot skip states.
2. **ActualHours required** — mandatory on every status transition except entering `new`.
3. **Checklist gate** — `under-review` and `completed` both require 100% checklist progress.
4. **Blocked guard** — an active block entry prevents status changes (admin exempt).
5. **Review approval** — if `RequiresQA`, the QA assignee or manager approves; otherwise only the manager.
6. **Reopen** — only the manager can reopen a `completed` task.
7. **Reassign auto-unblock** — reassigning a task automatically resolves all active blocks.
8. **Delete guard** — a task with child tasks cannot be deleted.
9. **Code immutability** — task and project codes are auto-generated and never changeable after creation.
10. **Estimated hours** — must be > 0 on create and update; non-negotiable.

---

## 13.5 Permission System Cheat Sheet

```
Request arrives → JWT validated
                  ↓
           Is user SystemAdmin (RoleId=1)?  → ALLOW ALL
                  ↓ no
           Is role IsAdmin = true?          → ALLOW ALL
                  ↓ no
           Is route = '/' or 'dashboard'?  → CanView = true (others = false unless permissioned)
                  ↓
           UserPagePermission exists?       → Use user-level bitmap (overrides role)
                  ↓ no
           RolePagePermission exists?       → Use role-level bitmap
                  ↓ no
                               DENY
```

**Bitmap bits:** View=1, Create=2, Update=4, Delete=8. Full access = 15.

---

## 13.6 Task Status Allowed Moves

```
new          → in-progress, completed
in-progress  → paused, blocked, under-review, completed
paused       → in-progress, completed
blocked      → in-progress, completed
under-review → issues, in-progress (mgr), completed (QA/mgr)
issues       → in-progress, completed
completed    → in-progress (manager only — reopen)
```

---

## 13.7 SignalR Events Reference

### Client → Server (Hub Methods)

| Method | When |
|---|---|
| `SendMessage(dto)` | User sends a message |
| `JoinRoom(roomId)` | User opens a room |
| `StartTyping(roomId?)` | User starts typing |
| `StopTyping(roomId?)` | User stops typing |

### Server → Client (Events)

| Event | Payload | When |
|---|---|---|
| `ReceiveMessage` | `ChatMessageDto` | New chat message |
| `ReceiveNotification` | `NotificationDto` | Task or system notification |
| `UserJoined` | `OnlineUserDto` | Another user connects |
| `UserLeft` | `userId` | Another user disconnects |
| `OnlineUsers` | `List<OnlineUserDto>` | Initial presence snapshot on connect |
| `TypingStarted` | `userId, userName` | Someone starts typing |
| `TypingStopped` | `userId` | Someone stops typing |

---

## 13.8 Authentication Summary

| Aspect | Value |
|---|---|
| Scheme | JWT Bearer (HMAC-SHA256) |
| Token lifetime | 420 minutes |
| Storage | `localStorage.pms_token` |
| Username login | Case-sensitive |
| Email login | Case-insensitive |
| Password hashing | PBKDF2, HMACSHA256, 100,000 iterations |
| SignalR auth | `?access_token=<token>` query string |
| Refresh tokens | Not implemented |
| HTTPS | Not enforced (commented out) |

---

## 13.9 Frontend Architecture Summary

```
main.tsx → App.tsx
├── ErrorBoundary
├── ThemeProvider → SweetAlertProvider → AuthProvider → DataProvider
│   → QuickViewProvider → BrowserRouter → ChatProvider
└── Routes (12 lazy pages)
    ├── /auth         → Auth.tsx (public)
    ├── /             → Dashboard.tsx
    ├── /projects     → Projects.tsx
    ├── /projects/:id → ProjectDetails.tsx
    ├── /tasks        → Tasks.tsx
    ├── /users        → Users.tsx
    ├── /users/:id    → UserDetails.tsx
    ├── /roles        → Roles.tsx
    ├── /settings     → Settings.tsx
    ├── /chat         → Chat.tsx
    ├── /reports      → Reports.tsx
    └── *             → NotFound.tsx
```

**State:** `AuthContext` (identity) + `DataContext` (projects/users/roles/tasks) + `ChatContext` (SignalR) are the three core state stores.

**HTTP:** All calls go through `lib/api.ts` → `apiRequest<T>()`. It attaches JWT, unwraps `ApiResponse<T>`, drives `GlobalLoader`, and toasts 403 errors.

---

## 13.10 Valid Reason Tags

Used for task reassignment and project ownership transfer:

`Resignation` · `Workload Balancing` · `Management Decision` · `Unavailability` · `No Resource` · `Unable to Complete` · `Admin Decision` · `Other`

---

## 13.11 Known Issues & Top Priorities (from Phase 12)

| Priority | ID | Issue |
|---|---|---|
| P0 | SEC-01 | JWT signing key hardcoded in committed source |
| P0 | SEC-02 | DB credentials in committed source |
| P1 | SEC-03 | HTTPS not enforced |
| P1 | SEC-04 | Swagger enabled in production |
| P1 | ARCH-01 | Some controllers access DB directly (bypass service layer) |
| P2 | ERR-03 | Multi-step operations lack DB transactions |
| P2 | PERF-01 | Effort date filtering done in-memory (not SQL) |
| P2 | BL-01 | Block auto-resolution on reassign missing status history row |
| P3 | SEC-05 | Username availability check is unauthenticated |

Full details: [Phase12_Code_Quality_Review.md](Phase12_Code_Quality_Review.md)

---

## 13.12 Phase Index

| Phase | File | Status |
|---|---|---|
| 1 | [Phase1_Solution_Analysis.md](Phase1_Solution_Analysis.md) | Complete |
| 2 | [Phase2_Database_Analysis.md](Phase2_Database_Analysis.md) | Complete |
| 3 | [Phase3_API_Analysis.md](Phase3_API_Analysis.md) | Complete |
| 4 | [Phase4_Authentication_Authorization.md](Phase4_Authentication_Authorization.md) | Complete |
| 5 | [Phase5_Functional_Module_Discovery.md](Phase5_Functional_Module_Discovery.md) | Complete |
| 6 | [Phase6_Frontend_Analysis.md](Phase6_Frontend_Analysis.md) | Complete |
| 7 | [Phase7_SignalR_Analysis.md](Phase7_SignalR_Analysis.md) | Complete |
| 8 | [Phase8_Business_Rules.md](Phase8_Business_Rules.md) | Complete |
| 9 | [Phase9_Workflow_Documentation.md](Phase9_Workflow_Documentation.md) | Complete |
| 10 | [Phase10_SRS.md](Phase10_SRS.md) | Complete |
| 11 | [Phase11_UML_Documentation.md](Phase11_UML_Documentation.md) | Complete |
| 12 | [Phase12_Code_Quality_Review.md](Phase12_Code_Quality_Review.md) | Complete |
| 13 | [Phase13_Final_Documentation.md](Phase13_Final_Documentation.md) | Complete |

---

## 13.13 Developer Onboarding Checklist

- [ ] Clone repo and run `dotnet restore && dotnet build`
- [ ] Start backend: `dotnet run` → app on `http://localhost:5178`
- [ ] Open Swagger: `http://localhost:5178/swagger`
- [ ] Login with system admin credentials to verify DB connectivity
- [ ] Review `Phase1_Solution_Analysis.md` for full architecture overview
- [ ] Review `Phase8_Business_Rules.md` for all BR-XXX rules before touching TaskService
- [ ] Review `Phase12_Code_Quality_Review.md` for known issues before adding new features
- [ ] Understand the status machine (`AllowedEdges` in `Services/TaskService.cs:276`) before any status-related work
- [ ] Understand the permission bitmap before any authorization-related work
- [ ] Run `cd ClientApp && npm install && npm run dev` for frontend development
