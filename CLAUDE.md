# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**PMS — Project & Task Management System** (root namespace `TaskManagement`): a full-stack SaaS-style work management app with a Kanban board, analytics dashboard, role-based permissions, and real-time chat. The backend is ASP.NET Core 6 Web API; the frontend is a React 19 + Vite SPA. The built SPA (`npm run build`) outputs to `../wwwroot` and is served as static files by the API host on port 5178.

Project: `PMS_Final_Backup.csproj` (`net6.0`, `<RootNamespace>TaskManagement</RootNamespace>`). There is no `.sln` file — `PMS.Tests/PMS.Tests.csproj` (net9.0, xunit) references the main project directly and is built/run standalone (see **Tests** below).

> **Note on the directory name:** The root folder is `PMS_Final_Backup/` but the assembly/namespace is `TaskManagement`. Do not use `PMS_Final_Backup` as a namespace prefix.

## Running & Building

### Backend (default)
```bash
dotnet restore
dotnet build
dotnet run                                    # http://localhost:5178
# Swagger UI: http://localhost:5178/swagger
```
On first run `DatabaseInitializer.InitializeAsync()` runs `MigrateAsync()` and seeds `SystemAdmin` role + page modules if empty.

### Frontend dev server (Vite, port 3000)
The SPA proxy has been removed. `dotnet run` serves the **pre-built** SPA from `wwwroot/` only — it does **not** auto-launch Vite. For active frontend development, run both processes separately:

```bash
# Terminal 1
dotnet run                           # API on :5178

# Terminal 2
cd ClientApp
npm install
npm run dev        # Vite dev on :3000 (proxies /api and /hubs to :5178)
```

Other frontend commands:
```bash
npm run build      # production build → ../wwwroot  (not ClientApp/dist)
npm run lint       # tsc --noEmit type-check
npm run preview    # preview the production build locally
```

### Migrations
`dotnet-ef` is a local tool pinned in `.config/dotnet-tools.json` — run `dotnet tool restore` once, then:
```bash
# after changing PMSDbContext / entities
dotnet ef migrations add <Name>
dotnet ef database update
```
Connection string is `DefaultConnection` in `appsettings.json` (currently the remote `sql.bsite.net` SQL Server). `DefaultConnection_` is a localdb fallback kept in the file. `20260629063553_InitialCreate` is a squashed baseline with many migrations layered on top (most recent: workflow status overhaul, review checklist, block checklist) — use `dotnet ef migrations list` to see the current tail rather than trusting a filename in this doc.

### Tests
```bash
dotnet test PMS.Tests/PMS.Tests.csproj              # all tests
dotnet test PMS.Tests/PMS.Tests.csproj --filter "FullyQualifiedName~StatusTransitionTests"   # one class
dotnet test PMS.Tests/PMS.Tests.csproj --filter "DisplayName~SomeTestName"                   # one test
```
`PMS.Tests` targets `net9.0` (xunit + Moq + EF Core InMemory) and project-references the main `net6.0` API project directly — there's no `.sln`, so point `dotnet test`/`dotnet build` at the specific `.csproj` rather than running bare `dotnet build` from root expecting it to include tests. `StatusTransitionTests` drives `TaskService.ChangeStatusAsync` against an EF Core in-memory DB; `AuthServiceTests` covers login/password-hashing behavior.

### Publish
`appsettings.json` documents the release command:
```
dotnet publish -c Release --self-contained true -o ./publish && npm run build
```

## Architecture

### Backend layering (top-down)
- **Controllers/** — thin `[ApiController]` classes routed under `api/[controller]`. Each method delegates to a service and wraps responses in `ApiResponse<T> { Success, Message, Data }`. Most actions are guarded by `IAuthorizationService.CanView/CanCreate/...` checks keyed by route path (e.g. `"/tasks"`). Exceptions: `AuthController` (no auth) and `BackupController`.
- **Services/** — business logic, registered as `AddScoped` in `Program.cs`. Notable services:
  - `TaskService` — workflow state machine (`AllowedEdges` for status transitions), mandatory `ActualHours` on certain transitions, 100% checklist gate before completion, QA pass/fail path, manager-only reopen. Returns `TaskEntity` (the EF entity type — note the `TaskEntity` name avoids the `System.Threading.Tasks.Task` clash).
  - `AuthService` / `PasswordHasher` (both in `AuthService.cs`) — PBKDF2 via `Microsoft.AspNetCore.Cryptography.KeyDerivation`, JWT issuance. `JwtService` class in the same file is **dead code** — not registered in DI, do not use it.
  - `ChatService` + `Hubs/ChatHub` — SignalR hub at `/hubs/chat`; tokens are accepted via `?access_token=` query string for the WebSocket upgrade (see `Program.cs` `JwtBearerEvents.OnMessageReceived`).
  - `WorkDiaryService` — tracks daily work diary entries (hours logged per user per day).
  - `TaskTemplateService` — reusable task-set templates that generate real tasks on a recurrence schedule. See **Task templates & scheduling** below.
  - `OtpService` — email OTP issuance/validation for registration and password reset (see **Auth flows** below).
  - `ProjectService`, `UserService`, `RoleService`, `ActivityService`, `NotificationService`, `ReportService`, `AuthorizationService`, `DatabaseInitializer`, `DatabaseBackupService` (commented out in DI), `CodeGenerator`, `EffortHelpers`, `AppClock` (centralized "now" — replace direct `DateTime.UtcNow` with `AppClock.Now`).
  - **Background hosted services** (`AddHostedService` in `Program.cs`, not `AddScoped`): `TaskTemplateSchedulerService` (hourly pass that fires due templates) and `OtpCleanupService` (purges expired OTP records). Each opens its own DI scope per run.
- **DTOs/GeneralDtos.cs** — single file containing all request/response DTOs. Includes `ReasonTags` (valid reassignment reason strings), `UserDto`, `ProjectDto`, `TaskDto`, `StatusHistoryDto`, `ChecklistItemDto`, `TaskBlockEntryDto`, `ApiResponse<T>`, etc.
- **Data/PMSDbContext.cs** — EF Core context, ~20 `DbSet` declarations. Entities (`Role`, `User`, `Project`, `ProjectMember`, `ProjectModule`, `TaskEntity`, `TaskTag`, `TaskComment`, `Attachment`, `Activity`, `PageModule`, `RolePagePermission`, `UserPagePermission`, `ProjectAssignmentHistory`, `TaskAssignmentHistory`, `ChecklistItem`, `TaskBlockEntry`, `TaskStatusHistory`, `ChatMessage`, `ChatAttachment`, `ChatRoom`, `ChatRoomMember`, `WorkDiary`, the task-template family — `TaskTemplate`, `TaskTemplateItem`, `TaskTemplateAssignee`, `TaskTemplateItemChecklist`/`Tag`/`Dependency`/`ReviewCriteria`, `TaskTemplateGeneration`, `TaskTemplateGeneratedTask` — plus `RefreshToken`, `EmailOtp`, `TaskReviewIssue`, and `TaskIssueEntry`) are all declared inside this single file alongside the fluent-API configuration. `Models/` only contains `ChatMessage.cs` and `ChatAttachment.cs` placeholders.
- **Mappings/MappingProfile.cs** — AutoMapper profile (registered via `AddAutoMapper(typeof(MappingProfile))`).
- **Migrations/** — EF Core migrations. The baseline was squashed to `20260629063553_InitialCreate`; later migrations layer on top (WorkDiary, task-lifecycle/issue entries, refresh tokens, email OTP, soft-delete on `User`, task-template module + trigger time, work-diary project). The latest is `20260703130000_AddWorkDiaryProject` — run `dotnet ef migrations list` for the current tail rather than trusting this line.

### Frontend (ClientApp)
- **Stack:** React 19, TypeScript ~5.8, Vite 6, TailwindCSS 4 (via `@tailwindcss/vite`), `react-router-dom` v7, `@microsoft/signalr` v10, `react-select`, `sonner` toasts, `motion` animations, `date-fns`, `lucide-react` icons.
- **Entry:** `src/main.tsx` → `src/App.tsx`. `App.tsx` nests providers (`ThemeProvider` → `SweetAlertProvider` → `AuthProvider` → `DataProvider` → `QuickViewProvider` → `BrowserRouter` → `ChatProvider`) and lazy-loads every page inside `<Suspense>` with a global `ErrorBoundary` and `ProtectedRoute` guard.
- **State:** Contexts in `src/context/` (`AuthContext`, `DataContext` — single source of truth for projects/users/roles/tasks, `ChatContext` — SignalR connection, `QuickViewContext`, `SweetAlertContext`, `ThemeContext`). Cross-cutting concerns live in `src/hooks/` (debounce, throttle, permissions, local/session storage, push notifications, window size, availability).
- **API access:** `src/lib/api.ts` exposes `apiRequest<T>()` which auto-attaches the JWT from `localStorage.pms_token`, unwraps the `ApiResponse<T>` envelope, broadcasts request counts to `loadingBus`, and toasts 403s via `lib/toast.ts`. The base URL is `import.meta.env.VITE_API_URL || '/api'` (`src/config/dataSource.ts`).
- **Domain types:** `src/types/index.ts` — canonical TypeScript types for the whole frontend. Defines `Status` (`'new' | 'in-progress' | 'paused' | 'blocked' | 'under-review' | 'issues' | 'completed'`), `Priority`, `ProjectStatus`, `ReasonTag`, and all entity interfaces (`User`, `Project`, `Task`, etc.). Import domain types from here, not from individual service files.
- **Domain services:** `src/services/` mirrors backend controllers (one file per resource, e.g. `task.service.ts`, `project.service.ts`, `report.service.ts`, `diary.service.ts`).
- **Path alias:** `@/*` resolves to the `ClientApp/` root (configured in `tsconfig.json` and `vite.config.ts`). Use `@/components/...`, `@/lib/...`, etc. instead of relative imports across directories.
- **Routes** (defined in `App.tsx`): `/auth`, `/`, `/projects`, `/projects/:id`, `/tasks`, `/users`, `/users/:id`, `/roles`, `/settings`, `/chat`, `/reports`, `/diary`, `/templates`, `/templates/new`, `/templates/:id`, `/templates/:id/edit`. All non-auth routes are wrapped in `DashboardLayout` inside `ProtectedRoute`.

### Permission model
Page-level CRUD is encoded as a 4-bit bitmap: **View(1) + Create(2) + Update(4) + Delete(8)**, stored per role in `RolePagePermissions` and overridable per user in `UserPagePermissions`. Seeded as `15` for `SystemAdmin`. Controllers call `IAuthorizationService.CanView("/route")` etc. before executing.

### Task status machine
`TaskService` enforces transitions via a static `AllowedEdges` dictionary. Valid statuses: `new → in-progress → paused / blocked / under-review → issues → completed`. `completed → in-progress` (reopen) is manager-only. `ActualHours > 0` is required on every transition except entering `new`. 100% checklist progress is required before `under-review` or `completed`. See `Services/TaskService.cs:ValidateStatusTransition`.

### Task templates & scheduling
A `TaskTemplate` is a reusable set of `TaskTemplateItem`s (title, estimate, priority, assignee, QA reviewer, checklist, tags, review criteria, due-date offset, inter-item dependencies) plus a recurrence config (`daily`/`weekly`/`monthly`/`custom` + `DayOfWeek`/`DayOfMonth`/`CustomIntervalDays`, optional `TriggerTime`, `StartDate`/`EndDate`). "Generating" a template creates real `TaskEntity` rows — one per item — wiring checklists, tags, review issues, and `TaskBlockEntry` dependency links, then notifies assignees. Each generation is recorded as a `TaskTemplateGeneration` keyed by a **`PeriodKey`** (e.g. `"{id}::2026-07-07"`, ISO-week for weekly, `yyyy-MM` for monthly) which is the idempotency guard — a period is generated at most once. `TaskTemplateSchedulerService` runs hourly: for each active in-window template whose recurrence matches today and whose `TriggerTime` has passed, it generates if the `PeriodKey` doesn't already exist. `ComputeNextRunAt` (in `TaskTemplateService`) mirrors these exact rules to surface the next scheduled run. All template endpoints are gated by `IAuthorizationService.IsAdminAsync()`, **not** the page-permission bitmap.

### Auth flows
`AuthController` is `[AllowAnonymous]` and coordinates three flows beyond plain login: (1) **registration** and (2) **password reset** both go through `OtpService` — an email OTP is issued, then `ConfirmRegister`/reset validate-and-consume it via `ValidateAndConsumeAsync(email, code, purpose)`; (3) **refresh tokens** are issued alongside the JWT and stored in an httpOnly `pms_rt` cookie (falls back to the request body), rotated on `Refresh`. Expired OTP rows are purged by the `OtpCleanupService` hosted service. `User.IsDeleted` is a soft-delete flag — filter it out where listing users.

### Login case sensitivity
Username login is **case-sensitive** (`"admin" ≠ "Admin"`). Email login is **case-insensitive**. Implemented in `AuthService.LoginAsync` by splitting on `@`, using a CI DB query for username candidates, then filtering with `StringComparison.Ordinal` in C#.

### Permission model (detail)
`AuthorizationService` is `AddScoped` and caches the loaded `User` entity in `_cachedUser` to avoid repeated DB lookups within one request. Priority order: SystemAdmin (`RoleId=1`) → `IsAdmin=true` role → `UserPagePermission` (user override) → `RolePagePermission` (role default). Dashboard (`/`) always returns `CanView=true`.

## Conventions & Cross-Cutting Patterns
- `RootNamespace`/`AssemblyName` are `TaskManagement` (not `PMS_...`). The folder name `PMS_Final_Backup` is just the project directory.
- Async work should be `Task`-returning and `await`ed; avoid `.Result`/`.Wait()`.
- All API responses are wrapped in `ApiResponse<T>` (see `DTOs/GeneralDtos.cs`) — never return raw entities from controllers.
- Use `AppClock.Now` instead of `DateTime.UtcNow` for testability.
- Frontend fetches go through `apiRequest()` in `lib/api.ts` so loading state, auth headers, and 401/403 handling stay consistent.
- Working-hours / effort calculations live in `Services/EffortHelpers.cs` (the "10–19 IST working-hours filter" referenced in `E2E_Prompt.md`).
- Hardcoded JWT key in `appsettings.json` is a development default; `Program.cs` falls back to it when `JwtSettings:Key` is missing.

## Fixed Constraints
These are intentional or known-accepted; do not change them:
- `F-02`: DB credentials in `appsettings.json` — do not rotate/change.
- `F-03`: Swagger unconditionally enabled in production — intentional for this deployment.
- `F-06`: Hardcoded JWT key in `appsettings.json` — development default; do not change.

## Related Documentation
- `reverse_engineering/` — 13-phase reverse engineering output. Start with `Phase13_Final_Documentation.md` for onboarding, `Phase8_Business_Rules.md` for all domain rules, `Phase12_Code_Quality_Review.md` for known issues.
- `PMS — Codebase Map.md` — exhaustive file-by-file index.
- `USE_CASES.md` — end-to-end user flows.
- `PROJECT_TASKS.md` — task tracker / delivery status.
- `E2E_Prompt.md` — full-stack verification scenarios with 7 seeded roles, 6 users, 1 project, 52 tasks across 5 epics — useful as both a manual test script and a reference for the expected domain shape (status workflow cheat-sheet, permission matrix, sprint schedule).
- `SampleData.json` — copy-to-output seed payload used during initialization.
