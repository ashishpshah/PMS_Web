# Phase 9 – Workflow Documentation

**Source evidence:** `Services/TaskService.cs`, `Services/AuthService.cs`, `Services/ProjectService.cs`, `Controllers/TasksController.cs`, `Phase8_Business_Rules.md`

All flowcharts are Mermaid diagrams.

---

## 9.1 User Registration & Login Flow

```mermaid
flowchart TD
    A([Start]) --> B{Has account?}
    B -- Yes --> L1[Enter username/email + password]
    B -- No --> R1[Fill register form:\nName, Username, Email, Contact, Password]

    R1 --> R2{Password valid:\nupper + lower + digit + 6 chars?}
    R2 -- No --> R1
    R2 -- Yes --> R3[POST /api/auth/register]
    R3 --> R4{Username or Email\nalready taken?}
    R4 -- Yes --> R1
    R4 -- No --> R5[Assign lowest non-admin role\nordered by Level ASC]
    R5 --> R6[Account created]
    R6 --> L1

    L1 --> L2{Contains @ symbol?}
    L2 -- Yes: Email --> L3[Case-insensitive lookup by email]
    L2 -- No: Username --> L4[CI DB query + Ordinal filter in C#]
    L3 --> L5{User found?}
    L4 --> L5
    L5 -- No --> L6[Return: Invalid credentials]
    L5 -- Yes --> L7{IsActive == true?}
    L7 -- No --> L6
    L7 -- Yes --> L8{Password matches PBKDF2?}
    L8 -- No --> L6
    L8 -- Yes --> L9[Issue JWT: 420 minutes]
    L9 --> L10[Store token in localStorage]
    L10 --> L11[Load permissions from /api/permissions/my]
    L11 --> L12([Dashboard])
```

---

## 9.2 Task Status Workflow

```mermaid
stateDiagram-v2
    [*] --> new : Task created

    new --> in_progress : Start working
    new --> completed : Complete directly

    in_progress --> paused : Pause
    in_progress --> blocked : Block with reason
    in_progress --> under_review : Submit for review (100% checklist)
    in_progress --> completed : Complete directly

    paused --> in_progress : Resume
    paused --> completed : Complete directly

    blocked --> in_progress : Unblock then resume
    blocked --> completed : Admin override

    under_review --> issues : QA fail
    under_review --> in_progress : Send back (manager only)
    under_review --> completed : Approve (QA or manager)

    issues --> in_progress : Resume after fix
    issues --> completed : Complete directly

    completed --> in_progress : Reopen (manager only)
```

---

## 9.3 Task Status Change Validation Flow

```mermaid
flowchart TD
    A([ChangeStatusAsync called]) --> B{Valid target status?}
    B -- No --> E1[Error: Invalid status]
    B -- Yes --> C{Edge allowed from → to?}
    C -- No --> E2[Error: Transition not allowed]
    C -- Yes --> D{requireActualHours AND\nnot exempt AND actualHours le 0?}
    D -- Yes --> E3[Error: Actual hours required]
    D -- No --> E{Task has active block?}
    E -- Yes, not admin --> E4[Error: Unblock first]
    E -- No or admin --> F{Moving to blocked?}
    F -- Yes, no reason --> E5[Error: Reason required]
    F -- No or reason given --> G{Moving to under-review?}
    G -- Yes, checklist lt 100% --> E6[Error: Complete checklist first]
    G -- No or 100% --> H{Moving to completed AND\nchecklist exists AND lt 100%?}
    H -- Yes --> E7[Error: Complete checklist first]
    H -- No --> I[Role gate check per target]
    I --> J{All role gates pass?}
    J -- No --> E8[Error: Insufficient role]
    J -- Yes --> OK([Save status + history row])
```

---

## 9.4 Task Assignment Flow

```mermaid
flowchart TD
    A([Assign task]) --> B{Actor is Task Creator?}
    B -- No --> E1[403 Forbidden]
    B -- Yes --> C[Record previous assignee]
    C --> D[Set AssignedToId to new user]
    D --> F[Add TaskAssignmentHistory\nReasonTag = initial-assignment]
    F --> G[Save to DB]
    G --> H([Return updated task])
```

---

## 9.5 Task Reassignment Flow

```mermaid
flowchart TD
    A([Reassign task]) --> B{ReasonTag in ReasonTags.Valid?}
    B -- No --> E1[Error: Invalid reason tag]
    B -- Yes --> C{New assignee exists and active?}
    C -- No --> E2[Error: User not found]
    C -- Yes --> D[Record previous assignee]
    D --> F[Set AssignedToId to new user]
    F --> G[Add TaskAssignmentHistory with ReasonTag]
    G --> H{Task has active blocks?}
    H -- Yes --> I[Auto-resolve all active blocks\nResolvedAt set, IsActive = false]
    I --> J[Auto-advance status to in-progress]
    J --> K[Add StatusHistory row]
    K --> L[Save to DB]
    H -- No --> L
    L --> M([Return updated task])
```

---

## 9.6 Checklist Gate & Auto-Advance Flow

```mermaid
flowchart TD
    A([Toggle checklist item]) --> B{Actor is current Assignee?}
    B -- No --> E1[403 Forbidden]
    B -- Yes --> C[Update IsCompleted flag]
    C --> D[Recalculate Progress = completed / total x 100]
    D --> E{Progress == 100?}
    E -- Yes --> F{Current task status == issues?}
    F -- Yes --> G[Auto-advance to under-review]
    G --> H[Add StatusHistory row]
    F -- No --> I([Done])
    H --> I
    E -- No --> I
```

---

## 9.7 Project Ownership Transfer Flow

```mermaid
flowchart TD
    A([Reassign project]) --> B{ReasonTag in ReasonTags.Valid?}
    B -- No --> E1[Error: Invalid reason tag]
    B -- Yes --> C{New owner user exists?}
    C -- No --> E2[Error: User not found]
    C -- Yes --> D[Record previous OwnerId]
    D --> F[Set OwnerId = new owner]
    F --> G[Add ProjectAssignmentHistory\nwith ReasonTag and timestamp]
    G --> H[Save to DB]
    H --> I([Return updated project])
```

---

## 9.8 Permission Check Flow (Per Request)

```mermaid
flowchart TD
    A([API request arrives]) --> B{JWT signature + expiry valid?}
    B -- No --> HTTP401[401 Unauthorized]
    B -- Yes --> C[Extract userId from NameIdentifier claim]
    C --> D{AuthorizationService\nhas cached user?}
    D -- No --> F[Fetch User + Role from DB]
    F --> G[Cache in _cachedUser]
    D -- Yes --> G
    G --> H{RoleId == 1 SystemAdmin?}
    H -- Yes --> ALLOW[Full access]
    H -- No --> I{Role.IsAdmin == true?}
    I -- Yes --> ALLOW
    I -- No --> J[Find PageModule by route string]
    J --> K{Module found?}
    K -- No --> DENY[Access denied]
    K -- Yes --> L{UserPagePermission exists\nfor this userId + moduleId?}
    L -- Yes --> M[Read user-level bitmap]
    M --> N{Required bit set?}
    L -- No --> O{RolePagePermission exists\nfor this roleId + moduleId?}
    O -- Yes --> P[Read role-level bitmap]
    P --> N
    O -- No --> DENY
    N -- Yes --> ALLOW
    N -- No --> DENY
```

---

## 9.9 Chat Message Send Flow

```mermaid
flowchart TD
    A([User invokes SendMessage]) --> B{Has roomId?}
    B -- Yes --> C{IsMemberAsync returns true?}
    C -- No --> SILENT([Silently ignored])
    C -- Yes --> D[ChatService.SaveMessageAsync]
    B -- No: global --> D
    D --> E[INSERT into ChatMessages]
    E --> F{Room message?}
    F -- Yes --> G[Clients.Group room_{id} SendAsync ReceiveMessage]
    F -- No --> H[Clients.All SendAsync ReceiveMessage]
    G --> DONE([Recipients receive message])
    H --> DONE
```

---

## 9.10 User Deactivation Impact Flow

```mermaid
flowchart TD
    A([Admin deactivates user]) --> B[Set IsActive = false in DB]
    B --> C{User tries to login?}
    C -- Yes --> D[Return: Invalid credentials]
    C -- No --> E{User has an existing JWT?}
    E -- Yes --> F{Token expired?}
    F -- Yes --> G[401 on all requests]
    F -- No --> H{User calls GET /api/auth/validate?}
    H -- Yes --> I[Fetch fresh user from DB]
    I --> J{IsActive?}
    J -- No --> K[401 returned - session ends]
    J -- Yes --> L[200 - still active]
    H -- No --> M[Requests continue to succeed\nuntil token expires]
    E -- No --> N([No impact on existing session])
```

---

## 9.11 Task Deletion Pre-Check Flow

```mermaid
flowchart TD
    A([Delete task request]) --> B{Task exists?}
    B -- No --> E1[404 Not Found]
    B -- Yes --> C{Has child tasks?}
    C -- Yes --> E2[Error: Remove or relink children first]
    C -- No --> D[Delete: Tags, Comments, Attachments,\nChecklistItems, AssignmentHistory]
    D --> F[Delete TaskEntity row]
    F --> G[Save changes]
    G --> H([200 OK])
```

---

## 9.12 Full Task Lifecycle Summary

```mermaid
timeline
    title Task Lifecycle
    section Creation
        Created : Task record created with Code TSK-PP-TT
        Assigned : Creator assigns to an active user
    section Work
        Started : Assignee starts, status → in-progress
        Paused : Assignee pauses (status → paused)
        Blocked : Blocker added with reason (status → blocked)
        Unblocked : Block resolved, status → in-progress
    section Review
        Submitted : 100% checklist + submit → under-review
        QA Fail : Issues found → issues status
        Fixed : Assignee resumes → in-progress
        Approved : QA/manager approves → completed
    section Closure
        Completed : Task closed
        Reopened : Manager reopens → in-progress if needed
```
