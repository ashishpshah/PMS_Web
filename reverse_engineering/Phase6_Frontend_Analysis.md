# Phase 6 – React Frontend Analysis

**Source evidence:** `ClientApp/src/App.tsx`, `ClientApp/src/context/`, `ClientApp/src/pages/`, `ClientApp/src/hooks/`, `ClientApp/src/services/`, `ClientApp/src/components/`, `ClientApp/vite.config.ts`

---

## 6.1 Technology Summary

| Property | Value |
|---|---|
| Framework | React 19 |
| Language | TypeScript ~5.8 |
| Build Tool | Vite 6 |
| CSS | TailwindCSS 4 (via `@tailwindcss/vite` plugin) |
| Router | react-router-dom v7 (`BrowserRouter`) |
| State | React Context API (no Redux) |
| Real-time | `@microsoft/signalr` v10 |
| Toast | `sonner` |
| Animations | `motion` |
| Date utils | `date-fns` |
| Select | `react-select` |
| Icons | `lucide-react` |
| HTTP | Fetch API via `lib/api.ts` wrapper |
| SPA output | `../wwwroot` (compiled into ASP.NET Core static files) |

---

## 6.2 Entry Point & Provider Nesting

```
main.tsx
└─ <App />
   └─ ErrorBoundary (class component — catches render errors)
      ├─ GlobalLoader (request-count-driven spinner)
      └─ ThemeProvider
         └─ SweetAlertProvider
            └─ AuthProvider
               └─ DataProvider
                  └─ QuickViewProvider
                     └─ BrowserRouter
                        └─ ChatProvider
                           ├─ <Toaster /> (sonner, top-right, 4s)
                           ├─ <NotificationPopup />
                           └─ <Suspense fallback={<LoadingFallback />}>
                              └─ <Routes>
```

---

## 6.3 Route Definitions

All routes defined in `App.tsx`. All non-auth routes require authentication.

| Path | Component | Auth | Layout |
|---|---|---|---|
| `/auth` | `Auth` | Public | None |
| `/` | `Dashboard` | Required | `DashboardLayout` |
| `/projects` | `Projects` | Required | `DashboardLayout` |
| `/projects/:id` | `ProjectDetails` | Required | `DashboardLayout` |
| `/tasks` | `Tasks` | Required | `DashboardLayout` |
| `/users` | `Users` | Required | `DashboardLayout` |
| `/users/:id` | `UserDetails` | Required | `DashboardLayout` |
| `/roles` | `Roles` | Required | `DashboardLayout` |
| `/settings` | `Settings` | Required | `DashboardLayout` |
| `/chat` | `Chat` | Required | `DashboardLayout` |
| `/reports` | `Reports` | Required | `DashboardLayout` |
| `*` | `NotFound` | Public | None |

**Route guard:** `ProtectedRoute` component checks `user` from `AuthContext` and `loading` from `DataContext`. Redirects to `/auth` if not authenticated. Shows `LoadingFallback` while loading.

**Lazy loading:** All page components are `React.lazy()` + `Suspense` with a spinner fallback.

---

## 6.4 Context / State Management

### AuthContext (`context/AuthContext.tsx`)

| Export | Type | Purpose |
|---|---|---|
| `user` | `User \| null` | Current authenticated user profile |
| `login(identifier, password)` | `async fn` | POST to `/api/auth/login`, stores JWT in localStorage |
| `register(data)` | `async fn` | POST to `/api/auth/register` |
| `logout()` | `fn` | Clears localStorage, redirects to `/auth` |
| `isLoading` | `boolean` | True while initial auth check runs |
| `isSystemAdmin` | `boolean` | Derived from `user.role === 'systemadmin'` |
| `isAdmin` | `boolean` | Derived from `user.isAdmin` |
| `pagePermissions` | `Record<string, number>` | Bitmap map keyed by lowercase route |
| `checkAuthStatus()` | `async fn` | Validates stored token with backend on load |

**Persistence:** `localStorage.pms_token` (JWT) + `localStorage.pms_user` (serialized User object). Permissions are loaded fresh after every login.

---

### DataContext (`context/DataContext.tsx`)

Central shared state for the application's primary data entities.

| State | Type | Loaded From |
|---|---|---|
| `projects` | `Project[]` | `GET /api/projects` |
| `users` | `User[]` | `GET /api/users` |
| `roles` | `Role[]` | `GET /api/roles` |
| `tasks` | `Task[]` | `GET /api/tasks` (all pages accumulated) |
| `loading` | `boolean` | True during initial fetch |

**Task loading strategy:** Uses `loadAllTasks()` helper — fetches page 1, reads `totalPages`, then parallel-fetches remaining pages via `Promise.all`. Page size = 100.

**`refreshData()`** method re-fetches all entities. Called after login, create/update/delete operations.

---

### ChatContext (`context/ChatContext.tsx`)

Manages the SignalR connection and all chat state.

| State | Purpose |
|---|---|
| `messages` | Global channel messages |
| `roomMessages` | Per-room message map (keyed by room ID) |
| `rooms` | User's room list |
| `activeRoomId` | Currently selected room (null = global) |
| `onlineUsers` | Live online presence list |
| `typingUsers` | Who is typing in the current channel |
| `unreadCount` | Badge counter |
| `isConnected` | SignalR connection state |
| `isLoadingHistory` | Pagination guard |
| `hasMoreMessages` | Whether older messages exist |

**Connection:** Built on app load (when `user` is set). Auto-reconnects with backoff `[0, 2000, 5000, 10000, 30000]` ms. Stops on unmount.

---

### Other Contexts

| Context | Purpose |
|---|---|
| `ThemeContext` | Dark/light mode toggle, persisted in `localStorage` |
| `SweetAlertContext` | Custom `confirm()` / `alert()` dialog UI |
| `QuickViewContext` | Slide-in task detail panel from task list |

---

## 6.5 API Client (`lib/api.ts`)

```typescript
// Base URL: import.meta.env.VITE_API_URL || '/api'
apiRequest<T>(endpoint, options?) → Promise<T>
apiRequestWithMeta<T>(endpoint, options?) → Promise<{ data: T, meta: ApiPageMeta }>
```

**Behaviours:**
- Auto-attaches `Authorization: Bearer <token>` from `localStorage.pms_token`
- Unwraps `ApiResponse<T>` envelope — returns `.Data` directly
- Broadcasts request count to `loadingBus` (drives `GlobalLoader`)
- Toasts 403 errors via `lib/toast.ts`
- Throws on non-success responses

---

## 6.6 Custom Hooks

| Hook | File | Purpose |
|---|---|---|
| `usePermissions()` | `hooks/usePermissions.ts` | `canView/canCreate/canUpdate/canDelete(route)` using `pagePermissions` bitmap |
| `useDebounce(value, delay)` | `hooks/useDebounce.ts` | Debounce state values (used for availability checking) |
| `useThrottle(fn, delay)` | `hooks/useThrottle.ts` | Throttle function calls |
| `useLocalStorage(key, default)` | `hooks/useLocalStorage.ts` | Typed localStorage access |
| `useSessionStorage(key, default)` | `hooks/useSessionStorage.ts` | Typed sessionStorage access |
| `useWindowSize()` | `hooks/useWindowSize.ts` | Reactive window dimensions |
| `usePreferredDark()` | `hooks/usePreferredDark.ts` | System dark-mode preference |
| `usePushNotifications()` | `hooks/usePushNotifications.ts` | Web Push Notification permission |
| `useAvailability(value, opts)` | `hooks/useAvailability.ts` | Live username/email availability check (debounced) |

---

## 6.7 Frontend Services

Mirror backend controllers, 1 file per resource. All use `apiRequest()`.

| File | Responsibility |
|---|---|
| `services/task.service.ts` | Task CRUD, status changes, checklist, blocking, effort |
| `services/project.service.ts` | Project CRUD, member management, reassign |
| `services/user.service.ts` | User CRUD, assignable list, reset password |
| `services/role.service.ts` | Role CRUD |
| `services/activity.service.ts` | Activity log read/write |
| `services/report.service.ts` | All report endpoints |
| `services/permission.service.ts` | Permission management endpoints |

---

## 6.8 Page Descriptions

### `/auth` — Auth.tsx
- Login form: username/email (tabIndex=1), password (tabIndex=2), Login button (tabIndex=3), Forgot Password (tabIndex=4)
- Register form: first/last name, username (live availability), email (live availability), contact, password
- Toggle between login/register modes
- `Forgot Password` button — **no functionality implemented** (Requires Business Validation)

### `/` — Dashboard.tsx
- Task stats widgets (total, completed, by-status breakdown)
- Effort summary (productive/paused seconds, top users)
- Recent activity feed

### `/projects` — Projects.tsx
- Project cards/list view
- Create project modal (admin only)
- Filter/search

### `/projects/:id` — ProjectDetails.tsx
- Project info header
- Task board (Kanban columns by status)
- Member management
- Project modules
- Assignment history
- Task creation inline

### `/tasks` — Tasks.tsx
- Paginated task table/board
- Filters: status, priority, project, assignee
- QuickView panel on row click
- Create/edit task modal

### `/users` — Users.tsx
- User list (excludes SystemAdmin)
- Create user (admin only)
- Activate/deactivate toggle
- Reset password (SystemAdmin only)

### `/users/:id` — UserDetails.tsx
- User profile detail
- Edit profile
- Assigned tasks view

### `/roles` — Roles.tsx
- Role list
- Create/edit role
- Permission matrix editor (per page module, per bit)

### `/settings` — Settings.tsx
- User profile self-edit (name, avatar, contact, password change)
- Theme toggle
- Notification preferences

### `/chat` — Chat.tsx
- Sidebar: room list + online users
- Message list (cursor-based scroll-up pagination)
- Message input with file upload
- Typing indicator
- Reply-to threading

### `/reports` — Reports.tsx
- Date range pickers
- User effort chart
- Daily effort breakdown
- Task-level effort detail
- Hours summary

---

## 6.9 Navigation Structure

```
DashboardLayout
├─ Sidebar (always visible, collapsible)
│  ├─ Dashboard  (/)
│  ├─ Projects   (/projects)     — shown if canView('/projects')
│  ├─ Tasks      (/tasks)        — shown if canView('/tasks')
│  ├─ Users      (/users)        — shown if canView('/users')
│  ├─ Roles      (/roles)        — shown if canView('/roles')
│  ├─ Reports    (/reports)
│  ├─ Chat       (/chat)         — with unread badge
│  └─ Settings   (/settings)
└─ Navbar (top bar)
   ├─ Search
   ├─ Theme toggle
   ├─ Notification dropdown
   └─ User avatar + logout
```

Sidebar items are conditionally rendered based on `usePermissions().canView(route)`.

---

## 6.10 Form Validation

| Form | Validation | Library |
|---|---|---|
| Login | Required fields, password ≥ 6 chars | Inline state |
| Register | Name, username regex, email format, password strength (upper+lower+digit) | `lib/validation.ts` + `useAvailability` |
| Create User | `[Required]`, `[EmailAddress]`, `[StringLength]`, `[Phone]` | DTO annotations + frontend mirror |
| Create Task | Title required, EstimatedHours 0.01–100000 | DTO `[Range]` annotation |
| Chat Upload | Magic-byte + size (25 MB) | Server-side; client shows error message |

Password strength for registration: `/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/` — requires uppercase, lowercase, and digit.

---

## 6.11 UI Component Library (Custom)

All components are custom-built with TailwindCSS — no external UI framework.

| Component | Purpose |
|---|---|
| `Button` | Base button with variants |
| `Card`, `CardContent` | Panel container |
| `Modal` | Portal-based overlay dialog |
| `Badge` | Status/priority label chip |
| `ProgressBar` | Task progress indicator |
| `LoadingSpinner` | Inline spinner |
| `EmptyState` | No-data placeholder |
| `PageHeader` | Page title + action bar |
| `VTextField` | Validated text input |
| `VSelect` | Validated select (wraps react-select) |
| `DateInput` | Date picker input |
| `TimeInput` | Time picker input |
| `FileUploader` | Drag-and-drop file upload |
| `ReassignModal` | Modal for task/project reassignment with reason |
| `ReasonTagSelector` | Dropdown for valid reason tags |
| `ChecklistPanel` | Task checklist management |
| `TaskBlockPanel` | Block entry management |
| `TaskEffortPanel` | Effort timeline display |
| `TaskStatusActions` | Status transition action buttons |
| `InteractiveLink` | Clickable link with navigation |
| `GlobalLoader` | Top-bar loading progress |

**Skeleton components:** `DashboardSkeleton`, `SkeletonCard`, `SkeletonTaskItem`, `SkeletonText` — shown during data loading.

**QuickView:** `QuickViewContainer` + `CommentSection` — a slide-in panel that shows task details without full navigation.
