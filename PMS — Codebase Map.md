PMS — Codebase Map
A full-stack .NET 6 / React 19 project & task management system. Frontend and backend live in the same repo: backend in project root, frontend in ClientApp/. ASP.NET Core serves the React SPA from a single host (API + static files + SPA fallback). This map covers every layer the codebase actually implements.

1. Solution / Project Setup
Project root: .NET 6 ASP.NET Core app. Program.cs wires JWT, EF Core, AutoMapper, SignalR, Swagger, CORS, SPA fallback. DatabaseInitializer runs on startup and applies EF migrations + seeds roles, page modules, permissions, and the SystemAdmin user.
Backend launch profile: dotnet run --launch-profile http → http://localhost:5178.
Frontend (Vite 6 + React 19 + TS): ClientApp/, npm run dev → http://localhost:3000. Vite dev proxy forwards /api → http://localhost:5178. npm run build produces ClientApp/dist/; dotnet publish runs the frontend build then copies dist → wwwroot via MSBuild.
Build lock caveat: if the backend is running, dotnet build/dotnet ef can't copy TaskManagement.exe. Either stop the process or build to a temp dir: dotnet build -c Debug -p:OutputPath=obj\buildcheck.
appsettings.json: active ConnectionStrings:DefaultConnection points to remote sql.bsite.net; a parked alternate (LocalDB) is under DefaultConnection_. JWT key/issuer/audience + ExpiryMinutes: 420 (7h).
2. Database (Data/PMSDbContext.cs)
22 entities, single EF Core DbContext, with OnModelCreating configuring all relationships, indexes, decimal precision, and cascade behaviors.

#	Entity	Key fields / role
1	Role	Id, Name, Code (unique nullable), Level, IsAdmin, IsActive. RoleId=1 is the seeded SystemAdmin.
2	User	Id, UserName (unique), Email (unique), FirstName, LastName, FullName (derived First+Last), PasswordHash, RoleId, AvatarUrl, ContactNo, IsActive, CreatedAt/UpdatedAt (IST via AppClock.Now).
3	Project	Id, Code (PRJ-PP), SeqNumber, Name, Description, Status, StartDate, EndDate, CreatedById, OwnerId. Child collections: Members, Tasks, AssignmentHistory, Modules.
4	ProjectMember	composite key (ProjectId, UserId), RoleInProject, JoinedAt.
5	ProjectModule	composite key (ProjectId, Name); module name string.
6	TaskEntity	Id, Code (TSK-PP-TT or SUB-PP-TT-SS), SeqNumber, Title, Description, Status, Priority, ProjectId, AssignedToId, CreatedById, DueDate, EstimatedHours, ActualHours (decimal(18,2)), Progress, Module, Tags, Comments, Attachments, StartedAt/StartedById, ParentTaskId (self-FK), RequiresQA, QaAssigneeId, ChecklistItems, BlockEntries, StatusHistory, AssignmentHistory.
7	TaskTag	composite key (TaskId, Tag).
8	TaskComment	Id, TaskId, UserId, Content, CreatedAt.
9	Attachment	Id, TaskId, FileName, FilePath, FileType, FileSize, UploadedById, UploadedAt.
10	Activity	Id, UserId, UserName, Action, TargetType, TargetId, TargetName, Timestamp. Last 100 served.
11	PageModule	Id, Name, Route, Description. Seeded: Dashboard /, Projects /projects, Tasks /tasks, Users /users, Roles /roles.
12	RolePagePermission	Id, RoleId, PageModuleId, Permissions (int bitmap: View=1, Create=2, Update=4, Delete=8, full=15).
13	UserPagePermission	per-user override of the same bitmap.
14	ProjectAssignmentHistory	owner reassignment audit: PreviousOwnerId, NewOwnerId, ChangedById, ReasonTag, ChangedAt.
15	TaskAssignmentHistory	assignee reassignment audit, same shape.
16	ChecklistItem	Id, TaskId, Title, IsCompleted, CompletedAt, CompletedById, OrderIndex, CreatedAt.
17	TaskBlockEntry	Id, TaskId, BlockedById, BlockedByName, Reason, IsActive, BlockedAt, ResolvedAt. Unique (TaskId, BlockedById).
18	TaskStatusHistory	Id, TaskId, FromStatus, ToStatus, ChangedById, Reason, ActualHours, ChangedAt — the foundation of derived effort.
19	ChatMessage	`Id, Content, SenderId, SentAt, MessageType (text
20	ChatAttachment	1:1 with ChatMessage (MessageId); stored on disk under wwwroot/chat-uploads/yyyy/mm/<guid.ext>.
21	ChatRoom	`Id, Name, RoomType (public
22	ChatRoomMember	composite key (RoomId, UserId), JoinedAt.
Conventions enforced by OnModelCreating: most FKs are Restrict (so deletes don't cascade unexpectedly); checklist/block entries use Cascade from task; status history is Cascade from task. UserName/Email are unique; role/project/task Code are unique via filtered indexes. Decimal precision is decimal(18,2) for hours.

Migrations (Migrations/):

20260528100015_InitialCreate
20260530055225_AddUserFirstLastName_UniqueIndexes
20260530062946_AddRoleIsActive
20260530091733_AddStatusHistoryActualHours (latest)
DatabaseInitializer runs MigrateAsync on boot, then conditionally seeds the SystemAdmin role + page modules + RolePagePermission(15) for SystemAdmin and the admin / admin@123 user.

3. Backend Services (Services/)
All business logic lives in services; controllers stay thin. Each service has a corresponding interface, registered as Scoped in Program.cs.

TaskService (largest service, ~1500 lines)
Owns the full task lifecycle. Highlights:

Status workflow — ValidStatuses (7) and AllowedEdges (from→to map mirroring TaskStatusActions.tsx ALLOWED_EDGES): new → in-progress|completed; in-progress → paused|blocked|under-review|completed; paused → in-progress|completed; blocked → in-progress|completed; under-review → issues|in-progress|completed; issues → in-progress|completed; completed → in-progress (reopen, manager-only).
Mandatory hours — ActualHoursExemptStatuses = { "new" }; entering any other status requires actualHours > 0. Enforced in ValidateStatusTransition. qa/pass and qa/fail controllers pass requireActualHours: false.
Checklist gates — under-review/completed require Progress == 100 (only when the task has any checklist items). RecalculateTaskProgressAsync updates Progress from checklist ratio and auto-transitions: 100% while in-progress → under-review; uncheck while in review → back to in-progress.
Block lifecycle — SetTaskBlockAsync upserts a TaskBlockEntry per (TaskId, BlockedById), sets status to blocked; unblock deactivates ALL active entries and resumes to in-progress. ChangeStatusAsync auto-resolves active blocks on leaving blocked.
Hierarchy codes — CodeGenerator.NextTaskCodeAsync → TSK-PP-TT; NextSubtaskCodeAsync → SUB-PP-TT-SS (uses parent project + parent task seq numbers).
Status history — every transition writes a TaskStatusHistory row including ActualHours (exempt only for new). QA approval and rejection are reviewer actions and don't require hours.
Reassignment — ReassignTaskAsync requires a ReasonTag from ReasonTags.Valid (Resignation, Workload Balancing, Management Decision, Unavailability, No Resource, Unable to Complete, Admin Decision, Other). Auto-resolves any active block entries; if status was blocked, resumes to new (not started) or in-progress.
Derived effort — GetTaskEffortAsync reads TaskStatusHistories + TaskAssignmentHistories and runs the pure ComputeEffort (also exposed for tests) which:
Builds status segments [StartAt, EndAt) via EffortHelpers.BuildStatusSegments.
Groups durations by status → productive = in-progress, paused, blocked, under-review, other.
Builds assignment windows per user via EffortHelpers.BuildAssignmentWindows.
Intersects segments with windows, applies the IST working-hours filter (10:00–19:00, see EffortHelpers.WorkingOverlap), and attributes seconds to each user.
Returns TaskEffortDto with ByStatus, ByUser, Timeline, plus a computed IsRunning flag.
Org-wide stats — GetEffortStatsAsync(fromUtc, toUtc) runs the same derivation across all tasks in bulk (3 query batches to avoid N+1) and returns DashboardEffortDto with totals + live snapshot (UsersCurrentlyWorking from current status, not windowed) + top 5 productive users.
Other endpoints — AssignTaskAsync, AddCommentAsync, checklist CRUD (Add/Toggle/Update/Delete/MarkAllComplete), GetCommentsAsync with optional userId/from/to filters, GetTaskAssignmentHistoryAsync, GetTaskBlockEntriesAsync, GetDashboardStatsAsync, GetTaskEntityAsync, IsPreviousAssigneeAsync, GetStatusHistoryAsync.
ProjectService
CRUD with hierarchy code (PRJ-PP) generation; Progress is computed as Average(t.Progress) over child tasks.
UpdateProjectAsync reconciles Modules (replace-on-update) and refuses to remove a module that is still in use by any task (returns the list of task codes using it).
DeleteProjectAsync cascades removal of ProjectMembers, ProjectAssignmentHistories, and per-task children (Tags, Comments, Attachments, TaskAssignmentHistories, ChecklistItems).
ReassignProjectAsync writes a ProjectAssignmentHistory row (with reason tag).
SetProjectMembersAsync diffs existing vs incoming userIds and adds/removes ProjectMember rows; new members default to "Developer".
UserService
CRUD with SystemAdminRoleId = 1 as a protected, single seeded account: cannot be assigned to new users, and the seeded admin's role is never demoted on update.
Unique UserName and Email (case-insensitive via ToLower() matching) excluding self on update.
DeleteUserAsync is a soft delete (sets IsActive = false).
AuthService
LoginAsync matches either usernameOrEmail or legacy email field, case-insensitive.
RegisterAsync auto-assigns the lowest-privilege non-admin role (lowest Level, Id != 1, !IsAdmin). If none exists, registration is refused.
CheckAvailabilityAsync returns AvailabilityDto (live username/email availability check, with excludeUserId for edit form).
JWT generated inline (7-day expiry, DateTime.UtcNow — explicitly NOT routed through AppClock).
BuildLoginResponse returns LoginResponseDto { Token, User }; IsAdmin is RoleId == 1 || (Role?.IsAdmin ?? false).
RoleService
List/get/save/delete. Excludes Id == 1 (SystemAdmin) everywhere.
SaveRoleAsync is upsert; enforces Code uniqueness case-insensitive excluding self.
DeleteRoleAsync is a hard delete.
ActivityService
GetAllActivitiesAsync returns the most recent 100 activities (server-side).
CreateActivityAsync is a public write endpoint but in practice all activity rows are written by services inline (ChangeStatusAsync, ReassignTaskAsync, ReassignProjectAsync, checklist ops, etc.).
ChatService
Public + private + direct rooms; RoomType ∈ { public, private, direct }.
GetRecentMessagesAsync supports beforeId for infinite scroll and roomId filter.
GetRoomsForUserAsync returns public rooms OR rooms the user is a member of; sets the displayed name for direct rooms to the other member's FullName.
GetOrCreateDirectRoomAsync finds an existing 2-member direct room between two users, or creates one named "<me>_<other>".
SaveMessageAsync saves the message, optionally links a pre-uploaded attachment by AttachmentId, and re-loads with Sender + Attachment + ReplyTo includes.
SaveAttachmentAsync writes the file under wwwroot/chat-uploads/yyyy/mm/<guid.ext> (creates directories), then persists a ChatAttachment row.
ValidateFile enforces 20 MB max + an allowlist of extensions (images, video, pdf/doc/xls/ppt, zip/rar/7z, txt/csv/json/xml).
MapToDto flattens attachment + reply-to into the wire shape.
NotificationService
Thin wrapper over SignalR IHubContext<ChatHub>. Sends a ReceiveNotification event to the recipient's SignalR user identifier (the JWT NameIdentifier claim = user id). NotifyUsersAsync de-dupes and fans out.

ReportService
Five windowed reports, all using the same EffortHelpers machinery:

GetUserEffortReportAsync(from, to, requestingUserId, isAdmin) — per-user totals (productive/paused/blocked/under-review) + task count. Non-admins are auto-restricted to themselves.
GetUserTransitionReportAsync(from, to, ...) — counts of (fromStatus → toStatus) transitions per user, attributed to the assignee at the moment of transition. Includes MostCommonTransition.
GetUserTaskEffortAsync(targetUserId, from, to, ...) — per-task breakdown for a single user. Non-admins may only query their own data.
GetUserDailyEffortAsync(targetUserId, from, to, ...) — per-calendar-day breakdown (one row per day in range), iterating each segment-day intersection.
GetHoursSummaryAsync(from, to, userId?, projectId?, ...) — full 3-way breakdown (by user / by task / by project). Non-admins are forced to filterUserId = self. Project filter is applied at task load.
AuthorizationService
IsSystemAdmin() — RoleId == 1.
IsAdmin() — RoleId == 1 || (Role?.IsAdmin ?? false).
GetCurrentUserId() / GetCurrentUserRole() — reads NameIdentifier and Role/role claims from the current HTTP context.
CanView/CanCreate/CanUpdate/CanDelete(route) — bitmap check against PageModule.Route:
//""/dashboard always allowed.
SystemAdmin / IsAdmin → all permissions.
User-level UserPagePermission overrides role-level RolePagePermission.
View: missing role record → allow (default). Create/Update/Delete: missing role record → deny.
CanCreate/CanUpdate/CanDelete are bitmaps 2, 4, 8; CanView is bit 1.
AppClock
Single source of truth for "now". Resolves IST (India Standard Time / Asia/Kolkata, custom UTC+5:30 fallback) and returns DateTime.Now as DateTimeKind.Unspecified (so it stores/serializes as a bare wall-clock, no Z/offset). Explicitly does not apply to JWT expiry — token generation uses DateTime.UtcNow.AddDays(7).

CodeGenerator
Builds hierarchical codes: project PRJ-PP, task TSK-PP-TT, subtask SUB-PP-TT-SS. Each is max(SeqNumber) + 1 scoped to its parent (per-project for tasks, per-parent for subtasks). 2-digit zero-padded (D2).

EffortHelpers
Pure functions reused by TaskService and ReportService:

IsProductiveStatus(s) — s == "in-progress" (case-insensitive).
BuildStatusSegments(createdAt, currentStatus, statusRows, now) — produces non-zero [StartAt, EndAt, Seconds, IsProductive] segments by walking the ordered statusRows; final segment runs to now for non-completed tasks.
BuildAssignmentWindows(createdAt, assignRows, currentAssigneeId, now) — produces per-user [Start, End) windows from the TaskAssignmentHistory timeline.
Overlap(a, b) — raw second-overlap, used only for assignment-window intersection.
WorkingOverlap(start, end) and WorkingOverlapForDay(start, end, day) — clip to office hours 10:00–19:00 (per the comment: "timestamps are stored as IST wall-clock, so no tz conversion is needed"). Iterates each calendar day in the range.
DatabaseBackupService
Defined but the controller is commented out. CreateBackupAsync runs BACKUP DATABASE ... TO DISK = '<appdir>/Backups/<db>_<timestamp>.bak' via a raw SqlCommand. DI registration is also commented out in Program.cs.

JwtService / PasswordHasher
JwtService.GenerateToken — kept but unused in the current login flow (the actual login uses AuthService.GenerateJwtToken inline).
PasswordHasher — PBKDF2 (100,000 iterations, 16-byte salt, 32-byte hash, HMAC-SHA256). Stores as "iterations:base64(salt):base64(hash)". VerifyPassword uses CryptographicOperations.FixedTimeEquals for constant-time comparison.
4. Backend Controllers (Controllers/, all under /api/)
All controllers are thin: they resolve _authService.GetCurrentUserId() / IsAdmin() / Can* guards, call the service, and translate to HTTP. Standard pattern:

_authService.CanView("route") → 403 Forbid if missing.
"Only the …" service error messages → 403; everything else → 400 or 404.
Controller	Routes	Notes
Tasks	GET/POST/PUT/DELETE /tasks; GET /tasks/{id}; POST /tasks/{id}/comments; GET /tasks/{id}/comments?userId=&from=&to=; GET /tasks/dashboard-stats; PUT /tasks/{id}/assign; PUT /tasks/{id}/reassign (requires ReassignTaskDto with ReasonTag); POST /tasks/{id}/start; PUT /tasks/{id}/status (ChangeStatusDto); GET /tasks/{id}/status-history; GET /tasks/{id}/effort; GET /tasks/effort-stats?from=&to=; POST /tasks/{id}/qa/pass · /qa/fail (reviewer action, requireActualHours: false); GET /tasks/{id}/assignment-history; checklist CRUD (POST /tasks/{id}/checklist, PUT /tasks/{id}/checklist/{itemId}/toggle, PUT /tasks/{id}/checklist/{itemId}, DELETE /tasks/{id}/checklist/{itemId}, POST /tasks/{id}/checklist/mark-all-complete); PUT /tasks/{id}/block; GET /tasks/{id}/block-entries.	HasTaskEditAccess helper: task.CreatedById == userId OR project.OwnerId/CreatedById == userId — used for checklist add/edit/delete. Comment permission: CreatedBy/AssignedTo/ProjectOwner/ProjectCreator.
Projects	GET/POST/PUT/DELETE /projects; GET /projects/{id}; PUT /projects/{id}/reassign; GET /projects/{id}/assignment-history; POST /projects/{id}/assign; DELETE /projects/{id}/members/{userId}; PUT /projects/{id}/members (set full member list).	POST/PUT/DELETE all require _authService.IsAdmin() in addition to the role-level permission.
Users	GET/POST/PUT/DELETE /users; GET /users/assignable; GET /users/{id} (rejects id <= 1); POST /users/{id}/reset-password (SystemAdmin only, also rejects id <= 1, resets to "123456").	GET /users filters out Id <= 1 from the list (the SystemAdmin is hidden from the management UI).
Roles	GET/POST/DELETE /roles; GET /roles/{id} (rejects id <= 1).	POST switches between update and create based on dto.Id > 0.
Auth	POST /auth/login (username OR email); POST /auth/register; GET /auth/check-availability?userName=&email=&excludeUserId=; GET /auth/validate (re-hydrates the current user from the token); POST /auth/reset-password (public, by email).	LoginAsync returns 401 on bad credentials.
Chat	GET /chat/messages?count=&beforeId=&roomId=; GET /chat/rooms; POST /chat/rooms; POST /chat/rooms/direct/{otherUserId}; POST /chat/upload (25 MB request limit; creates a placeholder message and links the attachment); GET /chat/file/{attachmentId} (streams the file with its stored MimeType).	[Authorize]-gated. GetUserId checks NameIdentifier/sub/nameid.
Permissions	GET /permissions/my (current user's effective permissions merged across all pages); GET /permissions/pages (SystemAdmin only); GET /permissions/roles; GET/PUT /permissions/role/{roleId}; GET/PUT/DELETE /permissions/user/{userId}.	user/{id} PUT is a replace-all (deletes existing then inserts non-zero rows).
Activities	GET /activities; POST /activities.	Last 100.
Reports	GET /reports/user-effort?from=&to=; GET /reports/user-transitions?from=&to=; GET /reports/user-task-effort?userId=&from=&to=; GET /reports/user-daily-effort?userId=&from=&to=; GET /reports/hours-summary?from=&to=&userId=&projectId=.	All return 401 if userId <= 0; per-user reports return 403 for non-admins querying other users.
Backup	All commented out.	DI registration also commented out.
5. AutoMapper (Mappings/MappingProfile.cs)
Single profile. Key mappings:

User ↔ UserDto (role name + IsAdmin derived from RoleId == 1 || Role.IsAdmin).
Project → ProjectDto (flattened members list, Module names, computed TaskCount/MemberCount, ignored Progress/AssignmentHistory because service code sets them).
TaskEntity → TaskDto (deep flattens ChildTasks to LinkedTaskDto; ignored ChecklistItems/AssignmentHistory/BlockEntries/IsBlocked because service code sets them).
TaskComment → TaskCommentDto (Content → Text, CreatedAt → Timestamp).
ChecklistItem → ChecklistItemDto, TaskBlockEntry → TaskBlockEntryDto (falls back to denormalized BlockedByName).
6. SignalR Hub (Hubs/ChatHub.cs)
[Authorize]-gated. In-memory ConcurrentDictionary<string, OnlineUserDto> for presence. Methods:

OnConnectedAsync — pushes UserJoined to others, returns OnlineUsers to caller, auto-joins all rooms the user is a member of.
OnDisconnectedAsync — broadcasts UserLeft(userId).
SendMessage(SendMessageDto) — verifies room membership (no-op otherwise), persists, broadcasts to room_{id} group or Clients.All for global.
JoinRoom(int roomId) — adds to the room_{id} group if the user is a member.
StartTyping/StopTyping(int? roomId) — broadcasts to OthersInGroup (or Others for global).
GetUserId checks NameIdentifier/sub/nameid; GetUserName checks Name/unique_name/name.
7. App-wide Conventions (Backend)
All timestamps use AppClock.Now (IST, DateTimeKind.Unspecified). Stored as bare wall-clock in datetime2, serialized without a Z/offset, rendered as-is by the frontend. Date-only fields (DueDate, project StartDate/EndDate) are calendar dates.
JWT expiry is the only place that uses DateTime.UtcNow.
Permission bitmap: View=1, Create=2, Update=4, Delete=8, full=15.
Audit trail: most write actions append an Activity row; status/block/reassignment/etc. all log.
SystemAdmin protection: RoleId = 1 / UserId = 1 is the seeded admin; excluded from list endpoints (GetAllUsers filters, GetAllRoles filters), not assignable to others, not editable, password-reset disabled, id <= 1 returns 403 from user detail/update/delete.
Hierarchy codes are immutable / system-generated; preserved on update.
TaskEntity.ActualHours (task total) and TaskStatusHistory.ActualHours (per status transition) are the manual reported hours — kept separate from derived effort.
StartTaskAsync stamps StartedAt = AppClock.Now, StartedById = userId, sets status to in-progress (only the assignee may start, only when not already started, only when not completed). Writes a TaskStatusHistory row.
8. Frontend — Stack & Skeleton
ClientApp/src/ with React 19, TypeScript, Vite 6, React Router 7, Tailwind 4. UI: lucide-react icons, sonner toasts, motion animations, date-fns, @microsoft/signalr, clsx + tailwind-merge. No form library — validation is hand-rolled in ClientApp/src/lib/validation.ts. Auth and JWT live in localStorage (pms_token, pms_user).

main.tsx mounts <App /> under <StrictMode>. App.tsx wraps the tree in:


ErrorBoundary → GlobalLoader → ThemeProvider → SweetAlertProvider → AuthProvider → DataProvider → QuickViewProvider → BrowserRouter → ChatProvider → Toaster + NotificationPopup + Suspense(Routes)
The same order is set in the CLAUDE.md spec. ProtectedRoute checks user and redirects to /auth; both authLoading and dataLoading trigger the loading fallback. ErrorBoundary catches render errors and shows a "Refresh Page" screen.

All routes are lazy-loaded: /auth is public; everything else sits under <ProtectedRoute> and <DashboardLayout> and includes /, /projects, /projects/:id, /tasks, /users, /users/:id, /roles, /settings, /chat, /reports. The * catch-all is NotFound.

9. Frontend Context Providers (context/)
Context	File	Responsibility
AuthContext	AuthContext.tsx	Holds user, isLoading, isSystemAdmin (matches role string), isAdmin (uses backend isAdmin flag), pagePermissions: Record<route, bitmap>. login and register POST to /auth/login and /auth/register, store token+user in localStorage, then call fetchMyPermissions (which hits /permissions/my and lowers the route keys). logout clears storage and window.location.href = '/auth'. checkAuthStatus runs on mount: reads localStorage, hits /auth/validate with the saved token, refreshes permissions. Exposes useAuth().
DataContext	DataContext.tsx	Central in-memory store. On currentUser change fetches projects, tasks, users, assignable users, and activities in parallel. Owns mutations: add/update/delete/reassign project (and member management), add/update/delete/reassign task, task comments, checklist CRUD, block toggle, status changes, start, user CRUD, activity create. Exposes a client-side notifications array (with activeAlert for popup), markNotificationAsRead, clearAllNotifications, dismissAlert. Plays a notification sound (mixkit.co/.../2869-preview.mp3) on new alerts. Visibility is filterable client-side (admin sees all; others see tasks where they are assignee/creator) — but backend still gates. Periodic due-date reminder check runs hourly. Exposes useData().
QuickViewContext	QuickViewContext.tsx	Stack-based navigation for the modal. Frames are { type, id } where type is `'project'
ChatContext	ChatContext.tsx	Owns the SignalR HubConnection to /hubs/chat (WebSockets + LongPolling, automatic reconnect). Subscribes to ReceiveMessage, ReceiveNotification, OnlineUsers, UserJoined, UserLeft, TypingStarted, TypingStopped. Maintains messages (global), roomMessages (per room), rooms, onlineUsers, typingUsers, unreadCount, isConnected. Exposes sendMessage, sendFile (uploads via /chat/upload, then sends a file-typed message), startTyping/stopTyping, markAsRead, loadMoreMessages, notifyNewMessage (browser Notification), createRoom, openDirectMessage, loadRoomMessages. Uses accessTokenFactory to send the JWT on the WebSocket upgrade.
ThemeContext	ThemeContext.tsx	`Theme ∈ { 'light'
SweetAlertContext	SweetAlertContext.tsx	Backdrop modal alerts (success / error / warning / info / confirm) with motion animations. showAlert(msg, type, durationMs) for transient toasts, confirmAlert(msg, onConfirm, onCancel) for confirm prompts.
10. Frontend Lib (lib/)
File	Purpose
api.ts	apiRequest<T>(endpoint, options): prepends getApiUrl(), injects Authorization: Bearer <token> from localStorage, unwraps ApiResponse<T> to return T.data, redirects to /auth on 401 (except for /auth/* calls), toasts a 403 error. beginRequest()/endRequest() round the global loader counter.
utils.ts	cn (clsx + twMerge), copyToClipboard, formatDate (DD-MM-YYYY), formatDateTime (DD-MM-YYYY hh:mm AM/PM), toInputDate (YYYY-MM-DD), toHHMM / fromHHMM for hh:mm ↔ decimal hours, formatSeconds (Nh MMm or Nm).
toast.ts	showSuccess/showError/showWarning/showInfo wrappers over sonner.
validation.ts	Hand-rolled validators: EMAIL_REGEX, USERNAME_REGEX, validateRequired, validateName, validateUsername, validateEmail, validateContact (optional, 7-15 digits), validatePassword (≥6), collectErrors (strips empty strings).
dateRanges.ts	PeriodKey ∈ { all, today, yesterday, last7, thisWeek, prevWeek, thisMonth, prevMonth, custom }. PERIOD_OPTIONS and resolvePeriod(key, now) → { from, to } ISO strings. Weeks are Monday-based. resolveCustom(from, to) makes to inclusive (end-of-day).
loadingBus.ts	In-flight request counter (not boolean) with subscribe/unsubscribe. The GlobalLoader overlay reads from this and shows a 250 ms-delayed full-screen blocking spinner.
importExport.ts	exportToCSV, exportProjects, exportTasks, exportProjectWithTasks, getSampleProjectCSV/TaskCSV/ProjectWithTasksCSV, and parseCSV(file).
11. Frontend Hooks (hooks/)
Exported via hooks/index.ts:

useDebounce(value, delay) — debounced value.
useThrottle(value, limit) — leading + trailing throttle.
useLocalStorage(key, initial) / useSessionStorage(key, initial) — typed reactive storage (writes to storage, swallows quota errors).
usePreferredDark() — prefers-color-scheme: dark media query.
useWindowSize() — { width, height } with resize listener.
Standalone files:

usePermissions.ts — reads useAuth(), returns { canView, canCreate, canUpdate, canDelete, hasPermission }. isAdmin → all true; / always visible; otherwise ANDs the requested action bit with the page's permission bitmap from pagePermissions. Bits: view=1, create=2, update=4, delete=8.
useAvailability(value, { field, excludeUserId, enabled }) — debounces the value (450 ms) and calls userService.checkAvailability; returns 'idle' | 'checking' | 'available' | 'taken'.
usePushNotifications.ts — on mount, requests Notification.permission and registers /sw.js; returns { notify(title, body) } for OS-level notifications.
useAuth and useData are not hook files — they live in their respective context files (AuthContext.tsx exports useAuth; DataContext.tsx exports useData).

12. Frontend Service Layer (services/)
All services call apiRequest (which prepends getApiUrl(), injects JWT, and unwraps ApiResponse).

Service	Endpoints called
task.service.ts	GET/POST/PUT/DELETE /tasks, POST /tasks/{id}/start, PUT /tasks/{id}/status, `POST /tasks/{id}/qa/pass
project.service.ts	GET/POST/PUT/DELETE /projects, PUT /projects/{id}/reassign, GET /projects/{id}/assignment-history, PUT /projects/{id}/members, DELETE /projects/{id}/members/{userId}.
user.service.ts	GET /users, GET /users/assignable, POST /users, PUT /users/{id}, DELETE /users/{id}, POST /users/{id}/reset-password, GET /auth/check-availability.
role.service.ts	GET /roles, POST /roles (upsert by id), DELETE /roles/{id}.
activity.service.ts	GET /activities, POST /activities.
permission.service.ts	GET /permissions/pages, /roles, /role/{id}, /user/{id}, PUT /role/{id}, PUT /user/{id}, DELETE /user/{id}.
report.service.ts	All /reports/* endpoints; maps API DTOs to frontend types (UserEffortReport, UserTransitionReport, UserTaskEffortReport, UserDailyEffortReport, HoursSummary).
config/dataSource.ts: const API_URL = import.meta.env.VITE_API_URL || '/api'. The Vite dev proxy maps /api → http://localhost:5178 (backend).

13. Frontend Pages (pages/)
Page	Responsibility
Dashboard.tsx	Stats cards (projects / active tasks / team / blocked) → "Effort & Productivity" widgets with PERIOD_OPTIONS filter (today / yesterday / last7 / this/prev week / this/prev month / custom date range) → "My Work" boxes (Assigned to Me, Overdue & Upcoming Deadlines sorted with overdue first, Created by Me) → "Recent Tasks" + "Blocked Tasks" row. Recent Tasks cards show project, priority, status, checklist progress, creator/assignee/owner avatars, and an overdue pill. Blocked tasks show the active block reason and (admin only) a "Reassign" button that opens ReassignModal. Loads taskService.getEffortStats with the resolved period.
Projects.tsx	Project list/grid view.
ProjectDetails.tsx	Single project detail page (deeper view than the QuickView).
Tasks.tsx	The largest page. Supports grid (Kanban) and list view. Kanban has 7 columns (new, in-progress, paused, blocked, under-review, issues, completed). NEXT_STAGE map enables a quick "+" advance button per card. Drag/drop, filters, search with text highlighting, and inline editing. TaskCompletionModal opens per task with two tabs: Status History and a day-bucketed User Effort Timeline. Many sub-components: TaskStatusActions, ChecklistPanel, TaskBlockPanel, FileUploader, DateInput, TimeInput, InteractiveLink, etc.
Users.tsx	User list with create / edit / reset password flows. Edit form uses useAvailability for live username/email validation.
UserDetails.tsx	Single user profile.
Roles.tsx	Role list with code uniqueness, IsAdmin toggle, and role/user permission grid (reads/writes /permissions/role/{id} and /permissions/user/{id}).
Settings.tsx	Personal preferences (notifications, reminder threshold).
Chat.tsx	Three-pane chat: room list (ChatSidebar), message list (MessageList + MessageBubble + TypingIndicator), and MessageInput. FilePreviewModal shows image/video/document previews. Uses useChat exclusively.
Reports.tsx	Effort report page. Renders the same period filter (today / yesterday / last 7 days / week / month / custom) and surfaces UserEffortReport (top users bar with productive hours) and HoursSummary (per-user / per-task / per-project tables).
Auth.tsx	Login + register on one page.
NotFound.tsx	404.
14. Frontend Components (components/)
QuickView/ (the side-panel modal)
QuickViewContainer.tsx — single source of truth. Renders the modal with a back button if the stack has >1 frame. Cases:
project → header with code + status + dates, Load/Flow tiles, status breakdown, modules, team members, manifest list, owner/created-by, ownership history, "Access Full Relay" link.
task → header (code, status, priority, blocked pill, module, tags), Deadline + Effort tiles (effort tile is a button that opens the effort frame), progress + over-budget warning, Assignee/Created By, full ChecklistPanel (add/toggle/edit/delete/mark-all-complete, with Start Task button), TaskStatusActions (status switcher with mandatory-hours prompt for non-new targets), Reassign Task panel + ReassignModal, TaskBlockPanel, Linked Tasks list, Create Subtask button, Assignment History, CommentSection, footer with "Project Relay" + "Terminate View" buttons. Many capability flags (canReassignTask, canManageChecklist, canUnblock, canAddSubtask) computed from isManager = isAdmin || isCreator || isProjectOwner || isProjectCreator.
user → avatar, name, role, email, counts (managed projects / assigned tasks), recent activities, "Profile Node" link.
effort → tabbed view: Status History (timeline with from → to chips, changedByName, timestamp, manual hours, reason) + User Effort Timeline (TaskEffortPanel).
CommentSection.tsx — comment thread for tasks.
Chat/
ChatSidebar.tsx — room list with unread counts.
MessageList.tsx — virtualized-ish list with load-more on scroll.
MessageBubble.tsx — text/file bubbles with reply-to.
MessageInput.tsx — typing trigger, file picker, send.
TypingIndicator.tsx — "User is typing..." pill.
FilePreviewModal.tsx — full-screen preview for image/video/pdf.
Layout/
DashboardLayout.tsx — sidebar + topbar shell. Renders <Sidebar />, <Navbar />, <NotificationDropdown />, the route <Outlet /> wrapped in <PageTransition />, and the global <QuickViewContainer /> at the bottom.
Sidebar.tsx — primary nav with permission-gated links (usePermissions().canView(route)).
Navbar.tsx — search, theme toggle, user menu, notifications bell.
NotificationDropdown.tsx — useData().notifications list with mark-as-read and clear-all.
PageTransition.tsx — small motion fade/slide wrapper.
ui/
Button.tsx, Badge.tsx, Card.tsx, EmptyState.tsx, LoadingSpinner.tsx, PageHeader.tsx, InteractiveLink.tsx, ProgressBar.tsx, Modal.tsx, FileUploader.tsx, DateInput.tsx, TimeInput.tsx, ReasonTagSelector.tsx, ReassignModal.tsx, TaskStatusActions.tsx (status switcher with ALLOWED_EDGES mirror), TaskBlockPanel.tsx, ChecklistPanel.tsx, TaskEffortPanel.tsx (the productive/paused bar + per-user breakdown used in the QuickView effort frame and Dashboard widgets), GlobalLoader.tsx (subscribes to loadingBus, 250 ms show-delay).
forms/
VTextField.tsx, VSelect.tsx — hand-rolled controlled inputs (no RHF/Yup).
skeletons/
DashboardSkeleton.tsx, SkeletonCard.tsx, SkeletonTaskItem.tsx, SkeletonText.tsx — loading placeholders.
Top-level
NotificationPopup.tsx — listens to DataContext.activeAlert and renders a global popup with the motion library.
QuickViewContainer is mounted from DashboardLayout.
15. Frontend Types (types/index.ts)
Single barrel module. Key types:

Core — Priority, Status (7 values), TASK_STATUSES, STATUS_LABELS, STATUS_BADGE_VARIANT, ProjectStatus, ReasonTag (8 values) + REASON_TAGS + BLOCK_REASON_TAGS.
User — User (with name/firstName/lastName/username/role/isAdmin/etc.), ProjectPermission.
Project — Project, ProjectMember, ProjectAssignmentHistory.
Task — Task, TaskComment, ChecklistItem, TaskAssignmentHistory, TaskBlockEntry, LinkedTaskRef, TaskStatusHistory, plus the child/parent fields (parentTaskId, childTasks, requiresQA, qaAssignee).
Effort — StatusDuration, UserEffort, EffortTimelineSegment, TaskEffort, TopUserEffort, DashboardEffort.
Activity / Notification — Activity (targetType: 'project' | 'task'), Notification (with type: 'reminder' | 'update' | 'system'), NotificationType.
Chat — ChatMessage, OnlineUser, ChatRoomMember, ChatRoom (roomType: 'public' | 'private' | 'direct', lastMessage, unreadCount).
Reports — UserEffortReport, UserEffortReportItem, UserTransitionReport, UserTransitionReportItem, TransitionCount, UserTaskEffortReport, UserTaskEffortItem, UserDailyEffortReport, DailyEffortItem, HoursSummary + its 3 row shapes.
16. Cross-cutting Concerns
Permissions enforced on both sides — frontend usePermissions() AND backend _authService.CanView/CanCreate/CanUpdate/CanDelete(route). Admins bypass the bitmap.
Activity logging — automatic inside services on status change, reassign, block, checklist ops, comment. ActivityService itself just exposes GET/POST.
Derived effort — every dashboard / report widget / per-task timeline runs through the same EffortHelpers pipeline. Office hours are 10:00–19:00 IST; the IST wall-clock assumption is documented in AppClock and EffortHelpers.
Working-hours filter is the source of all "productive/paused/etc." seconds in the dashboard and reports. DashboardEffortDto.ProductiveSeconds and TopProductiveUsers[*].ProductiveSeconds come from this filter applied to every task's status segments, intersected with the per-user assignment windows.
Live snapshot in DashboardEffortDto (UsersCurrentlyWorking, UsersInPauseReview) is taken from the current task.Status (not windowed) — useful for "who's working right now?" cards.
Drag & drop in Kanban — only Project Owner, Task Assignee, or IsAdmin may drag; never while the task is blocked (admin bypass). Moving to a non-new status opens an ActualHours prompt in TaskStatusActions (mirrors backend ActualHoursExemptStatuses = { "new" }).
Hierarchy — PRJ-PP / TSK-PP-TT / SUB-PP-TT-SS, with 2-digit zero-padded sequences. CodeGenerator is the only producer; codes are immutable and preserved on update.
Reason tags for reassignment live in ReasonTags.Valid (backend) and REASON_TAGS/BLOCK_REASON_TAGS (frontend). The block-reason form uses a smaller subset (No Resource, Unable to Complete, Admin Decision, Workload Balancing, Other).
QA flow — tasks can have RequiresQA = true and a QaAssigneeId. Only the assigned QA reviewer may qa/pass (transitions under-review → completed); qa/fail moves it to issues. Both bypass requireActualHours because they're reviewer actions.
Self-registration — AuthService.RegisterAsync never assigns RoleId == 1 and never assigns an IsAdmin role. If no non-admin role exists, registration is refused.
Chat realtime — access_token query string is allowed on the SignalR hub per Program.cs (OnMessageReceived lets ?access_token= populate the JWT for the hub upgrade). The frontend sets accessTokenFactory: () => localStorage.getItem('pms_token').
SPA hosting — UseDefaultFiles + UseStaticFiles + MapFallbackToFile("index.html") + UseCors("AllowAll") for http://localhost:3000 and http://localhost:5178. Swagger is always on (app.UseSwagger + UseSwaggerUI).
No test framework — manual testing is the current convention.
17. File Map (compact)

PMS_Final_Backup/
├── Program.cs                              # DI, JWT, EF, SignalR, Swagger, CORS, SPA fallback
├── appsettings.json                        # active DefaultConnection (remote), JWT
├── Data/PMSDbContext.cs                    # 22 entities + relationships
├── DTOs/GeneralDtos.cs                     # all request/response shapes
├── Mappings/MappingProfile.cs              # AutoMapper config
├── Hubs/ChatHub.cs                         # SignalR: messages, presence, typing, notifications
├── Migrations/                             # 4 EF migrations (latest: AddStatusHistoryActualHours)
├── Services/
│   ├── AppClock.cs                         # IST single source of truth
│   ├── CodeGenerator.cs                    # PRJ-/TSK-/SUB- codes
│   ├── EffortHelpers.cs                    # status segments, assignment windows, 10-19 IST filter
│   ├── JwtService.cs (+ PasswordHasher)    # PBKDF2 hashing
│   ├── AuthorizationService.cs             # bitmap permission checks
│   ├── AuthService.cs                      # login/register/JWT/availability
│   ├── UserService.cs                      # user CRUD, SystemAdmin guards
│   ├── RoleService.cs                      # role CRUD, SystemAdmin excluded
│   ├── ProjectService.cs                   # project CRUD, member mgmt, code gen
│   ├── TaskService.cs                      # tasks, status workflow, blocks, checklist, effort
│   ├── ChatService.cs                      # rooms, messages, attachments, file storage
│   ├── ReportService.cs                    # 5 windowed reports
│   ├── ActivityService.cs                  # last 100 activities
│   ├── NotificationService.cs              # SignalR push wrapper
│   └── DatabaseBackupService.cs            # disabled
├── Controllers/
│   ├── TasksController.cs                  # largest; tasks + status + checklist + effort
│   ├── ProjectsController.cs               # projects + members + reassign
│   ├── UsersController.cs                  # users + reset password
│   ├── RolesController.cs                  # roles
│   ├── AuthController.cs                   # login + register + validate
│   ├── ChatController.cs                   # messages + rooms + upload/download
│   ├── PermissionsController.cs            # /permissions/* with SystemAdmin gates
│   ├── ActivitiesController.cs             # /activities
│   ├── ReportsController.cs                # /reports/*
│   └── BackupController.cs                 # commented out
└── ClientApp/src/
    ├── main.tsx                            # mount
    ├── App.tsx                             # providers + routes (lazy)
    ├── index.css                           # Tailwind 4
    ├── types/index.ts                      # all shared types
    ├── config/dataSource.ts                # API base URL
    ├── context/                            # Auth, Data, Theme, QuickView, SweetAlert, Chat
    ├── lib/                                # api, utils, toast, validation, dateRanges, loadingBus, importExport
    ├── hooks/                              # useDebounce, useThrottle, useLocalStorage, useSessionStorage, usePreferredDark, useWindowSize, usePermissions, useAvailability, usePushNotifications
    ├── services/                           # task, project, user, role, activity, permission, report
    ├── pages/                              # Dashboard, Projects, ProjectDetails, Tasks, Users, UserDetails, Roles, Settings, Chat, Reports, Auth, NotFound
    └── components/
        ├── Layout/                         # DashboardLayout, Sidebar, Navbar, NotificationDropdown, PageTransition
        ├── QuickView/                      # QuickViewContainer, CommentSection
        ├── Chat/                           # ChatSidebar, MessageList, MessageBubble, MessageInput, TypingIndicator, FilePreviewModal
        ├── ui/                             # Button, Badge, Card, EmptyState, LoadingSpinner, PageHeader, InteractiveLink, ProgressBar, Modal, FileUploader, DateInput, TimeInput, ReasonTagSelector, ReassignModal, TaskStatusActions, TaskBlockPanel, ChecklistPanel, TaskEffortPanel, GlobalLoader
        ├── forms/                          # VTextField, VSelect
        ├── skeletons/                      # DashboardSkeleton, SkeletonCard, SkeletonTaskItem, SkeletonText
        └── NotificationPopup.tsx

That's the full system. Every layer the codebase actually implements — backend EF model + services + controllers, frontend contexts + lib + hooks + services + pages + components, the realtime chat and effort derivation, the permission bitmap, IST clock conventions, and hierarchy code generation — is in the map above.