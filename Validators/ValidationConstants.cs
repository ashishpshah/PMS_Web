namespace TaskManagement.Validators
{
    /// <summary>
    /// Centralized validation regex/limits shared across every validator in this folder.
    /// Each constant documents which frontend rule it mirrors (and where the two frontend
    /// copies of that rule had drifted) so backend/frontend stay in lockstep going forward.
    /// </summary>
    public static class ValidationConstants
    {
        // Mirrors ClientApp/src/lib/validation.ts EMAIL_REGEX.
        public const string EmailPattern = @"^[^\s@]+@[^\s@]+\.[^\s@]+$";

        // Mirrors ClientApp/src/pages/Auth.tsx PASSWORD_STRENGTH_REGEX (at least one lowercase,
        // one uppercase, one digit). NOTE: ClientApp/src/lib/validation.ts's validatePassword()
        // — used by the admin Users.tsx create/edit form — did NOT enforce this; only Auth.tsx's
        // register/reset flows did. Backend now enforces it everywhere a password is set,
        // closing that mismatch (see report "Validation mismatches resolved").
        public const string PasswordComplexityPattern = @"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)";

        // Mirrors ClientApp/src/lib/validation.ts CONTACT_ALLOWED — digits, +, -, (), spaces only.
        public const string ContactAllowedPattern = @"^[0-9+\-()\s]+$";

        public const int PasswordMinLength = 6;
        public const int NameMinLength = 2;
        public const int NameMaxLength = 100;
        public const int UserNameMaxLength = 50;
        public const int EmailMaxLength = 256;
        // Mirrors lib/validation.ts validateContact()'s normalized-digit-count check.
        public const int ContactMinDigits = 7;
        public const int ContactMaxDigits = 15;

        public const int OtpLength = 6;

        // Mirrors Services/TaskService.cs ValidStatuses (TaskService.cs:420-421).
        public static readonly string[] ValidTaskStatuses =
        {
            "new", "in-progress", "paused", "blocked", "under-review", "issues", "completed"
        };

        // Mirrors ClientApp/src/types/index.ts Priority type.
        public static readonly string[] ValidPriorities = { "low", "medium", "high", "critical" };

        // Mirrors ClientApp/src/types/index.ts ProjectStatus type.
        public static readonly string[] ValidProjectStatuses = { "active", "on-hold", "completed" };

        // Mirrors DTOs/GeneralDtos.cs ReasonTags.Valid.
        public static readonly string[] ValidReasonTags =
        {
            "Resignation", "Workload Balancing", "Management Decision", "Unavailability",
            "No Resource", "Unable to Complete", "Admin Decision", "Other"
        };

        // Mirrors DTOs/GeneralDtos.cs BlockCategories.Valid.
        public static readonly string[] ValidBlockCategories =
        {
            "Waiting for Client", "Waiting for Manager", "Waiting for Design",
            "Waiting for API", "Waiting for Backend", "Waiting for Frontend",
            "Waiting for Database", "Waiting for Third-party Service",
            "Waiting for Approval", "Waiting for Infrastructure",
            "Waiting for Requirement Clarification", "Other"
        };

        public static readonly string[] ValidReviewChecklistStatuses = { "pending", "passed", "failed", "na" };

        // Mirrors Services/TaskTemplateService.cs recurrence types.
        public static readonly string[] ValidRecurrenceTypes = { "daily", "weekly", "monthly", "custom" };

        public static readonly string[] ValidChatMessageTypes = { "text", "file", "image" };
        public static readonly string[] ValidChatRoomTypes = { "public", "private", "direct" };

        public const int MaxEstimatedHours = 100000;
        public const decimal MinEstimatedHours = 0.01m;
        public const int MaxActualHours = 100000;

        public const int TextFieldDefaultMaxLength = 2000;
        public const int TitleMaxLength = 500;
        public const int ShortNameMaxLength = 200;
    }
}
