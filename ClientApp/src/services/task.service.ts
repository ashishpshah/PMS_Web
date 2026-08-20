import { apiRequest, apiRequestWithMeta, getAccessToken } from '../lib/api';
import { getApiUrl } from '../config/dataSource';
import { Task, Attachment, TaskComment, ChecklistItem, TaskAssignmentHistory, TaskBlockEntry, ReasonTag, LinkedTaskRef, Status, TaskStatusHistory, TaskEffort, DashboardEffort, DashboardStats, TaskConditionHistory, TaskIssueEntry, TaskReviewIssue, BlockChecklistItem, AddBlockItem, ReviewChecklistItem } from '../types';

interface ApiChecklistItemDto {
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

interface ApiTaskAssignmentHistoryDto {
  id: number;
  taskId: number;
  previousAssigneeId?: number;
  previousAssigneeName?: string;
  newAssigneeId?: number;
  newAssigneeName?: string;
  changedById: number;
  changedByName: string;
  changedAt: string;
  reasonTag: string;
}

interface ApiCommentDto {
  id: number;
  taskId: number;
  userId: number;
  userName: string;
  avatarUrl?: string;
  text: string;
  timestamp: string;
}

interface ApiConditionHistoryDto {
  id: number;
  conditionName: string;
  newValue: boolean;
  notes?: string;
  changedAt: string;
  changedById: number;
  changedByName?: string;
}

interface ApiIssueEntryDto {
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

interface ApiBlockEntryDto {
  id: number;
  taskId: number;
  blockedById: number;
  blockedByName: string;
  reason: string;
  isActive: boolean;
  blockedAt: string;
  resolvedAt?: string;
}

interface ApiReviewChecklistItemDto {
  id: number;
  taskId: number;
  title: string;
  description?: string;
  sequence: number;
  isRequired: boolean;
  status: string;
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

interface ApiBlockChecklistItemDto {
  id: number;
  taskId: number;
  category: string;
  description: string;
  comment?: string;
  expectedResolution?: string;
  status: string;
  resolvedAt?: string;
  resolvedById?: number;
  resolvedByName?: string;
  createdById: number;
  createdByName?: string;
  createdAt: string;
  updatedAt?: string;
}

interface ApiLinkedTaskDto {
  id: number;
  code?: string;
  title: string;
  status: string;
  assignedToId?: number;
  assignedToName?: string;
}

interface ApiAttachmentDto {
  id: number;
  taskId: number;
  fileName: string;
  fileType: string;
  fileSize: number;
  uploadedById: number;
  uploadedByName?: string;
  uploadedAt: string;
}

interface ApiTaskDto {
  id: number;
  code?: string;
  projectCode?: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  projectId: number;
  projectName?: string;
  assignedToId?: number;
  assignedToName?: string;
  assignedToAvatarUrl?: string;
  dueDate?: string;
  progress: number;
  estimatedHours?: number;
  actualHours?: number;
  module?: string;
  isBlocked: boolean;
  tags: string[];
  commentCount: number;
  comments?: ApiCommentDto[];
  checklistItems?: ApiChecklistItemDto[];
  assignmentHistory?: ApiTaskAssignmentHistoryDto[];
  blockEntries?: ApiBlockEntryDto[];
  createdAt: string;
  updatedAt?: string;
  startedAt?: string;
  startedById?: number;
  startedByName?: string;
  parentTaskId?: number;
  parentTaskTitle?: string;
  requiresQA?: boolean;
  qaAssigneeId?: number;
  qaAssigneeName?: string;
  childTasks?: ApiLinkedTaskDto[];
  childTaskCount?: number;
  hasIssues?: boolean;
  isPaused?: boolean;
  isOverdue?: boolean;
  pauseReason?: string;
  conditionHistory?: ApiConditionHistoryDto[];
  issueEntries?: ApiIssueEntryDto[];
  reviewIssues?: ApiIssueEntryDto[];
  reviewChecklistItems?: ApiReviewChecklistItemDto[];
  blockChecklistItems?: ApiBlockChecklistItemDto[];
  attachments?: ApiAttachmentDto[];
}

interface ApiStatusHistoryDto {
  id: number;
  taskId: number;
  fromStatus: string;
  toStatus: string;
  changedById: number;
  changedByName?: string;
  reason?: string;
  actualHours?: number;
  changedAt: string;
}

interface ApiTaskEffortDto {
  totalElapsedSeconds: number;
  productiveSeconds: number;
  pausedSeconds: number;
  blockedSeconds: number;
  underReviewSeconds: number;
  otherSeconds: number;
  isRunning: boolean;
  byStatus: { status: string; seconds: number; isProductive: boolean }[];
  byUser: {
    userId: number; userName: string; productiveSeconds: number; pausedSeconds: number;
    assignedAt?: string; firstStartedAt?: string; completedAt?: string;
  }[];
  timeline: { status: string; startAt: string; endAt: string; seconds: number; isProductive: boolean }[];
}

export interface TaskFilters {
  status?: string;
  priority?: string;
  projectId?: number;
  assigneeId?: number;
  search?: string;
}

export interface PagedTasks {
  tasks: Task[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const normalizeStatus = (s?: string): Status =>
  (s || '').toLowerCase().replace(/\s+/g, '-') as Status;

const mapChecklistItem = (dto: ApiChecklistItemDto): ChecklistItem => ({
  id: dto.id,
  taskId: dto.taskId,
  title: dto.title,
  isCompleted: dto.isCompleted,
  completedAt: dto.completedAt,
  completedById: dto.completedById,
  completedByName: dto.completedByName,
  orderIndex: dto.orderIndex,
  createdAt: dto.createdAt,
});

const mapApiTask = (dto: ApiTaskDto): Task => ({
  id: dto.id,
  code: dto.code,
  projectCode: dto.projectCode,
  title: dto.title,
  description: dto.description || '',
  status: normalizeStatus(dto.status),
  priority: dto.priority?.toLowerCase() as Task['priority'],
  projectId: dto.projectId,
  assigneeId: dto.assignedToId || 0,
  dueDate: dto.dueDate ? dto.dueDate.split('T')[0] : null,
  progress: dto.progress || 0,
  estimatedHours: dto.estimatedHours ?? undefined,
  actualHours: dto.actualHours ?? undefined,
  module: dto.module,
  tags: dto.tags || [],
  comments: (dto.comments || []).map(c => ({
    id: c.id,
    userId: c.userId,
    userName: c.userName,
    avatarUrl: c.avatarUrl,
    text: c.text,
    timestamp: c.timestamp,
  } as TaskComment)),
  isBlocked: dto.isBlocked ?? false,
  checklistItems: (dto.checklistItems || []).map(mapChecklistItem),
  assignmentHistory: (dto.assignmentHistory || []).map(h => ({
    id: h.id,
    taskId: h.taskId,
    previousAssigneeId: h.previousAssigneeId,
    previousAssigneeName: h.previousAssigneeName,
    newAssigneeId: h.newAssigneeId,
    newAssigneeName: h.newAssigneeName,
    changedById: h.changedById,
    changedByName: h.changedByName,
    changedAt: h.changedAt,
    reasonTag: h.reasonTag as ReasonTag,
  } as TaskAssignmentHistory)),
  blockEntries: (dto.blockEntries || []).map(b => ({
    id: b.id,
    taskId: b.taskId,
    blockedById: b.blockedById,
    blockedByName: b.blockedByName,
    reason: b.reason,
    isActive: b.isActive,
    blockedAt: b.blockedAt,
    resolvedAt: b.resolvedAt,
  } as TaskBlockEntry)),
  createdAt: dto.createdAt,
  updatedAt: dto.updatedAt,
  startedAt: dto.startedAt,
  startedById: dto.startedById,
  startedByName: dto.startedByName,
  parentTaskId: dto.parentTaskId,
  parentTaskTitle: dto.parentTaskTitle,
  requiresQA: dto.requiresQA ?? false,
  qaAssigneeId: dto.qaAssigneeId,
  qaAssigneeName: dto.qaAssigneeName,
  childTasks: (dto.childTasks || []).map(c => ({
    id: c.id,
    code: c.code,
    title: c.title,
    status: normalizeStatus(c.status),
    assignedToId: c.assignedToId,
    assignedToName: c.assignedToName,
  } as LinkedTaskRef)),
  childTaskCount: dto.childTaskCount ?? 0,
  hasIssues: dto.hasIssues ?? false,
  isPaused: dto.isPaused ?? false,
  isOverdue: dto.isOverdue ?? false,
  pauseReason: dto.pauseReason,
  conditionHistory: (dto.conditionHistory || []).map(h => ({
    id: h.id,
    conditionName: h.conditionName as 'HasIssues' | 'IsPaused',
    newValue: h.newValue,
    notes: h.notes,
    changedAt: h.changedAt,
    changedById: h.changedById,
    changedByName: h.changedByName,
  } as TaskConditionHistory)),
  issueEntries: (dto.issueEntries || []).map(e => ({
    id: e.id,
    taskId: e.taskId,
    description: e.description,
    isResolved: e.isResolved,
    createdAt: e.createdAt,
    createdById: e.createdById,
    createdByName: e.createdByName,
    resolvedAt: e.resolvedAt,
    resolvedById: e.resolvedById,
    resolvedByName: e.resolvedByName,
  } as TaskIssueEntry)),
  reviewIssues: (dto.reviewIssues || []).map(e => ({
    id: e.id,
    taskId: e.taskId,
    description: e.description,
    isResolved: e.isResolved,
    createdAt: e.createdAt,
    createdById: e.createdById,
    createdByName: e.createdByName,
    resolvedAt: e.resolvedAt,
    resolvedById: e.resolvedById,
    resolvedByName: e.resolvedByName,
  } as TaskReviewIssue)),
  reviewChecklistItems: (dto.reviewChecklistItems || []).map(r => ({
    id: r.id,
    taskId: r.taskId,
    title: r.title,
    description: r.description,
    sequence: r.sequence,
    isRequired: r.isRequired,
    status: r.status as 'pending' | 'passed' | 'failed' | 'na',
    reviewerComment: r.reviewerComment,
    reviewedAt: r.reviewedAt,
    reviewedById: r.reviewedById,
    reviewedByName: r.reviewedByName,
    developerResolutionComment: r.developerResolutionComment,
    developerResolutionAt: r.developerResolutionAt,
    createdById: r.createdById,
    createdByName: r.createdByName,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  } as ReviewChecklistItem)),
  blockChecklistItems: (dto.blockChecklistItems || []).map(b => ({
    id: b.id,
    taskId: b.taskId,
    category: b.category,
    description: b.description,
    comment: b.comment,
    expectedResolution: b.expectedResolution,
    status: b.status as 'active' | 'resolved' | 'removed',
    resolvedAt: b.resolvedAt,
    resolvedById: b.resolvedById,
    resolvedByName: b.resolvedByName,
    createdById: b.createdById,
    createdByName: b.createdByName,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
  } as BlockChecklistItem)),
  attachments: (dto.attachments || []).map(mapApiAttachment),
});

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const mapApiAttachment = (a: ApiAttachmentDto): Attachment => ({
  id:             a.id,
  taskId:         a.taskId,
  name:           a.fileName,
  url:            `${getApiUrl()}/tasks/attachments/download/${a.id}`,
  type:           a.fileType === 'image' ? 'image' : 'document',
  size:           formatFileSize(a.fileSize),
  uploadedById:   a.uploadedById,
  uploadedByName: a.uploadedByName,
  uploadedAt:     a.uploadedAt,
});

export const taskService = {
  async getAll(filters?: TaskFilters, page = 1, pageSize = 100): Promise<PagedTasks> {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (filters?.status)    params.set('status',    filters.status);
    if (filters?.priority)  params.set('priority',  filters.priority);
    if (filters?.projectId) params.set('projectId', String(filters.projectId));
    if (filters?.assigneeId) params.set('assigneeId', String(filters.assigneeId));
    if (filters?.search)    params.set('search',    filters.search);
    const { data, meta } = await apiRequestWithMeta<ApiTaskDto[]>(`/tasks?${params}`);
    return {
      tasks:      (data || []).map(mapApiTask),
      totalCount: meta.totalCount,
      page:       meta.page,
      pageSize:   meta.pageSize,
      totalPages: meta.totalPages,
    };
  },

  async getById(id: number): Promise<Task> {
    const dto = await apiRequest<ApiTaskDto>(`/tasks/${id}`);
    return mapApiTask(dto);
  },

  async create(task: Task, checklistTitles?: string[]): Promise<Task> {
    const dto = await apiRequest<ApiTaskDto>('/tasks', {
      method: 'POST',
      body: JSON.stringify({
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        projectId: task.projectId,
        assignedToId: task.assigneeId || null,
        dueDate: task.dueDate || null,
        module: task.module,
        tags: task.tags || [],
        parentTaskId: task.parentTaskId ?? null,
        requiresQA: task.requiresQA ?? false,
        qaAssigneeId: task.qaAssigneeId ?? null,
        estimatedHours: task.estimatedHours ?? null,
        actualHours: task.actualHours ?? null,
        checklistItems: checklistTitles ?? [],
      }),
    });
    return mapApiTask(dto);
  },

  async update(task: Task): Promise<Task> {
    const dto = await apiRequest<ApiTaskDto>(`/tasks/${task.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        projectId: task.projectId,
        assignedToId: task.assigneeId || null,
        dueDate: task.dueDate || null,
        module: task.module,
        tags: task.tags || [],
        parentTaskId: task.parentTaskId ?? null,
        requiresQA: task.requiresQA ?? false,
        qaAssigneeId: task.qaAssigneeId ?? null,
        estimatedHours: task.estimatedHours ?? null,
        actualHours: task.actualHours ?? null,
      }),
    });
    return mapApiTask(dto);
  },

  async start(taskId: number): Promise<Task> {
    const dto = await apiRequest<ApiTaskDto>(`/tasks/${taskId}/start`, {
      method: 'POST',
    });
    return mapApiTask(dto);
  },

  async changeStatus(taskId: number, toStatus: Status, reason?: string, actualHours?: number, blockItems?: AddBlockItem[]): Promise<Task> {
    const dto = await apiRequest<ApiTaskDto>(`/tasks/${taskId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ toStatus, reason, actualHours, blockItems }),
    });
    return mapApiTask(dto);
  },

  // ── Review Issues (reviewer-facing) ──
  async addReviewIssue(taskId: number, description: string): Promise<Task> {
    const dto = await apiRequest<ApiTaskDto>(`/tasks/${taskId}/review-issues`, {
      method: 'POST',
      body: JSON.stringify({ description }),
    });
    return mapApiTask(dto);
  },

  async resolveReviewIssue(taskId: number, issueId: number, isResolved: boolean): Promise<Task> {
    const dto = await apiRequest<ApiTaskDto>(`/tasks/${taskId}/review-issues/${issueId}`, {
      method: 'PUT',
      body: JSON.stringify({ isResolved }),
    });
    return mapApiTask(dto);
  },

  async deleteReviewIssue(taskId: number, issueId: number): Promise<Task> {
    const dto = await apiRequest<ApiTaskDto>(`/tasks/${taskId}/review-issues/${issueId}`, {
      method: 'DELETE',
    });
    return mapApiTask(dto);
  },

  async completeReview(taskId: number): Promise<Task> {
    const dto = await apiRequest<ApiTaskDto>(`/tasks/${taskId}/review/complete`, { method: 'POST' });
    return mapApiTask(dto);
  },

  async toggleCondition(taskId: number, conditionName: 'HasIssues' | 'IsPaused', value: boolean, reason?: string): Promise<Task> {
    const dto = await apiRequest<ApiTaskDto>(`/tasks/${taskId}/condition`, {
      method: 'PUT',
      body: JSON.stringify({ conditionName, value, reason }),
    });
    return mapApiTask(dto);
  },

  async addIssueEntry(taskId: number, description: string): Promise<Task> {
    const dto = await apiRequest<ApiTaskDto>(`/tasks/${taskId}/issues`, {
      method: 'POST',
      body: JSON.stringify({ description }),
    });
    return mapApiTask(dto);
  },

  async resolveIssueEntry(taskId: number, entryId: number, isResolved: boolean): Promise<Task> {
    const dto = await apiRequest<ApiTaskDto>(`/tasks/${taskId}/issues/${entryId}`, {
      method: 'PUT',
      body: JSON.stringify({ isResolved }),
    });
    return mapApiTask(dto);
  },

  async deleteIssueEntry(taskId: number, entryId: number): Promise<Task> {
    const dto = await apiRequest<ApiTaskDto>(`/tasks/${taskId}/issues/${entryId}`, {
      method: 'DELETE',
    });
    return mapApiTask(dto);
  },

  async getStatusHistory(taskId: number): Promise<TaskStatusHistory[]> {
    const dtos = await apiRequest<ApiStatusHistoryDto[]>(`/tasks/${taskId}/status-history`);
    return dtos.map(h => ({
      id: h.id,
      taskId: h.taskId,
      fromStatus: normalizeStatus(h.fromStatus),
      toStatus: normalizeStatus(h.toStatus),
      changedById: h.changedById,
      changedByName: h.changedByName,
      reason: h.reason,
      actualHours: h.actualHours,
      changedAt: h.changedAt,
    }));
  },

  async getEffort(taskId: number): Promise<TaskEffort> {
    const dto = await apiRequest<ApiTaskEffortDto>(`/tasks/${taskId}/effort`);
    return {
      totalElapsedSeconds: dto.totalElapsedSeconds,
      productiveSeconds: dto.productiveSeconds,
      pausedSeconds: dto.pausedSeconds,
      blockedSeconds: dto.blockedSeconds,
      underReviewSeconds: dto.underReviewSeconds,
      otherSeconds: dto.otherSeconds,
      isRunning: dto.isRunning,
      byStatus: (dto.byStatus || []).map(s => ({
        status: normalizeStatus(s.status),
        seconds: s.seconds,
        isProductive: s.isProductive,
      })),
      byUser: (dto.byUser || []).map(u => ({
        userId: u.userId,
        userName: u.userName,
        productiveSeconds: u.productiveSeconds,
        pausedSeconds: u.pausedSeconds,
        assignedAt: u.assignedAt,
        firstStartedAt: u.firstStartedAt,
        completedAt: u.completedAt,
      })),
      timeline: (dto.timeline || []).map(t => ({
        status: normalizeStatus(t.status),
        startAt: t.startAt,
        endAt: t.endAt,
        seconds: t.seconds,
        isProductive: t.isProductive,
      })),
    };
  },

  async getDashboardStats(): Promise<DashboardStats> {
    return apiRequest<DashboardStats>('/tasks/dashboard-stats');
  },

  async getEffortStats(fromIso?: string, toIso?: string): Promise<DashboardEffort> {
    const qs = new URLSearchParams();
    if (fromIso) qs.set('from', fromIso);
    if (toIso) qs.set('to', toIso);
    const q = qs.toString();
    return apiRequest<DashboardEffort>(`/tasks/effort-stats${q ? `?${q}` : ''}`);
  },

  async delete(id: number): Promise<void> {
    return apiRequest<void>(`/tasks/${id}`, {
      method: 'DELETE',
    });
  },

  async addComment(taskId: number, text: string): Promise<ApiCommentDto> {
    return apiRequest<ApiCommentDto>(`/tasks/${taskId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
  },

  async getComments(taskId: number, filters?: { userId?: number; from?: string; to?: string }): Promise<TaskComment[]> {
    const params = new URLSearchParams();
    if (filters?.userId) params.set('userId', String(filters.userId));
    if (filters?.from) params.set('from', filters.from);
    if (filters?.to) params.set('to', filters.to);
    const qs = params.toString() ? `?${params}` : '';
    const dtos = await apiRequest<ApiCommentDto[]>(`/tasks/${taskId}/comments${qs}`);
    return dtos.map(c => ({
      id: c.id,
      userId: c.userId,
      userName: c.userName,
      avatarUrl: c.avatarUrl,
      text: c.text,
      timestamp: c.timestamp,
    }));
  },

  async reassign(taskId: number, newAssigneeId: number | null, reasonTag: string): Promise<Task> {
    const dto = await apiRequest<ApiTaskDto>(`/tasks/${taskId}/reassign`, {
      method: 'PUT',
      body: JSON.stringify({ newAssigneeId, reasonTag }),
    });
    return mapApiTask(dto);
  },

  async addChecklistItem(taskId: number, title: string, orderIndex: number): Promise<ChecklistItem> {
    const dto = await apiRequest<ApiChecklistItemDto>(`/tasks/${taskId}/checklist`, {
      method: 'POST',
      body: JSON.stringify({ title, orderIndex }),
    });
    return mapChecklistItem(dto);
  },

  async toggleChecklistItem(taskId: number, itemId: number, isCompleted: boolean): Promise<ChecklistItem> {
    const dto = await apiRequest<ApiChecklistItemDto>(`/tasks/${taskId}/checklist/${itemId}/toggle`, {
      method: 'PUT',
      body: JSON.stringify({ isCompleted }),
    });
    return mapChecklistItem(dto);
  },

  async updateChecklistItem(taskId: number, itemId: number, title: string, orderIndex: number): Promise<ChecklistItem> {
    const dto = await apiRequest<ApiChecklistItemDto>(`/tasks/${taskId}/checklist/${itemId}`, {
      method: 'PUT',
      body: JSON.stringify({ title, orderIndex }),
    });
    return mapChecklistItem(dto);
  },

  async deleteChecklistItem(taskId: number, itemId: number): Promise<void> {
    return apiRequest<void>(`/tasks/${taskId}/checklist/${itemId}`, {
      method: 'DELETE',
    });
  },

  async markAllChecklistComplete(taskId: number): Promise<void> {
    return apiRequest<void>(`/tasks/${taskId}/checklist/mark-all-complete`, {
      method: 'POST',
    });
  },

  async setBlock(taskId: number, isBlocked: boolean, blockItems?: AddBlockItem[], reason?: string): Promise<Task> {
    const dto = await apiRequest<ApiTaskDto>(`/tasks/${taskId}/block`, {
      method: 'PUT',
      body: JSON.stringify({ isBlocked, blockItems, reason }),
    });
    return mapApiTask(dto);
  },

  async resolveBlockItem(taskId: number, itemId: number, comment?: string): Promise<BlockChecklistItem> {
    return apiRequest<BlockChecklistItem>(`/tasks/${taskId}/block-checklist/${itemId}/resolve`, {
      method: 'PUT',
      body: JSON.stringify({ resolvedComment: comment }),
    });
  },

  async removeBlockItem(taskId: number, itemId: number): Promise<void> {
    return apiRequest<void>(`/tasks/${taskId}/block-checklist/${itemId}`, { method: 'DELETE' });
  },

  async getReviewChecklist(taskId: number): Promise<ReviewChecklistItem[]> {
    const items = await apiRequest<ApiReviewChecklistItemDto[]>(`/tasks/${taskId}/review-checklist`);
    return (items || []).map(r => ({
      id: r.id, taskId: r.taskId, title: r.title, description: r.description,
      sequence: r.sequence, isRequired: r.isRequired,
      status: r.status as 'pending' | 'passed' | 'failed' | 'na',
      reviewerComment: r.reviewerComment, reviewedAt: r.reviewedAt,
      reviewedById: r.reviewedById, reviewedByName: r.reviewedByName,
      developerResolutionComment: r.developerResolutionComment,
      developerResolutionAt: r.developerResolutionAt,
      createdById: r.createdById, createdByName: r.createdByName,
      createdAt: r.createdAt, updatedAt: r.updatedAt,
    } as ReviewChecklistItem));
  },

  async addReviewChecklistItem(taskId: number, title: string, description?: string, isRequired = true): Promise<ReviewChecklistItem> {
    const dto = await apiRequest<ApiReviewChecklistItemDto>(`/tasks/${taskId}/review-checklist`, {
      method: 'POST',
      body: JSON.stringify({ title, description, isRequired }),
    });
    return { ...dto, status: dto.status as 'pending' | 'passed' | 'failed' | 'na' } as ReviewChecklistItem;
  },

  async updateReviewChecklistItem(taskId: number, itemId: number, title: string, description?: string, isRequired = true): Promise<ReviewChecklistItem> {
    const dto = await apiRequest<ApiReviewChecklistItemDto>(`/tasks/${taskId}/review-checklist/${itemId}`, {
      method: 'PUT',
      body: JSON.stringify({ title, description, isRequired }),
    });
    return { ...dto, status: dto.status as 'pending' | 'passed' | 'failed' | 'na' } as ReviewChecklistItem;
  },

  async deleteReviewChecklistItem(taskId: number, itemId: number): Promise<void> {
    return apiRequest<void>(`/tasks/${taskId}/review-checklist/${itemId}`, { method: 'DELETE' });
  },

  async setReviewChecklistItemResult(taskId: number, itemId: number, status: 'pending' | 'passed' | 'failed' | 'na', reviewerComment?: string): Promise<ReviewChecklistItem> {
    const dto = await apiRequest<ApiReviewChecklistItemDto>(`/tasks/${taskId}/review-checklist/${itemId}/result`, {
      method: 'PUT',
      body: JSON.stringify({ status, reviewerComment }),
    });
    return { ...dto, status: dto.status as 'pending' | 'passed' | 'failed' | 'na' } as ReviewChecklistItem;
  },

  async setReviewChecklistItemResolution(taskId: number, itemId: number, developerResolutionComment: string): Promise<ReviewChecklistItem> {
    const dto = await apiRequest<ApiReviewChecklistItemDto>(`/tasks/${taskId}/review-checklist/${itemId}/resolution`, {
      method: 'PUT',
      body: JSON.stringify({ developerResolutionComment }),
    });
    return { ...dto, status: dto.status as 'pending' | 'passed' | 'failed' | 'na' } as ReviewChecklistItem;
  },

  async getAssignmentHistory(taskId: number): Promise<TaskAssignmentHistory[]> {
    const dtos = await apiRequest<ApiTaskAssignmentHistoryDto[]>(`/tasks/${taskId}/assignment-history`);
    return dtos.map(h => ({
      id: h.id,
      taskId: h.taskId,
      previousAssigneeId: h.previousAssigneeId,
      previousAssigneeName: h.previousAssigneeName,
      newAssigneeId: h.newAssigneeId,
      newAssigneeName: h.newAssigneeId ? h.newAssigneeName : undefined,
      changedById: h.changedById,
      changedByName: h.changedByName,
      changedAt: h.changedAt,
      reasonTag: h.reasonTag as ReasonTag,
    }));
  },

  // ── Attachments ──────────────────────────────────────────────────────────────

  async uploadAttachment(taskId: number, file: File): Promise<Attachment> {
    // Cannot use apiRequest here — it forces Content-Type: application/json.
    // Send as multipart/form-data (browser sets the boundary automatically).
    const token = getAccessToken();
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${getApiUrl()}/tasks/${taskId}/attachments`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { message?: string }).message || `Upload failed (${res.status})`);
    }
    const json = await res.json();
    const dto: ApiAttachmentDto = (json?.data ?? json) as ApiAttachmentDto;
    return mapApiAttachment(dto);
  },

  async deleteAttachment(taskId: number, attachmentId: number): Promise<void> {
    await apiRequest<void>(`/tasks/${taskId}/attachments/${attachmentId}`, { method: 'DELETE' });
  },
};
