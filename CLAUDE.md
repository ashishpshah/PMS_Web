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
On first run `DatabaseInitializer.InitializeAsync()` runs `MigrateAsync()` and seeds `SystemAdmin` role + page modules if empty. That call is wrapped in try/catch in `Program.cs` — a cold/unreachable remote SQL Server at startup logs an error but does not crash the host, so static files and the login page still serve even if the DB is down.

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
Connection string is `DefaultConnection` in `appsettings.json` (currently a remote SQL Server). `20260629063553_InitialCreate` is a squashed baseline with many migrations layered on top (most recent tail includes the workflow status overhaul, review/block checklists, skip-rules + multi-days-of-month recurrence, and `RemoveDueDateColumns` — due dates were dropped from both `Tasks` and `TaskTemplateItems`) — use `dotnet ef migrations list` to see the current tail rather than trusting a filename in this doc.

### Tests
```bash
dotnet test PMS.Tests/PMS.Tests.csproj              # all tests
dotnet test PMS.Tests/PMS.Tests.csproj --filter "FullyQualifiedName~StatusTransitionTests"   # one class
dotnet test PMS.Tests/PMS.Tests.csproj --filter "DisplayName~SomeTestName"                   # one test
```
`PMS.Tests` targets `net9.0` (xunit + Moq + EF Core InMemory) and project-references the main `net6.0` API project directly — there's no `.sln`, so point `dotnet test`/`dotnet build` at the specific `.csproj` rather than running bare `dotnet build` from root expecting it to include tests. `StatusTransitionTests` drives `TaskService.ChangeStatusAsync` against an EF Core in-memory DB; `AuthServiceTests` covers login/password-hashing behavior. `UnitTest1.cs` is an empty scaffold stub left over from `dotnet new xunit` — not meaningful, don't treat it as coverage.

### Publish
`appsettings.json` documents the release command:
```
dotnet publish -c Release --self-contained true -o ./publish && npm run build
```

## Architecture

### Backend layering (top-down)
- **Controllers/** — thin `[ApiController]` classes routed under `api/[controller]`. Each method delegates to a service and wraps responses in `ApiResponse<T> { Success, Message, Data }`. Most actions are guarded by `IAuthorizationService.CanView/CanCreate/...` checks keyed by route path (e.g. `"/tasks"`). Exceptions: `AuthController` (no auth) and `BackupController`.
- **Validators/ + Filters/ValidationFilter.cs** — a FluentValidation layer sitting in front of every controller action. `Program.cs` registers `ValidationFilter` as a global `IAsyncActionFilter` and suppresses the framework's automatic ModelState-invalid 400 (`ApiBehaviorOptions.SuppressModelStateInvalidFilter = true`) so `ValidationFilter` is the single source of truth for the 400 response shape. Per request it: (1) trims every writable string property on every action argument (skipping properties whose name contains "Password"), (2) reads any DataAnnotations/ModelState failures, (3) resolves and runs the registered `IValidator<T>` for each argument type, then merges both error sources into one `ApiResponse<object>`. Validators live one file per domain area mirroring `Controllers/` (`AuthValidators.cs`, `UserValidators.cs`, `RoleValidators.cs`, `ProjectValidators.cs`, `TaskValidators.cs`, `WorkDiaryValidators.cs`, `TemplateValidators.cs`, `ChatValidators.cs`), plus shared building blocks in `ValidationConstants.cs` (regex/enum/limit constants) and `ValidatorExtensions.cs` (`RequiredText`, `MustBeOneOf`, `MustBeValidHours`, etc.), and `FileValidationHelper.cs` (shared magic-byte file-type check used by both chat and task attachment uploads). All are registered via `AddValidatorsFromAssemblyContaining<LoginDtoValidator>()`. See `VALIDATION_PARITY_REPORT.md` for the full audit of what each validator closes.
- **Services/** — business logic, registered as `AddScoped` in `Program.cs` (except where noted). Notable services:
  - `TaskService` — the task workflow state machine. Valid (from, to) edges and whether each requires `ActualHours` are **not** hardcoded — they come from `ITaskStatusTransitionProvider` (registered `AddSingleton`), which parses appsettings.json's `TaskStatusTransitions` section once at startup. `TaskService.ValidateStatusTransition` consults that graph for "is this edge legal at all" / "does it need hours", then layers on checklist-completion gates (100% required to enter `under-review` or `completed`) and per-target role gates (assignee-only submit-for-review, QA-reviewer-or-manager approve/return-issues, manager-only send-back-from-review). `completed → in-progress` (reopen) no longer exists as an edge — it was removed from the config, not just gated. `DeriveActionName(from, to)` maps edges to human labels ("Start Work", "Submit for Review", "Approve & Complete", …) surfaced via `/api/tasks/status-transitions` so the frontend doesn't keep a driftable copy. Returns `TaskEntity` (the EF entity type — note the `TaskEntity` name avoids the `System.Threading.Tasks.Task` clash).
  - `AuthService` / `PasswordHasher` (both in `AuthService.cs`) — PBKDF2 via `Microsoft.AspNetCore.Cryptography.KeyDerivation`, JWT issuance. `Services/JwtService.cs` is a separate, still-**dead** file — not registered in DI, do not use it.
  - `EmailService` — thin MailKit SMTP wrapper (`IEmailService.SendAsync(to, subject, htmlBody)`) reading `Email:*` settings from config; used by `OtpService` to deliver registration/reset codes.
  - `ChatService` + `Hubs/ChatHub` — SignalR hub at `/hubs/chat`; tokens are accepted via `?access_token=` query string for the WebSocket upgrade (see `Program.cs` `JwtBearerEvents.OnMessageReceived`). `ChatHub` also reports presence through `IOnlineUserTracker` (`AddSingleton`, an in-memory `ConcurrentDictionary<connectionId, OnlineUserDto>`) — connect/disconnect update the tracker and the caller is sent the current `OnlineUsers` list.
  - `WorkDiaryService` — tracks daily work diary entries (hours logged per user per day).
  - `TaskTemplateService` — reusable task-set templates that generate real tasks on a recurrence schedule. See **Task templates & scheduling** below.
  - `OtpService` — email OTP issuance/validation for registration and password reset (see **Auth flows** below).
  - `ProjectService`, `UserService`, `RoleService`, `ActivityService`, `NotificationService`, `ReportService`, `AuthorizationService`, `DatabaseInitializer`, `DatabaseBackupService` (commented out in DI), `CodeGenerator`, `EffortHelpers`, `AppClock` (centralized "now" — replace direct `DateTime.UtcNow` with `AppClock.Now`).
  - **Background hosted services** (`AddHostedService` in `Program.cs`, not `AddScoped`): `TaskTemplateSchedulerService` (hourly pass that fires due templates) and `OtpCleanupService` (purges expired OTP records). Each opens its own DI scope per run.
- **Middleware/LoginRateLimitMiddleware.cs** — sliding-window rate limiter (5 requests/IP/minute) on `POST /api/auth/{login,refresh,forgot-password,register/initiate}`. Deliberately **skipped entirely in Development** (`IWebHostEnvironment.IsDevelopment()`) because normal dev/Playwright usage burns through the budget on its own; only Production enforces it.
- **DTOs/GeneralDtos.cs** — single file containing all request/response DTOs. Includes `ReasonTags` (valid reassignment reason strings), `UserDto`, `ProjectDto`, `TaskDto`, `StatusHistoryDto`, `ChecklistItemDto`, `TaskBlockEntryDto`, `OnlineUserDto`, `ApiResponse<T>`, etc.
- **Data/PMSDbContext.cs** — EF Core context, ~20 `DbSet` declarations. Entities (`Role`, `User`, `Project`, `ProjectMember`, `ProjectModule`, `TaskEntity`, `TaskTag`, `TaskComment`, `Attachment`, `Activity`, `PageModule`, `RolePagePermission`, `UserPagePermission`, `ProjectAssignmentHistory`, `TaskAssignmentHistory`, `ChecklistItem`, `TaskBlockEntry`, `TaskStatusHistory`, `ChatMessage`, `ChatAttachment`, `ChatRoom`, `ChatRoomMember`, `WorkDiary`, the task-template family — `TaskTemplate`, `TaskTemplateItem`, `TaskTemplateAssignee`, `TaskTemplateItemChecklist`/`Tag`/`Dependency`/`ReviewCriteria`, `TaskTemplateGeneration`, `TaskTemplateGeneratedTask` — plus `RefreshToken`, `EmailOtp`, `TaskReviewIssue`, and `TaskIssueEntry`) are all declared inside this single file alongside the fluent-API configuration. `Models/` only contains `ChatMessage.cs` and `ChatAttachment.cs` placeholders.
- **Mappings/MappingProfile.cs** — AutoMapper profile (registered via `AddAutoMapper(typeof(MappingProfile))`).
- **Migrations/** — EF Core migrations; see **Migrations** above for the current tail and the recent due-date removal.
- **Sentry** (`Program.cs`, top of file) — `builder.WebHost.UseSentry(...)` only activates when `Sentry:Dsn` is non-empty in config, so it's a safe no-op in local development where the DSN is blank.

### Frontend (ClientApp)
- **Stack:** React 19, TypeScript ~5.8, Vite 6, TailwindCSS 4 (via `@tailwindcss/vite`), `react-router-dom` v7, `@microsoft/signalr` v10, `react-select`, `sonner` toasts, `motion` animations, `date-fns`, `lucide-react` icons.
- **Entry:** `src/main.tsx` → `src/App.tsx`. `App.tsx` nests providers (`ThemeProvider` → `SweetAlertProvider` → `AuthProvider` → `DataProvider` → `QuickViewProvider` → `BrowserRouter` → `ChatProvider`) and lazy-loads every page inside `<Suspense>` with a global `ErrorBoundary` and `ProtectedRoute` guard.
- **State:** Contexts in `src/context/` (`AuthContext`, `DataContext` — single source of truth for projects/users/roles/tasks, `ChatContext` — SignalR connection, `QuickViewContext`, `SweetAlertContext`, `ThemeContext`). Cross-cutting concerns live in `src/hooks/` (debounce, throttle, permissions, local/session storage, push notifications, window size, availability).
- **API access:** `src/lib/api.ts` exposes `apiRequest<T>()` which auto-attaches the JWT from `localStorage.pms_token`, unwraps the `ApiResponse<T>` envelope, broadcasts request counts to `loadingBus`, and toasts 403s via `lib/toast.ts`. The base URL is `import.meta.env.VITE_API_URL || '/api'` (`src/config/dataSource.ts`).
- **Domain types:** `src/types/index.ts` — canonical TypeScript types for the whole frontend. Defines `Status` (`'new' | 'in-progress' | 'paused' | 'blocked' | 'under-review' | 'issues' | 'completed'`), `Priority`, `ProjectStatus`, `ReasonTag`, and all entity interfaces (`User`, `Project`, `Task`, etc.). Import domain types from here, not from individual service files.
- **Domain services:** `src/services/` mirrors backend controllers (one file per resource, e.g. `task.service.ts`, `project.service.ts`, `report.service.ts`, `diary.service.ts`).
- **Path alias:** `@/*` resolves to the `ClientApp/` root (configured in `tsconfig.json` and `vite.config.ts`). Use `@/components/...`, `@/lib/...`, etc. instead of relative imports across directories.
- **Routes** (defined in `App.tsx`): `/auth`, `/`, `/projects`, `/projects/:id`, `/tasks`, `/users`, `/users/:id`, `/roles`, `/settings`, `/chat`, `/reports`, `/diary`, `/templates`, `/templates/new`, `/templates/:id`, `/templates/:id/edit`. All non-auth routes are wrapped in `DashboardLayout` inside `ProtectedRoute`.
- **Playwright e2e:** `ClientApp/e2e/` + `playwright.config.ts` — run from `ClientApp/`. Note per `AUDIT_REPORT.md`: some existing e2e specs use a destructive pattern (worth checking before assuming a spec is side-effect-free against the shared dev DB).

### Permission model
Page-level CRUD is encoded as a 4-bit bitmap: **View(1) + Create(2) + Update(4) + Delete(8)**, stored per role in `RolePagePermissions` and overridable per user in `UserPagePermissions`. Seeded as `15` for `SystemAdmin`. Controllers call `IAuthorizationService.CanView("/route")` etc. before executing.

### Task status machine
Statuses: `new`, `in-progress`, `paused`, `blocked`, `under-review`, `issues`, `completed`. The transition graph itself is **data, not code** — `appsettings.json`'s `TaskStatusTransitions` section (parsed by `Services/TaskStatusTransitionProvider.cs`, a singleton) is the single source of truth for which (from, to) edges exist and whether each requires `ActualHours`. Currently configured: `new→in-progress` (no hours); `in-progress→{paused, blocked, under-review, issues, completed}` (hours required on all five); `paused→in-progress` and `blocked→in-progress` (no hours); `under-review→{completed, issues, in-progress}` (no hours on any); `issues→in-progress` (no hours). `completed` is terminal — there is no `completed→in-progress` edge (reopen was removed, not just permission-gated).
On top of the graph, `TaskService.ValidateStatusTransition` (`Services/TaskService.cs`) enforces: 100% checklist progress before `under-review` or `completed`; assignee-or-manager for `paused`/`blocked`/`in-progress`; assignee-or-manager (assignee only, for submit) for `under-review`; QA-reviewer-or-manager for `completed` (when `RequiresQA`) and for `issues`; manager-only for sending a task back from `under-review` to `in-progress`. "Manager" = SystemAdmin/IsAdmin role, task creator, or the owning project's owner/creator. Changing the graph itself only requires editing `appsettings.json`, not redeploying code.

### Task templates & scheduling
A `TaskTemplate` is a reusable set of `TaskTemplateItem`s (title, estimate, priority, assignee, QA reviewer, checklist, tags, review criteria, inter-item dependencies) plus a recurrence config (`daily`/`weekly`/`monthly`/`custom` + `DayOfWeek`/`DayOfMonth`(s)/`CustomIntervalDays`/skip-rules, optional `TriggerTime`, `StartDate`/`EndDate`). Note: per-item due-date offsets were removed (`RemoveDueDateColumns` migration dropped `DueDateOffsetDays` from `TaskTemplateItems` and `DueDate` from `Tasks`). "Generating" a template creates real `TaskEntity` rows — one per item — wiring checklists, tags, review issues, and `TaskBlockEntry` dependency links, then notifies assignees. Each generation is recorded as a `TaskTemplateGeneration` keyed by a **`PeriodKey`** (e.g. `"{id}::2026-07-07"`, ISO-week for weekly, `yyyy-MM` for monthly) which is the idempotency guard — a period is generated at most once. `TaskTemplateSchedulerService` runs hourly: for each active in-window template whose recurrence matches today and whose `TriggerTime` has passed, it generates if the `PeriodKey` doesn't already exist. `ComputeNextRunAt` (in `TaskTemplateService`) mirrors these exact rules to surface the next scheduled run. All template endpoints are gated by `IAuthorizationService.IsAdminAsync()`, **not** the page-permission bitmap.

### Auth flows
`AuthController` is `[AllowAnonymous]` and coordinates three flows beyond plain login: (1) **registration** and (2) **password reset** both go through `OtpService` — an email OTP is issued (delivered via `EmailService`), then `ConfirmRegister`/reset validate-and-consume it via `ValidateAndConsumeAsync(email, code, purpose)`; (3) **refresh tokens** are issued alongside the JWT and stored in an httpOnly `pms_rt` cookie (falls back to the request body), rotated on `Refresh`. Expired OTP rows are purged by the `OtpCleanupService` hosted service. `User.IsDeleted` is a soft-delete flag — filter it out where listing users. All 7 auth DTOs are now covered by FluentValidation (`Validators/AuthValidators.cs`) — previously the single biggest validation gap in the app, since this is the one unauthenticated controller.

### Login
`AuthService.LoginAsync` (`Services/AuthService.cs:37-62`) only resolves two identifier shapes: an **email** (`identifier.Contains('@')`, matched case-insensitively against the DB) or a **mobile number** (≥7 digits after stripping non-digit characters, matched against the pre-normalized `ContactNoNormalized` column for an indexed lookup). **There is no username-login path** — an identifier that is neither an email nor ≥7 digits falls straight through to `user == null`, and login always returns "Invalid email/mobile or password.", regardless of case. This is a real, currently-open bug (not a stylistic choice) — `AUDIT_REPORT.md` lists "Implement username login in `AuthService.LoginAsync`" as a Priority-1 / production-launch blocker (B3/R5), and separately flags this exact CLAUDE.md section as having previously drifted from the code. Don't assume username login works when reasoning about auth.

### Permission model (detail)
`AuthorizationService` is `AddScoped` and caches the loaded `User` entity in `_cachedUser` to avoid repeated DB lookups within one request. Priority order: SystemAdmin (`RoleId=1`) → `IsAdmin=true` role → `UserPagePermission` (user override) → `RolePagePermission` (role default). Dashboard (`/`) always returns `CanView=true`.

## Conventions & Cross-Cutting Patterns
- `RootNamespace`/`AssemblyName` are `TaskManagement` (not `PMS_...`). The folder name `PMS_Final_Backup` is just the project directory.
- Async work should be `Task`-returning and `await`ed; avoid `.Result`/`.Wait()`.
- All API responses are wrapped in `ApiResponse<T>` (see `DTOs/GeneralDtos.cs`) — never return raw entities from controllers. `ValidationFilter` is the single place all validation failures (DataAnnotations + FluentValidation) get reshaped into this envelope; don't hand-roll a different 400 shape in a controller.
- Use `AppClock.Now` instead of `DateTime.UtcNow` for testability.
- Frontend fetches go through `apiRequest()` in `lib/api.ts` so loading state, auth headers, and 401/403 handling stay consistent.
- Working-hours / effort calculations live in `Services/EffortHelpers.cs` (the "10–19 IST working-hours filter" referenced in `E2E_Prompt.md`).
- Hardcoded JWT key in `appsettings.json` is a development default; `Program.cs` falls back to it when `JwtSettings:Key` is missing.
- Explicit `_context.Database.BeginTransactionAsync()` calls (14 across `Services/`, e.g. `TaskService.StartTaskAsync`/`MarkAllChecklistCompleteAsync`) are **not** wrapped in an EF execution strategy — `AddDbContext` doesn't enable `EnableRetryOnFailure`, deliberately, because doing so would require rewrapping every one of those call sites in `Database.CreateExecutionStrategy().ExecuteAsync(...)` first (a real refactor, left alone for now). Don't add `EnableRetryOnFailure` without also doing that rewrap, or user-initiated transactions will start throwing.

## Fixed Constraints
These are intentional or known-accepted; do not change them:
- `F-02`: DB credentials in `appsettings.json` — do not rotate/change.
- `F-03`: Swagger unconditionally enabled in production — intentional for this deployment.
- `F-06`: Hardcoded JWT key in `appsettings.json` — development default; do not change.

Note: the Gmail SMTP credentials also in `appsettings.json`'s `Email` section are a *separate, not-yet-accepted* finding per `AUDIT_REPORT.md` (unlike F-02/F-03/F-06) — don't assume it's covered by the same "leave it alone" exception.

## Related Documentation
- `reverse_engineering/` — 13-phase reverse engineering output. Start with `Phase13_Final_Documentation.md` for onboarding, `Phase8_Business_Rules.md` for all domain rules, `Phase12_Code_Quality_Review.md` for known issues.
- `AUDIT_REPORT.md` — periodic full-stack security/quality audit with a Go/No-Go gate, risk register, and change-tracking against the previous audit. The authoritative source for what's an accepted risk (F-02/F-03/F-06) vs. an open finding.
- `VALIDATION_PARITY_REPORT.md` — the frontend/backend validation audit that produced the current `Validators/`/`ValidationFilter` layer; documents every gap closed and why (e.g. no KYC-style fields exist in this domain, so none were built).
- `code_review_findings.md` — prior code-quality review findings.
- `TASK_STATUS_REDESIGN_PLAN.md` — a **proposed, not-yet-implemented** plan to replace the task status dropdown with visual action cards + a workflow timeline on the frontend. None of the components it describes (`StatusActionCard`, `WorkflowTimeline`, `SmartTimeInput`, `BlockReasonForm`, `src/lib/statusActions.ts`) exist in `ClientApp/src` yet — treat it as a design doc, not current architecture.
- `DESIGN_SYSTEM_AND_THEME.md` — frontend design tokens / theming conventions.
- `PMS — Codebase Map.md` — exhaustive file-by-file index.
- `USE_CASES.md` — end-to-end user flows.
- `PROJECT_TASKS.md` — task tracker / delivery status.
- `E2E_Prompt.md` — full-stack verification scenarios with 7 seeded roles, 6 users, 1 project, 52 tasks across 5 epics — useful as both a manual test script and a reference for the expected domain shape (status workflow cheat-sheet, permission matrix, sprint schedule).
- `SampleData.json` — copy-to-output seed payload used during initialization.
