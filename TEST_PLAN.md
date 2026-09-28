# PMS Test Plan — Full-Stack Task Management System

## Introduction

This test plan outlines the end-to-end verification strategy for the **Project & Task Management System (PMS)**, a full-stack SaaS-style work management application built with **ASP.NET Core 6 Web API** (backend) and **React 19 + Vite SPA** (frontend). The application serves a mini software development company with features including Kanban boards, analytics dashboards, role-based permissions, real-time chat, task templates, and work diaries.

**Scope**: This plan covers the four core functional areas required for release readiness:
1. Projects creation and management
2. Task lifecycle — creation, editing, deletion, status transitions
3. Task review, issue resolution, and QA gates
4. User comments, attachments, and effort reporting

**Environment**:
- Backend: `http://localhost:5178` (ASP.NET Core 6, Swagger at `/swagger`)
- Frontend: `http://localhost:3000` (Vite dev server, proxied API/hubs)
- Database: Remote SQL Server (connection via `DefaultConnection` in `appsettings.json`)
- Test data: Realistic Indian names, emails, and project contexts (e.g., "Rajesh Kumar", "Priya Sharma", "TCS Bangalore", "Infosys Pune")

**Playwright Configuration**:
```typescript
// playwright.config.ts
use: {
  baseURL: 'http://localhost:3000',
  viewport: { width: 1280, height: 900 },
  ignoreHTTPSErrors: true,
  launchOptions: { slowMo: 1500 }
}
```

---

## Test Cases

### 1. Projects Creation and Management

#### TC-01: Create a New Project
**Steps**:
1. Login as **SystemAdmin** (email: `admin@company.com`, password: `Admin@123`)
2. Navigate to **Projects** page via sidebar
3. Click **New Project** button
3. Fill form: Name = "TCS Bangalore CRM", Code = "TCS-CRM", Description = "Customer relationship management for TCS Bangalore", Owner = "Rajesh Kumar", Start Date = today, End Date = +90 days
4. Click **Save**
5. Verify project appears in list with correct code and status "Active"

**Expected**: Project created, visible in list, API returns 201 with project DTO
**Actual**: _[to be filled during execution]_

#### TC-02: Edit Project Details
**Steps**:
1. Open project "TCS Bangalore CRM" from list
2. Click **Edit**, change Description to "Updated CRM scope for TCS Bangalore", change Owner to "Priya Sharma"
3. Save and verify changes reflected in detail view and list

**Expected**: Project updated, audit trail recorded in `ProjectAssignmentHistory`
**Actual**: _[to be filled during execution]_

#### TC-03: Delete Project (Admin Only)
**Steps**:
1. As SystemAdmin, open a project with no tasks
2. Click **Delete**, confirm
3. Verify project removed from list and database

**Expected**: Project deleted, cascade removes members/modules; projects with tasks blocked from deletion
**Actual**: _[to be filled during execution]_

---

### 2. Task Lifecycle — Creation, Editing, Deletion, Status Transitions

#### TC-04: Create Task with Validations
**Steps**:
1. Open project "TCS Bangalore CRM"
2. Click **New Task**, fill: Title = "Design Login API", Priority = "High", Estimated Hours = 8, Assignee = "Arjun Patel", Module = "Auth", Checklist = ["Define DTOs", "Implement JWT", "Add refresh token"]
3. Save and verify task appears in Kanban column "New" with code like `TSK-01-01`

**Expected**: Task created, initial status "new", checklist items generated, notification sent to assignee
**Actual**: _[to be filled during execution]_

#### TC-05: Duplicate Title Prevention
**Steps**:
1. Attempt to create another task in same project with title "Design Login API"
2. Verify validation error: "A task titled 'Design Login API' already exists in this project and is still active"

**Expected**: 400 response, `TaskTitleAvailabilityDto.Available = false`
**Actual**: _[to be filled during execution]_

#### TC-06: Task Status Transitions — Full Workflow
**Steps** (using Kanban drag-drop or status dropdown):
1. **New → In Progress**: Assignee clicks "Start Work" → enters ActualHours = 2 → task moves to "In Progress", `StartedAt` set
2. **In Progress → Paused**: Assignee clicks "Pause" → reason "Waiting for design approval" → task moves to "Paused"
3. **Paused → In Progress**: Assignee clicks "Resume" → no hours required
4. **In Progress → Blocked**: Assignee clicks "Block" → adds block checklist item (Category: "Waiting for API", Description: "Backend team delayed") → task moves to "Blocked"
5. **Blocked → In Progress**: Assignee resolves block item → clicks "Unblock" → task returns to "In Progress"
6. **In Progress → Under Review**: Assignee clicks "Submit for Review" (requires 100% checklist) → ActualHours = 4 → task assigned to QA reviewer
7. **Under Review → Completed**: QA reviewer clicks "Approve & Complete" → task moves to "Completed"
8. **Under Review → Issues**: QA reviewer clicks "QA Failed / Return Issues" → adds review issue → task moves to "Issues"
9. **Issues → In Progress**: Assignee clicks "Fix Issues" → task returns to "In Progress"

**Expected**: Each transition creates `TaskStatusHistory` record with `StartTimestamp`, `EndTimestamp`, `SpentHours`; `ActualHours` stored only when required by transition config; blocked from invalid transitions (e.g., New → Completed)
**Actual**: _[to be filled during execution]_

#### TC-07: Task Editing and Deletion
**Steps**:
1. Edit task: change Priority to "Critical", reassign to "Neha Singh", update Description
2. Verify changes persisted, `UpdatedAt` updated, assignment history recorded
3. Delete task (by creator or project owner) → confirm removal

**Expected**: Task updated/deleted; child tasks prevent parent deletion
**Actual**: _[to be filled during execution]_

---

### 3. Task Review, Issue Resolution, and QA Gates

#### TC-08: Review Checklist Completion
**Steps**:
1. Move task to "Under Review"
2. As QA reviewer, open **Review Checklist** tab
3. Add checklist items: "Code follows standards" (Required), "Unit tests > 80%" (Required), "Documentation updated" (Optional)
4. Mark required items as **Passed**, optional as **N/A**
3. Click **Complete Review** → task moves to "Completed"

**Expected**: Required items must be Passed/NA before completion; failed item forces "Issues" status
**Actual**: _[to be filled during execution]_

#### TC-09: Issue Entry and Resolution
**Steps**:
1. Assignee adds issue entry: "Null reference in JWT middleware" via **Add Issue** button
2. QA reviewer adds review issue: "Missing refresh token rotation" via **Add Review Issue**
3. Assignee resolves both issues → marks as resolved
4. Verify `HasIssues` flag updates automatically

**Expected**: Issues tracked in `TaskIssueEntries` and `TaskReviewIssues`; resolved timestamp recorded
**Actual**: _[to be filled during execution]_

#### TC-10: Block Checklist Workflow
**Steps**:
1. Block task with checklist items: Category "Waiting for Client", Description "Client approval on UI mockups"
2. Verify task cannot be unblocked until all block items resolved
3. Resolve block items → unblock task → task returns to "In Progress"

**Expected**: Block checklist enforced; auto-resolved on reassignment
**Actual**: _[to be filled during execution]_

---

### 4. User Comments, Attachments, and Reports

#### TC-11: Comment and Attachment Flow
**Steps**:
1. Open task detail, add comment: "Started implementation, will push by EOD"
2. Upload attachment: `login-api-spec.pdf` (via drag-drop)
3. Verify comment visible in thread, attachment downloadable
4. Delete comment/attachment as owner

**Expected**: Comments restricted to task stakeholders; attachments stored in `wwwroot/uploads`, metadata in `Attachments` table
**Actual**: _[to be filled during execution]_

#### TC-12: Effort and Status History Reporting
**Steps**:
1. Open **Effort** tab on task → verify timeline shows status segments with `SpentHours`
2. Open **Status History** → verify each transition shows From/To, ActualHours, Action, timestamp
3. As Admin, open **Reports → Effort Stats** → verify org-wide productive/paused hours
4. Export project status matrix (by assignee) → verify working hours calculated from status timestamps

**Expected**: `SpentHours` = system-calculated (EndTimestamp - StartTimestamp); `ActualHours` = user-reported; both visible in UI
**Actual**: _[to be filled during execution]_

---

## Error Handling and Edge Case Notes

| Scenario | Handling |
|----------|----------|
| Network failure during API call | Playwright retries with `retry: 2`; test fails with screenshot on final failure |
| Validation error (400) | Assert error message matches `ValidationFilter` response shape (`ApiResponse<{Errors: string[]}>`) |
| Authorization failure (403) | Verify correct role/permission message; test with non-admin, non-assignee users |
| Concurrent edits | Optimistic concurrency via `UpdatedAt`; second save returns 409, test verifies user prompt |
| Slow backend (cold start) | `slowMo: 1500` accommodates; increase `timeout` to 30s for first request after idle |
| HTTPS certificate errors (dev) | `ignoreHTTPSErrors: true` in Playwright config |
| Database migration pending | Backend auto-migrates on startup; test suite waits for `/health` endpoint before running |

---

## Test Data Seeding (Indian Context)

| Entity | Sample Values |
|--------|---------------|
| Users | Rajesh Kumar (rajesh.kumar@tcs.com), Priya Sharma (priya.sharma@infosys.com), Arjun Patel (arjun.patel@wipro.com), Neha Singh (neha.singh@hcl.com) |
| Projects | "TCS Bangalore CRM", "Infosys Pune HRMS", "Wipro Chennai FinTech" |
| Modules | Auth, HR, Finance, Reporting, Notification |
| Statuses | new, in-progress, paused, blocked, under-review, issues, completed |
| Priorities | Low, Medium, High, Critical |

---

## Execution Checklist

- [ ] Backend running on `:5178` (`dotnet run`)
- [ ] Frontend dev server on `:3000` (`cd ClientApp && npm run dev`)
- [ ] Database migrated (`dotnet ef database update`)
- [ ] Playwright installed (`npx playwright install chromium`)
- [ ] Test file created: `ClientApp/e2e/specs/full-flow.spec.ts`
- [ ] Run tests: `cd ClientApp && npx playwright test --reporter=html`

---

**Prepared by**: Senior QA Engineer  
**Date**: September 2026  
**Version**: 1.0