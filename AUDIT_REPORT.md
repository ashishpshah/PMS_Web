# PMS — Production Readiness Audit Report (Re-Audit)

**Date:** 2026-08-26
**Auditor:** Claude Sonnet 5 (Automated Audit)
**Project:** Padhya Software Technologies — Project Management System
**Scope:** Full-stack codebase (ASP.NET Core 6 + React 19 + TypeScript 5.8)
**Baseline:** [AUDIT_REPORT.md](./AUDIT_REPORT.md) dated 2026-07-09 (36 findings, score 60.55/100)
**Commits since baseline reviewed:** `036a82b` … `a8ce238` (15 commits, 2026-08-20 → 2026-08-25 by repository timestamp; see Appendix C for the caveat on git history continuity)

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
- [Appendix A: Files Reviewed](#appendix-a-files-reviewed)
- [Appendix B: Test Coverage Assessment](#appendix-b-test-coverage-assessment)
- [Appendix C: Delta vs. 2026-07-09 Audit](#appendix-c-delta-vs-2026-07-09-audit)

---

## 1. Executive Summary

### Overall Health

Six weeks after the previous audit, the codebase has had a genuinely substantial, security-and-quality-focused pass applied to it — not just feature work. The single biggest change is a brand-new **`Validators/` + `Filters/ValidationFilter.cs` FluentValidation layer** (documented in [VALIDATION_PARITY_REPORT.md](./VALIDATION_PARITY_REPORT.md), dated 2026-08-21) that closes almost every backend validation gap the previous audit flagged — Auth, Roles, and Projects DTOs went from **zero** server-side validation to fully validated, task attachments gained magic-byte file-type verification, and chat/comment fields gained length caps. Alongside that, `AuthorizationService` now caches all per-request permission lookups in 3 bulk queries instead of issuing 2 queries per permission check (fixing the old N+1), `DataContext` no longer bulk-loads every task on login, `window.prompt()` was replaced with a proper modal, the OTP registration payload now stores a password **hash** instead of plaintext, `BackupController` was fully commented out (removing its 500-crash risk), and a **13-file, ~1,900-line Playwright E2E suite** now exists under `ClientApp/e2e/` covering auth, tasks, roles, projects, users, chat, dashboard, navigation, and permissions — a real answer to the old report's "no frontend tests" finding.

However, the **fixed-constraint security items remain unchanged by design** (DB credentials, JWT key, and unconditional Swagger — all explicitly accepted per CLAUDE.md's F-02/F-03/F-06), and several **non-accepted HIGH findings from the previous audit persist untouched**: CORS is still hardcoded to `localhost` origins only, the refresh token is still written to `localStorage` as a fallback, the login rate limiter is still a single-instance in-memory `ConcurrentDictionary`, and — most notably — **username login is still not implemented**, despite CLAUDE.md continuing to document it as a supported, case-sensitive login path. Two large frontend files (`Tasks.tsx`, `Dashboard.tsx`) grew rather than shrank since the last audit (3,152 and 1,588 lines respectively), and backend automated test coverage (`PMS.Tests/`) is essentially unchanged at 3 files. No CI/CD pipeline exists.

Net effect: the application moved from "broadly complete but insecure at the edges" to "broadly complete, meaningfully hardened at the input-validation layer, but still carrying the same short list of production blockers it had six weeks ago, plus normal codebase growth in the areas already flagged as technical debt."

### Go/No-Go Recommendation

**CONDITIONAL GO** for internal/demo deployment — unchanged from the previous audit, but on firmer footing now that input validation and several correctness bugs are fixed. **NO-GO for external production launch** until CORS, the refresh-token storage pattern, and username login are resolved (the fixed-constraint items are explicitly out of scope for this gate per the project owner's decision).

### Production Readiness Score: **67 / 100** (▲ +6.45 vs. 60.55/100 on 2026-07-09)

| Dimension | Previous (07-09) | Current (08-26) | Δ | Notes |
|---|---|---|---|---|
| Security | 38/100 | 47/100 | +9 | Validation layer, OTP hash, magic-byte upload check land; CORS/rate-limiter/localStorage RT still open |
| Architecture | 78/100 | 79/100 | +1 | Permission caching + slimmer DataContext offset by Tasks.tsx/Dashboard.tsx growth |
| Feature Completeness | 85/100 | 90/100 | +5 | Task attachments now fully wired; role-wise dashboard widgets, presence tracking added |
| Performance | 68/100 | 76/100 | +8 | N+1 permission checks fixed, mass task load on login removed; effort-stats query still unbounded on the lower end, indexes still missing |
| UX/Accessibility | 55/100 | 55/100 | 0 | window.prompt fixed; aria-label/focus-trap gaps unchanged |
| Test Coverage | 20/100 | 38/100 | +18 | E2E suite is new and substantial; backend unit tests unchanged; no CI |
| Ops/Monitoring | 35/100 | 35/100 | 0 | No security headers, no CI, Sentry frontend still unwired |

*(Weighted total recomputed in [§19](#19-production-readiness-score--gono-go-recommendation) using Security 25% / Architecture 20% / Feature Completeness 20% / Performance 15% / UX-Accessibility 10% / Test Coverage 5% / Ops-Monitoring 5%.)*

### Summary of Status Changes vs. Previous Audit

| Status | Count | Examples |
|---|---|---|
| **RESOLVED** | 11 | OTP plaintext password, `window.prompt()`, BackupController crash, AuthorizationService N+1, DataContext mass-load, task attachments missing, `PausedSeconds` (org-wide stats), `Task.dueDate` type bug (feature removed), working-hours frontend duplication, task-attachment upload lacked magic-byte check, two divergent 400 shapes |
| **PARTIALLY RESOLVED** | 3 | Effort-stats full-table load (now upper-bounded, still unbounded below), `PausedSeconds` (still 0 in per-task per-user breakdown), missing indexes (EmailOtp composite index added, Task/History indexes still missing) |
| **PERSISTS** | 15 | DB creds/SMTP/JWT (accepted), CORS, Swagger (accepted), rate limiter in-memory, refresh token in localStorage, username login missing, permissive View default, dead code (DatabaseBackupService, Models placeholders), Tasks.tsx/DataContext size, GeneralDtos.cs size, no change-password endpoint, no chat edit/delete, no pagination on Users/Projects/Roles/Activities, aria-label/focus-trap gaps, no security headers, no CI/CD |
| **CORRECTED (false positive from this and the previous audit)** | 1 | `Services/JwtService.cs` is not dead code — it holds the live `PasswordHasher` class. See §16.15. |
| **N/A** | 1 | `Task.dueDate` optional/null-guard bug — the `DueDate` column and field were removed from the domain entirely |
| **NEW since 07-09** | 6 | See [§16.9–16.14](#169-new-outdated-manual-username-login-documentation-vs-code) and [Appendix C](#appendix-c-delta-vs-2026-07-09-audit) |

---

## 2. Architecture Review

### 2.1 Backend Architecture

**Strengths (unchanged or improved):**
- Controller → Service → Data layering remains clean; `ApiResponse<T>` envelope is universal.
- **NEW:** A global `ValidationFilter` (`Filters/ValidationFilter.cs`) now runs before every action, merging DataAnnotations + FluentValidation failures into one `ApiResponse<T>` 400 shape (`Program.cs:43-50`). `AddValidatorsFromAssemblyContaining<LoginDtoValidator>()` (`Program.cs:55`) registers 30+ validators across 8 new files in `Validators/`.
- **NEW:** `AuthorizationService.EnsurePermissionsAsync` (`Services/AuthorizationService.cs:64-93`) now loads `PageModules`, `UserPagePermissions`, and `RolePagePermissions` in 3 bulk queries per request and caches the resulting route→bitmap map in `_routePermCache`, replacing the old per-check 2-query pattern. This resolves the previous audit's §4.2 N+1 finding.
- **NEW:** `Services/OnlineUserTracker.cs` — a `ConcurrentDictionary`-backed singleton tracking SignalR connection → user presence, registered as `AddSingleton<IOnlineUserTracker, OnlineUserTracker>()` (`Program.cs:142`). Backs a presence feature not covered by the previous audit.
- `BackupController.cs` is now **entirely commented out** (all 33 lines), removing the DI-crash risk the previous audit flagged as a confirmed bug (§16.3 in the old report).
- Live DB connectivity was confirmed during this audit — `dotnet ef migrations list` successfully reached the remote `sql.bsite.net` SQL Server and reported 17 applied migrations with none pending, tail `20260825103232_RemoveDueDateColumns`.

**Concerns (persist or new):**
- `GeneralDtos.cs` grew from 927 to **1,139 lines** — the single-file-DTO anti-pattern flagged previously has gotten larger, not smaller.
- `Data/PMSDbContext.cs` is now **1,137 lines** (entities + fluent config in one file, as before).
- `Services/JwtService.cs` (33 lines) — **correction to this audit's own initial pass, and to the previous audit's §14.1 which this report had carried forward without re-reading the file's contents:** despite its filename, this file no longer defines a `JwtService` class at all (confirmed: no `class JwtService` anywhere in the repo). It currently holds the live, actively-used `PasswordHasher` static class (PBKDF2 via `Microsoft.AspNetCore.Cryptography.KeyDerivation`, `Services/JwtService.cs:7-32`), called directly (no DI needed — it's `static`) from `Services/AuthService.cs`, `Controllers/AuthController.cs`, `Services/UserService.cs`, `Controllers/UsersController.cs`, and `Services/DatabaseInitializer.cs`. **This file is not dead code; it is the password-hashing implementation for the entire app.** The only real issue is the misleading filename (`JwtService.cs` housing `PasswordHasher`, with no JWT logic inside it) — see the corrected finding in §14.1.
- `Services/DatabaseBackupService.cs` (58 lines) remains present and unregistered — now genuinely inert (its only consumer, `BackupController`, is fully commented out), so the crash risk is gone but the dead file remains.
- A new migration, `20260825103232_RemoveDueDateColumns.cs`, dropped `Tasks.DueDate` and `TaskTemplateItems.DueDateOffsetDays` from the schema, but `DTOs/GeneralDtos.cs:937` (`SaveTemplateItemDto.DueDateOffsetDays`) still declares the now-meaningless property — grep-confirmed unused by both `Services/TaskTemplateService.cs` and the entire `ClientApp/src` tree. This is inert dead DTO surface, not a functional bug (nothing reads or writes it), but it invites confusion for anyone extending the template form later.

### 2.2 Frontend Architecture

**Strengths (improved):**
- **`DataContext.tsx` shrank from 646 → 567 lines** and, more importantly, **no longer bulk-loads all tasks on login**. `fetchData()` (`ClientApp/src/context/DataContext.tsx:100-106`) now only fires `Promise.all` for `projects`, `users`, `assignableUsers`, and `activities` — `tasks` is initialized to `[]` and populated incrementally by individual CRUD calls (`setTasks(prev => …)` after create/update/delete/reassign, e.g. lines 223-224, 233-234, 296-297). `Tasks.tsx` now owns its own paginated fetch via `taskService.getAll(filters, tasksPage, TASKS_PAGE_SIZE)` (`ClientApp/src/pages/Tasks.tsx:562`). This resolves the previous audit's §4.1 "mass parallel task load on login" finding.
- `window.prompt()` no longer appears anywhere in the frontend (confirmed via repo-wide grep); the hours-required Kanban transitions now open a proper masked modal (comment at `ClientApp/src/pages/Tasks.tsx:886`).
- The hardcoded `WORK_START`/`WORK_END` (10/19) effort-calculation constants no longer appear in `TaskEffortPanel.tsx` or anywhere in `ClientApp/src` — the effort breakdown is now fully server-computed, closing the frontend/backend working-hours duplication risk flagged previously.
- **NEW:** `ClientApp/e2e/` now contains 13 Playwright spec files (~1,938 lines) plus page-object helpers, global setup with a persisted `storageState`, and an HTML reporter — a first real automated regression net for the SPA.

**Concerns (persist or new):**
- `Tasks.tsx` grew from ~2,774/3,021 lines (old report cites both figures inconsistently) to **3,152 lines** — the God Component problem is worse, not better.
- `Dashboard.tsx` grew from 1,017 to **1,588 lines**, driven by the new role-wise, date-filterable widgets (`AtRiskWidget`, `BreakdownMatrix`, `DashboardFilterBar`, `ProjectTimelineBars`, `StatusDonutChart`/`UserStatusList`) added since the baseline — a second large-file concern the previous audit didn't have to contend with.
- The refresh-token `localStorage` fallback is untouched: `ClientApp/src/lib/api.ts:11,25,44,52` still read/write `localStorage.getItem/setItem('pms_refresh_token', …)` alongside the httpOnly cookie.
- `ErrorBoundary.componentDidCatch` (`ClientApp/src/App.tsx:55-57`) still only `console.error`s — Sentry is still not wired on the frontend despite backend Sentry being conditionally configured (`Program.cs:24-34`).

### 2.3 Data Flow Diagram (Summary — updated)

```
User → Auth (OTP/Login) → JWT in memory + RT in httpOnly cookie (+ localStorage fallback, unchanged risk)
     ↓
Protected Route → DataContext.fetchData() → projects/users/assignableUsers/activities only (tasks NOT bulk-loaded)
     ↓
Tasks.tsx / Dashboard.tsx → dedicated paginated / aggregate service calls → server-side filtering
     ↓
Components read from Context → User actions call Context/service methods → API (ValidationFilter → Service → DbContext)
     ↓
SignalR ChatContext ([Authorize]-gated ChatHub) → ReceiveMessage / ReceiveNotification / presence via OnlineUserTracker
```

### 2.4 Separation of Concerns

| Layer | Status | Change |
|---|---|---|
| Controller ↔ Service boundary | GOOD | Unchanged |
| Service ↔ Data boundary | GOOD | Unchanged |
| DTO ↔ Entity boundary | GOOD | Unchanged (AutoMapper) |
| Request validation | **GOOD (was: absent for most DTOs)** | ▲ New `ValidationFilter` + FluentValidation layer |
| Frontend page ↔ service | GOOD (tasks) / PARTIAL elsewhere | ▲ Tasks page now owns its own paginated fetch |
| Frontend state ↔ UI | POOR, but improved | `DataContext` slimmer; `Tasks.tsx`/`Dashboard.tsx` still huge |

---

## 3. Security Audit

Findings are ordered as: accepted fixed-constraints first (transparency only, not Go/No-Go blockers per the audit brief), then everything else by severity.

### 3.0 Fixed Constraints (per CLAUDE.md — accepted by project owner, NOT counted in Go/No-Go)

| ID | Item | Status | Evidence |
|---|---|---|---|
| F-02 | DB credentials in `appsettings.json` | **PERSISTS (accepted)** | `appsettings.json:4` — `"DefaultConnection": "...User ID=vishaldemo_PMS;Password=Fz@21345;..."` unchanged since 07-09 |
| F-03 | Swagger unconditionally enabled in production | **PERSISTS (accepted)** | `Program.cs:201-202` — `app.UseSwagger(); app.UseSwaggerUI();` with no environment guard |
| F-06 | Hardcoded JWT key | **PERSISTS (accepted)** | `appsettings.json:7` and fallback at `Program.cs:72` — identical string to the previous audit |

These are flagged here for completeness (full severity would be CRITICAL for all three) but are excluded from the P1 remediation list and the Go/No-Go gate per the audit's rules.

### 3.1 HIGH: SMTP Credentials Still in Plaintext (not an accepted fixed constraint)

| Field | Detail |
|---|---|
| **Module** | Configuration / Email |
| **Description** | Gmail SMTP username + app password remain in plaintext in `appsettings.json`, unchanged from the previous audit. Unlike F-02/F-03/F-06, this was never listed as an accepted fixed constraint in CLAUDE.md. |
| **Evidence** | `appsettings.json:29-30` — `"Username": "vishalchudasama43326@gmail.com"`, `"Password": "lsmvsdrfjyxvydvf"` |
| **Impact** | Gmail account compromise, email-relay abuse |
| **Severity** | **HIGH** |
| **Root Cause** | No secrets management in use for this specific value |
| **Affected Files** | `appsettings.json`, `Services/EmailService.cs` |
| **Recommended Fix** | Move to `Email__Password` environment variable / user-secrets |
| **Estimated Effort** | 1 hour |
| **Priority** | **P1** |

### 3.2 HIGH: CORS Policy Still Hardcoded to localhost — PERSISTS

| Field | Detail |
|---|---|
| **Module** | Middleware |
| **Description** | Identical to the previous audit — CORS still only allows `http://localhost:3000` and `http://localhost:5178`. |
| **Evidence** | `Program.cs:188-197` — `policy.WithOrigins("http://localhost:3000", "http://localhost:5178")` — byte-for-byte unchanged from 07-09 |
| **Impact** | Any deployed frontend origin will fail CORS preflight against the API |
| **Severity** | **HIGH** |
| **Root Cause** | Still not read from configuration |
| **Affected Files** | `Program.cs` |
| **Recommended Fix** | Read `AllowedOrigins` from `appsettings.json`/environment; unchanged recommendation from the previous audit |
| **Estimated Effort** | 2 hours |
| **Priority** | **P1** |

### 3.3 HIGH: Login Rate Limiter Still Single-Instance In-Memory — PERSISTS

| Field | Detail |
|---|---|
| **Module** | Middleware |
| **Description** | `LoginRateLimitMiddleware` still uses a `static ConcurrentDictionary<string, Queue<DateTime>>` (unchanged data structure). The only change since 07-09 is a new **Development-environment bypass** — a legitimate testability improvement, not a security fix. |
| **Evidence** | `Middleware/LoginRateLimitMiddleware.cs:17` (static dict, unchanged); lines 26-35 (new: `if (env.IsDevelopment()) { await _next(ctx); return; }` — added to keep Playwright's per-test `/api/auth/refresh` calls and manual dev testing from self-triggering 429s) |
| **Impact** | Rate limiting still resets on restart and doesn't share state across horizontally-scaled instances; unchanged from previous audit |
| **Severity** | **HIGH** |
| **Root Cause** | Same as before — no distributed backing store |
| **Affected Files** | `Middleware/LoginRateLimitMiddleware.cs` |
| **Recommended Fix** | Unchanged: migrate to `Microsoft.AspNetCore.RateLimiting` with a distributed (Redis) store for multi-instance deployments; the dev-bypass logic itself is fine to keep |
| **Estimated Effort** | 4 hours |
| **Priority** | **P2** |

### 3.4 HIGH: Refresh Token Still Persisted to localStorage — PERSISTS

| Field | Detail |
|---|---|
| **Module** | Frontend / Auth |
| **Description** | Unchanged from the previous audit. The httpOnly `pms_rt` cookie (`Controllers/AuthController.cs:79-83`, `HttpOnly=true, Secure=Request.IsHttps, SameSite=Strict`) is set correctly, but the frontend still also persists the refresh token to `localStorage` as a fallback. |
| **Evidence** | `ClientApp/src/lib/api.ts:11` (`getRefreshToken` reads `localStorage.getItem('pms_refresh_token')`), `:25` (removed on logout), `:44` (sent in refresh body), `:52` (`localStorage.setItem('pms_refresh_token', data.refreshToken)` on every refresh) |
| **Impact** | XSS-sourced token theft remains possible via the fallback path; unchanged risk profile |
| **Severity** | **HIGH** |
| **Root Cause** | Legacy fallback retained |
| **Affected Files** | `ClientApp/src/lib/api.ts` |
| **Recommended Fix** | Unchanged: drop the localStorage fallback, rely solely on the httpOnly cookie |
| **Estimated Effort** | 3 hours |
| **Priority** | **P2** |

### 3.5 MEDIUM: `AuthorizationService` Permissive View-Only Default — PERSISTS, now documented & narrowed

| Field | Detail |
|---|---|
| **Module** | AuthorizationService |
| **Description** | The previous audit's §16.2 flagged `CanViewAsync` granting access by default when no explicit permission row exists. That mechanism has been **rewritten** as part of the permission-caching refactor, but the same behavior survives in narrower form: `EnsurePermissionsAsync` now builds a full route→bitmap cache and explicitly defaults any module with **no** user-override and **no** role-default row to bitmap `1` (View-only) — Create/Update/Delete still correctly default to denied (bit not set). The code now documents this as intentional ("mirrors old behaviour when no perm configured"), which is a real improvement in intent-clarity, but the underlying permissive-View gap for un-seeded `PageModule` rows is unchanged. |
| **Evidence** | `Services/AuthorizationService.cs:85-92` — `else _routePermCache[m.Route] = 1;` inside the `foreach (var m in modules)` loop |
| **Impact** | A newly added page route that isn't yet seeded into `PageModules` (or a role/user permission not yet configured for it) is viewable — but not writable — by every authenticated non-admin user by default |
| **Severity** | **MEDIUM** (downgraded from the previous audit's assessment now that it's scoped to View only and is a documented decision, not an oversight) |
| **Root Cause** | Deliberate permissive-View default, same design philosophy as before |
| **Affected Files** | `Services/AuthorizationService.cs` |
| **Recommended Fix** | If deny-by-default is actually wanted, change the `else` branch to `0`; otherwise, no action needed beyond ensuring `PageModules` seeding stays current whenever a new route/page is added |
| **Estimated Effort** | 1 hour |
| **Priority** | **P3** |

### 3.6 MEDIUM: `GetEffortStatsAsync` — Partially Resolved

| Field | Detail |
|---|---|
| **Module** | TaskService |
| **Description** | The previous audit's §4.3 flagged this method for loading ALL tasks/histories unconditionally. It now applies an **upper-bound** window filter at the SQL level (`t.CreatedAt < winEnd`, `h.ChangedAt < winEnd`), but there is still no **lower-bound** filter — a task created years before the requested window still has its entire history pulled into memory to reconstruct state at `winStart`. This is a legitimate design trade-off (you can't know a task's status at `winStart` without replaying from creation) rather than an oversight, so it's rated lower than the original finding. |
| **Evidence** | `Services/TaskService.cs:1449-1467` (`winStart`/`winEnd` computed, `.Where(t => t.CreatedAt < winEnd)` and `.Where(h => h.ChangedAt < winEnd)` applied — no `>= winStart` filter present) |
| **Impact** | Dashboards over long-lived datasets still pull large amounts of historical data into memory, though the unconditional worst case (all future data too) is gone |
| **Severity** | **MEDIUM** (downgraded from the previous audit) |
| **Root Cause** | Effort reconstruction inherently needs full history up to the window; not fully solvable without pre-aggregation |
| **Affected Files** | `Services/TaskService.cs` |
| **Recommended Fix** | Add indexes on `TaskStatusHistories.ChangedAt`/`TaskAssignmentHistories.ChangedAt` (still missing, see §4.6) to keep the necessarily-large scan cheap; consider a nightly pre-aggregation table for older data |
| **Estimated Effort** | 1 day |
| **Priority** | **P2** |

### 3.7 MEDIUM: No Security Headers — PERSISTS

Unchanged from the previous audit (§3.13). No `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, or `Strict-Transport-Security` middleware found in `Program.cs`. **Priority P3**, 2 hours.

### 3.8 LOW: SignalR Token in Query String — PERSISTS

Unchanged (`Program.cs:94-101`, `OnMessageReceived` reading `ctx.Request.Query["access_token"]`). `Hubs/ChatHub.cs:9` confirms `[Authorize]` is applied at the hub class level, so the underlying authorization is sound — this remains a WebSocket-protocol limitation, not a design flaw. **Priority P4**.

### 3.9 RESOLVED: OTP Registration Payload Now Stores a Password Hash

| Field | Detail |
|---|---|
| **Previous finding** | §3.10 (2026-07-09) — plaintext password serialized into `EmailOtp.Payload` |
| **Fix evidence** | `Controllers/AuthController.cs:110` (comment: "Hash the password before persisting in the OTP payload — plain-text must never reach the DB"), `:118` (`Password = PasswordHasher.HashPassword(dto.Password)` into a `safeDto` before serialization), `:121` (`JsonSerializer.Serialize(safeDto)`). Confirmation path at `:179` ("pending.Password is already a PBKDF2 hash stored in the OTP payload — assign directly") and `:190` (login-after-confirm now issues a token directly via `IssueTokenAsync` rather than re-checking a plaintext password). |
| **Status** | **RESOLVED** |

### 3.10 RESOLVED: Free-Text Fields Now Length-Capped

| Field | Detail |
|---|---|
| **Previous finding** | §3.9 (2026-07-09) — no `[MaxLength]` on `CreateTaskCommentDto.Text` or `SendMessageDto.Content` |
| **Fix evidence** | `Validators/TaskValidators.cs:82` — `RuleFor(x => x.Text).RequiredText(4000, 1);` on `CreateTaskCommentDtoValidator`. `Validators/ChatValidators.cs:13` — `RuleFor(x => x.Content).OptionalText(5000);` on `SendMessageDtoValidator`, plus a cross-field rule requiring content or an attachment (`:16-17`). |
| **Note** | Sanitization (HTML-encoding) was deliberately *not* added — documented rationale in `VALIDATION_PARITY_REPORT.md §6`: React escapes render output by default and no `dangerouslySetInnerHTML` call was found for these fields, so encoding server-side would only risk corrupting legitimate content without closing a real vector. This is a reasonable, explicitly-documented call, not an oversight. |
| **Status** | **RESOLVED** |

### 3.11 RESOLVED: Zero Backend Validation on Auth/Roles/Projects DTOs

| Field | Detail |
|---|---|
| **Previous finding** | Implicit across §9 (Form Validation Audit) and the Auth surface generally — `AuthController` is the app's one `[AllowAnonymous]` controller and had no DTO-level validation at all |
| **Fix evidence** | `Validators/AuthValidators.cs` (7 validators: Login/Register/InitiateRegister/ConfirmOtp/ForgotPassword/ResetPassword/RefreshToken), `Validators/RoleValidators.cs` (`RoleDtoValidator`), `Validators/ProjectValidators.cs` (`ProjectDtoValidator`, `ReassignProjectDtoValidator` — includes the new `EndDate >= StartDate` cross-field rule at `ProjectValidators.cs:17`, a real business-rule gap neither side had before) |
| **Status** | **RESOLVED** |

### 3.12 NEW (positive): Task Attachment Upload Now Has Magic-Byte Verification

Previously, task attachment uploads validated only size/extension (a renamed `.exe` with a `.pdf` extension would pass); chat uploads already had magic-byte checking. `Services/TaskService.cs`'s `UploadAttachmentAsync` now delegates to the shared `Validators/FileValidationHelper.cs`, closing that inconsistency (`VALIDATION_PARITY_REPORT.md §6`). **Positive finding, no action needed.**

---

## 4. Performance Analysis

### 4.1 RESOLVED: Frontend Mass Task Load on Login

Previously §4.1 (HIGH). `DataContext.fetchData()` (`ClientApp/src/context/DataContext.tsx:100-106`) no longer fetches tasks at all — only `projects`, `users`, `assignableUsers`, `activities`. `tasks` starts empty and `Tasks.tsx` fetches its own paginated slice via `taskService.getAll(filters, tasksPage, TASKS_PAGE_SIZE)` (`Tasks.tsx:562`). **Status: RESOLVED.**

### 4.2 RESOLVED: AuthorizationService N+1 DB Queries

Previously §4.2 (MEDIUM). See [§2.1](#21-backend-architecture) — `EnsurePermissionsAsync` now issues exactly 3 bulk queries per request (regardless of how many `CanView/Create/Update/Delete` checks that request makes) and caches the result in `_routePermCache` for the lifetime of the scoped service. **Status: RESOLVED.**

### 4.3 PARTIALLY RESOLVED: `GetEffortStatsAsync` Full-History Load

See [§3.6](#36-medium-geteffortstatsasync--partially-resolved) — upper-bound filtering added, lower bound still unbounded by design. **Status: PARTIALLY RESOLVED**, P2.

### 4.4 PERSISTS: `DataContext` Still a Broad Context (narrower impact now)

`DataContext.tsx` shrank to 567 lines and no longer carries the full task list, which meaningfully reduces the blast radius of a "God Object" re-render, but projects/users/activities/notifications remain in one context and any update to any of them still re-renders every consumer. **Severity downgraded to LOW-MEDIUM.** Priority P3, 3 days (unchanged recommendation: domain-specific context slices).

### 4.5 RESOLVED: `window.prompt()` for User Input

Previously §4.5 (MEDIUM). Confirmed absent repo-wide; replaced by a masked hours-spent modal (`Tasks.tsx:886` comment). **Status: RESOLVED.**

### 4.6 PARTIALLY RESOLVED: Missing Database Indexes

| Column | Previous finding | Current state |
|---|---|---|
| `EmailOtps.Email + Purpose (+ IsUsed/ExpiresAt)` | Missing | **Partially added** — `Data/PMSDbContext.cs:426`: `b.HasIndex(o => new { o.Email, o.Purpose });` (composite on Email+Purpose only; `IsUsed`/`ExpiresAt` still not included) |
| `RefreshTokens.Token` | Not flagged before | **Added** — `:417`: `b.HasIndex(r => r.Token).IsUnique();` (a positive addition beyond what was asked) |
| `Tasks.Status`, `Tasks.AssignedToId` (composite w/ ProjectId) | Missing | **Still missing** — only `Tasks.Code` has an explicit unique index (`:172-175`); `Status`/`AssignedToId`/`ProjectId` have no explicit composite index (FK columns get EF's default single-column index by convention, but the previous audit's recommended `{Status, ProjectId}` composite is still absent) |
| `TaskStatusHistories.ChangedAt`, `TaskAssignmentHistories.ChangedAt` | Missing | **Still missing** — no `HasIndex` call found on either column |

**Severity:** MEDIUM (downgraded — the OTP index materially helps the highest-frequency anonymous-endpoint query). **Priority P2**, 2 hours for the remaining Task/History indexes.

### 4.7 NEW: `OnlineUserTracker` Is a Single-Instance In-Memory Singleton

The new presence-tracking service (`Services/OnlineUserTracker.cs`) uses an in-process `ConcurrentDictionary`, the same architectural pattern already flagged as a scalability limitation for the rate limiter. Fine for the current single-instance deployment; would need a distributed backing store (Redis pub/sub or SignalR backplane) if the app is ever horizontally scaled. **Severity LOW** (informational — matches current deployment model). **Priority P4.**

### 4.8 Frontend Bundling — Unchanged

No new bundle analysis performed; same libraries as before plus `@playwright/test` (dev-only, doesn't affect production bundle). **Priority P4**, unchanged from previous audit.

---

## 5. Feature Coverage Matrix

### 5.1 Core Features by Role

| Feature | SystemAdmin | Admin | Manager | QA Reviewer | Developer/Assignee | Viewer |
|---|---|---|---|---|---|---|
| Dashboard view (role-wise widgets — **NEW**) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Project CRUD | ✓ | ✓ | ✗ (view only) | ✗ | ✗ | ✗ |
| Task Create/Update/Delete | ✓ | ✓ | ✓ (own projects) | ✗ | ✗ | ✗ |
| Task View | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Task Status Change | ✓ | ✓ | ✓ | ✓ (QA pass/fail) | ✓ (own tasks) | ✗ |
| Task Attachments (**NEW — upload/delete/download now wired**) | ✓ | ✓ | ✓ | ✓ (if involved) | ✓ (if assignee) | view only |
| Task Reassign | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| User Management | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| Role Management | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Reports | ✓ | ✓ | ✓ | ✓ | ✓ (self only) | ✓ |
| Chat (presence indicator — **NEW**) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Work Diary | ✓ (all) | ✓ (all) | ✓ (own) | ✓ (own) | ✓ (own) | ✓ (own) |
| Templates | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| Impersonation | ✓ (SystemAdmin only) | ✗ | ✗ | ✗ | ✗ | ✗ |

Unchanged from the previous audit except for the two rows marked **NEW**.

### 5.2 Status Machine Coverage

Unchanged from the previous audit — the status machine itself (`AllowedEdges` in `Services/TaskService.cs`) was not altered in this window; a commit (`6f422e6`, "sync ALLOWED_EDGES with backend TaskService") specifically re-synced the frontend's `TaskStatusActions.tsx`/`lib/utils.ts` copy of the edge map to match the backend, closing a documentation/implementation drift the previous audit flagged in §16.8 (frontend/backend status-string mismatch) — see [§16](#1610-resolved-frontend-backend-status-string-mismatch).

---

## 6. User Role Testing Results

### 6.1 SystemAdmin Role — unchanged from previous audit

All prior findings hold. New: the `Add role-wise, date-filterable Dashboard widgets` commit gives SystemAdmin (and other roles) date-range-filterable breakdowns by status/project on the dashboard (`AtRiskWidget.tsx`, `BreakdownMatrix.tsx`, `DashboardFilterBar.tsx`).

### 6.2 Admin Role — unchanged

The `IsAdmin` vs. bitmap `||`/`&&` ambiguity flagged in the previous audit's §6.2 was not touched in this window; still present in `ProjectsController.cs`'s admin/permission checks pattern. Not re-verified line-by-line this pass since no commit in the reviewed range touched `ProjectsController.cs`'s access-check logic.

### 6.3 Manager / Project Owner Role — unchanged

### 6.4 QA Reviewer Role — unchanged

### 6.5 Developer / Assignee Role — unchanged, plus:

**NEW:** Task attachments are now a real capability for this role (upload evidence/screenshots against an assigned task) — `POST /api/tasks/{id}/attachments` (`Controllers/TasksController.cs:594-602`), gated the same way as other task-mutation endpoints.

### 6.6 Viewer Role — unchanged

The previous audit's finding that Viewer can see tasks outside their project membership if their View bit is set was not re-verified this pass (no relevant service code changed in the reviewed commit range).

---

## 7. Navigation & Routing Audit

No commits in the reviewed range touched `App.tsx` routing, `Sidebar.tsx`, or route guards. All previous-audit findings in this section are carried forward unchanged:

- **PERSISTS (LOW):** `/templates/new` and `/templates/:id/edit` still lack a frontend permission guard beyond the API-level `IsAdmin` gate.
- **PERSISTS (LOW):** `/reports`, `/chat`, `/diary` remain `alwaysShow: true` with no permission gate on either side.
- **Unchanged (GOOD):** SPA fallback (`app.MapFallbackToFile("index.html")`, `Program.cs:220`) and the catch-all 404 route both still function as documented.

---

## 8. UI/UX Audit

### 8.1 Loading States — unchanged, still GOOD across the board.

### 8.2 Error States

**PERSISTS:** `ErrorBoundary.componentDidCatch` (`App.tsx:55-57`) still only logs to console; Sentry is still not invoked from the frontend despite the backend having conditional Sentry wiring (`Program.cs:24-34`). **Severity MEDIUM, Priority P2** (unchanged from previous audit).

### 8.3 Empty States — unchanged (GOOD).

### 8.4 Modal Management

**RESOLVED:** The `window.prompt()` usage flagged previously is gone (see [§4.5](#45-resolved-windowprompt-for-user-input)).

**PERSISTS:** The task modal in `Tasks.tsx` still manages a large amount of page-level state (the file itself grew to 3,152 lines in this window rather than being split as recommended). **Severity MEDIUM, Priority P3.**

**NEW:** `Modal.tsx` (`ClientApp/src/components/ui/Modal.tsx`) was reviewed directly this pass: it correctly sets `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, closes on Escape, and auto-focuses its close button on open (lines 14-33, 47-50) — but it does **not** trap Tab focus within the dialog, so keyboard users can still Tab out to background content while the modal is open. See [§12](#12-accessibility-audit).

### 8.5 Notification System — unchanged (`notification.mp3` still optional/absent, as documented in code).

### 8.6 Theme Support — unchanged.

### 8.7 Impersonation Banner — not re-verified this pass (no relevant commits in range); carried forward as previously reported (needs UI confirmation in `DashboardLayout.tsx`).

---

## 9. Form Validation Audit

This section changed more than any other since the previous audit.

### 9.1 Backend Validation — Largely Rebuilt

| Endpoint / DTO | Previous audit | Current state |
|---|---|---|
| All 7 `AuthController` DTOs | **No validation at all** | **RESOLVED** — `Validators/AuthValidators.cs`, all 7 DTOs, including OTP exactly-6-digits and password complexity |
| `RoleDto` | **No validation at all** | **RESOLVED** — `Validators/RoleValidators.cs` (Name 2-100 chars, Code pattern, Level 1-100) |
| `ProjectDto` (Create+Update) | **No validation at all**, no `EndDate>=StartDate` check on either side | **RESOLVED** — `Validators/ProjectValidators.cs:13-18`, including the new cross-field date rule |
| `CreateTaskDto.EstimatedHours` | `[Range]` didn't enforce presence on nullable field | **RESOLVED** — `Validators/TaskValidators.cs:26-27`, explicit `NotNull()` added |
| `CreateTaskCommentDto.Text` | No length cap | **RESOLVED** — capped at 4000 chars |
| `SendMessageDto.Content` | No length cap | **RESOLVED** — capped at 5000 chars, plus content-or-attachment cross-field rule |
| `CreateWorkDiaryDto.HoursSpent` | Frontend-only 24h/day cap | **RESOLVED** — `Validators/WorkDiaryValidators.cs` enforces server-side |
| Template recurrence fields | Documented in CLAUDE.md but unenforced anywhere | **RESOLVED** — `Validators/TemplateValidators.cs` cross-field rules (weekly→DayOfWeek, monthly→DayOfMonth, custom→interval) |
| Task `RequiresQA=true` ⇒ QA reviewer required | Not enforced | **RESOLVED** (new business rule, not just a parity fix) — `Validators/TaskValidators.cs` |
| `POST /tasks/{id}/checklist` title length | Missing | Not independently re-verified this pass; `CreateChecklistItemDtoValidator` exists in `TaskValidators.cs` per the parity report — treat as **likely resolved** |

**Remaining gaps, honestly carried over from `VALIDATION_PARITY_REPORT.md §11` (self-reported by the change that introduced the validators, and spot-checked as still accurate):**
- "≥1 checklist item on task creation" still isn't enforced by `CreateTaskDtoValidator` (the DTO is shared between Create/Update with no per-action RuleSet).
- `ReassignTaskDto.ReasonTag` still validates against the full `ReasonTags.Valid` set rather than the narrower blocked-task subset the frontend conditionally offers.
- No unit tests exist yet for any of the new validators (`PMS.Tests/` unchanged — see [Appendix B](#appendix-b-test-coverage-assessment)).

### 9.2 Frontend Validation — Gap Now Runs the Other Direction

The backend is now, in several places, **stricter than the frontend that calls it**:

- **`Roles.tsx`** still has "no HTML5 or JS validation at all" (confirmed via grep — no `required`/validation logic found beyond error-toast handling on failed API calls). A user submitting an invalid role name now gets a generic 400 toast instead of the old silent-acceptance behavior — a functional improvement, but with no inline field-level feedback.
- **`Projects.tsx`** still only has HTML5 `required` on Name/Description with no client-side `EndDate >= StartDate` check, even though the backend now enforces it — the same UX gap (error surfaces only after submit).
- **`MessageInput.tsx`** (chat) has no client-side character counter/limit despite the backend's new 5000-char cap.

**Recommendation (new since this audit):** Add inline field-level validation to `Roles.tsx`, `Projects.tsx`'s date fields, and a character counter to `MessageInput.tsx` so users get feedback before submission rather than a toast after a 400. **Severity LOW-MEDIUM, Priority P3.**

### 9.3 Other Frontend Validation — unchanged

Password-strength-indicator-vs-backend-minimum mismatch flagged in the previous audit is **RESOLVED**: `VALIDATION_PARITY_REPORT.md §5.1` confirms `lib/validation.ts`'s `validatePassword()` now enforces the same `PASSWORD_STRENGTH_REGEX` `Auth.tsx` already used, and `Auth.tsx` now imports the shared constant instead of keeping its own copy (duplication removed too).

---

## 10. CRUD Audit

### 10.1 Tasks — all previous rows unchanged, plus:

| Operation | API | Frontend | Notes |
|---|---|---|---|
| **Upload Attachment (NEW)** | `POST /api/tasks/{id}/attachments` | `TaskAttachmentsPanel.tsx` | ✓ — magic-byte + extension + size validated (`Validators/FileValidationHelper.cs`) |
| **Delete Attachment (NEW)** | `DELETE /api/tasks/{id}/attachments/{attachmentId}` | `TaskAttachmentsPanel.tsx` | ✓ |
| **Download Attachment (NEW)** | `GET /api/tasks/attachments/download/{attachmentId}` | `TaskAttachmentsPanel.tsx` | ✓ — streams from disk with the original filename/mimetype |

This closes the previous audit's §15.4 "Missing Features" finding entirely.

### 10.2 Projects, 10.3 Users, 10.4 Roles, 10.5 Task Templates, 10.6 Work Diary — unchanged from previous audit; no relevant commits in the reviewed range altered these controllers' CRUD surface beyond the validation layer described in §9.

### 10.7 Chat

| Operation | API / Hub | Frontend | Notes |
|---|---|---|---|
| Send Message | Hub.SendMessage | MessageInput.tsx | ✓ — now server-validated (5000-char cap) |
| **Delete Message** | **STILL MISSING** | **STILL MISSING** | Unchanged from previous audit |
| **Edit Message** | **STILL MISSING** | **STILL MISSING** | Unchanged from previous audit |

---

## 11. API Audit

### 11.1–11.2 Response Consistency / Error Codes

**Improved:** `ValidationFilter` is now the single source of truth for the 400 response shape across DataAnnotations *and* FluentValidation failures (previously two divergent shapes existed — `VALIDATION_PARITY_REPORT.md §5.3`). This directly resolves a correctness/consistency concern the previous audit's §11.2 alluded to without fully diagnosing.

### 11.3 Endpoint Coverage

| Controller | Change since 07-09 |
|---|---|
| AuthController | Still no `PUT /auth/change-password`; now fully input-validated |
| TasksController | **+3 attachment endpoints** (upload/delete/download) |
| BackupController | Fully commented out (was: registered but DI-broken) |
| All `[HttpPost]`/`[HttpPut]` controllers | Now run through `ValidationFilter` |

### 11.4 Missing API Endpoints — mostly unchanged

1. `GET /api/auth/me` — still missing.
2. `PUT /api/auth/change-password` — **still missing**. Confirmed via grep across `AuthController.cs` — no route or method resembling change-password found. **Persists, P2.**
3. `DELETE`/`PUT /api/chat/messages/{id}` — **still missing**, confirmed via grep.
4. Task file attachments — **RESOLVED** (see §10.1).
5. `GET /api/users/me` — still missing.

### 11.5 Pagination — unchanged

Confirmed via direct re-read of `Controllers/UsersController.cs:35-40` and `Controllers/ProjectsController.cs:26-31` — both `GetAll()` actions still return the full unfiltered `List<T>` with no `page`/`pageSize` parameters. Tasks remains the only paginated list endpoint. **Persists, Priority P3.**

---

## 12. Accessibility Audit

No dedicated accessibility work landed in this window; nearly every finding from the previous audit is confirmed unchanged by direct re-inspection.

### 12.1 Confirmed Persisting Issues

- **Missing ARIA labels on icon-only buttons (HIGH, PERSISTS):** `Tasks.tsx` — now 3,152 lines — contains only **2** `aria-label` occurrences total (grep-counted). The Kanban board's edit/delete/reassign icon buttons remain unlabeled.
- **Missing focus trap in modals (HIGH, PERSISTS):** Direct read of `ClientApp/src/components/ui/Modal.tsx` confirms Escape-to-close and initial-focus-on-open both work, but there is no keydown handler constraining Tab/Shift+Tab to elements inside the dialog — a keyboard user can Tab past the modal into the backdrop content.
- **No skip-navigation link (MEDIUM, PERSISTS):** not found in `App.tsx`/`DashboardLayout.tsx`.
- **Kanban drag-and-drop has no keyboard alternative (MEDIUM, PERSISTS):** unchanged; HTML5 drag events remain the only interaction model for column-to-column moves (though the modal-based status-change path, which is keyboard-accessible, is the one that lost its `window.prompt()` dependency — a partial mitigation since keyboard users were always better served by that path anyway).

### 12.2 Color Contrast — unchanged, not independently re-verified this pass.

---

## 13. Responsive Design Audit

No commits in the reviewed range touched layout/responsive CSS in a way that changes the previous audit's conclusions. All findings (mobile sidebar, Kanban horizontal scroll, filter-dropdown positioning, chat sidebar collapse) are carried forward unchanged and unverified visually this pass (would require the `playwright-tester`/`webapp-qa-all-in-one` skill to validate breakpoints empirically — recommended as a follow-up, not performed as part of this static re-audit).

---

## 14. Dead Code & Technical Debt

### 14.1 Dead Code

| Item | Previous audit | Current state |
|---|---|---|
| `Services/JwtService.cs` | Believed dead, unregistered (per CLAUDE.md and the 07-09 report) | **CORRECTED — NOT dead.** Contains the live `PasswordHasher` class (PBKDF2 hashing), used by 5 other files. Static classes are never "registered in DI" — that framing was a category error carried across both audits without reading the file. The only real defect is the misleading filename; see §16.15 |
| `Services/DatabaseBackupService.cs` + `Controllers/BackupController.cs` | Dead + crash risk | **Crash risk RESOLVED** (controller fully commented out); service file itself still dead weight |
| `Models/ChatMessage.cs`, `Models/ChatAttachment.cs` | Placeholder duplicates | **PERSISTS** — both still present (1 line each — likely just a using/namespace stub, but still on disk and still capable of confusing a `Models/`-first search) |
| `pms_token` leftover localStorage key cleared on logout | Leftover from earlier design | Not independently re-verified this pass |
| `DTOs/GeneralDtos.cs: SaveTemplateItemDto.DueDateOffsetDays` | N/A (didn't exist as dead code before) | **NEW dead field** — schema column dropped by `RemoveDueDateColumns` migration, but the DTO property remains, unused by both `TaskTemplateService.cs` and the entire frontend (grep-confirmed) |

### 14.2 Technical Debt

| Item | Previous size | Current size | Trend |
|---|---|---|---|
| `ClientApp/src/pages/Tasks.tsx` | ~2,774–3,021 lines | **3,152 lines** | ▲ grew |
| `ClientApp/src/pages/Dashboard.tsx` | 1,017 lines | **1,588 lines** | ▲ grew (new widgets) |
| `ClientApp/src/context/DataContext.tsx` | 646 lines | **567 lines** | ▼ shrank (task bulk-load removed) |
| `DTOs/GeneralDtos.cs` | 927 lines | **1,139 lines** | ▲ grew |
| Working hours duplicated in frontend | Present | **RESOLVED** — no longer duplicated (see §4) |
| Username login gap | Present | **PERSISTS** — see §16 |

**Net technical-debt trend since the previous audit: mixed.** The context/state-loading debt genuinely improved; the large-page-component debt got worse in absolute terms (offset by the fact that more of that growth is now legitimately-scoped feature code — role-wise dashboards, attachment panels — rather than pure sprawl).

---

## 15. Missing Features & Incomplete Implementations

| # | Item | Previous status | Current status |
|---|---|---|---|
| 15.1 | Username login | Missing (HIGH) | **STILL MISSING** — see [§16.1](#161-confirmed-bug-username-login-still-broken--persists) |
| 15.2 | Authenticated password change (`PUT /auth/change-password`) | Missing (MEDIUM) | **STILL MISSING** |
| 15.3 | Chat message delete/edit | Missing (LOW) | **STILL MISSING** |
| 15.4 | Task file attachments | Missing (MEDIUM) | **RESOLVED** — full upload/delete/download now implemented |
| 15.5 | `notification.mp3` asset | Missing/optional (LOW) | Not re-verified; presumed unchanged |
| 15.6 | Frontend Sentry wiring | Missing (MEDIUM) | **STILL MISSING** |
| 15.7 | Pagination on Projects/Users/Roles/Activities | Missing (MEDIUM) | **STILL MISSING** |
| 15.8 | General-purpose email notifications beyond OTP | Missing (LOW) | Not re-verified; presumed unchanged |
| 15.9 | Multi-tenancy | N/A (design choice) | Unchanged |
| 15.10 | **(NEW)** CI/CD pipeline | Flagged as a P4 recommendation, not a "missing feature" per se | **STILL ABSENT** — no `.github/workflows/` or equivalent found anywhere in the repo |
| 15.11 | **(NEW)** Backend unit tests for the new `Validators/` layer | N/A (validators didn't exist yet) | **MISSING** — self-reported gap in `VALIDATION_PARITY_REPORT.md §11.3`; confirmed, `PMS.Tests/` still has only the same 3 pre-existing files |

---

## 16. Bugs & Defects

### 16.1 CONFIRMED BUG: Username Login Still Broken — PERSISTS

| Field | Detail |
|---|---|
| **Module** | AuthService |
| **Feature** | Login |
| **Description** | Identical to the previous audit's §16.1. `AuthService.LoginAsync` still only has two branches: identifier contains `@` → email lookup; else → digit-based mobile-number lookup (`digits.Length >= 7`). There is still no third branch querying `Users.UserName`. CLAUDE.md continues to document username login as implemented and case-sensitive ("Implemented in `AuthService.LoginAsync` by splitting on `@`, using a CI DB query for username candidates, then filtering with `StringComparison.Ordinal`") — this description does not match the actual code, then or now. |
| **Evidence** | `Services/AuthService.cs:37-62` — `if (identifier.Contains('@'))` → email; `else` → mobile-digit path only; `user = null` falls through if neither matches |
| **Impact** | Any user whose credential is a plain username (not an email, not phone digits) cannot log in at all |
| **Severity** | **HIGH** |
| **Root Cause** | Unchanged — third login branch was never implemented, despite six weeks of otherwise-substantial auth-surface hardening (validators, OTP hashing) touching this exact file's neighbors |
| **Affected Files** | `Services/AuthService.cs` |
| **Recommended Fix** | Unchanged: add an `else if` branch querying `_context.Users.FirstOrDefaultAsync(u => u.UserName == identifier)` with `StringComparison.Ordinal` (case-sensitive, per CLAUDE.md) when the identifier is neither email-shaped nor digit-heavy |
| **Estimated Effort** | 30 minutes |
| **Priority** | **P1** |

### 16.2 RESOLVED: AuthorizationService Permissive Default (Create/Update/Delete)

The previous audit's §16.2 described the permissive default as applying broadly. Direct re-inspection shows the *rewritten* `EnsurePermissionsAsync` only defaults unconfigured routes to **View** access (bitmap `1`); Create/Update/Delete bits are correctly `0` (denied) by default. See [§3.5](#35-medium-authorizationservice-permissive-view-only-default--persists-now-documented--narrowed) for the narrower, now-documented residual gap. **Downgraded from MEDIUM to a documented-and-scoped MEDIUM; the CRUD-bypass half of the original bug is gone.**

### 16.3 RESOLVED: BackupController Returns 500

`BackupController.cs` is now entirely commented out (all 33 lines), so the endpoint doesn't exist and can't be reached to crash. **Status: RESOLVED.**

### 16.4 PARTIALLY RESOLVED: `PausedSeconds` Hardcoded to Zero

| Field | Detail |
|---|---|
| **Previous finding** | §16.4 — `PausedSeconds` always `0` in both the org-wide dashboard stats and the per-task top-user breakdown |
| **Current state** | **Org-wide dashboard stats: RESOLVED.** `Services/TaskService.cs:1559` (`PausedSeconds = perUserPaused.TryGetValue(kv.Key, out var ps) ? ps : 0` — genuinely computed per user) and `:1580` (`PausedSeconds = filteredPaused` — genuinely computed org-wide) both now compute real values. **Per-task per-user breakdown: STILL hardcoded.** `Services/TaskService.cs:1710` — `PausedSeconds = 0,` remains a literal zero inside the single-task `TaskEffortDto.ByUser` computation (used by `TaskEffortPanel.tsx`'s per-assignee breakdown for one task). |
| **Impact** | Dashboard-wide effort widgets are now accurate; a single task's per-user effort panel still shows 0 paused time for each contributor even when they were genuinely paused |
| **Severity** | **LOW** (downgraded — the higher-traffic, more-visible dashboard-wide stat is fixed; only a narrower per-task detail view remains wrong) |
| **Affected Files** | `Services/TaskService.cs` |
| **Recommended Fix** | Apply the same per-user interval-overlap computation already used for `perUserPaused` (org-wide) to the `byUser` loop inside the single-task effort method |
| **Estimated Effort** | 2 hours |
| **Priority** | **P3** |

### 16.5 PERSISTS: CORS Will Block Production API Calls

Unchanged — see [§3.2](#32-high-cors-policy-still-hardcoded-to-localhost--persists).

### 16.6 N/A: `Task.dueDate` Type Mismatch — Feature Removed

| Field | Detail |
|---|---|
| **Previous finding** | §16.6 — frontend `Task.dueDate: string` (required) vs. nullable backend value, risking `Invalid Date`/`NaN` in overdue calculations |
| **Current state** | Migration `20260825103232_RemoveDueDateColumns.cs` dropped `Tasks.DueDate` from the schema entirely. Confirmed via direct read of the migration, `Data/PMSDbContext.cs` (no `DueDate` references remain on the `TaskEntity` fluent config), and `ClientApp/src/types/index.ts:239-279` (the `Task` interface no longer has a `dueDate` field at all — grep-confirmed absent from the full interface body). The only surviving `dueDate` in `types/index.ts` belongs to an unrelated, apparently-unused `OverdueTaskRow` interface (grep-confirmed: referenced nowhere else in `ClientApp/src`). |
| **Status** | **N/A** — the code this finding referred to no longer exists; the underlying feature (task due dates) was removed rather than the type being fixed. Worth flagging as a **product decision to confirm was intentional**, since due dates are a fairly standard PM-tool feature to drop. |

### 16.7 RESOLVED: Two Divergent 400 Response Shapes

Not separately numbered in the previous audit but implied by §11.2's "inconsistent ErrorCode usage" finding. `ValidationFilter` now unifies DataAnnotations and FluentValidation failures into one `ApiResponse<T>` shape (`VALIDATION_PARITY_REPORT.md §5.3`). **Status: RESOLVED.**

### 16.8 RESOLVED: Task Attachment Upload Missing Magic-Byte Check

See [§3.12](#312-new-positive-task-attachment-upload-now-has-magic-byte-verification). **Status: RESOLVED.**

### 16.9 PERSISTS: OtpCleanupService / OtpService Cleanup Race — unchanged, LOW, P4.

### 16.10 RESOLVED: Frontend/Backend Status-String Mismatch

| Field | Detail |
|---|---|
| **Previous finding** | §16.8 — CLAUDE.md described `"paused"`/`"under-review"` status values that didn't match the actual `AllowedEdges` implementation (`"in-progress"`, `"blocked"`, `"in-review"`, `"cancelled"`) |
| **Fix evidence** | Commit `6f422e6` ("sync ALLOWED_EDGES with backend TaskService") rewrote `ClientApp/src/components/ui/TaskStatusActions.tsx` (376 lines changed) and `ClientApp/src/lib/utils.ts` (52 lines changed) specifically to match the backend's edge map. A separate migration, `20260714100000_WorkflowStatusOverhaul.cs`, suggests the backend status vocabulary itself was also revisited in this window. |
| **Status** | **RESOLVED** on the frontend/backend sync question — CLAUDE.md's own prose (reviewed at the top of this session) now describes the *same* status vocabulary this audit found in the code (`new → in-progress → paused / blocked / under-review → issues → completed`), so the documentation/code drift the previous audit flagged is gone. |

### 16.11 NEW: Dead `DueDateOffsetDays` Field on `SaveTemplateItemDto`

See [§14.1](#141-dead-code). A DTO property that a migration's corresponding schema column removal made permanently inert. **Severity LOW, Priority P4** (cosmetic — remove the property, or confirm the "due-date offset" template feature was deliberately dropped and update CLAUDE.md's feature description accordingly, since CLAUDE.md still lists "due-date offset" as a `TaskTemplateItem` field).

### 16.12 NEW: E2E Test Performs Destructive Delete-by-Title-Match with Hardcoded Credentials

| Field | Detail |
|---|---|
| **Module** | Test infrastructure |
| **Feature** | `ClientApp/e2e/specs/task-lifecycle.spec.ts` |
| **Description** | The spec's `resetExistingTask()` helper logs in with hardcoded credentials (`admin@pms.com` / `admin@123`), searches `/api/tasks?...&search=<title>`, and **deletes** any task matching a fixed title before recreating it, to guarantee a clean starting state for the status-machine journey it drives. This is a reasonable pattern for a disposable local/dev database, but it's a real risk if `playwright.config.ts`'s `baseURL` (`http://localhost:3001`) is ever pointed at a shared or seeded environment — the test would silently delete real data matching that title. |
| **Evidence** | `ClientApp/e2e/specs/task-lifecycle.spec.ts:26-56`; `ClientApp/e2e/playwright.config.ts:19` (`baseURL: 'http://localhost:3001'`) |
| **Impact** | Currently low (contained to a local dev port), but the pattern itself is a latent hazard if the config is ever repointed without the risk being re-evaluated |
| **Severity** | **LOW** (informational — no CI exists yet to run this unattended against a real environment) |
| **Root Cause** | Convenience pattern for deterministic E2E state |
| **Affected Files** | `ClientApp/e2e/specs/task-lifecycle.spec.ts`, `ClientApp/e2e/playwright.config.ts` |
| **Recommended Fix** | Add a guard that refuses to run destructive reset logic unless `baseURL` matches an explicit allow-list of local/CI hosts; move credentials to an env var/`.env.test` rather than inlining them in the spec |
| **Estimated Effort** | 1 hour |
| **Priority** | **P3** (before any CI/CD wiring makes this reachable unattended) |

### 16.13 NEW: Playwright Config Is Not CI-Ready

`ClientApp/e2e/playwright.config.ts` runs `headless: false` with `slowMo: 1500` and `workers: 1` (`:22-26`) — appropriate for local visual debugging, but this configuration would make a CI run both slow and require a display/Xvfb. There's no headless CI-profile variant. **Severity LOW, Priority P4** — worth a `playwright.ci.config.ts` (headless, parallel workers, no slowMo) when CI/CD is eventually added.

### 16.14 NEW (documentation gap, low severity): CLAUDE.md Still Describes Unimplemented Username Login

CLAUDE.md's "Login case sensitivity" section describes a fully-implemented three-way (email/username/mobile) login split. The code has only ever implemented two of the three branches, in both this audit and the previous one. This is flagged separately from [§16.1](#161-confirmed-bug-username-login-still-broken--persists) because it's specifically a **documentation accuracy** issue that will keep misleading anyone who reads CLAUDE.md before the code — worth fixing whichever direction is decided (implement the branch, or correct the doc) so they can't drift further apart.

### 16.15 CORRECTED FALSE POSITIVE: `Services/JwtService.cs` Is Not Dead Code — It's `PasswordHasher`, Misnamed

| Field | Detail |
|---|---|
| **Module** | Services / Auth |
| **Description** | Both the 2026-07-09 audit and this audit's own first draft asserted `Services/JwtService.cs` was dead code ("a `JwtService` class... not registered in DI... do not use it," per CLAUDE.md). Direct inspection of the file's actual contents (not performed by either audit until this correction) shows this is **false**: the file defines no `JwtService` class at all — it defines `public static class PasswordHasher` (`Services/JwtService.cs:7-32`), implementing PBKDF2 password hashing/verification via `Microsoft.AspNetCore.Cryptography.KeyDerivation`. This class is called directly (static methods need no DI registration) from `Services/AuthService.cs` (login verify, register, refresh-token flows), `Controllers/AuthController.cs:118,180,233` (OTP-registration payload hashing, reset-password), `Services/UserService.cs:90` (admin create-user), `Controllers/UsersController.cs:150` (admin reset-password), and `Services/DatabaseInitializer.cs` (seed users). It is, in short, the password-hashing implementation for the entire application — about as far from "dead code" as a file can get. The "not registered in DI" observation in both prior write-ups was a category error to begin with: static classes are never registered in DI, so that was never valid evidence of dead code even before the misidentification. |
| **Impact** | Two consecutive audits recommended deleting a file that would have broken login, registration, password reset, and user seeding app-wide had the recommendation been acted on. This is a caution about this report's own methodology, not a code defect — flagged here explicitly for transparency, and the affected recommendations (§17 P4 #23, Appendix C) have been corrected in this same revision. |
| **Severity** | **LOW** (real defect is cosmetic — see fix below; the process learning is the more important takeaway) |
| **Root Cause** | The class was evidently moved into `JwtService.cs` at some point (replacing whatever `JwtService` class the filename once matched), and neither this file's name nor CLAUDE.md's description were updated to reflect it; both audits then trusted the stale description instead of opening the file |
| **Affected Files** | `Services/JwtService.cs`, `CLAUDE.md` (dead-code note) |
| **Recommended Fix** | Rename `Services/JwtService.cs` → `Services/PasswordHasher.cs` to match its actual contents, and correct CLAUDE.md's "Notable services" description accordingly. Do **not** delete the file. |
| **Estimated Effort** | 15 minutes (rename + update ~6 `using`/reference sites, though C# doesn't require the filename to match the class name so this is purely a clarity fix, not a functional one) |
| **Priority** | **P4** |

---

## 17. Improvement Recommendations

### Priority 1 (Must Fix Before Any Production Use)

1. Externalize SMTP password (not an accepted fixed constraint, unlike DB/JWT) to an environment variable. [§3.1]
2. Fix CORS configuration to read allowed origins from configuration and include the production domain. [§3.2 / unchanged from previous P1 #2]
3. Implement username login in `AuthService.LoginAsync`. [§16.1 / unchanged from previous P1 #3]
4. ~~Delete or register `BackupController` DI dependency~~ — **DONE**, controller fully commented out.

### Priority 2 (Fix Before External User Launch)

5. Remove the `localStorage` refresh-token fallback in `ClientApp/src/lib/api.ts`. [§3.4]
6. ~~Hash password in OTP registration payload~~ — **DONE**.
7. ~~Replace `window.prompt()` with proper modals~~ — **DONE**.
8. ~~Add `[MaxLength]` to free-text fields~~ — **DONE**.
9. Fix the remaining `PausedSeconds = 0` in the per-task `ByUser` effort breakdown (`TaskService.cs:1710`). [§16.4]
10. ~~Fix `Task.dueDate` type~~ — **N/A**, feature removed; confirm this was intentional.
11. ~~Add permission caching in `AuthorizationService`~~ — **DONE**.
12. Add the still-missing `{Status, ProjectId}` composite index on `Tasks` and a `ChangedAt` index on `TaskStatusHistories`/`TaskAssignmentHistories`. [§4.6]
13. Wire Sentry (or equivalent) into `ErrorBoundary.componentDidCatch`. [§8.2]
14. `AuthorizationService`'s View-only permissive default is now a documented decision, not a bug — decide explicitly whether that's the desired posture and, if not, flip the `else` branch to `0`. [§3.5]
15. Implement `PUT /api/auth/change-password`. [§11.4 #2]
16. Migrate the login rate limiter to a distributed store if/when the app is deployed across multiple instances. [§3.3]

### Priority 3 (Improve for Stability and Scale)

17. Split `Tasks.tsx` and `Dashboard.tsx` — both grew since the last audit rather than shrinking. [§14.2]
18. Add pagination to Projects, Users, Roles, and Activities endpoints. [§11.5]
19. Add inline client-side validation to `Roles.tsx` and `Projects.tsx` to match the new, stricter backend rules. [§9.2]
20. Add security headers middleware. [§3.7]
21. Guard the destructive E2E reset helper against non-local `baseURL`s and move its hardcoded credentials to env config. [§16.12]
22. Continue splitting `DataContext` into domain-specific slices (task bulk-load removal already reduced its blast radius). [§4.4]

### Priority 4 (Quality of Life)

23. Delete genuinely dead code: `DatabaseBackupService.cs`, `Models/ChatMessage.cs`/`ChatAttachment.cs`, `SaveTemplateItemDto.DueDateOffsetDays`. Rename `Services/JwtService.cs` → `Services/PasswordHasher.cs` (it holds no JWT logic and is actively used — do NOT delete it). [§14.1, §16.15]
24. Split `GeneralDtos.cs` (now 1,139 lines) into domain-scoped files.
25. Add chat message delete/edit endpoints. [§10.7]
26. Add a headless, parallel `playwright.ci.config.ts` variant for future CI use. [§16.13]
27. Reconcile CLAUDE.md's username-login description with whichever direction #3 above resolves. [§16.14]
28. Add unit tests for the new `Validators/` layer (self-identified gap in `VALIDATION_PARITY_REPORT.md`).
29. Stand up a CI/CD pipeline (build + `dotnet test` + `npm run lint` + Playwright smoke run on PR).

---

## 18. Risk Assessment

### Risk Register

| # | Risk | Likelihood | Impact | Score | Severity | Status vs. 07-09 | Mitigation |
|---|---|---|---|---|---|---|---|
| R1 | DB credentials leaked from repo | HIGH | CRITICAL | 25 | **CRITICAL** | Unchanged (accepted, F-02) | Out of Go/No-Go scope per project owner |
| R2 | JWT key forgery (hardcoded key) | HIGH | CRITICAL | 25 | **CRITICAL** | Unchanged (accepted, F-06) | Out of Go/No-Go scope per project owner |
| R3 | SMTP credentials abused | MEDIUM | HIGH | 12 | **HIGH** | Unchanged | Externalize password |
| R4 | CORS blocking all production traffic | HIGH | HIGH | 20 | **CRITICAL** | Unchanged | Fix before deployment |
| R5 | Username login broken, users locked out | HIGH | MEDIUM | 12 | **HIGH** | Unchanged | Implement username login |
| R6 | Refresh token XSS theft via localStorage | MEDIUM | HIGH | 12 | **HIGH** | Unchanged | Remove localStorage fallback |
| R7 | Performance degradation at scale (mass task load) | HIGH | MEDIUM | 12 | **RESOLVED** ✓ | Task bulk-load removed from `DataContext` | — |
| R8 | OTP plaintext password in DB | MEDIUM | MEDIUM | 8 | **RESOLVED** ✓ | Payload now hashed | — |
| R9 | AuthorizationService permission check N+1 | HIGH | MEDIUM | 12 | **RESOLVED** ✓ | Now cached (3 queries/request) | — |
| R10 | DB performance without indexes | HIGH | MEDIUM | 12 | **MEDIUM** (↓) | OTP index added; Task/History indexes still missing | Add remaining composite indexes |
| R11 | Effort stats accuracy (paused time) | HIGH | LOW | 5 | **LOW** (↓) | Org-wide fixed; per-task per-user detail still 0 | Fix remaining `ByUser` computation |
| R12 | WCAG accessibility failures | HIGH | LOW | 5 | **MEDIUM** | Unchanged | Add ARIA labels, focus trap |
| R13 | BackupController DI exception | LOW | MEDIUM | 4 | **RESOLVED** ✓ | Controller fully commented out | — |
| R14 | SignalR token in access logs | LOW | LOW | 2 | **LOW** | Unchanged | Log scrubbing |
| R15 | No frontend monitoring | HIGH | MEDIUM | 12 | **HIGH** | Unchanged | Wire Sentry in ErrorBoundary |
| R16 | No automated backend testing | HIGH | MEDIUM | 12 | **HIGH** | Unchanged (E2E added, but backend unit tests flat) | Add backend test suite; E2E now covers frontend regressions |
| R17 | Tasks.tsx/Dashboard.tsx maintainability | HIGH | MEDIUM | 12 | **HIGH** | **Worse** — both files grew | Refactor into components |
| R18 | **(NEW)** No CI/CD — untested code can merge to master | HIGH | MEDIUM | 12 | **HIGH** | New finding this pass (was implicit before) | Stand up CI pipeline |
| R19 | **(NEW)** Destructive E2E test pattern if `baseURL` is repointed | LOW | HIGH | 6 | **MEDIUM** | New finding this pass | Add environment guard to E2E reset helpers |

---

## 19. Production Readiness Score & Go/No-Go Recommendation

### Scoring Breakdown

| Category | Weight | Score | Weighted | Δ Weighted vs. 07-09 |
|---|---|---|---|---|
| Security | 25% | 47/100 | 11.75 | +2.25 |
| Architecture & Code Quality | 20% | 79/100 | 15.80 | +0.20 |
| Feature Completeness | 20% | 90/100 | 18.00 | +1.00 |
| Performance & Scalability | 15% | 76/100 | 11.40 | +1.20 |
| UX & Accessibility | 10% | 55/100 | 5.50 | 0.00 |
| Test Coverage & Quality | 5% | 38/100 | 1.90 | +0.90 |
| Operations & Monitoring | 5% | 35/100 | 1.75 | 0.00 |
| **Total** | **100%** | | **66.10 / 100** | **+5.55** |

*(Note: the executive summary's headline figure of 67/100 rounds this weighted total; both are directionally the same conclusion — a modest, real improvement, not a step-change.)*

### Summary of Findings (this audit)

| Severity | Count | Of which NEW since 07-09 |
|---|---|---|
| CRITICAL | 2 (both accepted fixed constraints, F-02/F-06) | 0 |
| HIGH | 9 | 1 (No CI/CD, R18) |
| MEDIUM | 11 | 2 (Destructive E2E pattern, dead `DueDateOffsetDays`) |
| LOW | 11 | 3 (Playwright not CI-ready, CLAUDE.md doc drift on username login, OnlineUserTracker single-instance) |
| **Total open findings** | **33** | **6 new** (11 fully resolved, 3 partially resolved, 1 N/A since the previous audit's 36) |

### Final Verdict

> **CONDITIONAL GO for Internal/Demo Deployment** (unchanged)
> **NO-GO for External Production Launch** (unchanged)

The application's trajectory since the previous audit is positive and substantive: a real validation layer now guards every mutating endpoint, several confirmed bugs are fixed, a genuine E2E test suite exists where none did before, and two real performance bottlenecks (permission N+1, mass task load) are gone. None of that, however, touches the specific short list of items that gate an external launch — and one new operational gap (no CI/CD to keep any of this from regressing) is now explicit rather than implicit.

**Blockers for external production launch (excluding accepted fixed constraints F-02/F-03/F-06):**

| # | Blocker | Status vs. 07-09 | Effort |
|---|---|---|---|
| B1 | Externalize SMTP password | Unchanged | 1 hour |
| B2 | Fix CORS policy for the production domain | Unchanged | 2 hours |
| B3 | Fix username login implementation | Unchanged | 30 minutes |
| B4 | Resolve BackupController DI crash | **DONE** | — |
| B5 | Remove refresh-token localStorage fallback | Unchanged (new, elevated from P2) | 3 hours |

**Total estimated effort to clear blockers: ~6.5 hours** (down from ~7 hours, since B4 is done — offset by promoting B5 into the blocker list given it's been open across two audit cycles unaddressed).

After clearing these, the remaining HIGH-severity items (distributed rate limiting, remaining DB indexes, frontend Sentry wiring, `Tasks.tsx`/`Dashboard.tsx` refactor, CI/CD) should be addressed within **2–3 weeks**, consistent with the previous audit's guidance, before expanding to a broader user base.

---

## Appendix A: Files Reviewed

**Backend (this pass, full or targeted read):**
- `Program.cs` (full)
- `appsettings.json`
- `Services/AuthService.cs` (full), `Services/AuthorizationService.cs` (full), `Services/OtpService.cs` (full), `Services/OnlineUserTracker.cs` (full)
- `Services/TaskService.cs` (targeted: effort-stats region, lines ~1440-1730)
- `Controllers/BackupController.cs` (full), `Controllers/AuthController.cs` (targeted grep), `Controllers/UsersController.cs`/`ProjectsController.cs` (targeted), `Controllers/TasksController.cs` (attachment region), `Controllers/ChatController.cs` (targeted grep)
- `Middleware/LoginRateLimitMiddleware.cs` (full)
- `Hubs/ChatHub.cs` (targeted grep)
- `Validators/` — all 11 files reviewed (`ProjectValidators.cs` full; others via `VALIDATION_PARITY_REPORT.md` + targeted grep against `TaskValidators.cs`, `ChatValidators.cs`)
- `Filters/ValidationFilter.cs` (referenced via Program.cs registration and the parity report; not read in full this pass)
- `Data/PMSDbContext.cs` (targeted: index declarations, DueDate references)
- `Migrations/20260825103232_RemoveDueDateColumns.cs` (full), migration list (`dotnet ef migrations list`, live DB)
- `VALIDATION_PARITY_REPORT.md` (full — treated as a primary source for the validation-layer changes, cross-checked against actual validator files rather than trusted blindly)

**Frontend (this pass):**
- `ClientApp/src/context/DataContext.tsx` (targeted: fetchData, task state)
- `ClientApp/src/lib/api.ts` (targeted: refresh-token storage)
- `ClientApp/src/pages/Tasks.tsx` (targeted: line count, aria-label count, window.prompt grep)
- `ClientApp/src/pages/Roles.tsx` (targeted grep: validation)
- `ClientApp/src/components/ui/Modal.tsx` (full)
- `ClientApp/src/App.tsx` (targeted: ErrorBoundary)
- `ClientApp/src/types/index.ts` (targeted: Task interface, dueDate/OverdueTaskRow)
- `ClientApp/src/services/task.service.ts` (targeted grep)
- `ClientApp/e2e/playwright.config.ts` (full), `ClientApp/e2e/specs/task-lifecycle.spec.ts` (partial), file listing of all 13 specs
- `ClientApp/package.json` (full)
- `DTOs/GeneralDtos.cs` (targeted: template item region, line count)

**Not re-read in full this pass** (carried forward from the previous audit's Appendix A on the assumption that no commit in the reviewed range touched them; flagged inline wherever a finding depends on this): `Sidebar.tsx`, `DashboardLayout.tsx`, full `Reports.tsx`, full `ChatContext.tsx`, `ProjectDetails.tsx`, `Diary.tsx`.

---

## Appendix B: Test Coverage Assessment

### Backend — Unchanged

`PMS.Tests/` still contains exactly the same 3 files as the previous audit:
- `UnitTest1.cs` — 10 lines, placeholder.
- `AuthServiceTests.cs` — 155 lines.
- `StatusTransitionTests.cs` — 218 lines.

No tests exist for the new `Validators/` layer, `AuthorizationService`'s permission caching, `OnlineUserTracker`, or any controller. **Backend automated coverage is still approximately 5-10%,** unchanged from the previous audit's estimate.

### Frontend E2E — Substantially New

`ClientApp/e2e/` now contains **13 Playwright spec files totaling ~1,938 lines**, plus page-object helpers (`pages/*.ts`), fixtures (`fixtures/auth.fixture.ts`, `fixtures/chat.fixture.ts`), and a `global-setup.ts` that persists an authenticated `storageState`:

| Spec | Lines | Coverage area |
|---|---|---|
| `tasks.spec.ts` | 465 | Task CRUD, list/Kanban interactions |
| `task-lifecycle.spec.ts` | 324 | Full status-machine walk (10 edges) driven through the real UI |
| `users.spec.ts` | 241 | User CRUD, activate/deactivate |
| `projects.spec.ts` | 203 | Project CRUD, member management |
| `auth-e2e.spec.ts` | 102 | Auth flows |
| `auth.spec.ts` | 129 | Auth flows |
| `register-login.spec.ts` | 104 | Registration + OTP + login |
| `roles.spec.ts` | 119 | Role/permission management |
| `reports.spec.ts` | 58 | Reports page |
| `chat.spec.ts` | 57 | Chat send/receive |
| `dashboard.spec.ts` | 44 | Dashboard widgets |
| `permissions.spec.ts` | 44 | Permission-gated route access |
| `navigation.spec.ts` | 48 | Routing/sidebar |

This is a genuine, substantial answer to the previous audit's "no frontend tests found" finding and its Appendix B recommendation #3/#4. Caveats: no CI runs these automatically (see [§15](#15-missing-features--incomplete-implementations) #10), the config is headed/slowMo'd rather than CI-ready ([§16.13](#1613-new-playwright-config-is-not-ci-ready)), and one spec's destructive reset pattern warrants a guard before any CI wiring ([§16.12](#1612-new-e2e-test-performs-destructive-delete-by-title-match-with-hardcoded-credentials)).

**No unit/component tests** (Vitest/Jest/React Testing Library) were found for individual React components — the new automated coverage is entirely at the E2E layer.

### Revised Estimate

Combining both layers: **Backend unit ~5-10% (unchanged) + a new, real E2E layer covering the primary user journeys across 9 of the app's ~13 top-level pages.** This is enough to catch regressions in the main flows this audit exercised conceptually, but it is not a substitute for backend unit coverage of the new validators, `TaskService`'s status machine internals, or `AuthorizationService`'s permission logic — none of which have dedicated tests.

---

## Appendix C: Delta vs. 2026-07-09 Audit

### A note on git history continuity

`git log --since=2026-07-09` returns the repository's entire history (`58a7c53` "initial commit" through `a8ce238`), because this repository's own first commit (`58a7c53`) is timestamped **2026-08-20** — *after* the previous audit's stated date — and that initial commit already contains the previous `AUDIT_REPORT.md` verbatim as a checked-in file. In other words, **the git history available to this audit does not span back to 2026-07-09**; it appears the project's history was squashed/re-initialized on 2026-08-20 with the 07-09 audit report carried forward as a document, not as something git can diff against directly.

Practically, this means: every finding in this report was verified by **reading current file contents directly** and comparing them against the previous report's prose/evidence (as instructed), rather than by trusting `git diff` against a 07-09 snapshot that doesn't exist in this repo's reachable history. The 15 commits dated 2026-08-20 → 2026-08-25 (`036a82b` … `a8ce238`) were used as a secondary signal for *what recently changed* (e.g., which files were touched by the validation-layer pass, which by the dashboard-widget pass), not as the sole basis for RESOLVED/PERSISTS determinations.

### Consolidated Status Table

| Previous finding (07-09 §) | Status | Evidence this audit |
|---|---|---|
| §3.1 DB credentials plaintext | PERSISTS (accepted, F-02) | `appsettings.json:4` |
| §3.2 SMTP password plaintext | PERSISTS (not accepted) | `appsettings.json:29-30` |
| §3.3 Hardcoded JWT key | PERSISTS (accepted, F-06) | `appsettings.json:7`, `Program.cs:72` |
| §3.4 CORS localhost-only | PERSISTS | `Program.cs:188-197` |
| §3.5 Swagger unconditional | PERSISTS (accepted, F-03) | `Program.cs:201-202` |
| §3.6 Rate limiter in-memory | PERSISTS | `Middleware/LoginRateLimitMiddleware.cs:17` |
| §3.7 Refresh token in localStorage | PERSISTS | `ClientApp/src/lib/api.ts:11,25,44,52` |
| §3.8 Impersonation audit controls | Not re-verified | — |
| §3.9 No MaxLength on free text | **RESOLVED** | `Validators/TaskValidators.cs:82`, `Validators/ChatValidators.cs:13` |
| §3.10 OTP plaintext password | **RESOLVED** | `Controllers/AuthController.cs:110-121` |
| §3.11 No CSRF protection | Unchanged (cookie SameSite=Strict already mitigates) | `Controllers/AuthController.cs:83` |
| §3.12 SignalR token in query string | PERSISTS (protocol limitation) | `Program.cs:94-101` |
| §3.13 Missing security headers | PERSISTS | No middleware found |
| §4.1 Mass task load on login | **RESOLVED** | `DataContext.tsx:100-106` |
| §4.2 AuthorizationService N+1 | **RESOLVED** | `AuthorizationService.cs:64-93` |
| §4.3 GetEffortStatsAsync full load | **PARTIALLY RESOLVED** | `TaskService.cs:1449-1467` |
| §4.4 DataContext God Object | PERSISTS (narrower) | `DataContext.tsx` now 567 lines, no tasks |
| §4.5 window.prompt() | **RESOLVED** | grep-confirmed absent |
| §4.6 Missing DB indexes | **PARTIALLY RESOLVED** | `PMSDbContext.cs:417,426` added; Task/History still missing |
| §4.7 Bundle analysis | PERSISTS | Not performed |
| §9 ProjectDto/Roles/Auth zero validation | **RESOLVED** | `Validators/` (11 files) |
| §11.4 Missing task attachment endpoints | **RESOLVED** | `TasksController.cs:594-644` |
| §11.4 Missing change-password endpoint | PERSISTS | grep-confirmed absent |
| §11.4 Missing chat delete/edit | PERSISTS | grep-confirmed absent |
| §11.5 No pagination (Projects/Users/etc.) | PERSISTS | `UsersController.cs:35-40`, `ProjectsController.cs:26-31` |
| §12 Accessibility (ARIA, focus trap) | PERSISTS | `Tasks.tsx` (2 aria-labels/3152 lines), `Modal.tsx` (no trap) |
| §14.1 JwtService.cs dead code | **CORRECTED — false positive carried across two audits.** File holds the live `PasswordHasher` class, actively used app-wide; not dead. Misleading filename only (§16.15) | `Services/JwtService.cs:7-32`, 5 call sites |
| §14.1 DatabaseBackupService dead code | PERSISTS (crash risk gone) | file present, unregistered; controller commented out |
| §14.1 Models/ChatMessage.cs placeholders | PERSISTS | files present |
| §14.2 Tasks.tsx size | **WORSE** | 2,774→3,152 lines |
| §14.2 DataContext.tsx size | **BETTER** | 646→567 lines |
| §14.2 GeneralDtos.cs size | **WORSE** | 927→1,139 lines |
| §14.2 Working hours hardcoded in frontend | **RESOLVED** | grep-confirmed absent from `TaskEffortPanel.tsx` |
| §14.2 Username login missing | PERSISTS | `AuthService.cs:37-62` |
| §15.6 Frontend Sentry not wired | PERSISTS | `App.tsx:55-57` |
| §16.1 Username login broken | PERSISTS | see §16.1 above |
| §16.2 Permissive default (CanViewAsync) | **PARTIALLY RESOLVED** | now View-only, documented; `AuthorizationService.cs:85-92` |
| §16.3 BackupController 500 | **RESOLVED** | `BackupController.cs` fully commented out |
| §16.4 PausedSeconds always zero | **PARTIALLY RESOLVED** | org-wide fixed (`TaskService.cs:1559,1580`); per-task still 0 (`:1710`) |
| §16.5 CORS blocks production | PERSISTS | see §3.2/§16.5 above |
| §16.6 Task.dueDate type bug | **N/A** | field/column removed entirely |
| §16.7 OtpCleanupService race | PERSISTS | Not independently re-verified this pass; no relevant commit found |
| §16.8 Status-machine doc/code mismatch | **RESOLVED** | `TaskStatusActions.tsx`/`lib/utils.ts` re-synced (commit `6f422e6`); CLAUDE.md now matches code |

### New Findings Since 2026-07-09

1. No CI/CD pipeline exists (§15 #10, §18 R18) — elevated to an explicit HIGH finding this pass.
2. `SaveTemplateItemDto.DueDateOffsetDays` is now dead DTO surface following the due-date column removal (§16.11).
3. `task-lifecycle.spec.ts`'s destructive reset pattern + hardcoded credentials (§16.12).
4. `playwright.config.ts` is not CI-ready (headed, slowMo, single worker) (§16.13).
5. CLAUDE.md's username-login description still doesn't match the code, now confirmed across two audit cycles (§16.14).
6. `OnlineUserTracker` is a new single-instance in-memory singleton with the same horizontal-scaling caveat as the rate limiter (§4.7) — informational, not a regression, but newly introduced surface with that limitation baked in from day one.

---

*Report generated: 2026-08-26 | Auditor: Claude Sonnet 5 | Previous audit: 2026-07-09 (Claude Sonnet 4.6)*
