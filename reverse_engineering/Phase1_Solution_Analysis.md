# Phase 1 – Solution Analysis

**Source evidence:** `PMS_Final_Backup.csproj`, `Program.cs`, `appsettings.json`, `App.tsx`, `Mappings/MappingProfile.cs`

---

## 1.1 Architecture Overview

PMS is a **monolithic SaaS-style full-stack application** served from a single host and port. The React SPA is compiled to `wwwroot/` at build time; the ASP.NET Core process serves both the static SPA bundle and the REST API from the same origin, eliminating cross-origin complexity.

```
Browser
  │
  ▼
http://localhost:5178   (single process, single port)
  ├─ /api/**            → ASP.NET Core Controllers
  ├─ /hubs/chat         → SignalR Hub (WebSocket / Long-Polling)
  ├─ /swagger           → Swagger UI (always on)
  └─ /**                → wwwroot/index.html  (React SPA fallback)
```

---

## 1.2 Technology Stack

### Backend

| Component | Technology | Version | Evidence |
|---|---|---|---|
| Runtime | .NET 6 | `net6.0` | `PMS_Final_Backup.csproj` |
| Web Framework | ASP.NET Core 6 Web API | 6.x | `Program.cs` |
| ORM | Entity Framework Core | 6.0.36 | `.csproj` PackageReference |
| Database Provider | EF SqlServer | 6.0.36 | `.csproj` PackageReference |
| Real-time | SignalR | 6.x (built-in) | `Program.cs:67` |
| Authentication | JWT Bearer (HMAC-SHA256) | 6.0.36 | `Program.cs:28–55` |
| Object Mapping | AutoMapper | 12.0.1 | `.csproj` + `MappingProfile.cs` |
| API Documentation | Swashbuckle (Swagger) | 6.2.3 | `.csproj` + `Program.cs:94–125` |
| Password Hashing | PBKDF2 (`KeyDerivation`) | 6.0.36 | `.csproj` PackageReference |
| Root Namespace | `TaskManagement` | — | `.csproj` `<RootNamespace>` |
| Assembly Name | `TaskManagement` | — | `.csproj` `<AssemblyName>` |

### Frontend

| Component | Technology | Version | Evidence |
|---|---|---|---|
| UI Framework | React | 19 | `App.tsx` imports |
| Language | TypeScript | ~5.8 | `vite.config.ts` |
| Build Tool | Vite | 6 | `vite.config.ts` |
| CSS | TailwindCSS | 4 (via `@tailwindcss/vite`) | `vite.config.ts` |
| Routing | react-router-dom | v7 | `App.tsx` |
| Real-time Client | `@microsoft/signalr` | 10 | `ChatContext.tsx` |
| Toast Notifications | sonner | — | `App.tsx:110` |
| Animations | motion | — | imports |
| Date Utilities | date-fns | — | imports |
| Select Control | react-select | — | imports |
| Icons | lucide-react | — | imports |
| SPA Output Dir | `../wwwroot` | — | `vite.config.ts` build.outDir |

### Database

| Property | Value | Evidence |
|---|---|---|
| Engine | SQL Server 2016+ | `appsettings.json` Data Source |
| Host | `sql.bsite.net\MSSQL2016` (shared hosting) | `appsettings.json` |
| Database | `vishaldemo_PMS` | `appsettings.json` |
| Fallback | LocalDB `PMS_260604` (key `DefaultConnection_`) | `appsettings.json` |
| Migrations | 1 squashed (`InitialCreate`, 2026-06-29) | `Migrations/` folder |

---

## 1.3 Deployment Architecture

```
┌─────────────────────────────────────────────────────────┐
│                 Production / Dev Server                 │
│                                                         │
│   ┌─────────────────────────────────────────────────┐   │
│   │         ASP.NET Core 6 Process (:5178)          │   │
│   │                                                 │   │
│   │  ┌──────────────┐   ┌─────────────────────────┐│   │
│   │  │  REST API    │   │  SignalR Hub             ││   │
│   │  │  /api/**     │   │  /hubs/chat              ││   │
│   │  └──────┬───────┘   └──────────┬──────────────┘│   │
│   │         │                      │                │   │
│   │  ┌──────▼──────────────────────▼──────────────┐│   │
│   │  │         EF Core 6 (PMSDbContext)            ││   │
│   │  └──────────────────────┬─────────────────────┘│   │
│   │                         │                       │   │
│   │  ┌──────────────────────▼─────────────────────┐│   │
│   │  │   wwwroot/ (React SPA build artifact)       ││   │
│   │  │   served via UseStaticFiles()               ││   │
│   │  │   fallback → index.html                     ││   │
│   │  └────────────────────────────────────────────┘│   │
│   └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                            │
                 TCP / SQL over TLS
                            │
            ┌───────────────▼────────────────┐
            │  sql.bsite.net\MSSQL2016        │
            │  Database: vishaldemo_PMS        │
            └────────────────────────────────┘
```

**Build command** (from `appsettings.json` `_note`):
```bash
dotnet publish -c Release --self-contained true -o ./publish && npm run build
```

---

## 1.4 Middleware Pipeline

Order from `Program.cs` (lines 140–157):

| Order | Middleware | Config |
|---|---|---|
| 1 | `UseSwagger()` | Always enabled — no env gate |
| 2 | `UseSwaggerUI()` | Always enabled |
| 3 | ~~`UseHttpsRedirection()`~~ | **Commented out** — HTTP only |
| 4 | `UseDefaultFiles()` | Serves `index.html` for `/` |
| 5 | `UseStaticFiles()` | Serves `wwwroot/` |
| 6 | `UseRouting()` | Route matching |
| 7 | `UseCors("AllowAll")` | Allows `:3000` + `:5178` with credentials |
| 8 | `UseAuthentication()` | JWT Bearer |
| 9 | `UseAuthorization()` | Policy evaluation |
| 10 | `MapControllers()` | REST endpoints |
| 11 | `MapHub<ChatHub>("/hubs/chat")` | SignalR WebSocket |
| 12 | `MapFallbackToFile("index.html")` | SPA client-side routing |

**Startup hook** (before `app.Run()`):
1. `EffortHelpers.Configure(whOpts)` — applies `WorkStartHour=10`, `WorkEndHour=19` (IST working hours) to the static helper
2. `DatabaseInitializer.InitializeAsync()` — runs migrations, seeds roles/users/project if empty

---

## 1.5 Dependency Injection Registrations

All registrations are `AddScoped` (per HTTP request / per SignalR connection):

| Interface | Implementation | File |
|---|---|---|
| `ITaskService` | `TaskService` | `Services/TaskService.cs` |
| `IProjectService` | `ProjectService` | `Services/ProjectService.cs` |
| `IUserService` | `UserService` | `Services/UserService.cs` |
| `IRoleService` | `RoleService` | `Services/RoleService.cs` |
| `IActivityService` | `ActivityService` | `Services/ActivityService.cs` |
| `IAuthService` | `AuthService` | `Services/AuthService.cs` |
| `IChatService` | `ChatService` | `Services/ChatService.cs` |
| `INotificationService` | `NotificationService` | `Services/NotificationService.cs` |
| `IReportService` | `ReportService` | `Services/ReportService.cs` |
| `IDatabaseInitializer` | `DatabaseInitializer` | `Services/DatabaseInitializer.cs` |
| `IAuthorizationService` | `AuthorizationService` | `Services/AuthorizationService.cs` |
| `IHttpContextAccessor` | _(built-in)_ | `Program.cs:87` |
| `IOptions<WorkingHoursOptions>` | _(config binding)_ | `Program.cs:91` |
| ~~`IDatabaseBackupService`~~ | ~~`DatabaseBackupService`~~ | **Commented out** |

Framework registrations: `AddDbContext<PMSDbContext>`, `AddAutoMapper`, `AddSignalR`, `AddAuthentication(JwtBearer)`, `AddAuthorization`, `AddSwaggerGen`.

---

## 1.6 Configuration

| Key | Value | Purpose |
|---|---|---|
| `ConnectionStrings:DefaultConnection` | `sql.bsite.net\MSSQL2016 / vishaldemo_PMS` | Primary DB |
| `ConnectionStrings:DefaultConnection_` | LocalDB `PMS_260604` | Dev fallback (disabled by trailing `_`) |
| `JwtSettings:Key` | `PMS_Secure_Key_For_JWT_Token_2024_MinLength32Chars` | HMAC-SHA256 signing key |
| `JwtSettings:Issuer` | `PMS` | JWT `iss` claim |
| `JwtSettings:Audience` | `PMS` | JWT `aud` claim |
| `JwtSettings:ExpiryMinutes` | `420` (7 hours) | Token lifetime |
| `WorkingHours:WorkStartHour` | `10` | Working-hours window start |
| `WorkingHours:WorkEndHour` | `19` | Working-hours window end |
| `AllowedHosts` | `*` | No host filtering |

---

## 1.7 Layer Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    PRESENTATION LAYER                   │
│                                                         │
│  React 19 SPA (ClientApp/)                              │
│  Pages / Components / Contexts / Hooks / Services       │
│                                                         │
│  API calls via apiRequest() → /api/**                   │
│  Real-time via SignalR client → /hubs/chat              │
└──────────────────────┬──────────────────────────────────┘
                       │  HTTP/WebSocket
┌──────────────────────▼──────────────────────────────────┐
│                    API LAYER                            │
│                                                         │
│  Controllers/ (10 controllers)                          │
│  • Receives HTTP requests                               │
│  • Validates route-level permissions (IAuthorizationSvc)│
│  • Delegates to Service layer                           │
│  • Wraps result in ApiResponse<T>                       │
│                                                         │
│  Hubs/ (ChatHub)                                        │
│  • Receives SignalR invocations                         │
│  • Delegates to ChatService                             │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│                   SERVICE LAYER                         │
│                                                         │
│  TaskService  ProjectService  UserService  RoleService  │
│  AuthService  ChatService  NotificationService          │
│  ReportService  ActivityService  AuthorizationService   │
│  DatabaseInitializer  EffortHelpers  AppClock           │
│                                                         │
│  • Business logic, validation, workflow state machine   │
│  • AutoMapper (MappingProfile) for Entity↔DTO           │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│                    DATA LAYER                           │
│                                                         │
│  PMSDbContext (EF Core 6)                               │
│  ~20 DbSet<T> entities                                  │
│  1 migration: InitialCreate (2026-06-29)                │
│                                                         │
│  SQL Server 2016+  (sql.bsite.net — remote shared host) │
└─────────────────────────────────────────────────────────┘
```

---

## 1.8 Component Diagram (Backend)

```
Controllers/
├── AuthController          → IAuthService
├── TasksController         → ITaskService, PMSDbContext*
├── ProjectsController      → IProjectService
├── UsersController         → IUserService, PMSDbContext*
├── RolesController         → IRoleService
├── ActivitiesController    → IActivityService
├── ChatController          → IChatService
├── ReportsController       → IReportService
├── PermissionsController   → PMSDbContext*
└── BackupController        → (no service — disabled)

Hubs/
└── ChatHub                 → IChatService, INotificationService

Services/
├── AuthService             → PMSDbContext, IConfiguration
├── TaskService             → PMSDbContext, IMapper, IActivityService, INotificationService
├── ProjectService          → PMSDbContext, IMapper
├── UserService             → PMSDbContext, IMapper
├── RoleService             → PMSDbContext
├── ActivityService         → PMSDbContext
├── ChatService             → PMSDbContext
├── NotificationService     → IHubContext<ChatHub>
├── ReportService           → PMSDbContext
├── AuthorizationService    → PMSDbContext, IHttpContextAccessor
└── DatabaseInitializer     → PMSDbContext

Utilities/
├── AppClock                static — centralised DateTime.UtcNow
├── EffortHelpers           static — working-hours effort calculator
└── CodeGenerator           static — task/project code generation

* Direct PMSDbContext injection in controllers is a known code smell
  (see Phase 12 – Code Quality Review)
```

---

## 1.9 Frontend Component Diagram

```
App.tsx
└─ ErrorBoundary
   └─ GlobalLoader
      └─ ThemeProvider        (dark/light, persisted to localStorage)
         └─ SweetAlertProvider (custom confirm/alert dialogs)
            └─ AuthProvider    (JWT decode, login/register/logout)
               └─ DataProvider (projects, users, roles, tasks — shared state)
                  └─ QuickViewProvider (slide-in task detail panel)
                     └─ BrowserRouter
                        └─ ChatProvider  (SignalR connection, messages, rooms)
                           ├─ Toaster (sonner — top-right toast notifications)
                           ├─ NotificationPopup
                           └─ Routes
                              ├─ /auth          → Auth (public)
                              └─ ProtectedRoute  (redirects to /auth if no user)
                                 └─ DashboardLayout
                                    ├─ Sidebar + Navbar
                                    ├─ /             → Dashboard
                                    ├─ /projects     → Projects
                                    ├─ /projects/:id → ProjectDetails
                                    ├─ /tasks        → Tasks
                                    ├─ /users        → Users
                                    ├─ /users/:id    → UserDetails
                                    ├─ /roles        → Roles
                                    ├─ /settings     → Settings
                                    ├─ /chat         → Chat
                                    └─ /reports      → Reports
```

All page components are **lazy-loaded** (`React.lazy`) with a `Suspense` spinner fallback.
