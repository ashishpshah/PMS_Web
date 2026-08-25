# Phase 12 – Code Quality Review

**Source evidence:** Full codebase analysis across all phases. All findings reference specific files and lines where known.

Severity: **Critical** > **High** > **Medium** > **Low** > **Info**

---

## 12.1 Security Issues

| ID | Severity | Issue | Location | Recommendation |
|---|---|---|---|---|
| SEC-01 | High | JWT signing key hardcoded in `appsettings.json` and committed to source control | `appsettings.json:JwtSettings:Key` | Move to environment variable or secrets manager |
| SEC-02 | High | Database connection string with credentials committed to source control | `appsettings.json:ConnectionStrings` | Move to user secrets / environment variable |
| SEC-03 | High | HTTPS redirection commented out (`UseHttpsRedirection()`) | `Program.cs` | Enable HTTPS in production |
| SEC-04 | High | Swagger UI unconditionally enabled in production | `Program.cs:app.UseSwagger()` | Gate behind `env.IsDevelopment()` or auth |
| SEC-05 | Medium | `GET /api/users/check-availability` does not require authentication (no `[Authorize]`) | `Controllers/UsersController.cs` | Add `[Authorize]` to prevent username enumeration |
| SEC-06 | Medium | Password reset returns the temporary password in the API response body | `Controllers/UsersController.cs:128` | Consider email delivery instead |
| SEC-07 | Medium | No token revocation — deactivating a user does not invalidate existing JWTs | `Services/AuthService.cs` | Implement token revocation list or short-lived tokens |
| SEC-08 | Low | `avatarUrl` JWT claim derived from `Context.User` in ChatHub but not validated for format | `Hubs/ChatHub.cs:27` | Validate URL format or store only the path |

---

## 12.2 Business Logic Issues

| ID | Severity | Issue | Location | Recommendation |
|---|---|---|---|---|
| BL-01 | High | Reassigning a task auto-resolves blocks and advances status, but does NOT record a status history row for the block resolution | `Services/TaskService.cs:ReassignTaskAsync` | Add `TaskStatusHistory` row when auto-resolving blocks |
| BL-02 | Medium | `MarkAllChecklistComplete` is accessible to any authenticated user at the controller level but should be restricted to the assignee | `Controllers/TasksController.cs` vs `Services/TaskService.cs` | Add user ID check to controller or enforce in service |
| BL-03 | Medium | `AssignTaskAsync` records history with `ChangedById = task.CreatedById` (always creator), even when a manager assigns | `Services/TaskService.cs:460` | Pass the actual `requesterId` instead |
| BL-04 | Medium | `RecalculateTaskProgress` auto-advances from `issues` to `under-review` by calling an internal helper, not via `ChangeStatusAsync` — bypasses all validation | `Services/TaskService.cs` | Route auto-advance through `ChangeStatusAsync` |
| BL-05 | Low | `UpdateTaskAsync` does not log an `Activity` record for the update | `Services/TaskService.cs:UpdateTaskAsync` | Add activity logging on task updates |
| BL-06 | Low | Checklist `OrderIndex` is not enforced on insert — items may be added without a meaningful order | `Services/TaskService.cs:AddChecklistItemAsync` | Assign `OrderIndex = current max + 1` on add |

---

## 12.3 Architecture & Design Issues

| ID | Severity | Issue | Location | Recommendation |
|---|---|---|---|---|
| ARCH-01 | High | Some controllers access `PMSDbContext` directly, bypassing the service layer | `Controllers/TasksController.cs`, `Controllers/ChatController.cs` | Move all DB access to services |
| ARCH-02 | Medium | `JwtService` class exists in `Services/AuthService.cs` but is dead code — not registered in DI | `Services/AuthService.cs:JwtService` | Delete the class |
| ARCH-03 | Medium | `PasswordHasher` class is embedded in `AuthService.cs` rather than its own file | `Services/AuthService.cs` | Extract to `Services/PasswordHasher.cs` |
| ARCH-04 | Medium | `DatabaseBackupService` is commented out in DI registration — present but non-functional | `Program.cs`, `Services/DatabaseBackupService.cs` | Remove or fully wire up |
| ARCH-05 | Low | `Models/ChatMessage.cs` and `Models/ChatAttachment.cs` are placeholder files; actual entities are in `Data/PMSDbContext.cs` | `Models/` | Remove placeholder files or move entities |
| ARCH-06 | Low | All entity configurations are in a single `PMSDbContext.cs` (640 lines); navigation properties double as entity declarations | `Data/PMSDbContext.cs` | Split into `IEntityTypeConfiguration<T>` files |

---

## 12.4 Performance Issues

| ID | Severity | Issue | Location | Recommendation |
|---|---|---|---|---|
| PERF-01 | High | Effort calculations filter working hours in-memory after loading all rows | `Services/ReportService.cs` | Apply date filter in SQL using parameterized query |
| PERF-02 | Medium | `GetRoomsForUserAsync` loads all messages for all rooms to determine the last message | `Services/ChatService.cs` | Use `GROUP BY` or a lateral join to fetch only the latest message per room |
| PERF-03 | Medium | `IsMemberAsync` may use `.Any()` on a collection already loaded in memory (N+1 risk) | `Hubs/ChatHub.cs:65-68` | Ensure `IsMemberAsync` uses a targeted SQL query |
| PERF-04 | Low | `Members.Count()` on a loaded navigation collection uses LINQ-to-objects after EF loads the list | `Services/ProjectService.cs` | Use `_context.ProjectMembers.CountAsync(pm => pm.ProjectId == id)` |
| PERF-05 | Low | Frontend `DataContext` loads ALL tasks on every `refreshData()` call regardless of what changed | `ClientApp/src/context/DataContext.tsx` | Implement targeted refresh by entity type |

---

## 12.5 Error Handling & Resilience Issues

| ID | Severity | Issue | Location | Recommendation |
|---|---|---|---|---|
| ERR-01 | Medium | Status change and other endpoints return HTTP 200 with `{ Success: false }` for business errors | Multiple controllers | Use HTTP 4xx codes for client errors; 200 should mean success |
| ERR-02 | Medium | Frontend `apiRequest()` maps HTTP status codes to typed errors by comparing message strings | `ClientApp/src/lib/api.ts` | Use structured error codes in API response |
| ERR-03 | Medium | Multi-step DB operations (reassign, status change) are not wrapped in transactions | `Services/TaskService.cs` | Use `await _context.Database.BeginTransactionAsync()` |
| ERR-04 | Low | `OnDisconnectedAsync` in ChatHub does not handle the case where the connection ID was never added to `OnlineUsers` | `Hubs/ChatHub.cs:51-56` | Already uses `TryRemove` — low risk, defensive code is correct |

---

## 12.6 Code Maintainability Issues

| ID | Severity | Issue | Location | Recommendation |
|---|---|---|---|---|
| MAINT-01 | Medium | No `CancellationToken` propagation to most service methods | `Services/TaskService.cs`, `Services/ProjectService.cs` | Add `CancellationToken ct = default` parameter throughout |
| MAINT-02 | Medium | `ReasonTags.Valid` is a `List<string>` — O(N) for membership test | `DTOs/GeneralDtos.cs:8` | Change to `HashSet<string>` |
| MAINT-03 | Low | Notification sound file referenced from an external CDN URL | `ClientApp/src/context/ChatContext.tsx` | Bundle the sound file locally |
| MAINT-04 | Low | Several `useEffect` hooks in frontend components have incomplete dependency arrays | `ClientApp/src/pages/` | Fix dependency arrays per ESLint `exhaustive-deps` rule |
| MAINT-05 | Low | `loadHistory` function in `ChatContext` closes over a stale ref | `ClientApp/src/context/ChatContext.tsx` | Use `useCallback` with correct deps |
| MAINT-06 | Info | `AppClock.Now` is defined but some tests/scripts may use `DateTime.UtcNow` directly | Multiple service files | Audit and replace with `AppClock.Now` |

---

## 12.7 Frontend-Specific Issues

| ID | Severity | Issue | Location | Recommendation |
|---|---|---|---|---|
| FE-01 | Medium | `DataContext` uses a `Set` for tracking loaded task IDs but mutates the set directly in `useState` | `ClientApp/src/context/DataContext.tsx` | Replace with `useRef` or create a new Set on each update |
| FE-02 | Medium | `403` toast notification is fired in `api.ts` but the `NotificationPopup` shows it again via `ReceiveNotification` (double-toast risk) | `ClientApp/src/lib/api.ts` + `ChatContext.tsx` | De-duplicate notification sources |
| FE-03 | Low | Each `ReceiveNotification` event creates a new notification without a stable ID, causing toast de-duplication to fail | `ClientApp/src/context/ChatContext.tsx` | Include a unique `notificationId` in `NotificationDto` |
| FE-04 | Low | `useAvailability` in registration has no abort controller for in-flight requests | `ClientApp/src/hooks/useAvailability.ts` | Add `AbortController` to cancel stale requests |
| FE-05 | Info | Timezone is not configured globally on the frontend — date rendering uses browser local time, not IST | `ClientApp/src/` | Document the expected timezone or use `date-fns-tz` |

---

## 12.8 Positive Observations (What Works Well)

| ID | Observation |
|---|---|
| POS-01 | `AllowedEdges` dictionary cleanly encodes the state machine — easy to extend |
| POS-02 | `ValidateStatusTransition` is a pure synchronous method — highly testable |
| POS-03 | `AppClock.Now` correctly centralizes time access for testability |
| POS-04 | `ApiResponse<T>` envelope is consistent across all endpoints |
| POS-05 | `AsSplitQuery()` correctly prevents cartesian-product explosion on multi-include queries |
| POS-06 | SignalR group naming convention (`room_{id}`) is simple and correct |
| POS-07 | `ConcurrentDictionary` for online users is thread-safe |
| POS-08 | Magic-byte validation for file uploads is stronger than extension-only checks |
| POS-09 | Path traversal guard on file downloads is implemented |
| POS-10 | `Task.WhenAll` is used correctly for parallel DB queries in dashboard stats |
| POS-11 | Per-request user cache in `AuthorizationService` prevents repeated DB round-trips |
| POS-12 | PBKDF2 with 100,000 iterations is a strong password hashing configuration |

---

## 12.9 Priority Fix Ranking

| Priority | ID | Why |
|---|---|---|
| P0 | SEC-01 | Hardcoded JWT key in committed code — direct credential leak |
| P0 | SEC-02 | DB credentials in committed code — direct credential leak |
| P1 | SEC-03 | No HTTPS — token interception possible in transit |
| P1 | SEC-04 | Swagger in production exposes internal schema |
| P1 | ARCH-01 | Controllers bypass service layer — breaks testability and encapsulation |
| P2 | ERR-03 | Missing transactions — partial writes on failure |
| P2 | PERF-01 | In-memory effort date filtering — performance degrades with data growth |
| P2 | BL-01 | Missing status history row on block auto-resolution |
| P3 | SEC-05 | Unauthenticated username check endpoint |
| P3 | ERR-01 | 200 for business errors confuses API consumers |
| P3 | MAINT-01 | Missing CancellationToken propagation |
