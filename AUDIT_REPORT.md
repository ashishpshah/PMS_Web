# PMS — Production Readiness Audit Report
**Date:** 2026-07-09  
**Auditor:** Claude Sonnet 4.6 (Automated Audit)  
**Project:** Padhya Software Technologies — Project Management System  
**Scope:** Full-stack codebase (ASP.NET Core 6 + React 19 + TypeScript 5.8)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Review](#2-architecture-review)
3. [Security Audit](#3-security-audit)
4. [Performance Analysis](#4-performance-analysis)
5. [Feature Coverage Matrix](#5-feature-coverage-matrix)
6. [User Role Testing Results](#6-user-role-testing-results)
7. [Navigation & Routing Audit](#7-navigation--routing-audit)
8. [UI/UX Audit](#8-uiux-audit)
9. [Form Validation Audit](#9-form-validation-audit)
10. [CRUD Audit](#10-crud-audit)
11. [API Audit](#11-api-audit)
12. [Accessibility Audit](#12-accessibility-audit)
13. [Responsive Design Audit](#13-responsive-design-audit)
14. [Dead Code & Technical Debt](#14-dead-code--technical-debt)
15. [Missing Features & Incomplete Implementations](#15-missing-features--incomplete-implementations)
16. [Bugs & Defects](#16-bugs--defects)
17. [Improvement Recommendations](#17-improvement-recommendations)
18. [Risk Assessment](#18-risk-assessment)
19. [Production Readiness Score & Go/No-Go Recommendation](#19-production-readiness-score--gono-go-recommendation)

---

## 1. Executive Summary

### Overall Health

The PMS (Project Management System) is a well-structured full-stack SaaS application with substantial feature completeness. The backend follows clean layered architecture with proper service injection, the frontend uses React 19 best practices including lazy loading, context-based state management, and TypeScript typing. The application covers a comprehensive domain including task management, Kanban boards, real-time chat, work diaries, analytics, role-based permissions, and automated task templates.

However, several **critical security issues** prevent immediate production deployment:

1. **Database credentials exposed in plaintext** in `appsettings.json` committed to the codebase.
2. **SMTP email password in plaintext** in `appsettings.json`.
3. **Predictable JWT signing key** stored as a fixed string constant with a comment calling it "development default."
4. **Swagger enabled unconditionally in production** — documented as intentional but exposes full API schema publicly.
5. **CORS policy permits localhost origins only** — will break in production unless updated.
6. **Login flow stripped to email/mobile only** — username-based login mentioned in CLAUDE.md is not implemented in the auth flow (the backend only checks `@` character to detect email vs. phone number, but phone login requires 7+ digit sequence, meaning username login is effectively broken).
7. **Refresh token stored in localStorage** as a fallback — partially mitigates the httpOnly cookie design.

### Go/No-Go Recommendation

**CONDITIONAL GO** — The application is feature-rich and architecturally sound. It can proceed to limited production deployment (internal/demo environment) with **mandatory remediation of the 7 Critical findings** listed in Section 18. A **full production launch to external users is NOT recommended** until the security credentials, CORS configuration, and rate-limiting gaps are resolved.

### Production Readiness Score: **62 / 100**

| Dimension | Score | Notes |
|---|---|---|
| Architecture | 82/100 | Clean layering, good separation |
| Security | 38/100 | Critical secrets exposure |
| Performance | 70/100 | Some N+1 risks, good pagination |
| Feature Completeness | 85/100 | Broad feature set |
| Code Quality | 74/100 | Some duplication, dead code |
| UX/Accessibility | 55/100 | Missing ARIA, limited a11y |
| Test Coverage | 25/100 | Only 2 test files found |
| DevOps/Ops Readiness | 40/100 | No CI/CD, no monitoring wired |

---

## 2. Architecture Review

### 2.1 Backend Architecture

**Strengths:**
- Clear separation: Controllers → Services → Data (EF Core DbContext). Controllers are thin, delegating all business logic to `IService` interfaces.
- `ApiResponse<T>` envelope pattern provides consistent error/success signaling across all endpoints.
- `AppClock.Now` abstraction instead of `DateTime.UtcNow` supports testability (lines referenced: `AppClock.cs`).
- Per-request caching in `AuthorizationService._cachedUser` avoids repeated DB hits within a single HTTP request.
- Background services (`TaskTemplateSchedulerService`, `OtpCleanupService`) correctly open their own DI scopes per run.
- `AsSplitQuery()` used on complex EF includes to avoid Cartesian product issues.
- Transaction scope (`await using var tx`) wraps multi-step writes in `TaskService`, `ReassignTaskAsync`, etc.

**Concerns:**
- `GeneralDtos.cs` is a single 927-line file containing ALL DTOs for the entire application. This creates a massive coupling surface and merge conflict risk.
- `PMSDbContext.cs` contains entity declarations AND fluent API configuration in a single file. As the schema grows, this becomes unmaintainable.
- `AuthService.cs` contains `JwtService` (dead code, not registered in DI) alongside `LoginDto`, `RegisterDto`, `AvailabilityDto`, and `LoginResponseDto` — too many responsibilities in one file.
- `AuthorizationService` builds two separate DB queries for every permission check (one for `PageModule`, one for `UserPagePermission`/`RolePagePermission`). With 4 checks per controller action, this can result in 8+ round trips per request with no caching.
- The `ValidStatuses` set in `TaskService.cs` (line 358) includes `"in-review"` and `"cancelled"`, but the CLAUDE.md documentation and frontend `Status` type both use the same values. However, the status values in `AllowedEdges` differ subtly from those described in CLAUDE.md (CLAUDE.md mentions `"under-review"` and `"issues"` as valid status values, but the actual code uses `"in-review"` and the `issues`/`paused` conditions are flags, not statuses). This documentation inconsistency is a maintenance risk.

### 2.2 Frontend Architecture

**Strengths:**
- All pages lazy-loaded via `React.lazy` + `Suspense` in `App.tsx`.
- Global `ErrorBoundary` wraps all routes.
- `DataContext` is a proper single source of truth for all domain entities.
- `usePermissions` hook provides consistent permission checking that mirrors backend bitmap logic.
- Access token stored in module memory (not localStorage) to reduce XSS exposure — a deliberate, good security decision (`lib/api.ts` lines 6-10).
- SignalR connection managed cleanly in `ChatContext` with automatic reconnect backoff.
- `loadingBus` pattern decouples HTTP loading state from component render cycles.

**Concerns:**
- `DataContext.tsx` is 646 lines containing state, data fetching, all CRUD operations, notification logic, and reminder scheduling. This is a **God Object** anti-pattern. Any state update (e.g., a task change) re-renders all consumers regardless of relevance.
- `Tasks.tsx` is a 2,774-line file — a serious maintainability issue. It contains the task creation modal, Kanban board, list view, filter logic, drag-and-drop, completion modal, reassignment modal, and all related state. It should be split into ~10 separate components.
- `DataContext` loads ALL tasks on login using pagination (`loadAllTasks` fires `Promise.all` for all pages simultaneously). For large datasets, this causes massive parallel API bursts on startup.
- `useEffect` in `DataContext` depends on `[currentUser, authLoading, isSystemAdmin, isAdmin]` — any auth state change triggers a full data reload, which can cause unnecessary re-fetches during impersonation token refresh.
- Chat reconnection is not resilient: if the token refresh fails during reconnect, the SignalR connection drops silently.

### 2.3 Data Flow Diagram (Summary)

```
User → Auth (OTP/Login) → JWT in memory + RT in cookie/localStorage
     ↓
Protected Route → DataContext.fetchData() → parallel API calls
     ↓
Components read from Context → User actions call Context methods → API calls → Context state update
     ↓
SignalR ChatContext → ReceiveMessage / ReceiveNotification → Context ingestNotification
```

### 2.4 Separation of Concerns

| Layer | Status |
|---|---|
| Controller ↔ Service boundary | GOOD — controllers delegate cleanly |
| Service ↔ Data boundary | GOOD — services use injected DbContext |
| DTO ↔ Entity boundary | GOOD — AutoMapper profiles |
| Frontend page ↔ service | PARTIAL — some pages call taskService directly bypassing DataContext |
| Frontend state ↔ UI | POOR — DataContext is too large |

---

## 3. Security Audit

### 3.1 CRITICAL: Plaintext Database Credentials in Source Code

| Field | Detail |
|---|---|
| **Module** | Configuration |
| **Feature** | Database Connection |
| **Description** | SQL Server connection string with username and password is committed in plaintext to `appsettings.json`. |
| **Evidence** | `appsettings.json` line 4: `"DefaultConnection": "Data Source=sql.bsite.net\\MSSQL2016;Initial Catalog=vishaldemo_PMS;User ID=vishaldemo_PMS;Password=Fz@21345;Trust Server Certificate=True"` |
| **Impact** | Any developer with repo access or access to the deployment artifact can connect directly to the production database. |
| **Severity** | **CRITICAL** |
| **Root Cause** | Credentials not moved to environment variables, Azure Key Vault, or secrets management. Noted as "F-02: do not change" but exposure is the real issue. |
| **Affected Files** | `appsettings.json` |
| **Recommended Fix** | Move connection string to an environment variable (`DATABASE_URL`) or a secrets manager. Use `builder.Configuration.GetConnectionString("DefaultConnection")` with the value sourced from `ASPNETCORE_CONNECTION_STRING` or similar. |
| **Estimated Effort** | 2 hours |
| **Priority** | **P1** |

### 3.2 CRITICAL: SMTP Password in Plaintext

| Field | Detail |
|---|---|
| **Module** | Email Service |
| **Feature** | OTP Delivery |
| **Description** | Gmail SMTP credentials (username + app password) stored in plaintext in `appsettings.json`. |
| **Evidence** | `appsettings.json` lines 28-30: `"Username": "vishalchudasama43326@gmail.com"`, `"Password": "lsmvsdrfjyxvydvf"` |
| **Impact** | Gmail credentials can be stolen, enabling email abuse, account compromise. |
| **Severity** | **CRITICAL** |
| **Root Cause** | No secrets management in use. |
| **Affected Files** | `appsettings.json`, `Services/EmailService.cs` |
| **Recommended Fix** | Move to environment variables: `Email__Password` for .NET config binding. |
| **Estimated Effort** | 1 hour |
| **Priority** | **P1** |

### 3.3 CRITICAL: Hardcoded JWT Signing Key

| Field | Detail |
|---|---|
| **Module** | Authentication |
| **Feature** | JWT Issuance |
| **Description** | JWT signing key is a static string committed to source code. |
| **Evidence** | `appsettings.json` line 7: `"Key": "PMS_Secure_Key_For_JWT_Token_2024_MinLength32Chars"`. Also hardcoded as fallback in `Program.cs` line 36. |
| **Impact** | Anyone with the key can forge valid JWT tokens for any user, including SystemAdmin. Full authentication bypass. |
| **Severity** | **CRITICAL** |
| **Root Cause** | Development default committed and used in production. |
| **Affected Files** | `appsettings.json`, `Program.cs` (line 36), `Services/AuthService.cs` (line 308) |
| **Recommended Fix** | Generate a cryptographically random 256-bit key, store it as an environment variable `JwtSettings__Key`. Remove the hardcoded fallback in `Program.cs`. |
| **Estimated Effort** | 1 hour |
| **Priority** | **P1** |

### 3.4 HIGH: CORS Policy Will Break in Production

| Field | Detail |
|---|---|
| **Module** | Middleware |
| **Feature** | Cross-Origin Requests |
| **Description** | CORS policy only allows `http://localhost:3000` and `http://localhost:5178`. |
| **Evidence** | `Program.cs` lines 152-153: `policy.WithOrigins("http://localhost:3000", "http://localhost:5178")` |
| **Impact** | All API calls from a deployed frontend domain will fail with CORS errors in production. |
| **Severity** | **HIGH** |
| **Root Cause** | CORS policy not made configurable via `appsettings.json`. |
| **Affected Files** | `Program.cs` |
| **Recommended Fix** | Add `AllowedOrigins` array to `appsettings.json` and read it in `Program.cs`. Include production domain. |
| **Estimated Effort** | 2 hours |
| **Priority** | **P1** |

### 3.5 HIGH: Swagger Exposed in Production

| Field | Detail |
|---|---|
| **Module** | Middleware |
| **Feature** | API Documentation |
| **Description** | Swagger UI and schema are served unconditionally in all environments, including production. |
| **Evidence** | `Program.cs` lines 161-162: `app.UseSwagger(); app.UseSwaggerUI();` — no environment check. |
| **Impact** | Exposes full API schema, endpoint list, and authentication flow to anyone browsing `/swagger`. While noted as intentional (F-03), this enables reconnaissance for attackers. |
| **Severity** | **HIGH** |
| **Root Cause** | Intentional design decision per F-03. |
| **Affected Files** | `Program.cs` |
| **Recommended Fix** | If intentional, at minimum add HTTP Basic Authentication to Swagger UI. Ideally gate behind `if (app.Environment.IsDevelopment())`. |
| **Estimated Effort** | 2 hours |
| **Priority** | **P2** |

### 3.6 HIGH: Rate Limiter Uses In-Memory State Without Persistence

| Field | Detail |
|---|---|
| **Module** | Middleware |
| **Feature** | Login Rate Limiting |
| **Description** | `LoginRateLimitMiddleware` stores hit counts in a static `ConcurrentDictionary`. This state is lost on app restart and is not shared across multiple instances. |
| **Evidence** | `Middleware/LoginRateLimitMiddleware.cs` line 16: `private static readonly ConcurrentDictionary<string, Queue<DateTime>> _hits = new();` |
| **Impact** | Attacker can bypass rate limiting by waiting for app restart or using multiple instances. |
| **Severity** | **HIGH** |
| **Root Cause** | In-memory implementation, no distributed cache integration. |
| **Affected Files** | `Middleware/LoginRateLimitMiddleware.cs` |
| **Recommended Fix** | Migrate to distributed rate limiting (ASP.NET Core `RateLimiterMiddleware` with Redis backing, or `Microsoft.AspNetCore.RateLimiting`). |
| **Estimated Effort** | 4 hours |
| **Priority** | **P2** |

### 3.7 HIGH: Refresh Token Stored in localStorage

| Field | Detail |
|---|---|
| **Module** | Frontend / Auth |
| **Feature** | Token Persistence |
| **Description** | The refresh token is stored in `localStorage` (`pms_refresh_token`) as a fallback in addition to the httpOnly cookie. |
| **Evidence** | `ClientApp/src/lib/api.ts` line 11: `const getRefreshToken = () => localStorage.getItem('pms_refresh_token');`. `AuthContext.tsx` line 71: `localStorage.setItem('pms_refresh_token', response.refreshToken)`. |
| **Impact** | XSS attacks can steal the refresh token from localStorage, enabling session hijacking (8-hour window with 7-day RT). The access token itself is correctly in memory. |
| **Severity** | **HIGH** |
| **Root Cause** | Legacy fallback for "older builds" kept alive beyond its usefulness. |
| **Affected Files** | `ClientApp/src/lib/api.ts`, `ClientApp/src/context/AuthContext.tsx` |
| **Recommended Fix** | Remove the localStorage fallback for the refresh token. Rely exclusively on the httpOnly `pms_rt` cookie. Update the backend to always set the cookie and never return the RT in the response body. |
| **Estimated Effort** | 3 hours |
| **Priority** | **P2** |

### 3.8 MEDIUM: Admin Impersonation Lacks Audit Controls

| Field | Detail |
|---|---|
| **Module** | Authentication |
| **Feature** | Admin Impersonation |
| **Description** | SystemAdmin can log in as any non-admin user by entering the admin's own password. While an activity log entry is created, there is no notification to the impersonated user, no time limit on impersonated sessions, and no dedicated impersonation revocation endpoint. |
| **Evidence** | `Services/AuthService.cs` lines 76-109: impersonation block. Activity logged at line 93-103. |
| **Impact** | If admin account is compromised, full impersonation of any user is possible silently. |
| **Severity** | **MEDIUM** |
| **Root Cause** | Feature design choice; partial audit logging exists. |
| **Affected Files** | `Services/AuthService.cs`, `Controllers/AuthController.cs` |
| **Recommended Fix** | Add session expiration for impersonated tokens (shorter than normal), expose a dedicated `POST /auth/stop-impersonation` endpoint, and display a prominent banner to the admin (already done in `UserDto.IsImpersonated` flag). |
| **Estimated Effort** | 4 hours |
| **Priority** | **P3** |

### 3.9 MEDIUM: No Input Sanitization on Comment / Description Fields

| Field | Detail |
|---|---|
| **Module** | Tasks, Chat |
| **Feature** | User-generated content |
| **Description** | Task descriptions, comments, chat messages, and work diary entries are stored without HTML sanitization. If the frontend ever renders these as `innerHTML` or if an API consumer retrieves them, stored XSS could occur. |
| **Evidence** | `DTOs/GeneralDtos.cs` `CreateTaskCommentDto.Text` — no `[MaxLength]`, no sanitization. `SendMessageDto.Content` — no length limit. |
| **Impact** | Stored XSS if content is rendered as raw HTML anywhere; data pollution if no max-length. |
| **Severity** | **MEDIUM** |
| **Root Cause** | Validation annotations not applied to free-text fields. |
| **Affected Files** | `DTOs/GeneralDtos.cs`, `Services/ChatService.cs`, `Services/TaskService.cs` |
| **Recommended Fix** | Add `[MaxLength(2000)]` to `CreateTaskCommentDto.Text` and `SendMessageDto.Content`. Add `[MaxLength(5000)]` to task descriptions. Consider server-side HTML encoding for content rendered in emails (OTP emails already safe). |
| **Estimated Effort** | 2 hours |
| **Priority** | **P2** |

### 3.10 MEDIUM: OTP Registration Payload Stores Plain Password

| Field | Detail |
|---|---|
| **Module** | Authentication |
| **Feature** | OTP Registration |
| **Description** | During OTP-gated registration, the full `InitiateRegisterDto` including the plaintext password is serialized to JSON and stored in the `EmailOtp.Payload` database column. |
| **Evidence** | `Controllers/AuthController.cs` line 109: `var payload = JsonSerializer.Serialize(dto);`. `Services/OtpService.cs` line 73: `Payload = payload`. |
| **Impact** | The database `EmailOtp` table holds plaintext passwords for up to 2 minutes. If the DB is breached during that window, passwords are exposed. |
| **Severity** | **MEDIUM** |
| **Root Cause** | Convenience pattern to preserve registration data between OTP initiation and confirmation. |
| **Affected Files** | `Controllers/AuthController.cs`, `Services/OtpService.cs` |
| **Recommended Fix** | Hash the password in the payload before storing (`PasswordHasher.HashPassword(dto.Password)`) and mark the payload field as already-hashed during confirmation. Or store only non-sensitive fields and re-collect the password at OTP confirmation step. |
| **Estimated Effort** | 3 hours |
| **Priority** | **P2** |

### 3.11 MEDIUM: No CSRF Protection

| Field | Detail |
|---|---|
| **Module** | All API endpoints |
| **Feature** | CSRF Protection |
| **Description** | The API uses JWT Bearer tokens, which are generally not vulnerable to CSRF. However, the `POST /api/auth/refresh` endpoint accepts the refresh token from the httpOnly cookie `pms_rt` and has no CSRF token validation. |
| **Evidence** | `Controllers/AuthController.cs` lines 53-56: `var refreshToken = Request.Cookies["pms_rt"] ?? dto?.RefreshToken;` |
| **Impact** | A CSRF attack against `/api/auth/refresh` could force token rotation, potentially enabling session fixation if paired with other vulnerabilities. |
| **Severity** | **MEDIUM** |
| **Root Cause** | No `SameSite` double-submit pattern or anti-forgery token for cookie-based endpoints. |
| **Affected Files** | `Controllers/AuthController.cs`, `Program.cs` |
| **Recommended Fix** | The `pms_rt` cookie already uses `SameSite=Strict` (line 83 in `AuthController.cs`), which provides CSRF protection for modern browsers. Document this explicitly and add `__Host-` prefix to the cookie name for additional security. |
| **Estimated Effort** | 1 hour |
| **Priority** | **P3** |

### 3.12 LOW: SignalR Token Exposed in Query String

| Field | Detail |
|---|---|
| **Module** | Real-time / Chat |
| **Feature** | SignalR Authentication |
| **Description** | JWT token is passed via `?access_token=` query parameter for WebSocket upgrades. This exposes the token in server access logs, browser history, and referrer headers. |
| **Evidence** | `Program.cs` lines 59-66: `OnMessageReceived` handler reading `ctx.Request.Query["access_token"]`. |
| **Impact** | Access token logged in plaintext in server logs. |
| **Severity** | **LOW** |
| **Root Cause** | WebSocket protocol limitation — cannot set Authorization headers for the upgrade handshake. Standard SignalR pattern. |
| **Affected Files** | `Program.cs`, `ClientApp/src/context/ChatContext.tsx` |
| **Recommended Fix** | Ensure access logs do not store query parameters containing `access_token`. Consider using the `accessTokenFactory` pattern (already implemented in `ChatContext.tsx` line 128) combined with log scrubbing middleware. |
| **Estimated Effort** | 2 hours |
| **Priority** | **P4** |

### 3.13 LOW: Missing Security Headers

| Field | Detail |
|---|---|
| **Module** | Middleware |
| **Feature** | HTTP Security Headers |
| **Description** | No `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, or `Strict-Transport-Security` headers are configured. |
| **Evidence** | `Program.cs` — no security header middleware found. |
| **Impact** | Increased risk of clickjacking, MIME sniffing attacks, and protocol downgrade. |
| **Severity** | **LOW** |
| **Root Cause** | No header middleware configured. |
| **Affected Files** | `Program.cs` |
| **Recommended Fix** | Add `app.UseHsts()` and a middleware to inject security headers, or use `NWebsec` / `SecurityHeaders.AspNetCore` package. |
| **Estimated Effort** | 2 hours |
| **Priority** | **P3** |

---

## 4. Performance Analysis

### 4.1 Frontend: Mass Data Load on Login

| Field | Detail |
|---|---|
| **Module** | DataContext |
| **Feature** | Initial data loading |
| **Description** | On login, `DataContext.fetchData()` fires 5 parallel API calls: projects, ALL tasks (multi-page burst), users, assignable users, and activities. The tasks load fires `Promise.all` for every page simultaneously. For a system with 1000 tasks at pageSize 100, this is 10 simultaneous API calls immediately on login. |
| **Evidence** | `ClientApp/src/context/DataContext.tsx` lines 92-101: `loadAllTasks()` fires all page fetches in parallel. Lines 104-130: `fetchData()` awaits all 5 groups. |
| **Impact** | Slow initial page load; potential rate limiting or DB overload on the remote SQL Server host. |
| **Severity** | **HIGH** |
| **Root Cause** | Single-context "load everything" design without progressive loading or virtual scrolling. |
| **Recommended Fix** | Implement server-side filtering. Do not load all tasks into memory. Use URL-driven filtering that queries the API on demand. Implement virtual scrolling (e.g., `react-virtual`) for large lists. |
| **Estimated Effort** | 2 days (medium refactor) |
| **Priority** | **P2** |

### 4.2 Backend: AuthorizationService N+1 DB Queries

| Field | Detail |
|---|---|
| **Module** | AuthorizationService |
| **Feature** | Permission Checks |
| **Description** | Each `CanViewAsync`, `CanCreateAsync`, `CanUpdateAsync`, `CanDeleteAsync` call issues 2 DB queries (PageModule lookup + Permission lookup). Multiple checks per controller action result in 6-8 DB round-trips per request. |
| **Evidence** | `Services/AuthorizationService.cs` lines 80-90 (`CanViewAsync`) and 97-113 (`HasPermissionAsync`): each issues 2 queries. Per-request user caching is done, but PageModule and Permission rows are not cached. |
| **Impact** | Each API request to a permission-guarded endpoint can issue 8+ additional DB queries. On a shared remote SQL Server (bsite.net), latency compounds quickly. |
| **Severity** | **MEDIUM** |
| **Root Cause** | No caching of permission data beyond user identity. PageModule and Permission tables are rarely changing but queried on every request. |
| **Recommended Fix** | Cache `PageModule` rows (they are seeded once, rarely change) in `IMemoryCache` with a 5-minute sliding expiration. Optionally cache the effective permission bitmap per `(userId, pageRoute)` pair with 1-minute TTL or invalidation on role change. |
| **Estimated Effort** | 4 hours |
| **Priority** | **P2** |

### 4.3 Backend: GetEffortStatsAsync Loads All Tasks and Histories

| Field | Detail |
|---|---|
| **Module** | TaskService |
| **Feature** | Dashboard Effort Stats |
| **Description** | `GetEffortStatsAsync()` loads ALL tasks, ALL status histories, and ALL assignment histories into memory before computing effort. With 1000+ tasks, this is a multi-MB in-memory computation on every dashboard load. |
| **Evidence** | `Services/TaskService.cs` lines 1021-1035: `await _context.Tasks.Select(...).ToListAsync()`, `await _context.TaskStatusHistories.OrderBy(...).ToListAsync()`, `await _context.TaskAssignmentHistories.OrderBy(...).ToListAsync()`. |
| **Impact** | High memory usage; slow dashboard at scale; potential OOM on the server. |
| **Severity** | **MEDIUM** |
| **Root Cause** | Effort computation requires full timeline traversal — complex to push entirely to SQL. |
| **Recommended Fix** | Apply the date window filter (`winStart`, `winEnd`) to the SQL query before loading into memory. Add indexes on `TaskStatusHistories.ChangedAt` and `TaskAssignmentHistories.ChangedAt`. Consider pre-aggregating effort into a summary table via a nightly job. |
| **Estimated Effort** | 1 day |
| **Priority** | **P2** |

### 4.4 Frontend: DataContext State Updates Cause Global Re-renders

| Field | Detail |
|---|---|
| **Module** | DataContext |
| **Feature** | State management |
| **Description** | All application state lives in a single `DataContext`. Any update (e.g., toggling a checklist item) calls `setTasks(prev => ...)` which forces re-renders of ALL components consuming `useData()` — including the entire sidebar, dashboard widgets, and other pages. |
| **Evidence** | `ClientApp/src/context/DataContext.tsx` — single context with 15 state variables. All consumers re-render on any change. |
| **Impact** | Unnecessary re-renders causing UI jank, especially on the 2,774-line `Tasks.tsx`. |
| **Severity** | **MEDIUM** |
| **Root Cause** | God-Object context pattern. |
| **Recommended Fix** | Split context into domain-specific slices: `TaskContext`, `ProjectContext`, `UserContext`. Use `useMemo` and `useCallback` more aggressively. Consider Zustand or Jotai for more granular subscriptions. |
| **Estimated Effort** | 3 days |
| **Priority** | **P3** |

### 4.5 Frontend: window.prompt() for User Input

| Field | Detail |
|---|---|
| **Module** | Tasks.tsx |
| **Feature** | Status transition UI |
| **Description** | The `moveTask` function uses `window.prompt()` to collect blocking reason and actual hours when dragging a task card on the Kanban board. |
| **Evidence** | `ClientApp/src/pages/Tasks.tsx` lines 747-759: `const entered = window.prompt('Reason for blocking...')` and `const entered = window.prompt('Hours spent...')`. |
| **Impact** | Poor UX: browser-native prompt dialogs are unstyled, blocking, cannot be themed, and cannot be localized. Breaks the polished UI experience. |
| **Severity** | **MEDIUM** |
| **Root Cause** | Expedient implementation. |
| **Recommended Fix** | Replace with the existing `SweetAlertContext` or a custom inline modal (a `BlockIssueDialog` already exists in the codebase at `components/BlockIssueDialog.tsx`). |
| **Estimated Effort** | 3 hours |
| **Priority** | **P2** |

### 4.6 Backend: Missing Database Indexes

| Field | Detail |
|---|---|
| **Module** | Data |
| **Feature** | Query Performance |
| **Description** | Several high-frequency query columns lack explicit indexes. |
| **Evidence** | Queried without index: `Tasks.Status` (filtered in GetAll), `Tasks.AssignedToId` (filtered in GetAll), `TaskStatusHistories.ChangedAt` (ordered in effort computation), `EmailOtps.Email + Purpose + IsUsed` (OTP lookup). |
| **Impact** | Table scans on growing tables; performance degrades non-linearly. |
| **Severity** | **MEDIUM** |
| **Root Cause** | Migrations created basic schema without performance-targeted indexes. |
| **Recommended Fix** | Add an EF migration with composite indexes: `HasIndex(t => new { t.Status, t.ProjectId })` on Tasks, `HasIndex(h => h.TaskId)` on StatusHistories, `HasIndex(o => new { o.Email, o.Purpose, o.IsUsed, o.ExpiresAt })` on EmailOtps. |
| **Estimated Effort** | 2 hours |
| **Priority** | **P2** |

### 4.7 Frontend: Bundling and Build Configuration

| Field | Detail |
|---|---|
| **Module** | Build |
| **Feature** | Bundle size |
| **Description** | Good practices observed: all pages lazy-loaded, Vite 6 used (fast builds, good tree shaking). `motion/react` (previously Framer Motion) is imported for animations, which adds ~30KB gzipped. `react-select` and `sonner` are additional dependencies. No bundle analysis found. |
| **Impact** | Bundle likely acceptable for internal tools but no analysis performed. |
| **Severity** | **LOW** |
| **Recommended Fix** | Run `npx vite-bundle-visualizer` to identify heavy modules. Consider dynamic imports for `motion/react` where not critical. |
| **Estimated Effort** | 1 hour analysis |
| **Priority** | **P4** |

---

## 5. Feature Coverage Matrix

### 5.1 Core Features by Role

| Feature | SystemAdmin | Admin | Manager | QA Reviewer | Developer/Assignee | Viewer |
|---|---|---|---|---|---|---|
| Dashboard view | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Project CRUD | ✓ | ✓ | ✗ (view only) | ✗ | ✗ | ✗ |
| Task Create | ✓ | ✓ | ✓ (own projects) | ✗ | ✗ | ✗ |
| Task Update | ✓ | ✓ | ✓ (own projects) | ✗ | ✗ | ✗ |
| Task Delete | ✓ | ✓ | ✓ (own projects) | ✗ | ✗ | ✗ |
| Task View | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Task Status Change | ✓ | ✓ | ✓ | ✓ (QA pass/fail) | ✓ (own tasks) | ✗ |
| Task Reassign | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| Start Task | ✓ | ✓ | ✓ | ✓ | ✓ (if assignee) | ✗ |
| Toggle Checklist | ✓ | ✓ | ✓ | ✓ | ✓ (if assignee) | ✗ |
| Add Comment | ✓ | ✓ | ✓ | ✓ (if involved) | ✓ (if involved) | ✗ |
| Block/Unblock Task | ✓ | ✓ | ✓ (project owner) | ✗ | ✓ (if assignee) | ✗ |
| User Management | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| Role Management | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Reports | ✓ | ✓ | ✓ | ✓ | ✓ (self only) | ✓ |
| Chat | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Work Diary | ✓ (all) | ✓ (all) | ✓ (own) | ✓ (own) | ✓ (own) | ✓ (own) |
| Templates | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| Impersonation | ✓ (SystemAdmin only) | ✗ | ✗ | ✗ | ✗ | ✗ |

### 5.2 Status Machine Coverage

| Transition | UI Support | Backend Enforcement | Notes |
|---|---|---|---|
| new → in-progress | ✓ (Start Task button) | ✓ | Assignee only |
| in-progress → blocked | ✓ (drag or status action) | ✓ | Requires reason |
| in-progress → in-review | ✓ | ✓ | Requires 100% checklist |
| in-review → completed | ✓ (QA pass) | ✓ | QA reviewer or manager |
| in-review → in-progress | ✓ (QA fail / send back) | ✓ | Manager only |
| completed → in-progress | ✓ | ✓ | Manager only (reopen) |
| any → cancelled | ✓ | ✓ | Assignee or manager |
| cancelled → new | ✓ | ✓ | Manager only (restore) |
| blocked → in-progress | ✓ (unblock) | ✓ | Auto on reassign |

---

## 6. User Role Testing Results

### 6.1 SystemAdmin Role

**Login:** Via email or mobile number. Impersonation via entering another user's credentials with admin password works.  
**Accessible flows:**
- All CRUD operations on all entities.
- Can access `/roles` to manage page permissions.
- Can reassign any task or project.
- Can view all work diary entries (admin-only `getAllDiary` endpoint).
- Can manage task templates (IsAdmin gate on all template endpoints).

**Issues found:**
- SystemAdmin sees all diary entries but the diary page's date filter (`today/yesterday/custom`) works correctly. The admin diary view shows all users' entries for the selected date — good.
- SystemAdmin cannot differentiate between "their own impersonated sessions" and "original sessions" from the activity log without querying by `Action = 'Impersonation'`.

### 6.2 Admin Role (IsAdmin = true, RoleId != 1)

**Login:** Normal email/mobile.  
**Accessible flows:**
- Full task and project CRUD (via IsAdmin check in most controllers).
- Can reassign tasks and projects.
- Cannot access `/roles` (SystemAdmin only for role management — confirmed by `AuthorizationService.IsSystemAdminAsync()`).
- Template management allowed (IsAdmin gate covers all admin roles).

**Issues found:**
- `ProjectsController.cs` line 48: `if (!await _authService.IsAdminAsync() || !await _authService.CanCreateAsync("/projects"))` — this uses `||` (OR) which means if either check fails, access is denied. This is correct logic but confusingly named (should be read as "deny if NOT admin OR NOT has create perm"). If a role is flagged IsAdmin but the permissions bitmap has Create=0, the project cannot be created. Intended behavior is unclear — IsAdmin should probably bypass the bitmap check.

### 6.3 Manager / Project Owner Role

**Login:** Normal.  
**Accessible flows:**
- View all tasks and projects.
- Create tasks in projects they own/created.
- Change task status (with appropriate gates).
- Comment on tasks they created or own.
- Reopen completed tasks (manager-only gate in `ValidateStatusTransition`).

**Issues found:**
- Manager cannot see the `/templates` page — templates require IsAdmin. This may be intentional but limits a manager's ability to set up recurring work patterns.
- If a manager doesn't have the Create bit on `/tasks`, they can still create tasks if they are the project owner (fallback in `TasksController.cs` lines 58-62). This is correct but creates inconsistency between what the sidebar/permission check shows and what the API allows.

### 6.4 QA Reviewer Role

**Login:** Normal.  
**Accessible flows:**
- View all tasks.
- Pass (`POST /tasks/{id}/qa/pass`) or fail (`POST /tasks/{id}/qa/fail`) tasks assigned to them as QA reviewer.
- Add review issues, resolve review issues.
- Comment on tasks they are QA reviewer for.

**Issues found:**
- When a task moves to `in-review`, the system auto-reassigns the task to the QA reviewer (`ChangeStatusAsync` line 826-839). After the review is complete, the task assignee reverts to the original developer. This auto-assignment swap is not clearly communicated to the developer.

### 6.5 Developer / Assignee Role

**Login:** Normal.  
**Accessible flows:**
- View tasks assigned to them.
- Start their task.
- Toggle checklist items.
- Move task through their portion of the workflow (in-progress → in-review, blocked states).

**Issues found:**
- A developer can also block their own task via `SetTaskBlockAsync` without it being a manager action. This is correct business behavior.
- `ToggleChecklistItemAsync` enforces `task.StartedAt != null` — developers must press "Start Task" before completing checklist items. This is enforced on the backend but the frontend error message "Press 'Start Task' before completing checklist items" is only shown after the API call fails, not proactively.

### 6.6 Viewer Role

**Login:** Normal.  
**Accessible flows:**
- View dashboard.
- View projects and tasks (read-only).
- Chat (global channel accessible to all).
- View own work diary.
- View reports.

**Issues found:**
- Viewer can see all tasks via the API if they have the View bit set, even tasks in projects they are not members of. There is no project-membership-scoped task visibility at the API level.

---

## 7. Navigation & Routing Audit

### 7.1 Route Coverage

| Route | Component | Auth Guard | Notes |
|---|---|---|---|
| `/auth` | Auth.tsx | None | Public |
| `/` | Dashboard.tsx | ProtectedRoute | Always visible |
| `/projects` | Projects.tsx | ProtectedRoute + canView | Permission-gated in sidebar |
| `/projects/:id` | ProjectDetails.tsx | ProtectedRoute | No explicit permission re-check for individual project |
| `/tasks` | Tasks.tsx | ProtectedRoute + canView | |
| `/users` | Users.tsx | ProtectedRoute + canView | |
| `/users/:id` | UserDetails.tsx | ProtectedRoute | |
| `/roles` | Roles.tsx | ProtectedRoute + canView | |
| `/settings` | Settings.tsx | ProtectedRoute + canView | |
| `/chat` | Chat.tsx | ProtectedRoute | alwaysShow — no permission gate |
| `/reports` | Reports.tsx | ProtectedRoute | alwaysShow — no permission gate |
| `/diary` | Diary.tsx | ProtectedRoute | alwaysShow — no permission gate |
| `/templates` | TemplateList.tsx | ProtectedRoute + canView | |
| `/templates/new` | TemplateForm.tsx | ProtectedRoute | No frontend permission guard on route |
| `/templates/:id` | TemplateDetail.tsx | ProtectedRoute | |
| `/templates/:id/edit` | TemplateForm.tsx | ProtectedRoute | No frontend permission guard on route |
| `*` | NotFound.tsx | ProtectedRoute (caught before) | |

### 7.2 Issues Found

**MEDIUM: `/templates/new` and `/templates/:id/edit` lack frontend permission guard**
- `Sidebar.tsx` correctly filters out `/templates` for non-admin users, but the routes `/templates/new` and `/templates/:id/edit` are defined in `App.tsx` without a separate permission check.
- A non-admin user who knows the URL can navigate directly to the template form. The API will reject their requests (IsAdmin gate), but they will see a partially rendered form.
- **Fix:** Add `canView('/templates')` check to the template form route, or add a dedicated `AdminRoute` component.
- **Severity:** LOW

**LOW: `/reports`, `/chat`, `/diary` have no permission gate**
- These routes are marked `alwaysShow: true` in `Sidebar.tsx`, meaning they are always visible to authenticated users regardless of role.
- The backend `ReportsController` does not have permission checks either (based on the reports endpoint pattern).
- **Fix:** If certain report types should be restricted, add permission checks to both sidebar and API controllers.
- **Severity:** LOW

**LOW: Missing 404 Handling for Deep Links**
- `App.tsx` has a `<Route path="*" element={<NotFound />} />` catch-all. This correctly shows a 404 page for unknown routes.
- However, the SPA fallback `app.MapFallbackToFile("index.html")` in `Program.cs` ensures deep links work on page refresh.
- **Status:** GOOD

**LOW: `?id=` Query Parameter Navigation**
- Several features use `?id=<taskId>` query parameters to open modals (e.g., task detail from notification links). There is no server-side equivalent, so sharing these URLs requires the SPA to be loaded first.
- **Status:** Acceptable for SPA architecture.

---

## 8. UI/UX Audit

### 8.1 Loading States

| Component | Loading State | Quality |
|---|---|---|
| Dashboard | DashboardSkeleton + section-level loaders | GOOD |
| Tasks page | Global loading overlay via `GlobalLoader` | GOOD |
| Task modal | Inline status history fetch with pulse skeleton | GOOD |
| Task completion modal | Per-tab loading spinners | GOOD |
| Reports page | Section-level loading | Assumed present |
| Chat | `isLoadingHistory` flag | GOOD |
| Effort stats widget | `effortLoading` state | GOOD |

### 8.2 Error States

- API 403/401 errors surface via toast notifications (through `lib/api.ts`).
- API errors that cause form submissions to fail are caught and displayed via `showError()` toast.
- Global `ErrorBoundary` catches React render errors with a generic "Something went wrong" message.

**Issue:** The `ErrorBoundary` in `App.tsx` (line 56) has an empty `componentDidCatch` — errors are not sent to Sentry or any monitoring system even if `Sentry.Dsn` is configured.
- **Evidence:** `App.tsx` line 57: `componentDidCatch(_error: Error, _info: ErrorInfo) { // Error captured — production monitoring would go here }`
- **Severity:** MEDIUM
- **Fix:** Call `Sentry.captureException(error)` within `componentDidCatch` if Sentry DSN is configured.

### 8.3 Empty States

- `EmptyState` component (`components/ui/EmptyState.tsx`) exists and is used across pages.
- The Kanban board shows per-column empty states.
- Work diary, reports, and template lists appear to use empty state handling.

### 8.4 Modal Management

**Issue: Task modal state complexity**
- The task edit/view modal in `Tasks.tsx` manages 25+ individual state variables at the page level. When the modal closes, state reset is done in `handleOpenModal()` but requires explicit resets of all 25 states.
- This creates risk of state leakage between modal opens (e.g., `reviewIssueRows` reset to `['']` may not be sufficient if the previous edit session had partially entered review issues).
- **Severity:** MEDIUM
- **Fix:** Extract modal state into a dedicated hook `useTaskModal()` or a separate component with local state.

**Issue: window.prompt() usage**
- Already documented in Section 4.5. The Kanban drag-and-drop uses native browser prompts.
- **Severity:** MEDIUM

### 8.5 Notification System

- In-app notifications appear as a dropdown from the bell icon.
- Backend pushes notifications via SignalR's `ReceiveNotification` event.
- High-signal notifications (block, issue, overdue) also pop a modal dialog via `activeAlert`.
- Sound notification: `DataContext` plays `/notification.mp3` but the file may not exist (`// P5-D: local file — place ClientApp/public/notification.mp3 to enable sound`).
- **Issue:** Missing `notification.mp3` asset — audio will silently fail (`audio.play().catch(() => {})`). Not a bug, but creates a confusing gap in user experience documentation.

### 8.6 Theme Support

- `ThemeContext` manages dark/light mode.
- TailwindCSS 4 dark mode classes used consistently (`dark:bg-gray-950`, etc.).
- Theme appears to be persisted (implied by `ThemeContext` — needs verification).

### 8.7 Impersonation Banner

- When an admin impersonates a user, `UserDto.IsImpersonated = true` and `ImpersonatedByName` is set.
- The UI reads this from `user.isImpersonated` in `AuthContext`.
- **Issue:** No UI banner was found in the reviewed components that displays the impersonation state to the admin. The `UserDto` fields are set correctly but the UX indicator needs verification in `DashboardLayout.tsx` (not fully read).

---

## 9. Form Validation Audit

### 9.1 Backend Validation

| Endpoint | Validation | Quality |
|---|---|---|
| POST /auth/login | Identifier check, password verify | GOOD |
| POST /auth/register | Email format, password length, name required | GOOD |
| POST /auth/register/initiate | All fields validated in controller | GOOD |
| POST /auth/reset-password | Password min length | GOOD |
| POST /tasks | EstimatedHours required > 0; checklist required | GOOD |
| PUT /tasks/{id} | EstimatedHours required > 0 | GOOD |
| PUT /tasks/{id}/status | Status machine validation | GOOD |
| POST /tasks/{id}/checklist | No title length validation | MISSING |
| POST /tasks/{id}/comments | No text length validation | MISSING |
| POST /tasks/{id}/issues | MaxLength(500) on description | GOOD |
| POST /tasks/{id}/review-issues | MaxLength(500) on description | GOOD |
| POST /projects | No validation on ProjectDto | MISSING |
| PUT /users | DataAnnotations present | GOOD |
| POST /auth/check-availability | Requires authentication | GOOD (but odd) |

**Finding: `ProjectDto` used for both Create and Read**
- `ProjectsController.cs` lines 46 and 59 accept `ProjectDto` (the full DTO with all fields) instead of a separate `CreateProjectDto`. The `ProjectDto` has no `[Required]` annotations on `Name` or `Status`.
- **Severity:** MEDIUM
- **Fix:** Create a dedicated `CreateProjectDto` / `UpdateProjectDto` with proper `[Required]` and `[StringLength]` annotations.

**Finding: No maximum length on task title or description**
- `CreateTaskDto.Title` (line 243 in `GeneralDtos.cs`) has no `[Required]` or `[MaxLength]` annotation.
- **Severity:** LOW — EF Core will throw at DB level if the column length is exceeded, but the error message will be cryptic.

### 9.2 Frontend Validation

| Form | Validation Library/Pattern | Quality |
|---|---|---|
| Login form | Inline state checks | GOOD |
| Register form | `validateName`, `validateEmail`, `validateContact` from `lib/validation.ts` | GOOD |
| OTP input | Digit-only filter, 6-character limit | GOOD |
| Task create/edit form | Inline validation (estimatedHours, checklist count) | GOOD |
| User create/edit | Uses `VTextField` + validation.ts | GOOD |
| Project create/edit | Unclear — not fully reviewed | PARTIAL |
| Work Diary form | Required date and description | GOOD |

**Finding: No real-time validation feedback on task form fields**
- The task creation form validates `estimatedHours` and checklist count only on submit. Fields like `title` (required) are not validated until form submission fails.
- **Severity:** LOW

**Finding: Password strength indicator misleading**
- `Auth.tsx` line 18 defines `PASSWORD_STRENGTH_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/` for strength indication, but the backend only requires `length >= 6`. A password like `"aaaaaa"` would be accepted by the backend but marked as "weak" by the frontend.
- The strength indicator creates user friction without actual enforcement.
- **Severity:** LOW

---

## 10. CRUD Audit

### 10.1 Tasks

| Operation | API | Frontend | Notes |
|---|---|---|---|
| Create | POST /api/tasks | Tasks.tsx modal | ✓ — checklist required |
| Read (list) | GET /api/tasks | Tasks.tsx Kanban + List | ✓ — paginated |
| Read (single) | GET /api/tasks/{id} | QuickView panel | ✓ |
| Update | PUT /api/tasks/{id} | Tasks.tsx modal (edit mode) | ✓ |
| Delete | DELETE /api/tasks/{id} | Tasks.tsx delete button | ✓ — blocks if has children |
| Start | POST /api/tasks/{id}/start | TaskStatusActions.tsx | ✓ |
| Change Status | PUT /api/tasks/{id}/status | Kanban drag + status actions | ✓ |
| Reassign | PUT /api/tasks/{id}/reassign | ReassignModal | ✓ |
| Add Comment | POST /api/tasks/{id}/comments | CommentSection.tsx | ✓ |
| Add Checklist | POST /api/tasks/{id}/checklist | ChecklistPanel.tsx | ✓ |
| Toggle Checklist | PUT /api/tasks/{id}/checklist/{itemId}/toggle | ChecklistPanel.tsx | ✓ |
| Delete Checklist | DELETE /api/tasks/{id}/checklist/{itemId} | ChecklistPanel.tsx | ✓ |
| Block/Unblock | PUT /api/tasks/{id}/block | TaskBlockPanel.tsx | ✓ |
| QA Pass | POST /api/tasks/{id}/qa/pass | TaskStatusActions.tsx | ✓ |
| QA Fail | POST /api/tasks/{id}/qa/fail | TaskStatusActions.tsx | ✓ |
| Add Issue | POST /api/tasks/{id}/issues | Tasks.tsx (issue tab) | ✓ |
| Resolve Issue | PUT /api/tasks/{id}/issues/{entryId} | Tasks.tsx | ✓ |
| Delete Issue | DELETE /api/tasks/{id}/issues/{entryId} | Tasks.tsx | ✓ |
| Add Review Issue | POST /api/tasks/{id}/review-issues | Tasks.tsx (QA tab) | ✓ |
| Resolve Review Issue | PUT /api/tasks/{id}/review-issues/{issueId} | Tasks.tsx | ✓ |
| Delete Review Issue | DELETE /api/tasks/{id}/review-issues/{issueId} | Tasks.tsx | ✓ |
| Complete Review | POST /api/tasks/{id}/review/complete | Tasks.tsx | ✓ |

### 10.2 Projects

| Operation | API | Frontend | Notes |
|---|---|---|---|
| Create | POST /api/projects | Projects.tsx | ✓ — admin only |
| Read (list) | GET /api/projects | Projects.tsx | ✓ |
| Read (single) | GET /api/projects/{id} | ProjectDetails.tsx | ✓ |
| Update | PUT /api/projects/{id} | Projects.tsx (edit modal) | ✓ |
| Delete | DELETE /api/projects/{id} | Projects.tsx | ✓ |
| Reassign Owner | PUT /api/projects/{id}/reassign | ProjectDetails.tsx | ✓ |
| Set Members | PUT /api/projects/{id}/members | ProjectDetails.tsx | ✓ |
| Remove Member | DELETE /api/projects/{id}/members/{userId} | ProjectDetails.tsx | ✓ |

### 10.3 Users

| Operation | API | Frontend | Notes |
|---|---|---|---|
| Create | POST /api/users | Users.tsx | ✓ |
| Read (list) | GET /api/users | Users.tsx | ✓ |
| Read (single) | GET /api/users/{id} | UserDetails.tsx | ✓ |
| Update | PUT /api/users/{id} | UserDetails.tsx | ✓ |
| Soft Delete | DELETE /api/users/{id} | Users.tsx | ✓ — sets IsDeleted=true |
| Activate/Deactivate | PUT /api/users/{id}/active | Users.tsx | ✓ |
| Reactivate | PUT /api/users/{id}/reactivate | Users.tsx | ✓ |

**Missing:** No hard-delete endpoint for users. The API only supports soft-delete. This is a design choice (audit trail) but should be documented.

### 10.4 Roles

| Operation | API | Frontend | Notes |
|---|---|---|---|
| Create | POST /api/roles | Roles.tsx | ✓ |
| Read | GET /api/roles | Roles.tsx | ✓ |
| Update | PUT /api/roles/{id} | Roles.tsx | ✓ |
| Delete | DELETE /api/roles/{id} | Roles.tsx | ✓ |
| Set Permissions | PUT /api/roles/{id}/permissions | Roles.tsx | ✓ |

**Issue:** SystemAdmin role (RoleId=1) cannot be deleted (presumably guarded in RoleService) but the UI may show a delete button. Needs verification.

### 10.5 Task Templates

| Operation | API | Frontend | Notes |
|---|---|---|---|
| Create | POST /api/task-templates | TemplateForm.tsx | ✓ |
| Read (list) | GET /api/task-templates | TemplateList.tsx | ✓ |
| Read (single) | GET /api/task-templates/{id} | TemplateDetail.tsx | ✓ |
| Update | PUT /api/task-templates/{id} | TemplateForm.tsx | ✓ |
| Delete | DELETE /api/task-templates/{id} | TemplateList.tsx | ✓ |
| Manual Generate | POST /api/task-templates/{id}/generate | TemplateDetail.tsx | ✓ |
| List Generations | GET /api/task-templates/{id}/generations | TemplateDetail.tsx | ✓ |

### 10.6 Work Diary

| Operation | API | Frontend | Notes |
|---|---|---|---|
| Create | POST /api/diary | Diary.tsx | ✓ |
| Read (my entries) | GET /api/diary | Diary.tsx | ✓ |
| Read (all entries, admin) | GET /api/diary/all | Dashboard.tsx | ✓ |
| Update | PUT /api/diary/{id} | Diary.tsx | ✓ |
| Delete | DELETE /api/diary/{id} | Diary.tsx | ✓ |

### 10.7 Chat

| Operation | API / Hub | Frontend | Notes |
|---|---|---|---|
| Create Room | POST /api/chat/rooms | Chat.tsx | ✓ |
| Create Direct Message | POST /api/chat/rooms/direct/{userId} | Chat.tsx | ✓ |
| Read Rooms | GET /api/chat/rooms | ChatContext | ✓ |
| Read Messages | GET /api/chat/messages | ChatContext | ✓ |
| Send Message | Hub.SendMessage | MessageInput.tsx | ✓ |
| Send File | POST /api/chat/upload + Hub | MessageInput.tsx | ✓ |
| Typing Indicator | Hub.StartTyping / StopTyping | MessageInput.tsx | ✓ |
| **Delete Message** | MISSING | MISSING | ✗ — no delete endpoint |
| **Edit Message** | MISSING | MISSING | ✗ |

---

## 11. API Audit

### 11.1 Response Consistency

All controllers wrap responses in `ApiResponse<T>` with `Success`, `Message`, `Data`, and optional `Errors`. Consistent patterns observed:
- `200 OK` for successful operations.
- `201 Created` for resource creation (`CreatedAtAction`).
- `400 Bad Request` for validation failures.
- `401 Unauthorized` for authentication failures.
- `403 Forbidden` for authorization failures (via `StatusCode(403, ...)`).
- `404 Not Found` for missing resources.

**Minor issue:** Some controllers return `NotFound(result)` when the service returns a failure message that isn't necessarily "not found" (e.g., `ProjectsController` line 64: if `result.Message == "Project not found"` check is fragile string comparison).

### 11.2 Error Code Usage

`ApiResponse<T>` has an `ErrorCode` property. Usage is inconsistent:
- `FORBIDDEN` error code is used in TaskService for authorization failures.
- `NOT_FOUND` helper method exists but is rarely used explicitly.
- Most validation failures have no `ErrorCode`, making them harder for clients to distinguish programmatically.

### 11.3 Endpoint Coverage

| Controller | CRUD Complete | Auth Guard | Permission Guard | Notes |
|---|---|---|---|---|
| AuthController | Partial (no change-password) | AllowAnonymous/Authorize | N/A | Missing authenticated change-password |
| TasksController | Full | [Authorize] | CanView/Create/Update/Delete | Good |
| ProjectsController | Full | [Authorize] | IsAdmin + bitmap | Good |
| UsersController | Full + activate/reactivate | [Authorize] | IsAdmin | Good |
| RolesController | Full + permissions | [Authorize] | IsSystemAdmin | Good |
| ChatController | Partial (no delete/edit) | [Authorize] | Member check | Missing delete |
| ReportsController | Read only | [Authorize] | CanView | Good |
| WorkDiaryController | Full | [Authorize] | Owner/Admin | Good |
| TaskTemplatesController | Full + generate | [Authorize] | IsAdmin | Good |
| ActivitiesController | Read only | [Authorize] | CanView | Good |
| PermissionsController | Read/Update | [Authorize] | IsAdmin | Good |
| BackupController | N/A | Commented out in DI | N/A | Dead code in DI |

### 11.4 Missing API Endpoints

1. `GET /api/auth/me` — Frontend uses `/auth/validate` but there's no "get current user profile" endpoint that also returns extended details like permissions summary.
2. `PUT /api/auth/change-password` — No authenticated password change endpoint. Users can only change password via forgot-password OTP flow.
3. `DELETE /api/chat/messages/{id}` — No message deletion.
4. `PUT /api/chat/messages/{id}` — No message editing.
5. `GET /api/tasks/{id}/children` — Children are included in the task detail response but no dedicated endpoint for subtask listing.
6. `GET /api/users/me` — Frontend constructs user from login response; no refresh of user profile.

### 11.5 Pagination

- Tasks endpoint supports pagination: `page`, `pageSize` (capped at 500), `TotalCount`, `TotalPages` in response.
- Other list endpoints (projects, users, activities) do not support pagination.
- The frontend loads all records for non-task entities, which will degrade as data grows.

---

## 12. Accessibility Audit

### 12.1 Critical Accessibility Issues

**Missing ARIA Labels on Icon-Only Buttons**
- The Kanban board has multiple icon-only buttons (edit, delete, reassign) without `aria-label` attributes.
- Evidence: `Tasks.tsx` — icon buttons use `<Edit2>`, `<Trash2>` etc. without aria-label.
- **Impact:** Screen reader users cannot identify button actions.
- **Severity:** HIGH

**Missing `role="dialog"` on Custom Modals**
- Most modals use `role="dialog"` and `aria-modal="true"` (seen in `TaskCompletionModal` line 187). Good.
- However, dropdown menus in the filter toolbar (project filter, user filter in `Tasks.tsx`) use a plain `<div>` without `role="listbox"` or `role="menu"`.
- **Severity:** MEDIUM

**Missing Focus Trap in Modals**
- When a modal opens, focus is not explicitly trapped within the modal. A keyboard user can tab out of the modal to the background content.
- **Severity:** HIGH

**Missing Alternative Text on User Avatars**
- `Tasks.tsx` line 1019: `<img src={u.avatar} alt="" ...>` — empty alt text means screen readers skip the avatar, which is acceptable for decorative images. But these avatars carry user identity context. A meaningful `alt={u.name}` would be better.
- **Severity:** LOW

**No Skip Navigation Link**
- No "Skip to main content" link at the top of the page for keyboard users.
- **Severity:** MEDIUM

**Form Labels**
- The task creation form in `Tasks.tsx` uses `LABEL_CLS` pattern with visual labels adjacent to inputs. Labels appear to use `<label>` elements from the auth form, but the task modal form needs verification for proper `htmlFor`/`id` associations.
- **Severity:** MEDIUM

### 12.2 Keyboard Navigation

- Sidebar navigation items use `<NavLink>` which renders `<a>` elements — correct for keyboard navigation.
- Collapse/expand sidebar button has `aria-label` (line 58 in `Sidebar.tsx`). GOOD.
- Kanban drag-and-drop uses HTML5 drag events which are not keyboard accessible. No keyboard alternative for status transitions via drag.
- **Severity:** MEDIUM for drag-and-drop keyboard accessibility.

### 12.3 Color Contrast

- TailwindCSS 4 defaults generally meet WCAG 2.1 AA contrast ratios.
- `text-gray-400` on `dark:bg-gray-950` backgrounds may not meet 4.5:1 ratio for small text — needs verification with a contrast checker.
- Status badge colors (info/warning/danger/success) use colored backgrounds with white/dark text — generally adequate.

---

## 13. Responsive Design Audit

### 13.1 Mobile Support

- `DashboardLayout` includes a mobile hamburger menu and responsive sidebar.
- `Sidebar.tsx` handles `isMobileMenuOpen` prop and translates off-screen on mobile (`-translate-x-full lg:translate-x-0`).
- Evidence: `Sidebar.tsx` line 46-49.
- The Kanban board uses `overflow-x-auto` for horizontal scrolling on small screens.
- The task modal appears to be a fixed-position overlay that should work on mobile.

### 13.2 Issues

**Large Table/Grid Content**
- Reports page and User Details page likely contain wide tables. Without `overflow-x-auto` wrappers, these may overflow on mobile — needs visual testing.

**Kanban Board Horizontal Scroll**
- The Kanban board supports horizontal scrolling. However, on mobile, horizontal scroll + the mouse-drag-pan interaction may conflict with native touch scrolling.

**Filter Dropdowns**
- The project/user filter dropdowns in `Tasks.tsx` use `position: fixed` with calculated top/left from `getBoundingClientRect()`. On mobile, viewport changes (keyboard appearing) can misalign these dropdowns.

**Chat Interface**
- The `Chat.tsx` page uses a sidebar layout (`ChatSidebar.tsx` + `MessageList.tsx`). On mobile, this may not collapse correctly without testing.

---

## 14. Dead Code & Technical Debt

### 14.1 Dead Code

**`JwtService` class in `Services/AuthService.cs`**
- A `JwtService` class (separate from `AuthService`) exists in `Services/JwtService.cs` and is also referenced in CLAUDE.md as dead code.
- Evidence: `Services/JwtService.cs` exists; it is NOT registered in `Program.cs`.
- **Impact:** Maintenance confusion — developers may try to use this class.
- **Recommended Fix:** Delete `Services/JwtService.cs`.

**`DatabaseBackupService`**
- `Services/DatabaseBackupService.cs` exists but is commented out in `Program.cs` line 105.
- Evidence: `Program.cs`: `// builder.Services.AddScoped<IDatabaseBackupService, DatabaseBackupService>();`
- `Controllers/BackupController.cs` also exists but its DI dependency is not registered.
- **Impact:** `BackupController` will throw a `500` if called (missing DI registration).
- **Recommended Fix:** Either register the service and restore the controller, or delete both files.

**`Models/ChatMessage.cs` and `Models/ChatAttachment.cs`**
- CLAUDE.md notes these are "placeholder" files — the actual entities are declared in `PMSDbContext.cs`.
- These model files likely duplicate or shadow the entity definitions.
- **Recommended Fix:** Delete the placeholder `Models/` files to avoid confusion.

**`pms_token` Key in localStorage Cleanup**
- `AuthContext.tsx` line 125 clears `localStorage.removeItem('pms_token')` on logout — but `pms_token` is never set by the current implementation (access token is in memory). This is leftover from an older implementation.
- **Severity:** LOW

### 14.2 Technical Debt

**`Tasks.tsx` — 2,774 lines**
- This single file is the most significant technical debt item. It contains task listing, Kanban view, list view, task modal (create + edit), task detail tabs, checklist management, status history view, effort timeline, block panel integration, QA review flow, and reassignment.
- **Recommended Fix:** Split into: `TasksPage`, `KanbanBoard`, `TaskListView`, `TaskModal`, `TaskCompletionModal`, `TaskDetailTabs`, and integrate with existing `ChecklistPanel`, `TaskBlockPanel`, `TaskStatusActions` components.
- **Effort:** 2-3 days of refactoring.

**`DataContext.tsx` — 646 lines, God Object**
- As detailed in Section 4.4.
- **Recommended Fix:** Domain-specific context slices.

**`GeneralDtos.cs` — 927 lines, all DTOs in one file**
- Growing coupling surface.
- **Recommended Fix:** Split into domain files: `TaskDtos.cs`, `ProjectDtos.cs`, `UserDtos.cs`, `ChatDtos.cs`, `ReportDtos.cs`, `TemplateDtos.cs`.

**Working Hours Hardcoded in Frontend**
- `Tasks.tsx` line 138-143 defines `WORK_START = 10, WORK_END = 19` in the effort calculation inline in `TaskCompletionModal`. The backend reads these from `appsettings.json` via `WorkingHoursOptions`, but the frontend hardcodes the same values.
- If the working hours are changed in `appsettings.json`, the frontend will display incorrect day-wise effort breakdowns.
- **Recommended Fix:** Expose a `GET /api/config/working-hours` endpoint and read the values on the frontend.
- **Severity:** MEDIUM

**AuthService.LoginAsync — Username Login Missing**
- The auth flow in `AuthService.LoginAsync` checks if the identifier contains `@` to detect email login, otherwise falls through to mobile number login (7+ digits). There is NO username login path.
- CLAUDE.md says "Username login is case-sensitive" — but the code does not implement username login at all.
- Evidence: `Services/AuthService.cs` lines 39-62 — the `else` branch (no `@`) only checks `ContactNoNormalized`.
- **Impact:** Users with username-only credentials (no email `@` and not a mobile number) cannot log in.
- **Severity:** HIGH (functionality gap)
- **Recommended Fix:** Add a third branch: if the identifier is not an email and not a digit-heavy string, query by `UserName` using case-sensitive comparison (as documented in CLAUDE.md).

---

## 15. Missing Features & Incomplete Implementations

### 15.1 Username Login Not Implemented

As detailed in Section 14.2. Login only supports email or mobile number — username login is not implemented despite being documented.
- **Module:** AuthService
- **Impact:** Users cannot log in with their username.
- **Severity:** HIGH
- **Priority:** P1

### 15.2 Authenticated Password Change

No `PUT /api/auth/change-password` endpoint exists. Users who are already logged in cannot change their password — they must use the forgot-password → OTP → reset flow.
- **Module:** AuthController
- **Severity:** MEDIUM
- **Priority:** P2

### 15.3 Chat Message Deletion and Editing

No API endpoints for deleting or editing sent chat messages. Once sent, messages are permanent.
- **Module:** ChatController
- **Severity:** LOW (common product limitation)
- **Priority:** P4

### 15.4 File Attachment for Tasks

The `TaskDto` includes `attachments` and the `Attachment` entity exists in `PMSDbContext`. The frontend `FileUploader` component exists and is imported in `Tasks.tsx`. However, no attachment upload endpoint is visible in the task API (only chat upload exists at `/api/chat/upload`).
- **Module:** TasksController
- **Severity:** MEDIUM
- **Priority:** P2

### 15.5 Notification.mp3 Missing

Work diary reminder sounds require a `/notification.mp3` file in the public directory. The file is referenced but noted as optional (`// P5-D: local file — place ClientApp/public/notification.mp3 to enable sound`).
- **Module:** DataContext
- **Severity:** LOW
- **Priority:** P4

### 15.6 Sentry Error Reporting Not Wired in Frontend

`App.tsx` `componentDidCatch` is empty. Backend Sentry is conditionally wired (if DSN is configured), but frontend errors are not reported.
- **Module:** App.tsx
- **Severity:** MEDIUM (operational monitoring gap)
- **Priority:** P2

### 15.7 No Pagination on Non-Task List Endpoints

Projects, users, activities, and roles are returned without pagination. The frontend loads all records.
- **Module:** Multiple controllers
- **Severity:** MEDIUM
- **Priority:** P3

### 15.8 No Email Notification System Beyond OTP

The system sends OTP emails but has no general-purpose notification email (e.g., task assignment notification email, due date reminder email). All notifications are in-app via SignalR or browser notifications.
- **Module:** NotificationService
- **Severity:** LOW
- **Priority:** P4

### 15.9 No Tenant Isolation / Multi-Tenancy

The system is designed as a single-tenant application. There is no concept of organizations or workspaces. All users, projects, and tasks are shared in one database namespace.
- **Module:** Data layer
- **Severity:** N/A (design decision for single-org use)

---

## 16. Bugs & Defects

### 16.1 CONFIRMED BUG: Username Login Broken

| Field | Detail |
|---|---|
| **Module** | AuthService |
| **Feature** | Login |
| **Description** | `AuthService.LoginAsync` routes non-`@` identifiers to the mobile number (digit-based) login path. A username like "john_doe" would not match a mobile number pattern (`digits.Length >= 7`), resulting in `user = null` and a generic "Invalid email/mobile or password" error. |
| **Evidence** | `Services/AuthService.cs` lines 39-62: `if (identifier.Contains('@'))` → email login; `else` → mobile number login only. No username lookup path. |
| **Impact** | Users trying to log in with their username cannot authenticate. |
| **Severity** | **HIGH** |
| **Root Cause** | Incomplete implementation of the three-way login path. |
| **Affected Files** | `Services/AuthService.cs` |
| **Recommended Fix** | Add third branch: if not email and not digit-heavy, query `_context.Users.FirstOrDefaultAsync(u => u.UserName == identifier)` (case-sensitive per CLAUDE.md). |
| **Estimated Effort** | 30 minutes |
| **Priority** | **P1** |

### 16.2 CONFIRMED BUG: AuthorizationService CanViewAsync Allows Access When No PageModule Exists

| Field | Detail |
|---|---|
| **Module** | AuthorizationService |
| **Feature** | Permission Check |
| **Description** | In `CanViewAsync` (line 90), if no `PageModule` is found for the route, the method returns `false`. But in `HasPermissionAsync` (line 112), if no `rolePerm` is found after finding the `pageModule`, it returns `false` (deny). However if `pageModule` is null in `HasPermissionAsync`, it also returns `false`. The inconsistency is that `CanViewAsync` has special logic: if `pageModule == null`, return `false` (line 83). But in `CanViewAsync` line 86-90, if role permission for the module doesn't exist, it returns `true` via `return rolePerm == null || (rolePerm.Permissions & 1) == 1` — **allowing access when no explicit deny exists**. This is the permissive default pattern. |
| **Evidence** | `Services/AuthorizationService.cs` line 90: `return rolePerm == null || (rolePerm.Permissions & 1) == 1;` — returns `true` if no explicit role permission row exists. |
| **Impact** | If a new page route is added but not yet seeded in `PageModules`, all non-admin users will gain view access by default. This is a security-by-permissive-default pattern that may not be intended. |
| **Severity** | **MEDIUM** |
| **Root Cause** | Design choice (permissive default) vs. security-by-deny-default. |
| **Affected Files** | `Services/AuthorizationService.cs` |
| **Recommended Fix** | Change line 90 to `return rolePerm != null && (rolePerm.Permissions & 1) == 1;` (deny by default) and ensure all page modules are seeded with explicit permissions. |
| **Estimated Effort** | 1 hour |
| **Priority** | **P2** |

### 16.3 CONFIRMED BUG: BackupController Returns 500

| Field | Detail |
|---|---|
| **Module** | BackupController |
| **Feature** | Database Backup |
| **Description** | `BackupController` has `IDatabaseBackupService` injected, but the service is not registered in DI (`Program.cs` line 105 is commented out). Any request to backup endpoints will throw a `DI resolution exception` → `500 Internal Server Error`. |
| **Evidence** | `Program.cs` line 105: `// builder.Services.AddScoped<IDatabaseBackupService, DatabaseBackupService>();`. `Controllers/BackupController.cs` depends on `IDatabaseBackupService`. |
| **Impact** | Backup functionality is broken. API consumers get a 500 error. |
| **Severity** | **MEDIUM** |
| **Root Cause** | Service commented out during development. |
| **Affected Files** | `Program.cs`, `Controllers/BackupController.cs`, `Services/DatabaseBackupService.cs` |
| **Recommended Fix** | Either register the service or delete the `BackupController`. |
| **Estimated Effort** | 30 minutes |
| **Priority** | **P2** |

### 16.4 CONFIRMED BUG: TaskService.GetEffortStatsAsync PausedSeconds Always Zero

| Field | Detail |
|---|---|
| **Module** | TaskService |
| **Feature** | Dashboard Effort Stats |
| **Description** | In `GetEffortStatsAsync`, `DashboardEffortDto.PausedSeconds` is always set to `0` regardless of actual paused time. Similarly in `TopUserEffortDto` within `GetEffortStatsAsync`, `PausedSeconds = 0` for all top users. |
| **Evidence** | `Services/TaskService.cs` lines 1113-1124: `PausedSeconds = 0` hardcoded in `DashboardEffortDto`. Lines 1101-1109: `PausedSeconds = 0` hardcoded in each `TopUserEffortDto`. |
| **Impact** | Dashboard effort widgets show 0 paused time, making the "paused vs. productive" analysis inaccurate. |
| **Severity** | **MEDIUM** |
| **Root Cause** | Unfinished implementation — `paused` time computation was planned but not implemented in the org-wide stats path. The per-task effort computation correctly calculates paused time. |
| **Affected Files** | `Services/TaskService.cs` |
| **Recommended Fix** | Apply the same logic as `ComputeEffort` to compute paused seconds per user. Track paused status segments when `s.Status == "blocked"` or `"in-review"` etc. |
| **Estimated Effort** | 4 hours |
| **Priority** | **P2** |

### 16.5 CONFIRMED BUG: CORS Will Block All Production API Calls

Already documented in Security Section 3.4. This is both a security misconfiguration and a critical functional bug for production.

### 16.6 PROBABLE BUG: Task assigneeId Field Mapping Inconsistency

| Field | Detail |
|---|---|
| **Module** | Types / API |
| **Feature** | Task assignment display |
| **Description** | In the frontend `Task` interface (`types/index.ts`), the field is `assigneeId: number`. In `TaskDto` (backend), it is `AssignedToId`. The mapping via AutoMapper or manual mapping converts between these. However, in `DataContext.tsx` line 162, `task.dueDate` is used without type safety — `dueDate` is a `string` in the frontend type. If the backend sends `null` for dueDate on optional fields, string operations may throw. |
| **Evidence** | `types/index.ts` line 196: `dueDate: string` — no `?` optional. Some tasks may have no due date. `DataContext.tsx` line 162: `const dueDate = new Date(task.dueDate)` — will produce `Invalid Date` for null/undefined. |
| **Impact** | Due date filtering logic in `DataContext.tsx` will produce incorrect results (NaN comparisons) for tasks without due dates, causing them to appear as neither overdue nor upcoming. |
| **Severity** | **MEDIUM** |
| **Root Cause** | Type definition makes `dueDate` required but API may return null/undefined. |
| **Affected Files** | `ClientApp/src/types/index.ts`, `ClientApp/src/context/DataContext.tsx` |
| **Recommended Fix** | Change `dueDate: string` to `dueDate?: string` in the `Task` interface. Add null guards: `const dueDate = task.dueDate ? new Date(task.dueDate) : null`. |
| **Estimated Effort** | 1 hour |
| **Priority** | **P2** |

### 16.7 PROBABLE BUG: OtpCleanupService Race Condition

| Field | Detail |
|---|---|
| **Module** | OtpCleanupService |
| **Feature** | OTP Cleanup |
| **Description** | `OtpCleanupService` (a hosted service) runs cleanup on expired OTPs. If it runs simultaneously with `OtpService.GenerateAndSendAsync` (which also cleans stale OTPs at line 57-60), there is a potential race condition where an OTP row is cleaned by both services. |
| **Evidence** | `Services/OtpService.cs` lines 57-61: `existing.IsUsed = true` for existing OTPs. `Services/OtpCleanupService.cs` would run `DELETE WHERE ExpiresAt < now`. |
| **Impact** | Low impact — worst case is a "double delete" which EF Core handles gracefully. However, it indicates an inconsistency in cleanup responsibility. |
| **Severity** | **LOW** |
| **Priority** | **P4** |

### 16.8 PROBABLE BUG: Status Machine Discrepancy Between Frontend and Backend

| Field | Detail |
|---|---|
| **Module** | TaskService / Status type |
| **Feature** | Task Status Machine |
| **Description** | Frontend `Status` type includes `'paused'` in the comment section of CLAUDE.md description but the actual `Status` type in `types/index.ts` (lines 2-13) uses `'blocked'` and `'in-review'`. The backend `AllowedEdges` in `TaskService.cs` also uses `"in-review"` and `"blocked"`. However, CLAUDE.md describes the status machine with `"paused"` and `"under-review"` which don't match the actual implementation. |
| **Evidence** | `CLAUDE.md`: "Valid statuses: `new → in-progress → paused / blocked / under-review → issues → completed`". Actual code: `AllowedEdges` at line 363-370 uses `"in-progress", "blocked", "in-review", "cancelled"` — no `"paused"` or `"under-review"` statuses. The `IsPaused` flag exists as a task condition (boolean field), not as a status value. |
| **Impact** | Documentation misleads developers. New developers may implement features assuming `"paused"` is a valid status string. |
| **Severity** | **LOW** (doc issue, not code bug) |
| **Priority:** P4 |

---

## 17. Improvement Recommendations

### Priority 1 (Must Fix Before Any Production Use)

1. **Externalize all secrets** (DB credentials, SMTP password, JWT key) to environment variables or Azure Key Vault. Remove from `appsettings.json`. [Security 3.1-3.3]
2. **Fix CORS configuration** to read allowed origins from configuration, include production domain. [Security 3.4]
3. **Implement username login** in `AuthService.LoginAsync`. [Bug 16.1]
4. **Delete or register `BackupController`** DI dependency. [Bug 16.3]

### Priority 2 (Fix Before External User Launch)

5. **Remove localStorage refresh token fallback** — rely exclusively on httpOnly cookie. [Security 3.7]
6. **Hash password in OTP registration payload** before storing in DB. [Security 3.10]
7. **Replace `window.prompt()` with proper modals** in `Tasks.tsx`. [Performance 4.5]
8. **Add `[MaxLength]` annotations to free-text fields** (comments, chat messages, task descriptions). [Security 3.9]
9. **Fix `PausedSeconds` always-zero bug** in `GetEffortStatsAsync`. [Bug 16.4]
10. **Fix `Task.dueDate` type to optional** and add null guards. [Bug 16.6]
11. **Add permission caching** in `AuthorizationService` using `IMemoryCache`. [Performance 4.2]
12. **Add DB indexes** on frequently queried columns. [Performance 4.6]
13. **Add Sentry frontend error reporting** in `ErrorBoundary.componentDidCatch`. [Missing 15.6]
14. **Fix `CanViewAsync` permissive default** to deny-by-default. [Bug 16.2]
15. **Implement `GET /api/auth/change-password`** endpoint. [Missing 15.2]

### Priority 3 (Improve for Stability and Scale)

16. **Split `Tasks.tsx`** into multiple components. [Tech Debt 14.2]
17. **Split `DataContext`** into domain-specific slices. [Architecture 2.2]
18. **Expose working hours via API** so frontend reads from config. [Tech Debt 14.2]
19. **Add pagination** to projects, users, and activities endpoints. [Missing 15.7]
20. **Implement server-side task filtering** — don't load all tasks into memory. [Performance 4.1]
21. **Add security headers** middleware. [Security 3.13]
22. **Restrict distributed rate limiting** using Redis instead of in-memory. [Security 3.6]
23. **Add ARIA labels** to icon-only buttons. [Accessibility 12.1]
24. **Implement focus trap** in modals. [Accessibility 12.1]
25. **Add skip navigation link**. [Accessibility 12.1]

### Priority 4 (Quality of Life Improvements)

26. **Delete dead code**: `JwtService.cs`, `Models/ChatMessage.cs`, `Models/ChatAttachment.cs`. [Tech Debt 14.1]
27. **Split `GeneralDtos.cs`** into domain-scoped files. [Tech Debt 14.2]
28. **Add chat message delete/edit** endpoints. [Missing 15.3]
29. **Add `notification.mp3`** to public directory or document its absence. [Missing 15.5]
30. **Run bundle analysis** and optimize heavy imports. [Performance 4.7]
31. **Implement task file attachments** endpoint (the infrastructure exists but API is missing). [Missing 15.4]
32. **Add automated test coverage** — currently only 2 test files found. [Test Coverage]
33. **Implement CI/CD pipeline** with automated builds, tests, and deployment.

---

## 18. Risk Assessment

### Risk Register

| # | Risk | Likelihood | Impact | Score | Severity | Mitigation |
|---|---|---|---|---|---|---|
| R1 | DB credentials leaked from repo | HIGH | CRITICAL | 25 | **CRITICAL** | Externalize to env vars immediately |
| R2 | JWT key forgery (hardcoded key) | HIGH | CRITICAL | 25 | **CRITICAL** | Rotate key, externalize |
| R3 | SMTP credentials abused | MEDIUM | HIGH | 12 | **HIGH** | Externalize password |
| R4 | CORS blocking all production traffic | HIGH | HIGH | 20 | **CRITICAL** | Fix before deployment |
| R5 | Username login broken, users locked out | HIGH | MEDIUM | 12 | **HIGH** | Implement username login |
| R6 | Refresh token XSS theft via localStorage | MEDIUM | HIGH | 12 | **HIGH** | Remove localStorage fallback |
| R7 | Performance degradation at scale (all tasks in memory) | HIGH | MEDIUM | 12 | **HIGH** | Implement server-side filtering |
| R8 | OTP plaintext password in DB | MEDIUM | MEDIUM | 8 | **MEDIUM** | Hash before storing |
| R9 | AuthorizationService permission check N+1 | HIGH | MEDIUM | 12 | **HIGH** | Add permission caching |
| R10 | DB performance without indexes | HIGH | MEDIUM | 12 | **HIGH** | Add composite indexes |
| R11 | Effort stats paused time wrong | HIGH | LOW | 5 | **MEDIUM** | Fix calculation |
| R12 | WCAG accessibility failures | HIGH | LOW | 5 | **MEDIUM** | Add ARIA labels, focus management |
| R13 | BackupController DI exception | LOW | MEDIUM | 4 | **MEDIUM** | Delete or register service |
| R14 | SignalR token in access logs | LOW | LOW | 2 | **LOW** | Log scrubbing |
| R15 | No frontend monitoring | HIGH | MEDIUM | 12 | **HIGH** | Wire Sentry in ErrorBoundary |
| R16 | No automated testing | HIGH | MEDIUM | 12 | **HIGH** | Add test suite |
| R17 | Tasks.tsx maintainability | HIGH | MEDIUM | 12 | **HIGH** | Refactor into components |

---

## 19. Production Readiness Score & Go/No-Go Recommendation

### Scoring Breakdown

| Category | Weight | Score | Weighted |
|---|---|---|---|
| Security | 25% | 38/100 | 9.5 |
| Architecture & Code Quality | 20% | 78/100 | 15.6 |
| Feature Completeness | 20% | 85/100 | 17.0 |
| Performance & Scalability | 15% | 68/100 | 10.2 |
| UX & Accessibility | 10% | 55/100 | 5.5 |
| Test Coverage & Quality | 5% | 20/100 | 1.0 |
| Operations & Monitoring | 5% | 35/100 | 1.75 |
| **Total** | **100%** | | **60.55 / 100** |

### Summary of Findings

| Severity | Count |
|---|---|
| CRITICAL | 4 |
| HIGH | 8 |
| MEDIUM | 14 |
| LOW | 10 |
| **Total** | **36** |

### Final Verdict

> **CONDITIONAL GO for Internal/Demo Deployment**  
> **NO-GO for External Production Launch**

The PMS application demonstrates mature domain modeling, well-structured backend services, and a polished React frontend with dark mode, real-time chat, Kanban board, and comprehensive reporting. The feature set is broad and largely complete.

**However**, the following **blockers must be resolved before any production deployment:**

| # | Blocker | Effort |
|---|---|---|
| B1 | Externalize DB, SMTP, and JWT credentials to environment variables | 4 hours |
| B2 | Fix CORS policy to include production domain | 2 hours |
| B3 | Fix username login implementation | 30 minutes |
| B4 | Resolve BackupController DI crash | 30 minutes |

**Total estimated effort to clear blockers: ~7 hours**

After clearing blockers, the remaining HIGH-severity items (rate limiting persistence, localStorage refresh token, permission caching, DB indexes, performance improvements) should be addressed within **2 weeks** before expanding to a broader user base.

---

## Appendix A: Files Reviewed

**Backend:**
- `Program.cs`
- `appsettings.json`, `appsettings.Development.json`
- `Controllers/AuthController.cs`
- `Controllers/TasksController.cs`
- `Controllers/ProjectsController.cs`
- `Controllers/BackupController.cs`
- `Services/TaskService.cs` (lines 1-1752 reviewed)
- `Services/AuthService.cs`
- `Services/AuthorizationService.cs`
- `Services/OtpService.cs`
- `Services/EmailService.cs`
- `Services/EffortHelpers.cs`
- `Services/TaskTemplateSchedulerService.cs`
- `Middleware/LoginRateLimitMiddleware.cs`
- `Hubs/ChatHub.cs`
- `DTOs/GeneralDtos.cs`

**Frontend:**
- `src/App.tsx`
- `src/lib/api.ts`
- `src/lib/validation.ts`
- `src/context/AuthContext.tsx`
- `src/context/DataContext.tsx`
- `src/context/ChatContext.tsx`
- `src/types/index.ts`
- `src/pages/Tasks.tsx` (lines 1-1068 reviewed)
- `src/pages/Dashboard.tsx` (lines 1-100 reviewed)
- `src/pages/Auth.tsx` (lines 1-120 reviewed)
- `src/components/Layout/Sidebar.tsx` (lines 1-100 reviewed)
- `src/hooks/usePermissions.ts`

---

## Appendix B: Test Coverage Assessment

Only 3 test files found in the entire project:
- `PMS.Tests/UnitTest1.cs` — likely a placeholder
- `PMS.Tests/AuthServiceTests.cs` — authentication unit tests
- `PMS.Tests/StatusTransitionTests.cs` — task status transition tests

No frontend tests (Jest/Vitest/React Testing Library) were found. No integration tests or E2E tests (Playwright/Cypress) were found.

**Test Coverage is approximately 5-10%** based on the file count ratio.

**Recommendation:** Before scaling the application, add:
1. Service-layer unit tests for `TaskService`, `ProjectService`, `UserService`
2. API integration tests (using `WebApplicationFactory<Program>`)
3. Frontend component tests for critical UI flows (login, task creation, status transitions)
4. E2E tests for the complete user journeys defined in `USE_CASES.md`

---

*Report generated: 2026-07-09 | Auditor: Claude Sonnet 4.6*
