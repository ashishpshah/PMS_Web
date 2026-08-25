# Phase 11 – UML Documentation

**Source evidence:** `Data/PMSDbContext.cs`, `DTOs/GeneralDtos.cs`, `Services/`, `Controllers/`, Phase 1–10 analysis

All diagrams use Mermaid syntax.

---

## 11.1 Use Case Diagram

```mermaid
graph TD
    subgraph Actors
        UA[Unauthenticated User]
        TM[Team Member]
        MGR[Manager / Project Owner]
        ADM[Admin Role]
        SA[SystemAdmin]
    end

    subgraph Authentication
        UC01[Register Account]
        UC02[Login]
        UC03[Validate Session]
        UC04[Change Own Password]
        UC05[Reset User Password]
    end

    subgraph Projects
        UC10[View Projects]
        UC11[Create Project]
        UC12[Edit Project]
        UC13[Delete Project]
        UC14[Manage Members]
        UC15[Reassign Project Owner]
    end

    subgraph Tasks
        UC20[View Tasks]
        UC21[Create Task]
        UC22[Edit Task]
        UC23[Delete Task]
        UC24[Assign Task]
        UC25[Reassign Task]
        UC26[Start Task]
        UC27[Change Status]
        UC28[Add Comment]
        UC29[Manage Checklist]
        UC30[Block / Unblock Task]
    end

    subgraph Users
        UC40[View Users]
        UC41[Create User]
        UC42[Edit User]
        UC43[Activate / Deactivate]
    end

    subgraph Roles
        UC50[View Roles]
        UC51[Create / Edit Role]
        UC52[Manage Permissions]
    end

    subgraph Chat
        UC60[Send Global Message]
        UC61[Send Room Message]
        UC62[Create / Join Room]
        UC63[Send File]
        UC64[View Online Users]
    end

    subgraph Reports
        UC70[View Dashboard Stats]
        UC71[View Own Effort]
        UC72[View All Users Effort]
    end

    UA --> UC01
    UA --> UC02

    TM --> UC03
    TM --> UC04
    TM --> UC10
    TM --> UC20
    TM --> UC26
    TM --> UC27
    TM --> UC28
    TM --> UC29
    TM --> UC30
    TM --> UC60
    TM --> UC61
    TM --> UC62
    TM --> UC63
    TM --> UC64
    TM --> UC70
    TM --> UC71

    MGR --> TM
    MGR --> UC21
    MGR --> UC24
    MGR --> UC25

    ADM --> MGR
    ADM --> UC11
    ADM --> UC12
    ADM --> UC13
    ADM --> UC14
    ADM --> UC15
    ADM --> UC22
    ADM --> UC23
    ADM --> UC40
    ADM --> UC41
    ADM --> UC42
    ADM --> UC43
    ADM --> UC50
    ADM --> UC51
    ADM --> UC05
    ADM --> UC72

    SA --> ADM
    SA --> UC52
```

---

## 11.2 Class Diagram — Core Domain Entities

```mermaid
classDiagram
    class User {
        +int Id
        +string FirstName
        +string LastName
        +string FullName
        +string UserName
        +string Email
        +string PasswordHash
        +string? Phone
        +string? AvatarUrl
        +bool IsActive
        +bool IsAdmin
        +int RoleId
        +DateTime CreatedAt
    }

    class Role {
        +int Id
        +string Name
        +string? Code
        +string? Description
        +int Level
        +bool IsAdmin
    }

    class Project {
        +int Id
        +string Name
        +string? Description
        +string Code
        +int SeqNumber
        +int? OwnerId
        +int CreatedById
        +DateTime CreatedAt
        +DateTime? UpdatedAt
    }

    class TaskEntity {
        +int Id
        +string Title
        +string? Description
        +string Status
        +string Priority
        +string Code
        +int SeqNumber
        +int ProjectId
        +int? AssignedToId
        +int CreatedById
        +int? StartedById
        +int? QaAssigneeId
        +int? ParentTaskId
        +decimal EstimatedHours
        +decimal? ActualHours
        +int Progress
        +bool RequiresQA
        +DateTime CreatedAt
        +DateTime? UpdatedAt
        +DateTime? StartedAt
        +DateTime? DueDate
    }

    class ChecklistItem {
        +int Id
        +int TaskId
        +string Text
        +bool IsCompleted
        +int? CompletedById
        +DateTime? CompletedAt
        +int OrderIndex
    }

    class TaskStatusHistory {
        +int Id
        +int TaskId
        +string FromStatus
        +string ToStatus
        +int ChangedById
        +DateTime ChangedAt
        +string? Notes
        +decimal? ActualHours
    }

    class TaskAssignmentHistory {
        +int Id
        +int TaskId
        +int? PreviousAssigneeId
        +int? NewAssigneeId
        +int ChangedById
        +DateTime ChangedAt
        +string? ReasonTag
    }

    class TaskBlockEntry {
        +int Id
        +int TaskId
        +int BlockedById
        +string BlockedByName
        +string Reason
        +bool IsActive
        +DateTime BlockedAt
        +DateTime? ResolvedAt
    }

    class TaskComment {
        +int Id
        +int TaskId
        +int UserId
        +string Content
        +DateTime CreatedAt
    }

    class TaskTag {
        +int Id
        +int TaskId
        +string Tag
    }

    class ProjectMember {
        +int ProjectId
        +int UserId
        +DateTime JoinedAt
    }

    class ProjectAssignmentHistory {
        +int Id
        +int ProjectId
        +int? PreviousOwnerId
        +int? NewOwnerId
        +int ChangedById
        +DateTime ChangedAt
        +string? ReasonTag
    }

    class PageModule {
        +int Id
        +string Name
        +string Route
    }

    class RolePagePermission {
        +int RoleId
        +int PageModuleId
        +int Permissions
    }

    class UserPagePermission {
        +int UserId
        +int PageModuleId
        +int Permissions
    }

    class ChatMessage {
        +int Id
        +int SenderId
        +string Content
        +string MessageType
        +int? RoomId
        +int? ReplyToId
        +int? AttachmentId
        +DateTime SentAt
        +bool IsDeleted
    }

    class ChatRoom {
        +int Id
        +string Name
        +string RoomType
        +int CreatedById
        +DateTime CreatedAt
    }

    class ChatRoomMember {
        +int RoomId
        +int UserId
        +DateTime JoinedAt
    }

    class ChatAttachment {
        +int Id
        +string FileName
        +string StoredFileName
        +string ContentType
        +long FileSize
        +string FilePath
        +int UploadedById
        +DateTime UploadedAt
    }

    class Activity {
        +int Id
        +int? UserId
        +string Action
        +string? EntityType
        +int? EntityId
        +string? Details
        +DateTime CreatedAt
    }

    User "N" --> "1" Role : has role
    User "1" --> "N" TaskEntity : created
    User "1" --> "N" TaskEntity : assigned to
    User "N" --> "N" Project : member of
    Project "1" --> "N" TaskEntity : contains
    TaskEntity "1" --> "N" ChecklistItem
    TaskEntity "1" --> "N" TaskStatusHistory
    TaskEntity "1" --> "N" TaskAssignmentHistory
    TaskEntity "1" --> "N" TaskBlockEntry
    TaskEntity "1" --> "N" TaskComment
    TaskEntity "1" --> "N" TaskTag
    TaskEntity "0..1" --> "N" TaskEntity : parent/child
    Project "1" --> "N" ProjectMember
    Project "1" --> "N" ProjectAssignmentHistory
    Role "1" --> "N" RolePagePermission
    User "1" --> "N" UserPagePermission
    PageModule "1" --> "N" RolePagePermission
    PageModule "1" --> "N" UserPagePermission
    ChatRoom "1" --> "N" ChatMessage
    ChatRoom "1" --> "N" ChatRoomMember
    ChatMessage "0..1" --> "1" ChatAttachment
```

---

## 11.3 Class Diagram — Service Layer

```mermaid
classDiagram
    class ITaskService {
        <<interface>>
        +GetAllTasksAsync()
        +GetTaskByIdAsync()
        +CreateTaskAsync()
        +UpdateTaskAsync()
        +DeleteTaskAsync()
        +AssignTaskAsync()
        +ReassignTaskAsync()
        +StartTaskAsync()
        +ChangeStatusAsync()
        +AddCommentAsync()
        +AddChecklistItemAsync()
        +ToggleChecklistItemAsync()
        +SetTaskBlockAsync()
    }

    class TaskService {
        -PMSDbContext _context
        -IMapper _mapper
        -INotificationService _notifications
        -AllowedEdges : Dictionary
        -ActualHoursExemptStatuses : HashSet
        +ValidateStatusTransition()
    }

    class IAuthService {
        <<interface>>
        +LoginAsync()
        +RegisterAsync()
    }

    class AuthService {
        -PMSDbContext _context
        -JwtSettings _jwtSettings
        +GenerateJwtToken()
    }

    class IAuthorizationService {
        <<interface>>
        +CanViewAsync()
        +CanCreateAsync()
        +CanUpdateAsync()
        +CanDeleteAsync()
    }

    class AuthorizationService {
        -PMSDbContext _context
        -IHttpContextAccessor _http
        -User? _cachedUser
    }

    class IProjectService {
        <<interface>>
        +GetAllProjectsAsync()
        +CreateProjectAsync()
        +UpdateProjectAsync()
        +ReassignProjectAsync()
        +SetProjectMembersAsync()
    }

    class INotificationService {
        <<interface>>
        +NotifyUserAsync()
        +NotifyUsersAsync()
    }

    class NotificationService {
        -IHubContext~ChatHub~ _hub
    }

    class IChatService {
        <<interface>>
        +SaveMessageAsync()
        +GetRoomsForUserAsync()
        +IsMemberAsync()
    }

    class DatabaseInitializer {
        +InitializeAsync()
    }

    ITaskService <|.. TaskService
    IAuthService <|.. AuthService
    IAuthorizationService <|.. AuthorizationService
    INotificationService <|.. NotificationService
    IChatService <|.. ChatService
    TaskService --> INotificationService
    NotificationService --> ChatHub
```

---

## 11.4 Sequence Diagram — Task Status Change

```mermaid
sequenceDiagram
    participant Client
    participant TasksController
    participant IAuthorizationService
    participant ITaskService
    participant DB
    participant INotificationService
    participant SignalR

    Client->>TasksController: PUT /api/tasks/{id}/status\n{ toStatus, actualHours, notes }
    TasksController->>IAuthorizationService: CanUpdateAsync("/tasks")
    IAuthorizationService->>DB: Fetch user + role + page permission
    IAuthorizationService-->>TasksController: bool canUpdate

    alt canUpdate == false
        TasksController-->>Client: 403 Forbidden
    else
        TasksController->>ITaskService: ChangeStatusAsync(taskId, dto, userId, isAdmin)
        ITaskService->>DB: Load task + includes (project, checklist, blockEntries)
        ITaskService->>ITaskService: ValidateStatusTransition(task, from, to, userId, isAdmin, reason, actualHours)

        alt Validation fails
            ITaskService-->>TasksController: ApiResponse { Success: false, Message: error }
            TasksController-->>Client: 400 Bad Request
        else Validation passes
            ITaskService->>DB: UPDATE task.Status = toStatus
            ITaskService->>DB: INSERT TaskStatusHistory
            ITaskService->>INotificationService: NotifyUserAsync(assigneeId, notification)
            INotificationService->>SignalR: Clients.User(userId).SendAsync("ReceiveNotification")
            SignalR-->>Client: ReceiveNotification event
            ITaskService-->>TasksController: ApiResponse { Success: true, Data: TaskDto }
            TasksController-->>Client: 200 OK
        end
    end
```

---

## 11.5 Sequence Diagram — User Login

```mermaid
sequenceDiagram
    participant Browser
    participant AuthController
    participant AuthService
    participant PasswordHasher
    participant JwtService
    participant DB

    Browser->>AuthController: POST /api/auth/login\n{ UsernameOrEmail, Password }
    AuthController->>AuthService: LoginAsync(dto)

    alt Identifier contains '@'
        AuthService->>DB: WHERE Email.ToLower() == emailLower
    else
        AuthService->>DB: WHERE UserName.ToLower() == usernameLower
        AuthService->>AuthService: Ordinal filter in C#
    end

    DB-->>AuthService: User or null

    alt User not found
        AuthService-->>AuthController: { Success: false }
        AuthController-->>Browser: 401
    else User.IsActive == false
        AuthService-->>AuthController: { Success: false }
        AuthController-->>Browser: 401
    else
        AuthService->>PasswordHasher: VerifyPassword(inputPwd, user.PasswordHash)
        PasswordHasher-->>AuthService: bool match

        alt Match == false
            AuthService-->>AuthController: { Success: false }
            AuthController-->>Browser: 401
        else
            AuthService->>AuthService: GenerateJwtToken(user)
            AuthService-->>AuthController: { Success: true, Data: { Token, User } }
            AuthController-->>Browser: 200 OK
            Browser->>Browser: localStorage.pms_token = token
            Browser->>Browser: Load permissions GET /api/permissions/my
        end
    end
```

---

## 11.6 Component Diagram — Backend

```mermaid
graph TD
    subgraph ASP.NET Core 6
        MW[Middleware Pipeline\nCORS → Auth → Static → Routing]
        CTRL[Controllers Layer\n10 Controllers]
        SVC[Services Layer\n15+ Services]
        HUB[SignalR Hub\nChatHub]
        DB[PMSDbContext\nEF Core 6]
    end

    subgraph External
        SQLDB[(SQL Server\nsql.bsite.net)]
    end

    subgraph Frontend
        REACT[React SPA\nserved from wwwroot/]
    end

    REACT -->|HTTP REST| MW
    REACT -->|WebSocket| HUB
    MW --> CTRL
    CTRL --> SVC
    SVC --> DB
    HUB --> SVC
    DB --> SQLDB
```

---

## 11.7 Component Diagram — Frontend

```mermaid
graph TD
    subgraph React App
        APP[App.tsx\nProvider Nesting + Routes]
        CTX[Context Layer\nAuth · Data · Chat · Theme · QuickView · SweetAlert]
        PAGES[Pages\n12 lazy-loaded pages]
        COMP[Components\nShared UI library]
        HOOKS[Custom Hooks\n9 hooks]
        SVC[Frontend Services\n7 service files]
        LIB[lib/api.ts\nHTTP client wrapper]
    end

    subgraph Backend
        API[ASP.NET Core API\n/api/**]
        HUB[SignalR Hub\n/hubs/chat]
    end

    APP --> CTX
    CTX --> PAGES
    PAGES --> COMP
    PAGES --> HOOKS
    PAGES --> SVC
    SVC --> LIB
    LIB --> API
    CTX --> HUB
```

---

## 11.8 Activity Diagram — Checklist-Gated Task Completion

```mermaid
flowchart TD
    A([Assignee works on task]) --> B[Toggle checklist items]
    B --> C{All items completed?}
    C -- No --> B
    C -- Yes --> D{Task status == issues?}
    D -- Yes --> E[System auto-advances to under-review]
    E --> F[Manager or QA reviews]
    F --> G{Pass or fail?}
    G -- Fail --> H[Status set to issues]
    H --> B
    G -- Pass --> I[Status set to completed]
    D -- No --> J[Assignee submits for review]
    J --> F
    I --> K([Task closed])
```
