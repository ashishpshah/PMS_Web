# Frontend/Backend Validation Parity — Implementation Report

**Date:** 2026-08-21
**Scope:** Full-stack validation audit — every frontend form/input discovered, matched against
backend DTOs/controllers/services, gaps closed with FluentValidation.

---

## 1. Executive summary

The app had two validation layers that had drifted apart. The frontend enforced real rules
(required fields, length limits, a password-complexity regex, a 24h/day hours cap, etc.), but
almost none of it was replicated server-side — several of the weakest surfaces (**Roles**,
**Projects**, most of the **Task** lifecycle DTOs, and **every Auth DTO**) had **zero** backend
validation beyond what `[ApiController]`'s automatic ModelState check happened to catch, which
for those DTOs was nothing, because they carried no DataAnnotations at all.

This pass adds a **FluentValidation** layer that sits in front of every controller action via a
new global `ValidationFilter`, closes every gap the audit found, and reconciles the one place the
frontend disagreed with itself (password complexity). One thing worth stating up front: **this
app has no Aadhaar/PAN/GSTIN/IFSC/bank-account/passport/driving-license/vehicle-registration
fields anywhere in its data model** (confirmed by a repo-wide grep) — it's a task/project
management system, not a KYC/financial app — so none of those validators were built; building
them would have been dead code with nothing to validate.

---

## 2. Frontend validation discovered

| Form | File | Rules found |
|---|---|---|
| Login | `Auth.tsx:326-367` | identifier required, password ≥6 chars (ad hoc, not via shared lib) |
| Register | `Auth.tsx:386-432` | name/email/password via `lib/validation.ts` + `PASSWORD_STRENGTH_REGEX` (local to Auth.tsx) |
| OTP confirm | `Auth.tsx:210,254` | 6-digit length check |
| Forgot/Reset password | `Auth.tsx:487-557` | email format, OTP length, password complexity |
| Users create/edit | `Users.tsx:491-580` | `lib/validation.ts` (name/email/contact/**password — no complexity check**), avatar ≤2MB client preview only |
| Roles create/edit | `Roles.tsx:485-566` | **none at all** — no HTML5 or JS validation |
| Projects create/edit | `Projects.tsx:658-780` | HTML5 `required` on Name/Description only; no length caps, no start≤end check |
| Tasks create/edit | `Tasks.tsx:2279-2400` | HTML5 `required` Title/Description; custom: EstimatedHours>0, ≥1 checklist item on create |
| TemplateForm | `TemplateForm.tsx:477-495` | Name/StartDate required; per-item Title + DefaultAssigneeId required |
| Diary entry | `Diary.tsx:184-223` | date required + working-day check; per-row description/hours/category required |
| Settings — change password | `Settings.tsx:71-106` | required fields, length≥6, confirm-match (no complexity reuse) |
| Chat message | `MessageInput.tsx` | no text length cap; client-side file type/size allow-list (20MB) |

`ClientApp/src/lib/validation.ts` is the only shared frontend validation module, and it's used by
just two pages (`Auth.tsx`, `Users.tsx`) — every other form validates inline, ad hoc, or not at
all (Roles.tsx).

---

## 3. Matching backend validation implemented

All new validators live in a new `Validators/` folder, one file per domain area (mirrors
`Controllers/`), registered globally via DI and enforced by a new `Filters/ValidationFilter.cs`.

| File | Validators | DTOs covered |
|---|---|---|
| `Validators/ValidationConstants.cs` | — | Shared regex/enums/limits (email, password complexity, contact digits, valid statuses/priorities/reason tags/block categories/recurrence types/chat types) |
| `Validators/ValidatorExtensions.cs` | `RequiredText`, `OptionalText`, `MustBeOneOf`, `MustBeOneOfOrEmpty`, `MustBeValidContactNumber`, `MustBeValidHours`, `MustBeOnOrAfter` | Reusable rule-builder extensions used by every validator below |
| `Validators/AuthValidators.cs` | `LoginDtoValidator`, `RegisterDtoValidator`, `InitiateRegisterDtoValidator`, `ConfirmOtpDtoValidator`, `ForgotPasswordDtoValidator`, `ResetPasswordDtoValidator`, `RefreshTokenRequestDtoValidator` | 7 DTOs, previously **0** validated |
| `Validators/UserValidators.cs` | `CreateUserDtoValidator`, `UpdateUserDtoValidator`, `SetUserActiveDtoValidator` | Adds password complexity + whitespace-only rejection on top of existing DataAnnotations |
| `Validators/RoleValidators.cs` | `RoleDtoValidator` | Previously **0** validated (frontend and backend) |
| `Validators/ProjectValidators.cs` | `ProjectDtoValidator`, `ReassignProjectDtoValidator` | Previously **0** backend validation |
| `Validators/TaskValidators.cs` | `CreateTaskDtoValidator`, `ChangeStatusDtoValidator`, `ReassignTaskDtoValidator`, `CreateTaskCommentDtoValidator`, `CreateChecklistItemDtoValidator`, `UpdateChecklistItemDtoValidator`, `ReorderChecklistItemDtoValidator`, `SetTaskBlockDtoValidator`, `ToggleConditionDtoValidator`, `SetReviewChecklistItemResultDtoValidator`, `AddBlockChecklistItemDtoValidator` | 11 validators across the task lifecycle |
| `Validators/WorkDiaryValidators.cs` | `CreateWorkDiaryDtoValidator`, `UpdateWorkDiaryDtoValidator` | Adds 24h/day cap (was unenforced server-side) |
| `Validators/TemplateValidators.cs` | `SaveTaskTemplateDtoValidator`, `SaveTemplateItemDtoValidator`, `ManualGenerateDtoValidator` | Adds recurrence cross-field rules, per-item EstimatedHours>0 + DefaultAssigneeId required |
| `Validators/ChatValidators.cs` | `SendMessageDtoValidator`, `CreateChatRoomDtoValidator` | Previously **0** validated; Content had no length cap at all |
| `Validators/FileValidationHelper.cs` | `ValidateFileAsync` | Shared by Chat + Task attachment uploads (see §5) |
| `Filters/ValidationFilter.cs` | `ValidationFilter` (global `IAsyncActionFilter`) | Trims input, merges ModelState + FluentValidation into one `ApiResponse<T>` 400 |

**Existing DataAnnotations were left in place everywhere** (defense-in-depth) — FluentValidation
adds what DataAnnotations can't express (whitespace-only rejection, "must be one of a known set",
cross-field/conditional rules, business rules), rather than replacing what already worked.

---

## 4. Missing backend validations added

- **Roles** — Name (2-100 chars, non-blank), Code (alnum/hyphen/underscore pattern), Level
  (1-100). Previously nothing.
- **Projects** — Name/Description required with length caps, Status must be one of
  `active`/`on-hold`/`completed`, OwnerId must be selected, **EndDate ≥ StartDate** (frontend
  never checked this either — a real business-rule gap, not just a parity gap).
- **Tasks** — Description now required (frontend requires it; DTO left it nullable), EstimatedHours
  now `NotNull()` (the existing `[Range(0.01,100000)]` only fires when a value is present — a
  request omitting the field entirely previously slipped through), Status/Priority membership
  checks, ParentTaskId/QaAssigneeId sanity, **QA reviewer required when `RequiresQA=true`**
  (cross-field rule with no frontend or backend equivalent before this).
- **Auth (all 7 DTOs)** — every field on Login/Register/InitiateRegister/ConfirmOtp/
  ForgotPassword/ResetPassword/RefreshToken. This was the single biggest gap: `AuthController` is
  `[AllowAnonymous]`, so these were the most exposed inputs in the app with zero framework-level
  validation.
- **Chat** — `SendMessageDto.Content` now capped at 5000 chars (previously unlimited — a message
  with no length cap could bloat the DB and every connected client's render); a message must
  carry content or an attachment; `CreateChatRoomDto.Name` required for non-direct rooms.
- **WorkDiary** — `HoursSpent` now capped at 24/entry server-side (frontend already enforced this
  via `MAX_HOURS_PER_ENTRY`; backend had no equivalent).
- **Templates** — recurrence cross-field rules (weekly needs a day-of-week, monthly needs a
  day-of-month, custom needs an interval — documented in CLAUDE.md but previously unenforced
  anywhere), per-item EstimatedHours>0, DefaultAssigneeId required per item (frontend enforces
  this in `validateStep2`; backend didn't).

---

## 5. Validation mismatches resolved

1. **Password complexity** — `Auth.tsx`'s register/reset flows enforced
   `PASSWORD_STRENGTH_REGEX` (upper+lower+digit); `lib/validation.ts`'s `validatePassword()` —
   used by the **admin** Users.tsx create/edit form — only checked length ≥6. An admin could set
   a weak password for another user that a self-registering user couldn't set for themselves.
   **Fixed on both sides**: `lib/validation.ts` now exports and enforces
   `PASSWORD_STRENGTH_REGEX` too (`Auth.tsx` now imports it instead of keeping its own copy —
   duplication removed), and every backend password-setting validator enforces the same pattern.
2. **Task attachment upload lacked the magic-byte check chat attachments had** — see §6.
3. **Two divergent 400 response shapes** — DataAnnotations failures produced the framework's
   `ValidationProblemDetails`; manual checks inside controllers/services produced
   `ApiResponse<T>{ Message }`. `ValidationFilter` now owns the response shape for *all*
   validation failures (DataAnnotations included, via reading `ModelState` itself before the
   framework's own auto-400 — which is now suppressed — would have run), so callers always get
   one `ApiResponse<T>` shape with a populated `Errors: string[]` list of `"Field: message"`
   entries.

---

## 6. Security improvements

- **Task attachment magic-byte verification** (`Services/TaskService.cs` `UploadAttachmentAsync`)
  — previously validated only size and extension, so a renamed executable (`virus.exe` →
  `virus.pdf`) with an allowed extension would pass. Now delegates to the same
  `FileValidationHelper.ValidateFileAsync` chat attachments already used, which reads the file's
  first bytes and compares them against the expected signature for the claimed extension.
- **Auth surface hardening** — `AuthController` is the one `[AllowAnonymous]` controller in the
  app; its 7 DTOs going from zero validation to fully validated (including OTP format —
  exactly 6 digits, digits-only — and password complexity on every password-setting path) closes
  the largest unauthenticated attack surface in the codebase.
- **Input trimming centralized** — `ValidationFilter` trims every writable `string` property on
  every action argument before validation/business logic runs (skipping any property whose name
  contains "Password", since trimming a password could silently change what the user intended).
  This is applied globally rather than per-DTO, so new DTOs get it automatically.
- **Consistent 400 on malformed JSON / wrong types** — model-binding failures (bad JSON, a string
  where a number was expected, etc.) already populate `ModelState` before any action runs;
  `ValidationFilter` now surfaces those through the same `ApiResponse<T>` shape instead of the
  framework's default problem-details response, so a malformed request can't reach business logic
  at all and the client always gets a predictable shape to parse.
- **Sanitization — deliberately NOT added.** React escapes rendered content by default and no
  code path in this app renders raw HTML from these fields (`dangerouslySetInnerHTML` was not
  found in scope for these forms), so stripping/encoding input server-side would only risk
  silently corrupting legitimate content (e.g. a comment that happens to contain `<3`) without a
  concrete XSS vector it closes. Documented here as a conscious decision, not an oversight.

---

## 7. Business-rule validations added

- Project **EndDate ≥ StartDate**.
- Task **QA reviewer required whenever `RequiresQA = true`** (cross-field).
- **Moving a task to `blocked` requires ≥1 block item**, each with a valid category (from the
  existing `BlockCategories.Valid` set) and non-blank description — mirrors the rule already
  documented in CLAUDE.md/enforced deep in `TaskService.ChangeStatusAsync`, now also caught at
  the DTO boundary before that code runs, for both `ChangeStatusDto` and `SetTaskBlockDto`.
  **Deliberately not duplicated**: the full per-edge "which transitions require ActualHours"
  matrix (`AllowedEdges`/`HOURS_EXEMPT_EDGES`) stays solely in `TaskService.cs` — replicating it
  in a validator would create two sources of truth that could drift; only a basic
  "ActualHours, if supplied, must be > 0" sanity check was added at the validator layer.
- Template **recurrence cross-field rules**: weekly requires a day-of-week, monthly requires a
  day-of-month (or a `DaysOfMonth` list), custom requires an interval.
- Chat message **must carry text or an attachment** — a message with neither is meaningless but
  was previously accepted.

---

## 8. Shared validation components created

- `Validators/ValidationConstants.cs` — every regex/enum/limit used by more than one validator,
  each annotated with which frontend rule it mirrors.
- `Validators/ValidatorExtensions.cs` — `RequiredText`/`OptionalText`/`MustBeOneOf`/
  `MustBeOneOfOrEmpty`/`MustBeValidContactNumber`/`MustBeValidHours`/`MustBeOnOrAfter` — seven
  reusable rule-builder extensions, used 40+ times across the validator files instead of being
  re-implemented per property.
- `Validators/FileValidationHelper.cs` — the size/extension/magic-byte check, now used by both
  `ChatService` and `TaskService` (previously duplicated between them, and only one had the
  magic-byte check).
- `Filters/ValidationFilter.cs` — one filter, registered once, that is now the sole place
  responsible for turning *any* validation failure (DataAnnotations or FluentValidation) into the
  app's `ApiResponse<T>` shape.

---

## 9. Files modified

**Backend:**
- `PMS_Final_Backup.csproj` — added `FluentValidation` + `FluentValidation.DependencyInjectionExtensions` (11.9.2, net6.0-compatible).
- `Program.cs` — registered `ValidationFilter` globally, suppressed the framework's automatic ModelState 400, registered all validators via `AddValidatorsFromAssemblyContaining<LoginDtoValidator>()`.
- `Services/TaskService.cs` — `UploadAttachmentAsync` now delegates to `FileValidationHelper`.
- `Services/ChatService.cs` — `ValidateFileAsync` now delegates to `FileValidationHelper` (removed its own duplicated magic-byte dictionary).
- **New**: `Validators/ValidationConstants.cs`, `Validators/ValidatorExtensions.cs`, `Validators/FileValidationHelper.cs`, `Validators/AuthValidators.cs`, `Validators/UserValidators.cs`, `Validators/RoleValidators.cs`, `Validators/ProjectValidators.cs`, `Validators/TaskValidators.cs`, `Validators/WorkDiaryValidators.cs`, `Validators/TemplateValidators.cs`, `Validators/ChatValidators.cs`, `Filters/ValidationFilter.cs`.

**Frontend:**
- `ClientApp/src/lib/validation.ts` — `validatePassword()` now enforces complexity; exports `PASSWORD_STRENGTH_REGEX`.
- `ClientApp/src/pages/Auth.tsx` — imports the shared `PASSWORD_STRENGTH_REGEX` instead of keeping its own copy.

---

## 10. Endpoints affected

Every endpoint whose action binds one of the DTOs listed in §3 now runs through
`ValidationFilter` — in practice this is **every `[HttpPost]`/`[HttpPut]` action in
`AuthController`, `UsersController`, `RolesController`, `ProjectsController`, `TasksController`,
`WorkDiaryController`, `TaskTemplatesController`, and `ChatController`**. Read-only (`GET`)
endpoints are unaffected (nothing to validate). Endpoints whose DTO has no registered validator
and no DataAnnotations (e.g. `SetUserActiveDto`'s bare bool, `ToggleChecklistItemDto`,
`ResolveIssueEntryDto`) pass through unchanged — there was nothing meaningful to add there.

---

## 11. Remaining validation gaps

Reported honestly rather than silently left out:

1. **"≥1 checklist item required on task creation" is not enforced by `CreateTaskDtoValidator`.**
   `CreateTaskDto` is reused for both Create and Update on the same DTO type with no
   action-aware RuleSet split; the DTO's own comment says this rule is "ignored on updates," so
   adding it to the shared validator would incorrectly block every task update. Closing this
   properly needs either a separate `UpdateTaskDto` or a FluentValidation `RuleSet` selected
   per-action in `ValidationFilter` — a small infrastructure change, deliberately not made in
   this pass to avoid breaking the Update endpoint.
2. **`ReassignTaskDto.ReasonTag` validates against the full `ReasonTags.Valid` set, not the
   narrower `BLOCK_REASON_TAGS` subset the frontend uses when reassigning a *blocked* task**
   (`Tasks.tsx` conditionally offers a 5-tag subset in that case). The full-set check is safe
   (never rejects a value the frontend could legitimately send) but doesn't reject an
   out-of-context tag on a blocked-task reassignment; enforcing the narrower subset would require
   the validator to know the target task's `IsBlocked` state, which means either a DB lookup
   inside the validator (an architectural choice worth a separate discussion) or moving the check
   into the service layer where the task is already loaded.
3. **No unit tests were written for the new validators.** They're structured for easy testing
   (each is a standalone `AbstractValidator<T>` with no constructor dependencies), but adding
   `FluentValidation.TestHelper` and actual test cases to `PMS.Tests/` was out of scope for this
   pass.
4. **Existing manual validation inside `AuthController`/`UserService` (e.g. uniqueness checks,
   the inline length checks noted in the original audit) was left in place** — it's now
   redundant with the new validators for the checks that overlap (e.g. password length), but
   removing it wasn't attempted here to avoid touching business logic beyond what pure validation
   required. Worth a follow-up cleanup pass.
5. **Project "attachments" UI is non-functional** (`FileUploader.tsx` used by `Projects.tsx` is a
   client-only base64 stub with no backend endpoint or DTO field) — this is a missing *feature*,
   not a validation gap, but is flagged here since it surfaced during the audit and nothing in
   this pass touches it.
6. **Rate limiting / request-size limits beyond file uploads** were not audited — `LoginRateLimitMiddleware`
   already exists for login specifically, but general payload-size limits on non-file endpoints
   weren't reviewed as part of this validation-focused pass.

---

## 12. Severity and rationale

| Issue | Severity | Rationale |
|---|---|---|
| Auth DTOs (7) had zero backend validation | **High** | `AuthController` is unauthenticated (`[AllowAnonymous]`) — the most exposed surface in the app; a malformed/malicious request could reach `AuthService`/DB with no server-side gate beyond ad hoc inline checks. |
| Roles / Projects had zero backend validation | **High** | Admin-facing but still directly reachable via API regardless of frontend; Projects additionally had no start≤end date check on either side — a real data-integrity gap, not just a parity gap. |
| Task attachment upload missing magic-byte check | **High** | A file-type-spoofing vector (renamed executable) that the *sibling* chat-upload endpoint already correctly blocked — an inconsistency an attacker could specifically target once they'd learned the chat endpoint was hardened. |
| `CreateTaskDto.EstimatedHours` nullable bypass of `[Range]` | **Medium** | `[Range]` doesn't enforce presence on a nullable property — a request could omit the field entirely and skip a rule the frontend treats as mandatory; not exploitable for privilege escalation, but breaks a stated business invariant ("every task must have an estimate"). |
| Password-complexity mismatch (Users.tsx vs Auth.tsx) | **Medium** | Not a security hole on its own (still ≥6 chars), but an inconsistency that let admin-created accounts be weaker than self-registered ones, and meant backend enforcement had two different bars to match depending on which frontend flow was baseline. |
| Chat message content unlimited length | **Medium** | Not exploitable for RCE/injection (React escapes render output), but an unbounded string persisted to the DB and broadcast to every connected room member is a realistic DoS/storage-bloat vector via SignalR. |
| Two divergent 400 response shapes | **Low-Medium** | Not a security issue, but a real correctness/maintainability problem — frontend error handling can't reliably parse validation failures without knowing which of two shapes it's looking at; now unified. |
| Missing cross-field rules (QA reviewer, recurrence, blocked-task items) | **Low-Medium** | Business-logic correctness rather than security — a request could previously create a data state (e.g. `RequiresQA=true` with no reviewer) the UI never allows but the API silently accepted. |
| Sanitization not added | **N/A — deliberate** | See §6; adding it without a concrete XSS vector to close would be net-negative (risk of corrupting legitimate input) for a React app that already escapes render output. |
| Aadhaar/PAN/GSTIN/IFSC/etc. not implemented | **N/A — out of scope** | Confirmed via repo-wide grep: no such fields exist anywhere in this codebase. Building validators for non-existent fields would be dead code. |

---

## Verification

- `dotnet build` — **0 errors**, only pre-existing/unrelated warnings.
- `npx tsc --noEmit` (frontend) — clean.
- Manual verification still needed (not run as part of this pass): hit each affected endpoint
  with a deliberately invalid payload (empty Role name, Project with EndDate before StartDate,
  Task with no EstimatedHours, weak admin-created password, oversized chat message, a renamed
  `.exe` as a task attachment) and confirm each now returns `400` with a populated
  `ApiResponse<T>.Errors` list instead of either succeeding or throwing an unhandled exception.
  The backend needs a restart to pick up all of the above (same as every other backend change
  this session) — not yet restarted as of this report.
