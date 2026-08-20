export type Priority = 'low' | 'medium' | 'high' | 'critical';
export type Status =
  | 'new'
  | 'in-progress'
  | 'paused'
  | 'blocked'
  | 'under-review'
  | 'issues'
  | 'completed';

export const TASK_STATUSES: Status[] = [
  'new', 'in-progress', 'paused', 'blocked', 'under-review', 'issues', 'completed',
];

export const STATUS_LABELS: Record<Status, string> = {
  'new':          'New',
  'in-progress':  'In Progress',
  'paused':       'Paused',
  'blocked':      'Blocked',
  'under-review': 'Under Review',
  'issues':       'Issues',
  'completed':    'Completed',
};

// Badge variant per status (matches Badge.tsx variants)
export const STATUS_BADGE_VARIANT: Record<Status, 'default' | 'success' | 'warning' | 'danger' | 'info'> = {
  'new':          'default',
  'in-progress':  'info',
  'paused':       'warning',
  'blocked':      'danger',
  'under-review': 'warning',
  'issues':       'danger',
  'completed':    'success',
};
export type ProjectStatus = 'active' | 'on-hold' | 'completed';

export const PROJECT_STATUSES: ProjectStatus[] = ['active', 'on-hold', 'completed'];

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  'active':    'Active',
  'on-hold':   'On Hold',
  'completed': 'Completed',
};

// Badge variant per project status (matches Badge.tsx variants)
export const PROJECT_STATUS_BADGE_VARIANT: Record<ProjectStatus, 'default' | 'success' | 'warning' | 'danger' | 'info'> = {
  'active':    'success',
  'on-hold':   'warning',
  'completed': 'info',
};

export type ReasonTag =
  | 'Resignation'
  | 'Workload Balancing'
  | 'Management Decision'
  | 'Unavailability'
  | 'No Resource'
  | 'Unable to Complete'
  | 'Admin Decision'
  | 'Other';

export const REASON_TAGS: ReasonTag[] = [
  'Resignation',
  'Workload Balancing',
  'Management Decision',
  'Unavailability',
  'No Resource',
  'Unable to Complete',
  'Admin Decision',
  'Other',
];

// Tags that apply specifically when reassigning a blocked task
export const BLOCK_REASON_TAGS: ReasonTag[] = [
  'No Resource',
  'Unable to Complete',
  'Admin Decision',
  'Workload Balancing',
  'Other',
];

export interface ProjectPermission {
  projectId: number;
  access: 'view' | 'edit' | 'manage';
}

export interface User {
  id: number;
  name: string;            // canonical display name (backend FullName = first + last)
  firstName?: string;
  lastName?: string;
  username?: string;
  email: string;
  avatar?: string;
  contactNo?: string;
  role: string;
  roleId?: number;
  isAdmin?: boolean;
  isActive?: boolean;
  isDeleted?: boolean;
  isImpersonated?: boolean;
  impersonatedByName?: string;
  permissions?: ProjectPermission[];
  preferences?: {
    emailNotifications: boolean;
    reminderThresholdDays: number;
  };
}

export interface Attachment {
  id: number;
  name: string;
  url: string;
  type: 'image' | 'document';
  size: string;
  // Server-persisted fields (absent for local/link-only attachments)
  taskId?: number;
  uploadedById?: number;
  uploadedByName?: string;
  uploadedAt?: string;
}

export interface ProjectMember {
  userId: number;
  fullName: string;
  email?: string;
  avatarUrl?: string;
  roleInProject?: string;
}

export interface ProjectAssignmentHistory {
  id: number;
  projectId: number;
  previousOwnerId: number;
  previousOwnerName?: string;
  newOwnerId: number;
  newOwnerName?: string;
  changedById: number;
  changedByName: string;
  changedAt: string;
  reasonTag: ReasonTag;
}

export interface Project {
  id: number;
  code?: string;
  name: string;
  description: string;
  status: ProjectStatus;
  progress: number;
  startDate: string;
  endDate: string;
  ownerId: number;
  ownerName?: string;
  createdById?: number;
  createdAt?: string;
  createdByName?: string;
  memberIds?: number[];
  members?: ProjectMember[];
  modules?: string[];
  attachments?: Attachment[];
  assignmentHistory?: ProjectAssignmentHistory[];
}

export interface TaskComment {
  id: number;
  userId: number;
  userName: string;
  avatarUrl?: string;
  text: string;
  timestamp: string;
}

export interface ChecklistItem {
  id: number;
  taskId: number;
  title: string;
  isCompleted: boolean;
  completedAt?: string;
  completedById?: number;
  completedByName?: string;
  orderIndex: number;
  createdAt: string;
}

export interface TaskAssignmentHistory {
  id: number;
  taskId: number;
  previousAssigneeId?: number;
  previousAssigneeName?: string;
  newAssigneeId?: number;
  newAssigneeName?: string;
  changedById: number;
  changedByName: string;
  changedAt: string;
  reasonTag: ReasonTag;
}

export interface TaskBlockEntry {
  id: number;
  taskId: number;
  blockedById: number;
  blockedByName: string;
  reason: string;
  isActive: boolean;
  blockedAt: string;
  resolvedAt?: string;
}

export interface LinkedTaskRef {
  id: number;
  code?: string;
  title: string;
  status: Status;
  assignedToId?: number;
  assignedToName?: string;
}

export interface ReviewChecklistItem {
  id: number;
  taskId: number;
  title: string;
  description?: string;
  sequence: number;
  isRequired: boolean;
  status: 'pending' | 'passed' | 'failed' | 'na';
  reviewerComment?: string;
  reviewedAt?: string;
  reviewedById?: number;
  reviewedByName?: string;
  developerResolutionComment?: string;
  developerResolutionAt?: string;
  createdById: number;
  createdByName?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface Task {
  id: number;
  code?: string;
  projectCode?: string;
  projectId: number;
  title: string;
  description: string;
  status: Status;
  priority: Priority;
  dueDate: string | null;
  assigneeId: number;
  createdById?: number;
  createdByName?: string;
  createdAt: string;
  updatedAt?: string;
  attachments?: Attachment[];
  estimatedHours?: number;
  actualHours?: number;
  progress?: number;
  tags?: string[];
  module?: string;
  comments?: TaskComment[];
  checklistItems?: ChecklistItem[];
  assignmentHistory?: TaskAssignmentHistory[];
  isBlocked?: boolean;
  blockEntries?: TaskBlockEntry[];
  startedAt?: string;
  startedById?: number;
  startedByName?: string;
  parentTaskId?: number;
  parentTaskTitle?: string;
  requiresQA?: boolean;
  qaAssigneeId?: number;
  qaAssigneeName?: string;
  childTasks?: LinkedTaskRef[];
  childTaskCount?: number;
  hasIssues?: boolean;
  isPaused?: boolean;
  isOverdue?: boolean;
  pauseReason?: string;
  conditionHistory?: TaskConditionHistory[];
  issueEntries?: TaskIssueEntry[];
  reviewIssues?: TaskReviewIssue[];
  reviewChecklistItems?: ReviewChecklistItem[];
  blockChecklistItems?: BlockChecklistItem[];
}

export interface TaskConditionHistory {
  id: number;
  conditionName: 'HasIssues' | 'IsPaused';
  newValue: boolean;
  notes?: string;
  changedAt: string;
  changedById: number;
  changedByName?: string;
}

export interface TaskIssueEntry {
  id: number;
  taskId: number;
  description: string;
  isResolved: boolean;
  createdAt: string;
  createdById: number;
  createdByName?: string;
  resolvedAt?: string;
  resolvedById?: number;
  resolvedByName?: string;
}

export interface TaskStatusHistory {
  id: number;
  taskId: number;
  fromStatus: Status;
  toStatus: Status;
  action?: string;
  changedById: number;
  changedByName?: string;
  reason?: string;
  actualHours?: number;
  changedAt: string;
}

// ── Effort time tracking (derived from status + assignment history) ──────────
export interface StatusDuration {
  status: Status;
  seconds: number;
  isProductive: boolean;
}

export interface UserEffort {
  userId: number;
  userName: string;
  productiveSeconds: number;
  pausedSeconds: number;
  assignedAt?: string;
  firstStartedAt?: string;
  completedAt?: string;
}

export interface EffortTimelineSegment {
  status: Status;
  startAt: string;
  endAt: string;
  seconds: number;
  isProductive: boolean;
}

export interface TaskEffort {
  totalElapsedSeconds: number;
  productiveSeconds: number;
  pausedSeconds: number;
  blockedSeconds: number;
  underReviewSeconds: number;
  otherSeconds: number;
  isRunning: boolean;
  byStatus: StatusDuration[];
  byUser: UserEffort[];
  timeline: EffortTimelineSegment[];
}

export interface TopUserEffort {
  userId: number;
  userName: string;
  avatarUrl?: string;
  productiveSeconds: number;
  pausedSeconds: number;
}

export interface MatrixRow {
  id: number;
  name: string;
  countsByStatus: Record<string, number>;
  total: number;
}

export interface ProjectStatusMatrix {
  axis: 'project' | 'assignee';
  rows: MatrixRow[];
}

export interface OverdueTaskRow {
  id: number;
  code?: string;
  title: string;
  status: string;
  dueDate: string;
  daysOverdue: number;
  assignedToId?: number;
  assignedToName?: string;
}

export interface StalledProjectRow {
  id: number;
  code?: string;
  name: string;
  daysSinceActivity: number;
  ownerId: number;
  ownerName?: string;
}

export interface AtRiskData {
  overdueTasks: OverdueTaskRow[];
  stalledProjects: StalledProjectRow[];
}

export interface DashboardStats {
  filterUserId?: number;
  fromUtc?: string;
  toUtc?: string;
  totalProjects: number;
  totalTasks: number;
  activeUsers: number;
  completedTasks: number;
  tasksByStatus: { status: string; count: number }[];
  devChecklist: { total: number; completed: number; remaining: number };
  reviewChecklist: { pending: number; passed: number; failed: number };
  blockers: { active: number; resolved: number };
  issues: { open: number; resolved: number };
}

export interface DashboardEffort {
  fromUtc?: string;
  toUtc?: string;
  totalActiveUsers: number;
  productiveSeconds: number;
  pausedSeconds: number;
  workingSeconds: number;
  usersCurrentlyWorking: number;
  usersInPauseReview: number;
  topProductiveUsers: TopUserEffort[];
}

export interface Activity {
  id: number;
  userId: number;
  userName: string;
  action: string;
  targetType: 'project' | 'task';
  targetId: number;
  targetName: string;
  timestamp: string;
}

export type NotificationType = 'reminder' | 'update' | 'system';

export interface Notification {
  id: number;
  userId: number;
  title: string;
  message: string;
  type: NotificationType;
  read: boolean;
  timestamp: string;
  link?: string;
}

// ── Chat Types ──────────────────────────────────────────────

export interface ChatAttachmentData {
  id: number;
  fileName: string;
  fileType: string; // "image" | "video" | "document"
  fileSize: number;
  mimeType: string;
  url: string;
}

export interface ChatMessage {
  id: number;
  content?: string;
  senderId: number;
  senderName: string;
  senderAvatar?: string;
  sentAt: string;
  messageType: 'text' | 'file';
  attachment?: ChatAttachmentData;
  replyTo?: ChatMessage;
  roomId?: number | null;
}

export interface OnlineUser {
  userId: number;
  userName: string;
  avatarUrl?: string;
  connectedAt: string;
}

export interface ChatRoomMember {
  userId: number;
  userName: string;
  avatarUrl?: string;
}

export interface ChatRoom {
  id: number;
  name: string;
  roomType: 'public' | 'private' | 'direct';
  createdById: number;
  createdAt: string;
  members: ChatRoomMember[];
  lastMessage?: ChatMessage | null;
  unreadCount: number;
}

// ── Reports: user-wise effort breakdown ───────────────────────────────────────
export interface UserEffortReportItem {
  userId: number;
  userName: string;
  avatarUrl?: string;
  taskCount: number;
  productiveSeconds: number;
  pausedSeconds: number;
  blockedSeconds: number;
  underReviewSeconds: number;
  totalElapsedSeconds: number;
}

export interface UserEffortReport {
  fromUtc?: string;
  toUtc?: string;
  users: UserEffortReportItem[];
}

// ── Reports: user-wise status transition summary ──────────────────────────────
export interface TransitionCount {
  fromStatus: Status;
  toStatus: Status;
  count: number;
}

export interface UserTransitionReportItem {
  userId: number;
  userName: string;
  avatarUrl?: string;
  totalTransitions: number;
  mostCommonTransition: string;
  breakdown: TransitionCount[];
}

export interface UserTransitionReport {
  fromUtc?: string;
  toUtc?: string;
  users: UserTransitionReportItem[];
}

// ── Reports: per-task effort for a single user ────────────────────────────────
export interface UserTaskEffortItem {
  taskId: number;
  taskCode: string;
  taskTitle: string;
  taskStatus: Status;
  productiveSeconds: number;
  pausedSeconds: number;
  blockedSeconds: number;
  underReviewSeconds: number;
  totalElapsedSeconds: number;
}

export interface UserTaskEffortReport {
  userId: number;
  userName: string;
  avatarUrl?: string;
  fromUtc?: string;
  toUtc?: string;
  tasks: UserTaskEffortItem[];
}

// ── Reports: per-day effort for a single user ─────────────────────────────────
export interface DailyEffortItem {
  date: string;               // ISO date string, time = 00:00
  productiveSeconds: number;
  pausedSeconds: number;
  blockedSeconds: number;
  underReviewSeconds: number;
  totalElapsedSeconds: number;
  taskCount: number;
}

export interface UserDailyEffortReport {
  userId: number;
  userName: string;
  avatarUrl?: string;
  fromUtc?: string;
  toUtc?: string;
  days: DailyEffortItem[];
}

// ── Reports: hours summary (user / task / project breakdown) ──────────────────
export interface HoursSummaryUserRow {
  userId: number;
  userName: string;
  avatarUrl?: string;
  productiveSeconds: number;
  pausedSeconds: number;
  blockedSeconds: number;
  underReviewSeconds: number;
  totalSeconds: number;
  taskCount: number;
}

export interface HoursSummaryTaskRow {
  taskId: number;
  taskCode: string;
  taskTitle: string;
  taskStatus: Status;
  projectId: number;
  projectName: string;
  productiveSeconds: number;
  pausedSeconds: number;
  blockedSeconds: number;
  underReviewSeconds: number;
  totalSeconds: number;
}

export interface HoursSummaryProjectRow {
  projectId: number;
  projectName: string;
  productiveSeconds: number;
  pausedSeconds: number;
  blockedSeconds: number;
  underReviewSeconds: number;
  totalSeconds: number;
  taskCount: number;
  userCount: number;
}

export interface HoursSummary {
  fromUtc?: string;
  toUtc?: string;
  totalProductiveSeconds: number;
  totalWorkingSeconds: number;
  filterUserId?: number;
  filterProjectId?: number;
  byUser: HoursSummaryUserRow[];
  byTask: HoursSummaryTaskRow[];
  byProject: HoursSummaryProjectRow[];
}

export interface DailyUtilizationItem {
  date: string;
  dayName: string;
  diaryHours: number;
  taskHours: number;
  totalHours: number;
  targetHours: number;
  isWorkingDay: boolean;
  isComplete: boolean;
}

export interface UserDailyUtilizationReport {
  userId: number;
  userName: string;
  avatarUrl?: string;
  month: number;
  year: number;
  days: DailyUtilizationItem[];
  totalWorkingDays: number;
  daysComplete: number;
  daysPartial: number;
  totalHoursLogged: number;
}

// ── Task Template module ───────────────────────────────────────────────────────

export type RecurrenceType = 'daily' | 'weekly' | 'monthly' | 'custom';

export interface TaskTemplateItem {
  id: number;
  position: number;
  title: string;
  description?: string;
  estimatedHours: number;
  priority: Priority;
  defaultAssigneeId?: number;
  defaultAssigneeName?: string;
  qaReviewerId?: number;
  qaReviewerName?: string;
  dueDateOffsetDays: number;
  tags: string[];
  checklistItems: string[];
  dependsOnPositions: number[];
  reviewCriteria: string[];
}

export interface GeneratedTaskLink {
  taskId: number;
  taskTitle: string;
  assigneeName: string;
  templateItemTitle: string;
}

export interface TaskTemplateGeneration {
  id: number;
  periodKey: string;
  generatedAt: string;
  generatedByName?: string;
  taskCount: number;
  notes?: string;
  tasks: GeneratedTaskLink[];
}

export interface TaskTemplate {
  id: number;
  name: string;
  description?: string;
  projectId?: number;
  projectName?: string;
  module?: string;
  recurrenceType: RecurrenceType;
  dayOfWeek?: number;
  dayOfMonth?: number;
  daysOfMonth?: number[];
  skipDaysOfWeek?: number[];
  skipDates?: string[];
  skipDaysOfMonth?: number[];
  customIntervalDays?: number;
  triggerTime?: string;
  startDate: string;
  endDate?: string;
  isActive: boolean;
  createdByName: string;
  createdAt: string;
  generationCount: number;
  lastGeneratedAt?: string;
  nextRunAt?: string;
  itemCount: number;
  assigneeIds: number[];
  assigneeNames: string[];
  items: TaskTemplateItem[];
}

export const BLOCK_CATEGORIES = [
  'Waiting for Client',
  'Waiting for Manager',
  'Waiting for Design',
  'Waiting for API',
  'Waiting for Backend',
  'Waiting for Frontend',
  'Waiting for Database',
  'Waiting for Third-party Service',
  'Waiting for Approval',
  'Waiting for Infrastructure',
  'Waiting for Requirement Clarification',
  'Other',
] as const;
export type BlockCategory = typeof BLOCK_CATEGORIES[number];

export interface AddBlockItem {
  category: string;
  description: string;
  comment?: string;
  expectedResolution?: string;
}

export interface BlockChecklistItem {
  id: number;
  taskId: number;
  category: string;
  description: string;
  comment?: string;
  expectedResolution?: string;
  status: 'active' | 'resolved' | 'removed';
  resolvedAt?: string;
  resolvedById?: number;
  resolvedByName?: string;
  createdById: number;
  createdByName?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface TaskReviewIssue {
  id: number;
  taskId: number;
  description: string;
  isResolved: boolean;
  createdAt: string;
  createdById: number;
  createdByName?: string;
  resolvedAt?: string;
  resolvedById?: number;
  resolvedByName?: string;
}
