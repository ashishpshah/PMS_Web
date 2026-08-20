# Phase 2 – Database Analysis

**Source evidence:** `Data/PMSDbContext.cs`, `Migrations/20260629063553_InitialCreate.cs`

---

## 2.1 Database Summary

| Property | Value |
|---|---|
| Engine | SQL Server 2016+ |
| Host | `sql.bsite.net\MSSQL2016` |
| Database | `vishaldemo_PMS` |
| ORM | Entity Framework Core 6.0.36 |
| Migration Count | 1 (squashed `InitialCreate`, 2026-06-29) |
| Total Tables | 22 |
| Composite-PK Tables | 4 (`ProjectMembers`, `ProjectModules`, `TaskTags`, `ChatRoomMembers`) |

---

## 2.2 ER Diagram

```mermaid
erDiagram

    Roles {
        int Id PK
        string Name
        string Code UK
        int Level
        string Description
        bool IsAdmin
        bool IsActive
    }

    Users {
        int Id PK
        string UserName UK
        string Email UK
        string FirstName
        string LastName
        string FullName
        string PasswordHash
        int RoleId FK
        string AvatarUrl
        string ContactNo
        bool IsActive
        datetime CreatedAt
        datetime UpdatedAt
    }

    Projects {
        int Id PK
        string Code UK
        int SeqNumber
        string Name
        string Description
        string Status
        datetime StartDate
        datetime EndDate
        int CreatedById FK
        int OwnerId FK
        datetime CreatedAt
        datetime UpdatedAt
    }

    ProjectMembers {
        int ProjectId PK_FK
        int UserId PK_FK
        string RoleInProject
        datetime JoinedAt
    }

    ProjectModules {
        int ProjectId PK_FK
        string Name PK
    }

    Tasks {
        int Id PK
        string Code UK
        int SeqNumber
        string Title
        string Description
        string Status
        string Priority
        int ProjectId FK
        int AssignedToId FK
        int CreatedById FK
        datetime DueDate
        decimal EstimatedHours
        decimal ActualHours
        int Progress
        string Module
        datetime CreatedAt
        datetime UpdatedAt
        datetime StartedAt
        int StartedById FK
        int ParentTaskId FK
        bool RequiresQA
        int QaAssigneeId FK
    }

    TaskTags {
        int TaskId PK_FK
        string Tag PK
    }

    TaskComments {
        int Id PK
        int TaskId FK
        int UserId FK
        string Content
        datetime CreatedAt
    }

    Attachments {
        int Id PK
        int TaskId FK
        string FileName
        string FilePath
        string FileType
        long FileSize
        int UploadedById FK
        datetime UploadedAt
    }

    Activities {
        int Id PK
        int UserId
        string UserName
        string Action
        string TargetType
        int TargetId
        string TargetName
        datetime Timestamp
    }

    PageModules {
        int Id PK
        string Name
        string Route
        string Description
    }

    RolePagePermissions {
        int Id PK
        int RoleId FK
        int PageModuleId FK
        int Permissions
    }

    UserPagePermissions {
        int Id PK
        int UserId FK
        int PageModuleId FK
        int Permissions
    }

    ProjectAssignmentHistories {
        int Id PK
        int ProjectId FK
        int PreviousOwnerId FK
        int NewOwnerId FK
        int ChangedById FK
        datetime ChangedAt
        string ReasonTag
    }

    TaskAssignmentHistories {
        int Id PK
        int TaskId FK
        int PreviousAssigneeId FK
        int NewAssigneeId FK
        int ChangedById FK
        datetime ChangedAt
        string ReasonTag
    }

    ChecklistItems {
        int Id PK
        int TaskId FK
        string Title
        bool IsCompleted
        datetime CompletedAt
        int CompletedById FK
        int OrderIndex
        datetime CreatedAt
    }

    TaskBlockEntries {
        int Id PK
        int TaskId FK
        int BlockedById FK
        string BlockedByName
        string Reason
        bool IsActive
        datetime BlockedAt
        datetime ResolvedAt
    }

    TaskStatusHistories {
        int Id PK
        int TaskId FK
        string FromStatus
        string ToStatus
        int ChangedById FK
        string Reason
        decimal ActualHours
        datetime ChangedAt
    }

    ChatMessages {
        int Id PK
        string Content
        int SenderId FK
        datetime SentAt
        string MessageType
        bool IsDeleted
        int ReplyToId FK
        int RoomId FK
    }

    ChatAttachments {
        int Id PK
        int MessageId FK
        string FileName
        string StoredFileName
        string FilePath
        string FileType
        long FileSize
        string MimeType
    }

    ChatRooms {
        int Id PK
        string Name
        string RoomType
        int CreatedById FK
        datetime CreatedAt
    }

    ChatRoomMembers {
        int RoomId PK_FK
        int UserId PK_FK
        datetime JoinedAt
    }

    Roles ||--o{ Users : "has role"
    Users ||--o{ Projects : "creates"
    Users ||--o{ Projects : "owns"
    Projects ||--o{ ProjectMembers : "has"
    Users ||--o{ ProjectMembers : "member of"
    Projects ||--o{ ProjectModules : "has modules"
    Projects ||--o{ Tasks : "contains"
    Users ||--o{ Tasks : "assigned to"
    Users ||--o{ Tasks : "created by"
    Users ||--o{ Tasks : "started by"
    Users ||--o{ Tasks : "qa assignee"
    Tasks ||--o{ Tasks : "parent of"
    Tasks ||--o{ TaskTags : "tagged"
    Tasks ||--o{ TaskComments : "has comments"
    Users ||--o{ TaskComments : "comments"
    Tasks ||--o{ Attachments : "has files"
    Users ||--o{ Attachments : "uploads"
    Projects ||--o{ ProjectAssignmentHistories : "ownership log"
    Tasks ||--o{ TaskAssignmentHistories : "assignment log"
    Tasks ||--o{ ChecklistItems : "has checklist"
    Tasks ||--o{ TaskBlockEntries : "block log"
    Tasks ||--o{ TaskStatusHistories : "status log"
    Roles ||--o{ RolePagePermissions : "role perms"
    PageModules ||--o{ RolePagePermissions : "page"
    Users ||--o{ UserPagePermissions : "user perms"
    PageModules ||--o{ UserPagePermissions : "page"
    Users ||--o{ ChatMessages : "sends"
    ChatRooms ||--o{ ChatMessages : "contains"
    ChatMessages ||--o| ChatAttachments : "has file"
    ChatMessages ||--o{ ChatMessages : "reply to"
    Users ||--o{ ChatRooms : "creates"
    ChatRooms ||--o{ ChatRoomMembers : "has members"
    Users ||--o{ ChatRoomMembers : "member of"
```

---

## 2.3 Table Documentation

### Table: `Roles`

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| `Id` | `int` | No | PK, IDENTITY | Auto-increment role ID |
| `Name` | `nvarchar` | No | NOT NULL | Display name (e.g. "Project Manager") |
| `Code` | `nvarchar` | Yes | UNIQUE (filtered, nullable) | Short code (e.g. `PM`, `ADMIN`) |
| `Level` | `int` | No | DEFAULT 0 | Hierarchy rank; 1 = highest |
| `Description` | `nvarchar` | Yes | — | Optional description |
| `IsAdmin` | `bit` | No | DEFAULT 0 | Grants admin privileges if true |
| `IsActive` | `bit` | No | DEFAULT 1 | Soft-disable flag |

**Indexes:**
- `IX_Roles_Code` — UNIQUE, filtered `[Code] IS NOT NULL`

---

### Table: `Users`

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| `Id` | `int` | No | PK, IDENTITY | Auto-increment user ID |
| `UserName` | `nvarchar(50)` | No | UNIQUE | Case-sensitive login name |
| `Email` | `nvarchar(256)` | No | UNIQUE | Case-insensitive login email |
| `FirstName` | `nvarchar(100)` | No | NOT NULL | — |
| `LastName` | `nvarchar(100)` | No | NOT NULL | — |
| `FullName` | `nvarchar` | No | NOT NULL | Denormalized `FirstName + LastName` |
| `PasswordHash` | `nvarchar` | No | NOT NULL | PBKDF2 hash |
| `RoleId` | `int` | No | FK → Roles.Id RESTRICT | Single role assignment |
| `AvatarUrl` | `nvarchar` | Yes | — | Profile image URL |
| `ContactNo` | `nvarchar` | Yes | — | Phone number |
| `IsActive` | `bit` | No | DEFAULT 1 | Soft-disable (blocks login) |
| `CreatedAt` | `datetime2` | No | DEFAULT UTC | Account creation time |
| `UpdatedAt` | `datetime2` | Yes | — | Last profile update |

**Indexes:**
- `IX_Users_UserName` — UNIQUE
- `IX_Users_Email` — UNIQUE

**Foreign Keys:**
- `FK_Users_Roles_RoleId` → `Roles.Id` ON DELETE RESTRICT

---

### Table: `Projects`

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| `Id` | `int` | No | PK, IDENTITY | — |
| `Code` | `nvarchar` | Yes | UNIQUE (filtered) | e.g. `PRJ-01` |
| `SeqNumber` | `int` | No | — | 1-based position, used to build Code |
| `Name` | `nvarchar` | No | NOT NULL | Project display name |
| `Description` | `nvarchar` | Yes | — | — |
| `Status` | `nvarchar` | No | DEFAULT `'Active'` | `Active` / `Archived` / `Completed` |
| `StartDate` | `datetime2` | Yes | — | — |
| `EndDate` | `datetime2` | Yes | — | — |
| `CreatedById` | `int` | No | FK → Users.Id RESTRICT | Creator |
| `OwnerId` | `int` | No | FK → Users.Id RESTRICT | Accountable owner |
| `CreatedAt` | `datetime2` | No | DEFAULT UTC | — |
| `UpdatedAt` | `datetime2` | Yes | — | — |

**Indexes:**
- `IX_Projects_Code` — UNIQUE, filtered `[Code] IS NOT NULL`

**Foreign Keys:**
- `FK_Projects_Users_CreatedById` → `Users.Id` ON DELETE RESTRICT
- `FK_Projects_Users_OwnerId` → `Users.Id` ON DELETE RESTRICT

---

### Table: `ProjectMembers`

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| `ProjectId` | `int` | No | PK, FK → Projects.Id RESTRICT | — |
| `UserId` | `int` | No | PK, FK → Users.Id RESTRICT | — |
| `RoleInProject` | `nvarchar` | Yes | — | Free-text role label |
| `JoinedAt` | `datetime2` | No | DEFAULT UTC | Membership start |

**Primary Key:** Composite `(ProjectId, UserId)`

---

### Table: `ProjectModules`

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| `ProjectId` | `int` | No | PK, FK → Projects.Id CASCADE | — |
| `Name` | `nvarchar` | No | PK | Module label (e.g. "Backend") |

**Primary Key:** Composite `(ProjectId, Name)`

---

### Table: `Tasks`

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| `Id` | `int` | No | PK, IDENTITY | — |
| `Code` | `nvarchar` | Yes | UNIQUE (filtered) | `TSK-PP-TT` or `SUB-PP-TT-SS` |
| `SeqNumber` | `int` | No | — | 1-based sequence for code generation |
| `Title` | `nvarchar` | No | NOT NULL | — |
| `Description` | `nvarchar` | Yes | — | — |
| `Status` | `nvarchar` | No | DEFAULT `'new'` | Workflow state (see §2.4) |
| `Priority` | `nvarchar` | No | DEFAULT `'Medium'` | `Low` / `Medium` / `High` / `Critical` |
| `ProjectId` | `int` | No | FK → Projects.Id | — |
| `AssignedToId` | `int` | Yes | FK → Users.Id RESTRICT | Nullable (unassigned) |
| `CreatedById` | `int` | No | FK → Users.Id | — |
| `DueDate` | `datetime2` | Yes | — | — |
| `EstimatedHours` | `decimal(18,2)` | Yes | — | — |
| `ActualHours` | `decimal(18,2)` | Yes | — | Cumulative from status transitions |
| `Progress` | `int` | No | DEFAULT 0 | 0–100% |
| `Module` | `nvarchar` | Yes | — | Project module name |
| `CreatedAt` | `datetime2` | No | DEFAULT UTC | — |
| `UpdatedAt` | `datetime2` | Yes | — | — |
| `StartedAt` | `datetime2` | Yes | — | Set when status → `in_progress` |
| `StartedById` | `int` | Yes | FK → Users.Id RESTRICT | Who moved to in_progress |
| `ParentTaskId` | `int` | Yes | FK → Tasks.Id RESTRICT | Null = top-level task |
| `RequiresQA` | `bit` | No | DEFAULT 0 | Enables QA review step |
| `QaAssigneeId` | `int` | Yes | FK → Users.Id RESTRICT | QA reviewer |

**Indexes:**
- `IX_Tasks_Code` — UNIQUE, filtered `[Code] IS NOT NULL`

**Foreign Keys:**
- `FK_Tasks_Projects_ProjectId` → `Projects.Id`
- `FK_Tasks_Users_AssignedToId` → `Users.Id` ON DELETE RESTRICT
- `FK_Tasks_Users_CreatedById` → `Users.Id`
- `FK_Tasks_Users_StartedById` → `Users.Id` ON DELETE RESTRICT
- `FK_Tasks_Users_QaAssigneeId` → `Users.Id` ON DELETE RESTRICT
- `FK_Tasks_Tasks_ParentTaskId` → `Tasks.Id` ON DELETE RESTRICT (self-referencing)

---

### Table: `TaskTags`

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| `TaskId` | `int` | No | PK, FK → Tasks.Id | — |
| `Tag` | `nvarchar` | No | PK | Free-text tag value |

**Primary Key:** Composite `(TaskId, Tag)`

---

### Table: `TaskComments`

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| `Id` | `int` | No | PK, IDENTITY | — |
| `TaskId` | `int` | No | FK → Tasks.Id | — |
| `UserId` | `int` | No | FK → Users.Id RESTRICT | Author |
| `Content` | `nvarchar` | No | NOT NULL | Comment text |
| `CreatedAt` | `datetime2` | No | DEFAULT UTC | — |

---

### Table: `Attachments`

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| `Id` | `int` | No | PK, IDENTITY | — |
| `TaskId` | `int` | No | FK → Tasks.Id | — |
| `FileName` | `nvarchar` | No | NOT NULL | Original file name |
| `FilePath` | `nvarchar` | No | NOT NULL | Server-side relative path |
| `FileType` | `nvarchar` | No | NOT NULL | Extension or MIME |
| `FileSize` | `bigint` | No | NOT NULL | Bytes |
| `UploadedById` | `int` | No | FK → Users.Id RESTRICT | — |
| `UploadedAt` | `datetime2` | No | DEFAULT UTC | — |

---

### Table: `Activities`

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| `Id` | `int` | No | PK, IDENTITY | — |
| `UserId` | `int` | No | NOT NULL | Actor (no FK — denormalized) |
| `UserName` | `nvarchar` | No | NOT NULL | Snapshot of actor name |
| `Action` | `nvarchar` | No | NOT NULL | e.g. `"created"`, `"updated"` |
| `TargetType` | `nvarchar` | No | NOT NULL | e.g. `"Task"`, `"Project"` |
| `TargetId` | `int` | No | NOT NULL | PK of the affected entity |
| `TargetName` | `nvarchar` | No | NOT NULL | Snapshot of entity name |
| `Timestamp` | `datetime2` | No | DEFAULT UTC | — |

> Note: No foreign key on `UserId` — activity log is intentionally denormalized for immutable audit trail.

---

### Table: `PageModules`

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| `Id` | `int` | No | PK, IDENTITY | — |
| `Name` | `nvarchar` | No | NOT NULL | e.g. `"Tasks"`, `"Projects"` |
| `Route` | `nvarchar` | No | NOT NULL | Frontend route e.g. `"/tasks"` |
| `Description` | `nvarchar` | Yes | — | — |

---

### Table: `RolePagePermissions`

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| `Id` | `int` | No | PK, IDENTITY | — |
| `RoleId` | `int` | No | FK → Roles.Id | — |
| `PageModuleId` | `int` | No | FK → PageModules.Id | — |
| `Permissions` | `int` | No | NOT NULL | 4-bit bitmap: View(1) Create(2) Update(4) Delete(8) |

---

### Table: `UserPagePermissions`

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| `Id` | `int` | No | PK, IDENTITY | — |
| `UserId` | `int` | No | FK → Users.Id | — |
| `PageModuleId` | `int` | No | FK → PageModules.Id | — |
| `Permissions` | `int` | No | NOT NULL | 4-bit bitmap (overrides role) |

---

### Table: `ProjectAssignmentHistories`

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| `Id` | `int` | No | PK, IDENTITY | — |
| `ProjectId` | `int` | No | FK → Projects.Id RESTRICT | — |
| `PreviousOwnerId` | `int` | No | FK → Users.Id RESTRICT | — |
| `NewOwnerId` | `int` | No | FK → Users.Id RESTRICT | — |
| `ChangedById` | `int` | No | FK → Users.Id RESTRICT | Who performed the change |
| `ChangedAt` | `datetime2` | No | DEFAULT UTC | — |
| `ReasonTag` | `nvarchar(50)` | No | NOT NULL | Reason code from `ReasonTags` enum |

---

### Table: `TaskAssignmentHistories`

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| `Id` | `int` | No | PK, IDENTITY | — |
| `TaskId` | `int` | No | FK → Tasks.Id RESTRICT | — |
| `PreviousAssigneeId` | `int` | Yes | FK → Users.Id RESTRICT | Nullable (first assignment) |
| `NewAssigneeId` | `int` | Yes | FK → Users.Id RESTRICT | Nullable (unassign) |
| `ChangedById` | `int` | No | FK → Users.Id RESTRICT | — |
| `ChangedAt` | `datetime2` | No | DEFAULT UTC | — |
| `ReasonTag` | `nvarchar(50)` | No | NOT NULL | Reason code |

---

### Table: `ChecklistItems`

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| `Id` | `int` | No | PK, IDENTITY | — |
| `TaskId` | `int` | No | FK → Tasks.Id CASCADE | — |
| `Title` | `nvarchar(500)` | No | NOT NULL | Checklist item text |
| `IsCompleted` | `bit` | No | DEFAULT 0 | — |
| `CompletedAt` | `datetime2` | Yes | — | — |
| `CompletedById` | `int` | Yes | FK → Users.Id RESTRICT | Who ticked it |
| `OrderIndex` | `int` | No | NOT NULL | Display order |
| `CreatedAt` | `datetime2` | No | DEFAULT UTC | — |

---

### Table: `TaskBlockEntries`

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| `Id` | `int` | No | PK, IDENTITY | — |
| `TaskId` | `int` | No | FK → Tasks.Id CASCADE | — |
| `BlockedById` | `int` | No | FK → Users.Id RESTRICT | Who raised the block |
| `BlockedByName` | `nvarchar` | No | NOT NULL | Snapshot name |
| `Reason` | `nvarchar(1000)` | No | NOT NULL | Block reason text |
| `IsActive` | `bit` | No | DEFAULT 1 | False = resolved |
| `BlockedAt` | `datetime2` | No | DEFAULT UTC | — |
| `ResolvedAt` | `datetime2` | Yes | — | — |

**Indexes:**
- `IX_TaskBlockEntries_TaskId_BlockedById` — UNIQUE (one active block per user per task)

---

### Table: `TaskStatusHistories`

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| `Id` | `int` | No | PK, IDENTITY | — |
| `TaskId` | `int` | No | FK → Tasks.Id CASCADE | — |
| `FromStatus` | `nvarchar` | No | NOT NULL | Previous status value |
| `ToStatus` | `nvarchar` | No | NOT NULL | New status value |
| `ChangedById` | `int` | No | FK → Users.Id RESTRICT | — |
| `Reason` | `nvarchar` | Yes | — | Optional note |
| `ActualHours` | `decimal(18,2)` | Yes | — | Hours logged on this transition |
| `ChangedAt` | `datetime2` | No | DEFAULT UTC | — |

---

### Table: `ChatMessages`

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| `Id` | `int` | No | PK, IDENTITY | — |
| `Content` | `nvarchar` | Yes | — | Null for file-only messages |
| `SenderId` | `int` | No | FK → Users.Id RESTRICT | — |
| `SentAt` | `datetime2` | No | DEFAULT UTC | — |
| `MessageType` | `nvarchar(20)` | No | DEFAULT `'text'` | `text` / `file` |
| `IsDeleted` | `bit` | No | DEFAULT 0 | Soft-delete flag |
| `ReplyToId` | `int` | Yes | FK → ChatMessages.Id RESTRICT | Thread reply |
| `RoomId` | `int` | Yes | FK → ChatRooms.Id CASCADE | Null = global channel |

---

### Table: `ChatAttachments`

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| `Id` | `int` | No | PK, IDENTITY | — |
| `MessageId` | `int` | No | FK → ChatMessages.Id CASCADE | 1:1 with message |
| `FileName` | `nvarchar` | No | NOT NULL | Original name |
| `StoredFileName` | `nvarchar` | No | NOT NULL | Server-generated unique name |
| `FilePath` | `nvarchar` | No | NOT NULL | Relative server path |
| `FileType` | `nvarchar` | No | NOT NULL | Extension |
| `FileSize` | `bigint` | No | NOT NULL | Bytes |
| `MimeType` | `nvarchar` | No | NOT NULL | e.g. `image/png` |

---

### Table: `ChatRooms`

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| `Id` | `int` | No | PK, IDENTITY | — |
| `Name` | `nvarchar` | No | NOT NULL | Room display name |
| `RoomType` | `nvarchar(20)` | No | DEFAULT `'public'` | `public` / `private` / `direct` |
| `CreatedById` | `int` | No | FK → Users.Id RESTRICT | — |
| `CreatedAt` | `datetime2` | No | DEFAULT UTC | — |

---

### Table: `ChatRoomMembers`

| Column | Type | Nullable | Constraints | Description |
|---|---|---|---|---|
| `RoomId` | `int` | No | PK, FK → ChatRooms.Id CASCADE | — |
| `UserId` | `int` | No | PK, FK → Users.Id RESTRICT | — |
| `JoinedAt` | `datetime2` | No | DEFAULT UTC | — |

**Primary Key:** Composite `(RoomId, UserId)`

---

## 2.4 Task Status Workflow Values

The `Tasks.Status` column is a free-text `nvarchar` constrained by application logic only (no DB CHECK constraint). Valid values observed in `TaskService.cs`:

| Status Value | Description |
|---|---|
| `new` | Initial state |
| `in_progress` | Development started |
| `paused` | Temporarily halted |
| `blocked` | Externally blocked |
| `under_review` | QA review in progress |
| `qa_failed` | QA rejected |
| `completed` | Done — requires 100% checklist + actual hours |
| `reopened` | Manager-only reopen from completed |

---

## 2.5 Permission Bitmap

The `Permissions` column in `RolePagePermissions` and `UserPagePermissions` is a **4-bit integer**:

| Bit | Value | Name | Description |
|---|---|---|---|
| 0 | 1 | View | Can read/list |
| 1 | 2 | Create | Can create new records |
| 2 | 4 | Update | Can edit existing records |
| 3 | 8 | Delete | Can delete records |

`15` = all bits set (full access). `0` = no access.
User-level permissions in `UserPagePermissions` override the role-level `RolePagePermissions`.

---

## 2.6 Foreign Key Summary

| FK | From Table.Column | To Table.Column | On Delete |
|---|---|---|---|
| Users → Roles | `Users.RoleId` | `Roles.Id` | RESTRICT |
| Projects → Users (creator) | `Projects.CreatedById` | `Users.Id` | RESTRICT |
| Projects → Users (owner) | `Projects.OwnerId` | `Users.Id` | RESTRICT |
| ProjectMembers → Projects | `ProjectMembers.ProjectId` | `Projects.Id` | RESTRICT |
| ProjectMembers → Users | `ProjectMembers.UserId` | `Users.Id` | RESTRICT |
| ProjectModules → Projects | `ProjectModules.ProjectId` | `Projects.Id` | CASCADE |
| Tasks → Projects | `Tasks.ProjectId` | `Projects.Id` | — |
| Tasks → Users (assignee) | `Tasks.AssignedToId` | `Users.Id` | RESTRICT |
| Tasks → Users (creator) | `Tasks.CreatedById` | `Users.Id` | — |
| Tasks → Users (started by) | `Tasks.StartedById` | `Users.Id` | RESTRICT |
| Tasks → Tasks (parent) | `Tasks.ParentTaskId` | `Tasks.Id` | RESTRICT |
| Tasks → Users (QA) | `Tasks.QaAssigneeId` | `Users.Id` | RESTRICT |
| TaskTags → Tasks | `TaskTags.TaskId` | `Tasks.Id` | — |
| TaskComments → Tasks | `TaskComments.TaskId` | `Tasks.Id` | — |
| TaskComments → Users | `TaskComments.UserId` | `Users.Id` | RESTRICT |
| Attachments → Tasks | `Attachments.TaskId` | `Tasks.Id` | — |
| Attachments → Users | `Attachments.UploadedById` | `Users.Id` | RESTRICT |
| RolePagePermissions → Roles | `RolePagePermissions.RoleId` | `Roles.Id` | — |
| RolePagePermissions → PageModules | `RolePagePermissions.PageModuleId` | `PageModules.Id` | — |
| UserPagePermissions → Users | `UserPagePermissions.UserId` | `Users.Id` | — |
| UserPagePermissions → PageModules | `UserPagePermissions.PageModuleId` | `PageModules.Id` | — |
| ProjectAssignmentHistories → Projects | `.ProjectId` | `Projects.Id` | RESTRICT |
| ProjectAssignmentHistories → Users (×3) | `PreviousOwnerId`, `NewOwnerId`, `ChangedById` | `Users.Id` | RESTRICT |
| TaskAssignmentHistories → Tasks | `.TaskId` | `Tasks.Id` | RESTRICT |
| TaskAssignmentHistories → Users (×3) | `PreviousAssigneeId`, `NewAssigneeId`, `ChangedById` | `Users.Id` | RESTRICT |
| ChecklistItems → Tasks | `.TaskId` | `Tasks.Id` | CASCADE |
| ChecklistItems → Users | `.CompletedById` | `Users.Id` | RESTRICT |
| TaskBlockEntries → Tasks | `.TaskId` | `Tasks.Id` | CASCADE |
| TaskBlockEntries → Users | `.BlockedById` | `Users.Id` | RESTRICT |
| TaskStatusHistories → Tasks | `.TaskId` | `Tasks.Id` | CASCADE |
| TaskStatusHistories → Users | `.ChangedById` | `Users.Id` | RESTRICT |
| ChatMessages → Users (sender) | `.SenderId` | `Users.Id` | RESTRICT |
| ChatMessages → ChatMessages (reply) | `.ReplyToId` | `ChatMessages.Id` | RESTRICT |
| ChatMessages → ChatRooms | `.RoomId` | `ChatRooms.Id` | CASCADE |
| ChatAttachments → ChatMessages | `.MessageId` | `ChatMessages.Id` | CASCADE |
| ChatRooms → Users | `.CreatedById` | `Users.Id` | RESTRICT |
| ChatRoomMembers → ChatRooms | `.RoomId` | `ChatRooms.Id` | CASCADE |
| ChatRoomMembers → Users | `.UserId` | `Users.Id` | RESTRICT |

---

## 2.7 Index Summary

| Index Name | Table | Columns | Type |
|---|---|---|---|
| `IX_Roles_Code` | Roles | Code | UNIQUE, filtered `[Code] IS NOT NULL` |
| `IX_Users_UserName` | Users | UserName | UNIQUE |
| `IX_Users_Email` | Users | Email | UNIQUE |
| `IX_Projects_Code` | Projects | Code | UNIQUE, filtered `[Code] IS NOT NULL` |
| `IX_Tasks_Code` | Tasks | Code | UNIQUE, filtered `[Code] IS NOT NULL` |
| `IX_TaskBlockEntries_TaskId_BlockedById` | TaskBlockEntries | TaskId, BlockedById | UNIQUE |

---

## 2.8 Code Generation Pattern

| Entity | Code Pattern | Example |
|---|---|---|
| Project | `PRJ-{SeqNumber:D2}` | `PRJ-01` |
| Top-level Task | `TSK-{ProjectSeq:D2}-{TaskSeq:D2}` | `TSK-01-03` |
| Subtask | `SUB-{ProjectSeq:D2}-{ParentSeq:D2}-{ChildSeq:D2}` | `SUB-01-03-02` |

Source: `Services/CodeGenerator.cs`
