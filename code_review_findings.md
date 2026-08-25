# PMS — Production-Grade Code Review Findings

**Review Date:** 2026-07-01  
**Reviewer:** Claude Sonnet 4.6 (Claude Code)  
**Scope:** Full-stack review — ASP.NET Core 6 Web API + React 19 + TypeScript SPA  
**Solution:** `PMS_Final_Backup.sln` · Root namespace: `TaskManagement`

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Critical Findings (CR)](#critical-findings)
3. [High Findings (HI)](#high-findings)
4. [Medium Findings (ME)](#medium-findings)
5. [Low Findings (LO)](#low-findings)
6. [Prioritized Improvement Plan](#prioritized-improvement-plan)
7. [Quick Wins](#quick-wins)
8. [Systemic Architectural Concerns](#systemic-architectural-concerns)

---

## Executive Summary

The PMS codebase is a well-structured, feature-complete full-stack SaaS application with a clear layered architecture, good use of async/await patterns, and a working permission model. However, several **critical security vulnerabilities**, **data integrity risks**, and **scalability bottlenecks** were identified that must be addressed before the application can be considered production-ready at any meaningful scale.

### Summary Counts

| Severity  | Count |
|-----------|-------|
| Critical  | 5     |
| High      | 10    |
| Medium    | 12    |
| Low       | 7     |
| **Total** | **34**|

### Top 3 Most Urgent Issues

1. **CR-001** — SMTP app password committed to `appsettings.json` in source control
2. **CR-002** — User registration password stored in plain text in the `EmailOtps.Payload` database column
3. **CR-005** — Parallel EF Core queries on a single (non-thread-safe) `DbContext` in `TaskService.GetDashboardStatsAsync`

---

## Critical Findings

---

### CR-001 — SMTP Gmail App Password in Source-Controlled Configuration File

| Field         | Value |
|---------------|-------|
| **Severity**  | Critical |
| **Actionable**| Yes — Move to environment variable or secrets manager |
| **Architecture** | Backend — Configuration |
| **Category**  | Security / Secrets Management |
| **Location**  | `appsettings.json` line 30: `"Password": "lsmvsdrfjyxvydvf"` |

**Problem:**  
The Gmail SMTP app password `lsmvsdrfjyxvydvf` is stored in plain text in `appsettings.json`. If this file is committed to source control (it is present in the project directory), any person with repository read access can hijack the Gmail account used to send OTP and registration emails.

**Impact:**  
Full compromise of the `vishalchudasama43326@gmail.com` Gmail account used for transactional email. An attacker can read all emails sent from this account (including OTPs), send phishing emails from a trusted sender, exhaust email quotas, and disable email delivery for all users. Account takeover of any PMS user becomes trivial.

**Recommendation:**  
1. Immediately revoke the exposed app password in Google Account → Security → App passwords.
2. Generate a new app password and store it in an environment variable (`Email__Password`) or a secrets manager (Azure Key Vault, AWS Secrets Manager).
3. Remove the plain-text password from `appsettings.json`; reference it as `"Password": ""` with a comment directing to the environment variable.
4. Add `appsettings.*.json` patterns to `.gitignore` and use `appsettings.Development.json` for local secrets.

> **Note:** Per constraint F-02, DB credentials are intentionally in `appsettings.json` for this deployment. This finding applies to the SMTP password only, which has no similar documented exception.

---

### CR-002 — User Registration Password Stored in Plain Text in EmailOtps Table

| Field         | Value |
|---------------|-------|
| **Severity**  | Critical |
| **Actionable**| Yes — Hash password before storing in payload |
| **Architecture** | Backend — Service / Data Layer |
| **Category**  | Security / Sensitive Data Exposure |
| **Location**  | `Controllers/AuthController.cs` line 88: `var payload = JsonSerializer.Serialize(dto);` → `OtpService.GenerateAndSendAsync(..., payload, ...)` → stored in `EmailOtps.Payload` |

**Problem:**  
During OTP-based registration initiation (`POST /api/auth/register/initiate`), the entire `InitiateRegisterDto` object — including the user's **plain-text password** — is JSON-serialized and stored as the `Payload` column of the `EmailOtps` database row. When the OTP is confirmed (`POST /api/auth/register/confirm`), the payload is deserialized and `pending.Password` is used directly to call `PasswordHasher.HashPassword`.

**Impact:**  
Any SQL injection vulnerability, database breach, DBA access, or EF Core query logging that exposes `EmailOtps.Payload` reveals every pending registration's plain-text password. This is a direct violation of OWASP A02:2021 (Cryptographic Failures). Users who reuse passwords across services are immediately compromised across all those services.

**Recommendation:**  
Hash the password before embedding it in the payload:

```csharp
// In AuthController.InitiateRegister, before serializing:
var payloadDto = new InitiateRegisterDto
{
    FirstName = dto.FirstName,
    LastName  = dto.LastName,
    UserName  = dto.UserName,
    Email     = dto.Email,
    ContactNo = dto.ContactNo,
    Password  = PasswordHasher.HashPassword(dto.Password),  // store hash, not plain text
    ForceResend = false
};
var payload = JsonSerializer.Serialize(payloadDto);
```

Then in `ConfirmRegister`, assign `pending.Password` directly to `user.PasswordHash` (it is already hashed), and call `LoginAsync` with the original password stored client-side (it never needs to travel to the server again after the initial initiation request).

Alternatively, restructure the flow: store only non-sensitive fields in the OTP payload, require the user to re-enter their password at the OTP confirmation step.

---

### CR-003 — Default Reset Password Exposed in API Response Body

| Field         | Value |
|---------------|-------|
| **Severity**  | Critical |
| **Actionable**| Yes — Remove password from response message |
| **Architecture** | Backend — Controller |
| **Category**  | Security / Sensitive Data Exposure |
| **Location**  | `Controllers/UsersController.cs` — `ResetPassword` action (admin-triggered reset) |

**Problem:**  
The admin-triggered password reset endpoint returns the newly generated default password in the `Message` field of the `ApiResponse` (e.g., `"Password has been reset to Az@12345"`). This default password is also hardcoded as a string literal in the controller. Any HTTP log, browser dev-tools network tab, API monitoring tool, or HTTPS-intercepting proxy will capture this password in plain text.

**Impact:**  
The default reset password is predictable and broadcast in the response. An attacker who observes a reset API call (MITM, log access, shared screen) immediately knows the target user's current password before the user changes it. Combined with the knowledge of the user's email (visible in the admin UI), this enables account takeover.

**Recommendation:**  
1. Generate a cryptographically random temporary password instead of using a hardcoded default.
2. Never include the password in the API response. Send it directly to the user's registered email address.
3. Force a password-change-on-next-login flag after admin reset.

```csharp
// Generate a random temporary password
var tempPassword = Convert.ToBase64String(RandomNumberGenerator.GetBytes(12));
user.PasswordHash = PasswordHasher.HashPassword(tempPassword);
user.MustChangePassword = true;
await _context.SaveChangesAsync();

// Email the temp password to the user's registered address
await _emailService.SendAsync(user.Email, "Your password has been reset",
    $"Your temporary password is: {tempPassword}. Please change it after logging in.");

return Ok(new ApiResponse<bool> { Success = true, Message = "Password reset. The user has been emailed their temporary password." });
```

---

### CR-004 — Mobile Number Login Loads Entire Users Table into Memory

| Field         | Value |
|---------------|-------|
| **Severity**  | Critical |
| **Actionable**| Yes — Filter at DB level or add computed column |
| **Architecture** | Backend — Service |
| **Category**  | Performance / Security |
| **Location**  | `Services/AuthService.cs` lines 51–57: `ToListAsync()` then in-memory `FirstOrDefault` |

**Problem:**  
When a user logs in with a mobile number (identifier without `@` that has 7+ digits), the code executes:

```csharp
var candidates = await _context.Users
    .Include(u => u.Role)
    .Where(u => u.ContactNo != null)
    .ToListAsync();   // ALL users with a phone number materialized into RAM
user = candidates.FirstOrDefault(u =>
    new string(u.ContactNo!.Where(char.IsDigit).ToArray()) == digits);
```

Every login attempt via mobile number reads every user record (with their Role navigation property) into application memory and performs digit-normalization in C#.

**Impact:**  
- With 1,000 users: ~1MB RAM per login request, ~1,000 DB rows transferred.
- With 100,000 users: ~100MB RAM per login, query time scales linearly.
- A bot performing concurrent mobile logins (already partially mitigated by rate limiting) can cause memory pressure and OOM.
- This is also a DoS vector since the rate limiter uses per-IP limits but the mobile login path is expensive per request.

**Recommendation:**  
Store a normalized (digits-only) version of the contact number in a separate indexed column, set on write:

```csharp
// On user create/update: normalize and store
user.ContactNoNormalized = new string(dto.ContactNo.Where(char.IsDigit).ToArray());
```

Then query directly:

```csharp
user = await _context.Users
    .Include(u => u.Role)
    .FirstOrDefaultAsync(u => u.ContactNoNormalized == digits);
```

Add an index: `HasIndex(u => u.ContactNoNormalized)` in `OnModelCreating`.

---

### CR-005 — EF Core DbContext Used Concurrently in Task.WhenAll (Thread-Safety Violation)

| Field         | Value |
|---------------|-------|
| **Severity**  | Critical |
| **Actionable**| Yes — Replace with sequential awaits or separate DbContext instances |
| **Architecture** | Backend — Service |
| **Category**  | Correctness / Concurrency |
| **Location**  | `Services/TaskService.cs` — `GetDashboardStatsAsync` method |

**Problem:**  
`GetDashboardStatsAsync` executes multiple EF Core queries against the same `_context` instance using `Task.WhenAll`:

```csharp
var results = await Task.WhenAll(
    _context.TaskEntities.CountAsync(...),
    _context.TaskEntities.CountAsync(...),
    _context.TaskEntities.CountAsync(...),
    _context.TaskEntities.CountAsync(...),
    _context.TaskEntities.CountAsync(...)
);
```

EF Core's `DbContext` is **explicitly documented as not thread-safe**. Concurrent operations on the same context can result in data corruption, race conditions in the change tracker, or runtime exceptions (`InvalidOperationException: A second operation was started on this context instance before a previous operation completed`).

**Impact:**  
Intermittent crashes or silent data corruption on the dashboard stats endpoint. The failure mode is non-deterministic and can be difficult to reproduce in low-load test environments but manifests under concurrent user load.

**Recommendation:**  
Replace `Task.WhenAll` with sequential awaits for EF Core queries on the same context:

```csharp
var total      = await _context.TaskEntities.CountAsync(...);
var inProgress = await _context.TaskEntities.CountAsync(...);
var completed  = await _context.TaskEntities.CountAsync(...);
var overdue    = await _context.TaskEntities.CountAsync(...);
var myTasks    = await _context.TaskEntities.CountAsync(...);
```

If true parallelism is needed, create separate `DbContext` instances per query using `IDbContextFactory<PMSDbContext>`.

---

## High Findings

---

### HI-001 — EmailOtps Table Grows Unbounded (No Cleanup)

| Field         | Value |
|---------------|-------|
| **Severity**  | High |
| **Actionable**| Yes — Add scheduled cleanup |
| **Architecture** | Backend — Data Layer / Service |
| **Category**  | Resilience / Data Management |
| **Location**  | `Services/OtpService.cs` — No cleanup logic exists |

**Problem:**  
The `EmailOtps` table accumulates rows indefinitely. Expired OTPs are marked `IsUsed = true` but never deleted. Every registration attempt, every forgotten password, and every resend adds a row. There is no background job, trigger, or periodic cleanup to remove old records.

**Impact:**  
Table bloat degrades query performance over months of production use. Index scans on `Email + Purpose + IsUsed + ExpiresAt` become slower as the table grows. On the remote SQL Server (sql.bsite.net with presumably limited storage), this could fill disk space.

**Recommendation:**  
Add a cleanup step to the existing `TaskTemplateSchedulerService` or create a new `IHostedService`:

```csharp
// In any scheduled background job:
var cutoff = AppClock.Now.AddDays(-7);
await _context.EmailOtps
    .Where(o => o.IsUsed || o.ExpiresAt < cutoff)
    .ExecuteDeleteAsync();  // EF Core 7+ bulk delete
```

---

### HI-002 — Synchronous Shims Using GetAwaiter().GetResult() Risk Deadlock

| Field         | Value |
|---------------|-------|
| **Severity**  | High |
| **Actionable**| Yes — Migrate callers to async |
| **Architecture** | Backend — Service |
| **Category**  | Correctness / Resilience |
| **Location**  | `Services/AuthorizationService.cs` — `IsSystemAdmin()`, `IsAdmin()`, `CanView()`, `CanCreate()`, `CanUpdate()`, `CanDelete()` synchronous wrapper methods |

**Problem:**  
`AuthorizationService` exposes synchronous wrapper methods that call `SomeMethodAsync().GetAwaiter().GetResult()`. In ASP.NET Core, calling `.GetAwaiter().GetResult()` or `.Result` on a `Task` that itself awaits I/O can deadlock when the synchronization context is captured. While ASP.NET Core does not use a single-threaded sync context by default, the pattern is fragile and will deadlock if ever called from a context that does (e.g., Blazor, unit tests using `xunit`'s sync context, or any middleware that wraps execution).

**Impact:**  
Thread-pool starvation and eventual application hang under load. Any test or middleware integration that restores a synchronization context will deadlock immediately.

**Recommendation:**  
All controller actions already use `async Task<IActionResult>`. Remove the synchronous shims from `AuthorizationService` and update all callers to `await` the async variants directly:

```csharp
// Before (in controller):
if (!_authService.CanView("/tasks")) return Forbid();

// After:
if (!await _authService.CanViewAsync("/tasks")) return Forbid();
```

---

### HI-003 — SaveChangesAsync Inside Inner Loop (N+1 DB Round Trips)

| Field         | Value |
|---------------|-------|
| **Severity**  | High |
| **Actionable**| Yes — Batch outside the loop |
| **Architecture** | Backend — Service |
| **Category**  | Performance |
| **Location**  | `Services/TaskTemplateService.cs` — `GenerateAsync` and `SaveItemsAsync` methods |

**Problem:**  
`GenerateAsync` and `SaveItemsAsync` call `_db.SaveChangesAsync()` inside a `foreach` loop over template items. For a template with N items, this results in N+1 database round trips (one SELECT to fetch the template plus one INSERT per item).

**Impact:**  
Generating a template with 52 tasks (as in the E2E scenario) results in 52 sequential database round trips instead of 1. On a remote SQL Server (sql.bsite.net with network latency), this can take tens of seconds and block the HTTP request thread during that time. Concurrent template generations compound the problem.

**Recommendation:**  
Add all entities to the change tracker inside the loop, then call `SaveChangesAsync` once after the loop:

```csharp
foreach (var item in templateItems)
{
    _db.TaskEntities.Add(BuildTaskFromTemplate(item, generation));
    // DO NOT call SaveChangesAsync here
}
await _db.SaveChangesAsync();  // single round trip
```

---

### HI-004 — JWT Access Token Stored in localStorage (XSS-Vulnerable)

| Field         | Value |
|---------------|-------|
| **Severity**  | High |
| **Actionable**| Yes — Prefer httpOnly cookie for refresh token at minimum |
| **Architecture** | Frontend — API Layer |
| **Category**  | Security / XSS |
| **Location**  | `ClientApp/src/lib/api.ts` — `localStorage.getItem('pms_token')` |

**Problem:**  
Both the JWT access token and the refresh token are stored in `localStorage` (`pms_token` and `pms_refresh_token`). Any JavaScript executing in the same origin — including XSS payloads injected via a third-party dependency, a reflected XSS in any template, or a compromised CDN — can read these tokens and exfiltrate them.

**Impact:**  
Complete session hijacking. An attacker who can execute JavaScript in the browser can steal both the access token and the refresh token, gaining persistent access (up to 7 days via the refresh token) to the victim's account. This is OWASP A07:2021 (Identification and Authentication Failures).

**Recommendation:**  
- Store the **refresh token** in an `httpOnly; Secure; SameSite=Strict` cookie set by the server. The backend already has a `POST /auth/refresh` endpoint — modify it to `Set-Cookie` the refresh token and read it from the cookie on the server side, never exposing it to JavaScript.
- The short-lived access token (15 minutes) can remain in memory (React state / context) for the session duration. It should **not** be persisted to `localStorage`.
- At minimum, audit all places where user-provided content is rendered to ensure it goes through React's default XSS escaping (no `dangerouslySetInnerHTML` with unsanitized content).

---

### HI-005 — ChatHub OnlineUsers Static Dictionary: Multi-Instance and Memory Leak Risk

| Field         | Value |
|---------------|-------|
| **Severity**  | High |
| **Actionable**| Yes — Use IMemoryCache or Redis-backed presence |
| **Architecture** | Backend — SignalR Hub |
| **Category**  | Correctness / Scalability |
| **Location**  | `Hubs/ChatHub.cs` — `static readonly ConcurrentDictionary<string, OnlineUserDto> OnlineUsers` |

**Problem:**  
The online user presence dictionary is a static field on the `ChatHub` class. This has two problems:

1. **Multi-instance failure:** If the application is ever load-balanced across multiple server instances (or restarted), each instance has its own static dictionary. A user connected to Instance A is not visible as online to a user connected to Instance B.

2. **Memory leak:** If `OnDisconnectedAsync` throws an exception (network error, unhandled exception) or is not called (process kill), the user's entry is never removed from the dictionary. The connection ID key becomes stale but the entry persists until the process restarts.

**Impact:**  
Phantom "online" users visible in the UI after disconnect. In a scaled-out deployment, inconsistent online status across instances. Memory growth proportional to connection churn.

**Recommendation:**  
Replace the static dictionary with `IMemoryCache` (single-instance) or a Redis-backed distributed cache (multi-instance). Use SignalR's built-in group mechanisms for presence tracking. Add a fallback expiry on entries (e.g., TTL of 5 minutes, refreshed on heartbeat).

---

### HI-006 — Activity Entity Added Before Transaction Scope in StartTaskAsync

| Field         | Value |
|---------------|-------|
| **Severity**  | High |
| **Actionable**| Yes — Move entity adds inside the transaction |
| **Architecture** | Backend — Service |
| **Category**  | Correctness / Data Integrity |
| **Location**  | `Services/TaskService.cs` — `StartTaskAsync` method, approximately line 670 |

**Problem:**  
In `StartTaskAsync`, `Activity` and `TaskStatusHistory` entities are added to the EF Core change tracker **before** `BeginTransactionAsync()` is called. The subsequent `SaveChangesAsync` inside the transaction then persists them. However, if the transaction itself fails to begin (due to connection loss, deadlock, or transaction rollback), the entities are already tracked and may be partially written or left in an inconsistent state depending on EF Core behavior with failed transactions.

**Impact:**  
Orphaned activity log entries or status history records that do not correspond to an actual task state change. Data integrity violation in the audit trail.

**Recommendation:**  
Move all `_context.Activities.Add(...)` and `_context.TaskStatusHistories.Add(...)` calls to inside the `using (var tx = await _context.Database.BeginTransactionAsync())` block, before the final `SaveChangesAsync`. This ensures all changes are atomic with the transaction.

---

### HI-007 — Report Queries Load All Tasks into Memory Without Server-Side Filtering

| Field         | Value |
|---------------|-------|
| **Severity**  | High |
| **Actionable**| Yes — Push filtering to DB layer |
| **Architecture** | Backend — Service |
| **Category**  | Performance / Scalability |
| **Location**  | `Services/ReportService.cs` — `GetUserTaskEffortAsync`, `GetUserDailyEffortAsync`, `GetEffortStatsAsync` |

**Problem:**  
Multiple report methods load all `TaskEntity` records (with status history and assignment history navigation properties) into application memory, then perform filtering, grouping, and calculation in C#. For example, `GetEffortStatsAsync` in `TaskService.cs` fetches all tasks, all status histories, and all assignment histories without any date range filter at the DB level.

**Impact:**  
With the 52-task E2E dataset this is tolerable, but with 1,000+ tasks across multiple projects, report generation will consume hundreds of MB of RAM per request and take many seconds. Concurrent report requests will cascade into OOM.

**Recommendation:**  
Push filtering, grouping, and aggregation to the database using EF Core LINQ that translates to SQL:

```csharp
// Instead of loading all then filtering:
var efforts = await _context.TaskStatusHistories
    .Where(h => h.ChangedAt >= dateFrom && h.ChangedAt <= dateTo)
    .Where(h => h.AssignedToId == userId)
    .GroupBy(h => h.Status)
    .Select(g => new { Status = g.Key, Count = g.Count() })
    .ToListAsync();
```

---

### HI-008 — N+1 Query in ProjectService.GetProjectByIdAsync LINQ Projection

| Field         | Value |
|---------------|-------|
| **Severity**  | High |
| **Actionable**| Yes — Use a join or Include |
| **Architecture** | Backend — Service |
| **Category**  | Performance |
| **Location**  | `Services/ProjectService.cs` — `GetProjectByIdAsync` |

**Problem:**  
The LINQ projection for project assignment history includes a correlated subquery per history item:

```csharp
PreviousOwnerName = _context.Users
    .Where(u => u.Id == h.PreviousOwnerId)
    .Select(u => u.FullName)
    .FirstOrDefault()
```

This executes one SQL `SELECT` per history record inside the outer projection. A project with 10 assignment history records generates 11 queries (1 + 10).

**Impact:**  
Latency scales linearly with the number of assignment history records. On a remote SQL Server, each round trip adds 50–200ms of network overhead.

**Recommendation:**  
Use a `Join` or `Include` with a `Select` projection:

```csharp
var history = await _context.ProjectAssignmentHistories
    .Where(h => h.ProjectId == projectId)
    .Join(_context.Users, h => h.PreviousOwnerId, u => u.Id, (h, u) => new AssignmentHistoryDto
    {
        PreviousOwnerName = u.FullName,
        // ...
    })
    .ToListAsync();
```

---

### HI-009 — SignalR accessTokenFactory Stale Closure in ChatContext

| Field         | Value |
|---------------|-------|
| **Severity**  | High |
| **Actionable**| Yes — Change to live token factory |
| **Architecture** | Frontend — SignalR / Context |
| **Category**  | Correctness / Security |
| **Location**  | `ClientApp/src/context/ChatContext.tsx` — SignalR connection builder |

**Problem:**  
The SignalR connection is configured with a stale closure over the token:

```typescript
const token = localStorage.getItem('pms_token') ?? '';
// ...
.withUrl('/hubs/chat', { accessTokenFactory: () => token })
```

The `token` variable is captured once at connection-build time. When the JWT access token is refreshed (every 15 minutes), the SignalR connection continues sending the old (expired) token for authentication on reconnect, causing the hub to reject the connection or silently use a stale identity.

**Impact:**  
After 15 minutes, SignalR reconnect attempts will fail with 401 errors. Users will appear to be connected but will receive no messages until they reload the page. Chat becomes unreliable for long-lived sessions.

**Recommendation:**  
Change `accessTokenFactory` to always read the current token from storage:

```typescript
.withUrl('/hubs/chat', { accessTokenFactory: () => localStorage.getItem('pms_token') ?? '' })
```

This ensures each reconnect attempt fetches the latest token.

---

### HI-010 — SystemAdmin Impersonation Loads All Admin Users for Password Comparison

| Field         | Value |
|---------------|-------|
| **Severity**  | High |
| **Actionable**| Yes — Target a single known admin or use a dedicated impersonation token |
| **Architecture** | Backend — Service |
| **Category**  | Security / Performance |
| **Location**  | `Services/AuthService.cs` lines 82–88: `ToListAsync()` then in-memory `FirstOrDefault` |

**Problem:**  
When a normal login attempt fails the user's own password check, the code loads ALL SystemAdmin users and calls `PasswordHasher.VerifyPassword` (a slow PBKDF2 operation) against each one:

```csharp
var admins = await _context.Users
    .Include(u => u.Role)
    .Where(u => u.RoleId == 1 && u.IsActive)
    .ToListAsync();

var matchingAdmin = admins.FirstOrDefault(a =>
    PasswordHasher.VerifyPassword(loginDto.Password, a.PasswordHash));
```

**Impact:**  
1. **Timing side-channel:** A failed password attempt for a regular user triggers multiple PBKDF2 verifications against all admin hashes. The response time for "user with wrong password" differs measurably from "user with correct own password", leaking information.
2. **DoS amplification:** An attacker who knows a valid email can trigger O(N_admins × PBKDF2_cost) work per failed login attempt, exhausting CPU.
3. **N+1 potential:** If there are many SystemAdmin users, loading all of them with `Include(u => u.Role)` is wasteful.

**Recommendation:**  
Either limit impersonation to a single well-known master key (a separate config value, not stored as a user password), or require the admin to explicitly identify themselves in a separate field rather than inferring their identity by trying all admin hashes.

---

## Medium Findings

---

### ME-001 — Missing AsNoTracking() on Read-Only Queries Throughout Backend

| Field         | Value |
|---------------|-------|
| **Severity**  | Medium |
| **Actionable**| Yes — Add AsNoTracking() to all list/get queries |
| **Architecture** | Backend — Data Layer |
| **Category**  | Performance |
| **Location**  | `Services/ProjectService.cs`, `Services/TaskService.cs`, `Services/UserService.cs`, `Services/RoleService.cs` — all `GetAll*` and `GetById*` methods |

**Problem:**  
Read-only queries (list endpoints, GET by ID, report queries) do not use `AsNoTracking()`. EF Core tracks every entity returned from a query in the change tracker, maintaining a snapshot for change detection. For read-only operations this tracking overhead is pure waste — the entities are never modified or saved back.

**Impact:**  
Increased memory usage (double-buffering: the entity + its snapshot) and slower query materialization for large result sets. On the paginated tasks endpoint (up to 500 records with 8 includes), this overhead is significant.

**Recommendation:**  
Add `.AsNoTracking()` to all read-only queries:

```csharp
var tasks = await _context.TaskEntities
    .AsNoTracking()
    .Include(t => t.Project)
    .Where(...)
    .ToListAsync();
```

For services that mix reads and writes, use `.AsNoTrackingWithIdentityResolution()` when navigation property deduplication matters.

---

### ME-002 — Missing Database Indexes on High-Cardinality Foreign Key Columns

| Field         | Value |
|---------------|-------|
| **Severity**  | Medium |
| **Actionable**| Yes — Add indexes via EF migration |
| **Architecture** | Backend — Data Layer |
| **Category**  | Performance |
| **Location**  | `Data/PMSDbContext.cs` — `OnModelCreating` fluent configuration |

**Problem:**  
Several frequently queried columns lack explicit indexes:

- `TaskEntity.ProjectId` — used in almost every task list query
- `TaskEntity.AssignedToId` — used in user task filtering
- `TaskEntity.Status` — used in status-based queries and dashboard stats
- `Activity.UserId` — used in activity feeds
- `Activity.Timestamp` — used in time-range queries
- `WorkDiary.UserId + Date` (composite) — used in diary lookups
- `ChatMessage.RoomId` — used in all message history queries
- `ChatMessage.SenderId` — used in message attribution queries
- `PageModule.Route` — used in every authorization check

**Impact:**  
Full table scans on these columns under load. A dashboard stats page querying task counts by status on a 10,000-row `TaskEntity` table will be noticeably slow without indexes on `Status` and `ProjectId`.

**Recommendation:**  
Add indexes in the EF Core fluent configuration:

```csharp
modelBuilder.Entity<TaskEntity>().HasIndex(t => t.ProjectId);
modelBuilder.Entity<TaskEntity>().HasIndex(t => t.AssignedToId);
modelBuilder.Entity<TaskEntity>().HasIndex(t => t.Status);
modelBuilder.Entity<Activity>().HasIndex(a => new { a.UserId, a.Timestamp });
modelBuilder.Entity<WorkDiary>().HasIndex(w => new { w.UserId, w.Date });
modelBuilder.Entity<ChatMessage>().HasIndex(m => m.RoomId);
modelBuilder.Entity<PageModule>().HasIndex(p => p.Route).IsUnique();
```

Then run `dotnet ef migrations add AddPerformanceIndexes && dotnet ef database update`.

---

### ME-003 — AuthorizationService Case-Insensitive Route Comparison Prevents Index Use

| Field         | Value |
|---------------|-------|
| **Severity**  | Medium |
| **Actionable**| Yes — Normalize route on write, compare directly |
| **Architecture** | Backend — Service |
| **Category**  | Performance |
| **Location**  | `Services/AuthorizationService.cs` — `HasPermissionAsync` method: `pm.Route.ToLower() == pageRoute.ToLower()` |

**Problem:**  
The authorization check for page routes uses `.ToLower()` on both sides of the comparison, which prevents SQL Server from using an index on the `Route` column (the expression `LOWER(Route) = LOWER(@route)` is not sargable unless the index is a function-based index).

**Impact:**  
Full table scan on `PageModules` for every authorization check. Since authorization runs on every API request, this affects every protected endpoint.

**Recommendation:**  
Store routes in lowercase at write time (normalize in the seeder and on create/update). Then compare directly:

```csharp
var pageRouteLower = pageRoute.ToLower();
var module = await _context.PageModules
    .FirstOrDefaultAsync(pm => pm.Route == pageRouteLower);
```

With a unique index on `PageModules.Route`, this becomes an O(log N) index seek.

---

### ME-004 — DataContext Fetches All Tasks Paginated at Startup (No Lazy Loading)

| Field         | Value |
|---------------|-------|
| **Severity**  | Medium |
| **Actionable**| Yes — Switch to on-demand or lazy loading |
| **Architecture** | Frontend — Context |
| **Category**  | Performance / UX |
| **Location**  | `ClientApp/src/context/DataContext.tsx` — `loadAllTasks` function |

**Problem:**  
On application startup (after login), `DataContext.loadAllTasks` fetches all tasks page by page (up to 500 per page) across all pages until exhausted. With 500+ tasks this means multiple sequential API calls that block the UI from showing real data.

**Impact:**  
Slow initial page load. The Tasks page, Dashboard, and any component using `DataContext.tasks` will show a loading state until all pages are fetched. In the 52-task E2E scenario this is one API call; with 1,000 tasks it becomes 2+ sequential API calls of 500 records each.

**Recommendation:**  
Load tasks lazily or on-demand per page/view rather than eagerly fetching everything at startup. Use server-side pagination at the view level: when the user navigates to Tasks, fetch page 1; when they scroll or paginate, fetch the next page. The backend already supports pagination (`page` and `pageSize` query parameters on `GET /api/tasks`).

---

### ME-005 — No Brute-Force Limit on OTP Validation Endpoint

| Field         | Value |
|---------------|-------|
| **Severity**  | Medium |
| **Actionable**| Yes — Add attempt counter |
| **Architecture** | Backend — Service |
| **Category**  | Security |
| **Location**  | `Services/OtpService.cs` — `ValidateAndConsumeAsync` and `Controllers/AuthController.cs` — `ConfirmRegister`, `ResetPassword` |

**Problem:**  
The OTP validation endpoints (`POST /api/auth/register/confirm`, `POST /api/auth/reset-password`) have no limit on the number of incorrect OTP attempts. The rate limiter in `LoginRateLimitMiddleware` applies to `login`, `refresh`, `forgot-password`, and `register/initiate` — but not to `register/confirm` or `reset-password`.

**Impact:**  
An attacker with a valid email and a pending OTP has 2 minutes to guess a 6-digit code. Without a limit, they can try all 1,000,000 combinations (or at least 1,000,000 / (rate per second) within 2 minutes). At 100 requests/second, 12,000 attempts fit in 2 minutes — enough to have a ~1.2% chance of guessing correctly by random chance.

**Recommendation:**  
1. Add OTP attempt rate limiting to the middleware's protected path list.
2. Track failed attempts per OTP record and invalidate after 5 failures:
   ```csharp
   // Add FailedAttempts column to EmailOtps
   if (record.FailedAttempts >= 5) { record.IsUsed = true; await _context.SaveChangesAsync(); return null; }
   record.FailedAttempts++;
   ```

---

### ME-006 — Rate Limiter ConcurrentDictionary Grows Unbounded (Memory Leak)

| Field         | Value |
|---------------|-------|
| **Severity**  | Medium |
| **Actionable**| Yes — Add eviction or use IMemoryCache |
| **Architecture** | Backend — Middleware |
| **Category**  | Resilience / Memory |
| **Location**  | `Middleware/LoginRateLimitMiddleware.cs` — `static readonly ConcurrentDictionary<string, Queue<DateTime>> _hits` |

**Problem:**  
The rate limiter maintains a `ConcurrentDictionary` keyed by IP address. Stale entries (IPs that have not made requests in over 60 seconds) are never removed. An attacker cycling through source IPs will continuously add new keys to the dictionary with no eviction.

**Impact:**  
Long-running server processes will accumulate all unique source IPs ever seen, consuming unbounded memory. In an internet-facing deployment, this can be exploited as a memory exhaustion DoS by sending single requests from millions of unique IPs.

**Recommendation:**  
Replace the `Queue<DateTime>` per IP with `IMemoryCache` entries that auto-expire:

```csharp
_cache.Set(ip, hits, new MemoryCacheEntryOptions
{
    SlidingExpiration = TimeSpan.FromSeconds(60)
});
```

---

### ME-007 — IsUserAdminAsync: Repeated Per-Method DB Lookup Without Caching

| Field         | Value |
|---------------|-------|
| **Severity**  | Medium |
| **Actionable**| Yes — Cache result for request lifetime |
| **Architecture** | Backend — Service |
| **Category**  | Performance |
| **Location**  | `Services/TaskService.cs` — `IsUserAdminAsync` called from multiple methods |

**Problem:**  
`IsUserAdminAsync` performs a `_context.Users.Include(u => u.Role).FirstOrDefaultAsync(u => u.Id == userId)` on every call. Several `TaskService` methods call this before executing their main logic, resulting in multiple `Users` table queries per HTTP request.

**Impact:**  
2–5 extra DB round trips per task operation. On a remote SQL Server, this adds 100–500ms of latency per complex task request.

**Recommendation:**  
Cache the admin status for the request scope using a private nullable field on the (already-scoped) `TaskService`:

```csharp
private bool? _cachedIsAdmin;
private int?  _cachedAdminUserId;

private async Task<bool> IsUserAdminAsync(int userId)
{
    if (_cachedAdminUserId == userId && _cachedIsAdmin.HasValue)
        return _cachedIsAdmin.Value;

    var user = await _context.Users.Include(u => u.Role)
        .AsNoTracking()
        .FirstOrDefaultAsync(u => u.Id == userId);

    _cachedIsAdmin    = user?.RoleId == 1 || (user?.Role?.IsAdmin ?? false);
    _cachedAdminUserId = userId;
    return _cachedIsAdmin.Value;
}
```

---

### ME-008 — Password Transmitted in ResendOTP Request Body (Register Flow)

| Field         | Value |
|---------------|-------|
| **Severity**  | Medium |
| **Actionable**| Yes — Remove password from resend payload |
| **Architecture** | Frontend / Backend |
| **Category**  | Security |
| **Location**  | `ClientApp/src/pages/Auth.tsx` lines 279–283: `handleResendOtp` for `purpose === 'register'` |

**Problem:**  
When resending the OTP during registration, the frontend sends the full registration payload including the user's password:

```typescript
await apiRequest('/auth/register/initiate', {
    method: 'POST',
    body: JSON.stringify({ firstName, lastName, email, contactNo, password: regPassword, forceResend: true }),
});
```

This means the user's plain-text password is sent over the network on every "Resend OTP" click, not just on initial registration.

**Impact:**  
Every additional network transmission of the plain-text password increases the exposure window. It also appears in server-side request logs if verbose logging is enabled.

**Recommendation:**  
The resend endpoint should not require the password. The pending registration data (including the hashed password after the CR-002 fix) is already stored in `EmailOtps.Payload`. Remove `password` from the resend request body. If the server needs to re-validate the request, use only `email` and `forceResend: true`.

---

### ME-009 — AuthContext Stores User Data (Including Role/Permissions) in localStorage

| Field         | Value |
|---------------|-------|
| **Severity**  | Medium |
| **Actionable**| Yes — Store only non-sensitive identity in localStorage |
| **Architecture** | Frontend — Context |
| **Category**  | Security |
| **Location**  | `ClientApp/src/context/AuthContext.tsx` — `localStorage.setItem('pms_user', ...)` |

**Problem:**  
The full `UserDto` object (including `RoleId`, `RoleName`, `IsAdmin`, `IsImpersonated`, `ImpersonatedByName`) is serialized and stored in `localStorage.pms_user`. These values are security-sensitive: they determine what UI elements are shown and what actions are permitted client-side.

**Impact:**  
XSS can read and modify `pms_user` to forge a higher-privileged identity in the client. While server-side authorization is authoritative, a tampered `pms_user` can cause the UI to display admin controls to a regular user (UX disclosure).

**Recommendation:**  
Store only the user's ID and display name in `localStorage`. Re-derive role and permissions on login from the server's `/auth/validate` response, stored in React state (memory) only. If persistence across page refreshes is needed, use `sessionStorage` instead of `localStorage` (cleared when tab closes).

---

### ME-010 — SmtpClient Has No Connect/Send Timeout

| Field         | Value |
|---------------|-------|
| **Severity**  | Medium |
| **Actionable**| Yes — Set timeout |
| **Architecture** | Backend — Service |
| **Category**  | Resilience |
| **Location**  | `Services/EmailService.cs` — `SendAsync` method |

**Problem:**  
The `MailKit` SMTP client is configured without explicit timeouts for connection and message sending. If Gmail's SMTP server is unreachable or slow, the `ConnectAsync` or `SendAsync` call will block the thread indefinitely (or until the socket's OS default timeout, which can be 2+ minutes).

**Impact:**  
During a Gmail SMTP outage, every OTP email send blocks an ASP.NET Core request thread for up to 2 minutes. With enough concurrent registrations or password resets, all thread pool threads can be exhausted, causing a complete application hang.

**Recommendation:**  
Use a `CancellationTokenSource` with a timeout:

```csharp
using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(15));
await client.ConnectAsync(host, port, SecureSocketOptions.StartTls, cts.Token);
await client.AuthenticateAsync(username, password, cts.Token);
await client.SendAsync(message, cts.Token);
```

---

### ME-011 — RecalculateTaskProgressAsync Auto-Submits to In-Review (Bypasses Manual Trigger)

| Field         | Value |
|---------------|-------|
| **Severity**  | Medium |
| **Actionable**| Yes — Make auto-submit configurable or document explicitly |
| **Architecture** | Backend — Service |
| **Category**  | Correctness / Business Logic |
| **Location**  | `Services/TaskService.cs` — `RecalculateTaskProgressAsync` |

**Problem:**  
When all checklist items are completed (progress = 100%), `RecalculateTaskProgressAsync` automatically transitions the task status to `under-review`. This bypasses the intentional manual submission step: the task state machine (`AllowedEdges`) requires an explicit action to move from `in-progress` to `under-review`, but the progress recalculation short-circuits this.

**Impact:**  
A task assignee who completes all checklist items will have their task automatically submitted for review without explicitly choosing to do so. This may be intentional UX, but it bypasses the state machine's intended manual transition.

**Recommendation:**  
Document whether this is intentional and confirm with stakeholders. If the intent is that developers must explicitly submit for review, remove the auto-submission from `RecalculateTaskProgressAsync`. If auto-submission on 100% checklist completion is desired, document it in `Phase8_Business_Rules.md` and ensure the frontend informs users with a clear notification.

---

### ME-012 — Username Uniqueness Check in ConfirmRegister Uses Sequential Loop (Race-Prone)

| Field         | Value |
|---------------|-------|
| **Severity**  | Medium |
| **Actionable**| Yes — Add unique DB constraint and handle exception |
| **Architecture** | Backend — Controller |
| **Category**  | Correctness / Concurrency |
| **Location**  | `Controllers/AuthController.cs` lines 122–127: sequential `AnyAsync` in a `while` loop |

**Problem:**  
Username uniqueness during registration is checked with:

```csharp
int s = 1;
while (await _context.Users.AnyAsync(u => u.UserName.ToLower() == baseUsername + s)) s++;
userName = baseUsername + s;
```

Between the check and the insert, a concurrent registration with the same base username can claim the same `userName`. This is a classic TOCTOU (Time of Check, Time of Use) race condition.

**Impact:**  
Two users registering with the same email prefix simultaneously may both get assigned the same generated username, violating uniqueness. If no unique constraint exists on `UserName`, duplicate usernames can appear in the system.

**Recommendation:**  
1. Ensure a unique index exists on `Users.UserName` in the database.
2. Wrap the insert in a try/catch for `DbUpdateException` with a unique constraint violation and retry:

```csharp
bool saved = false;
while (!saved)
{
    try { await _context.SaveChangesAsync(); saved = true; }
    catch (DbUpdateException ex) when (IsUniqueConstraintViolation(ex))
    {
        s++; user.UserName = baseUsername + s;
    }
}
```

---

## Low Findings

---

### LO-001 — Hardcoded Indian Public Holiday / Saturday Rule in WorkDiaryService

| Field         | Value |
|---------------|-------|
| **Severity**  | Low |
| **Actionable**| Yes — Externalize to configuration |
| **Architecture** | Backend — Service |
| **Category**  | Maintainability |
| **Location**  | `Services/WorkDiaryService.cs` — `IsWorkingDay` method |

**Problem:**  
The working day calculation hardcodes the Indian 2nd and 4th Saturday off-day rule. This is not configurable and cannot accommodate different regional calendars, company-specific holiday lists, or different work week conventions.

**Recommendation:**  
Externalize the working-day rule to configuration. At minimum, add a `WorkingDays` config section specifying which days of the week are working days. For public holidays, consider a seeded `HolidayCalendar` table.

---

### LO-002 — avatarUrl Claim Never Added to JWT But ChatHub Reads It

| Field         | Value |
|---------------|-------|
| **Severity**  | Low |
| **Actionable**| Yes — Either add the claim or remove the read |
| **Architecture** | Backend — Hub / Service |
| **Category**  | Correctness |
| **Location**  | `Hubs/ChatHub.cs` — `OnConnectedAsync`: `User.FindFirst("avatarUrl")?.Value` · `Services/AuthService.cs` — `GenerateJwtToken`: claim never added |

**Problem:**  
`ChatHub.OnConnectedAsync` reads an `avatarUrl` claim from the JWT to populate the online user's avatar. However, `AuthService.GenerateJwtToken` never adds an `avatarUrl` claim to the token. The result is that `avatarUrl` is always `null` for online users in the presence dictionary.

**Recommendation:**  
Add the `avatarUrl` claim in `GenerateJwtToken`:

```csharp
if (!string.IsNullOrEmpty(user.AvatarUrl))
    claims.Add(new Claim("avatarUrl", user.AvatarUrl));
```

---

### LO-003 — Dead Code: JwtService Class in AuthService.cs

| Field         | Value |
|---------------|-------|
| **Severity**  | Low |
| **Actionable**| Yes — Delete the class |
| **Architecture** | Backend — Service |
| **Category**  | Code Quality |
| **Location**  | `Services/AuthService.cs` — `JwtService` class (noted in CLAUDE.md as dead code, not registered in DI) |

**Problem:**  
A `JwtService` class exists in `AuthService.cs` but is not registered in the DI container and is never called. It duplicates JWT generation logic that is already in `AuthService.GenerateJwtToken`. It risks a future developer accidentally using the wrong implementation.

**Recommendation:**  
Delete the `JwtService` class entirely.

---

### LO-004 — await Omitted on Response.WriteAsync in Rate Limiter Middleware

| Field         | Value |
|---------------|-------|
| **Severity**  | Low |
| **Actionable**| Yes — Add await |
| **Architecture** | Backend — Middleware |
| **Category**  | Code Quality / Correctness |
| **Location**  | `Middleware/LoginRateLimitMiddleware.cs` — rate limit exceeded response write |

**Problem:**  
`ctx.Response.WriteAsync(...)` is called without `await`. This is a fire-and-forget async call: the middleware returns without waiting for the response to be flushed, which can cause the response to be incomplete.

**Recommendation:**  
Add `await`:

```csharp
await ctx.Response.WriteAsync("{\"success\":false,\"message\":\"Too many requests. Please try again later.\"}");
```

---

### LO-005 — GenerateJwtToken Uses DateTime.UtcNow Instead of AppClock.Now

| Field         | Value |
|---------------|-------|
| **Severity**  | Low |
| **Actionable**| Yes — Replace with AppClock.Now |
| **Architecture** | Backend — Service |
| **Category**  | Testability |
| **Location**  | `Services/AuthService.cs` line 330: `expires: DateTime.UtcNow.AddMinutes(expiryMin)` |

**Problem:**  
`GenerateJwtToken` uses `DateTime.UtcNow` directly for token expiry, bypassing the `AppClock` abstraction. The CLAUDE.md convention explicitly states: "Use `AppClock.Now` instead of `DateTime.UtcNow` for testability."

**Recommendation:**  
Replace with `AppClock.Now.AddMinutes(expiryMin)`.

---

### LO-006 — `any` Cast in AuthContext for Property Name Mismatch

| Field         | Value |
|---------------|-------|
| **Severity**  | Low |
| **Actionable**| Yes — Fix DTO field naming or serialization policy |
| **Architecture** | Frontend — Context |
| **Category**  | Code Quality |
| **Location**  | `ClientApp/src/context/AuthContext.tsx`: `response.user.fullName || (response.user as any).FullName` |

**Problem:**  
The code uses `as any` to handle a property name mismatch between the frontend type (`fullName`) and the server response (`FullName`). This suppresses TypeScript type checking.

**Recommendation:**  
Verify that `JsonNamingPolicy.CamelCase` is configured globally in `Program.cs`. Then remove the `as any` cast and use `response.user.fullName` directly. If the mismatch is real, fix the serialization policy so all API responses use camelCase consistently.

---

### LO-007 — typingTimerRef Not Cleared in ChatContext Cleanup

| Field         | Value |
|---------------|-------|
| **Severity**  | Low |
| **Actionable**| Yes — Add clearTimeout in cleanup |
| **Architecture** | Frontend — Context |
| **Category**  | Correctness / Memory |
| **Location**  | `ClientApp/src/context/ChatContext.tsx` — `useEffect` cleanup function |

**Problem:**  
`typingTimerRef.current` (a `setTimeout` handle used to clear the "typing..." indicator) is not cleared in the `useEffect` cleanup function. If the component unmounts while a typing timer is pending, the timer fires into an unmounted component.

**Recommendation:**  
Add to the cleanup function:

```typescript
return () => {
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    connection.stop();
};
```

---

## Prioritized Improvement Plan

### Phase 1 — Immediate (Before Next Production Deployment)

| Priority | Finding | Effort | Risk if Deferred |
|----------|---------|--------|------------------|
| 1 | CR-001: Rotate and externalize SMTP password | 30 min | Account compromise |
| 2 | CR-002: Hash password before storing in OTP payload | 2 hours | DB breach exposes all pending passwords |
| 3 | CR-003: Remove default password from reset response | 1 hour | Account takeover via log exposure |
| 4 | CR-005: Fix concurrent DbContext usage in dashboard | 1 hour | Data corruption / runtime crashes |
| 5 | HI-002: Remove .GetAwaiter().GetResult() shims | 3 hours | Application deadlock under load |

### Phase 2 — Short-Term (Next Sprint)

| Priority | Finding | Effort | Risk if Deferred |
|----------|---------|--------|------------------|
| 6 | CR-004: Fix mobile login full-table scan | 4 hours | OOM / DoS vector |
| 7 | HI-004: Move tokens from localStorage to memory/httpOnly cookie | 1 day | XSS session theft |
| 8 | HI-009: Fix SignalR stale token closure | 30 min | Chat breaks after 15 min |
| 9 | HI-003: Batch SaveChangesAsync in TaskTemplateService | 2 hours | Slow template generation |
| 10 | ME-002: Add missing database indexes | 2 hours | Query performance degradation at scale |
| 11 | ME-001: Add AsNoTracking() to read queries | 2 hours | Excess memory usage per request |

### Phase 3 — Medium-Term (Within 4 Weeks)

| Priority | Finding | Effort |
|----------|---------|--------|
| 12 | HI-001: Add OTP table cleanup job | 2 hours |
| 13 | HI-006: Move entity adds inside transaction | 1 hour |
| 14 | HI-007: Push report filtering to DB | 1 day |
| 15 | HI-008: Fix N+1 in ProjectService | 2 hours |
| 16 | ME-005: Add brute-force limit to OTP validation | 3 hours |
| 17 | ME-006: Fix rate limiter memory leak | 2 hours |
| 18 | ME-007: Cache IsUserAdminAsync result | 1 hour |
| 19 | ME-010: Add SMTP timeout | 30 min |

### Phase 4 — Backlog

| Priority | Finding | Effort |
|----------|---------|--------|
| 20 | HI-005: Replace static OnlineUsers with IMemoryCache | 4 hours |
| 21 | HI-010: Redesign impersonation mechanism | 1 day |
| 22 | ME-003: Normalize routes for index use | 1 hour |
| 23 | ME-004: Lazy-load tasks in DataContext | 1 day |
| 24 | ME-008: Remove password from resend payload | 1 hour |
| 25 | ME-009: Move role data out of localStorage | 2 hours |
| 26 | ME-011: Confirm/document auto-submit behavior | 1 hour |
| 27 | ME-012: Add unique constraint + retry on username collision | 2 hours |
| 28 | All LO-* findings | 1 day total |

---

## Quick Wins

These findings can be fixed in under 30 minutes each and should be done immediately:

1. **LO-004** — Add `await` to `ctx.Response.WriteAsync` in rate limiter middleware (5 min).
2. **LO-005** — Replace `DateTime.UtcNow` with `AppClock.Now` in `GenerateJwtToken` (5 min).
3. **LO-007** — Clear `typingTimerRef` in ChatContext cleanup (5 min).
4. **HI-009** — Fix SignalR `accessTokenFactory` stale closure (10 min).
5. **LO-002** — Add `avatarUrl` claim to JWT token (10 min).
6. **ME-010** — Add 15-second timeout to SMTP client (15 min).
7. **LO-003** — Delete dead `JwtService` class (5 min).

---

## Systemic Architectural Concerns

### 1. No Centralized Secret Management

The codebase has multiple secrets in `appsettings.json`: DB connection string (intentional per F-02), SMTP password (CR-001), and JWT key (intentional per F-06). There is no mechanism to rotate secrets without redeploying, no secret manager integration, and no separation between development and production secrets. This is a systemic risk for any production deployment.

**Systemic Fix:** Integrate with a secrets manager (Azure Key Vault, HashiCorp Vault, or AWS Secrets Manager) and use `AddAzureKeyVault()` / `AddEnvironmentVariables()` in `Program.cs` to overlay production secrets over `appsettings.json` defaults.

---

### 2. DbContext Used as a Shared Unit-of-Work Across Unrelated Operations

The scoped `PMSDbContext` is shared across all service calls within a request. This means that operations from Service A and Service B within the same request share a change tracker, and a `SaveChangesAsync` in Service B can persist uncommitted changes from Service A. The discovered `Task.WhenAll` issue (CR-005) is a symptom of this architecture.

**Systemic Fix:** Consider using `IDbContextFactory<PMSDbContext>` to create short-lived contexts per logical unit of work, especially for parallel operations and background jobs.

---

### 3. No Structured Logging / Observability

The codebase uses `ILogger` in some services but there is no structured logging, no correlation ID middleware, no distributed tracing (Sentry DSN is configured but empty), and no health check endpoint. Diagnosing production issues is difficult without these.

**Systemic Fix:**
- Add Serilog with structured logging (JSON output to file + seq/Loki).
- Add a correlation ID middleware that stamps each request with a `X-Request-Id` header.
- Register `app.MapHealthChecks("/health")` with DB connectivity check.
- Fill in the Sentry DSN for exception monitoring.

---

### 4. Frontend Has No Content Security Policy (CSP)

The SPA is served as static files by ASP.NET Core with no `Content-Security-Policy` response header. Without CSP, any injected inline script (XSS) can freely access `localStorage`, call APIs, and exfiltrate data. This makes HI-004 (localStorage token storage) significantly more dangerous.

**Systemic Fix:** Add a CSP header in `Program.cs` middleware:

```csharp
app.Use(async (ctx, next) =>
{
    ctx.Response.Headers.Append("Content-Security-Policy",
        "default-src 'self'; script-src 'self'; connect-src 'self' ws://localhost:5178 wss://localhost:5178;");
    await next();
});
```

---

### 5. No Integration or End-to-End Tests

Based on the codebase scan, there are no test projects (`*.Tests.csproj`, `**/*.test.ts`, `**/*.spec.ts`). All validation is done via the manual `E2E_Prompt.md` script. Without automated tests, regressions in the task state machine, permission model, or auth flow are not caught until they reach production.

**Systemic Fix:**
- Add xUnit integration tests for `TaskService.ValidateStatusTransition` (state machine), `AuthService.LoginAsync` (all login paths), and `AuthorizationService.HasPermissionAsync`.
- Add Vitest unit tests for `usePermissions`, `DataContext` state transitions, and form validation.
- Wire tests into a CI pipeline (GitHub Actions or Azure DevOps).

---

### 6. Single Remote Database With No Failover or Connection Resiliency

All data is stored on `sql.bsite.net` (a free/shared SQL Server host) with no read replica, failover, backup validation, or connection resiliency configured in EF Core. Connection loss means total application unavailability.

**Systemic Fix:**
- Enable EF Core connection resiliency: `options.UseSqlServer(conn, o => o.EnableRetryOnFailure(3, TimeSpan.FromSeconds(5), null))`.
- Configure a regular automated backup and validate restore procedures.
- Consider migrating to a managed database service (Azure SQL, Supabase, Neon) with built-in HA.

---

*End of Review — 34 findings across 5 severity levels*  
*Generated by Claude Sonnet 4.6 (Claude Code)*
