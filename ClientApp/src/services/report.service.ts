import { apiRequest } from '../lib/api';
import { UserEffortReport, UserEffortReportItem, UserTransitionReport, UserTransitionReportItem, TransitionCount, Status, UserTaskEffortReport, UserTaskEffortItem, UserDailyEffortReport, DailyEffortItem, HoursSummary, HoursSummaryUserRow, HoursSummaryTaskRow, HoursSummaryProjectRow, DailyUtilizationItem, UserDailyUtilizationReport } from '../types';

interface ApiUserEffortReportItemDto {
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

interface ApiUserEffortReportDto {
  fromUtc?: string;
  toUtc?: string;
  users: ApiUserEffortReportItemDto[];
}

interface ApiTransitionCountDto {
  fromStatus: string;
  toStatus: string;
  count: number;
}

interface ApiUserTransitionReportItemDto {
  userId: number;
  userName: string;
  avatarUrl?: string;
  totalTransitions: number;
  mostCommonTransition: string;
  breakdown: ApiTransitionCountDto[];
}

interface ApiUserTransitionReportDto {
  fromUtc?: string;
  toUtc?: string;
  users: ApiUserTransitionReportItemDto[];
}

function mapEffortItem(dto: ApiUserEffortReportItemDto): UserEffortReportItem {
  return {
    userId: dto.userId,
    userName: dto.userName,
    avatarUrl: dto.avatarUrl,
    taskCount: dto.taskCount,
    productiveSeconds: dto.productiveSeconds,
    pausedSeconds: dto.pausedSeconds,
    blockedSeconds: dto.blockedSeconds,
    underReviewSeconds: dto.underReviewSeconds,
    totalElapsedSeconds: dto.totalElapsedSeconds,
  };
}

function mapTransitionItem(dto: ApiUserTransitionReportItemDto): UserTransitionReportItem {
  return {
    userId: dto.userId,
    userName: dto.userName,
    avatarUrl: dto.avatarUrl,
    totalTransitions: dto.totalTransitions,
    mostCommonTransition: dto.mostCommonTransition,
    breakdown: (dto.breakdown || []).map(t => ({
      fromStatus: t.fromStatus as Status,
      toStatus: t.toStatus as Status,
      count: t.count,
    } satisfies TransitionCount)),
  };
}

interface ApiUserTaskEffortItemDto {
  taskId: number;
  taskCode: string;
  taskTitle: string;
  taskStatus: string;
  productiveSeconds: number;
  pausedSeconds: number;
  blockedSeconds: number;
  underReviewSeconds: number;
  totalElapsedSeconds: number;
}

interface ApiUserTaskEffortReportDto {
  userId: number;
  userName: string;
  avatarUrl?: string;
  fromUtc?: string;
  toUtc?: string;
  tasks: ApiUserTaskEffortItemDto[];
}

function mapTaskEffortItem(dto: ApiUserTaskEffortItemDto): UserTaskEffortItem {
  return {
    taskId: dto.taskId,
    taskCode: dto.taskCode,
    taskTitle: dto.taskTitle,
    taskStatus: dto.taskStatus as Status,
    productiveSeconds: dto.productiveSeconds,
    pausedSeconds: dto.pausedSeconds,
    blockedSeconds: dto.blockedSeconds,
    underReviewSeconds: dto.underReviewSeconds,
    totalElapsedSeconds: dto.totalElapsedSeconds,
  };
}

function buildQs(fromIso?: string, toIso?: string): string {
  const qs = new URLSearchParams();
  if (fromIso) qs.set('from', fromIso);
  if (toIso) qs.set('to', toIso);
  const s = qs.toString();
  return s ? `?${s}` : '';
}

const toArray = <T,>(v: unknown): T[] => Array.isArray(v) ? (v as T[]) : [];

export const reportService = {
  async getUserEffortReport(fromIso?: string, toIso?: string): Promise<UserEffortReport> {
    const dto = await apiRequest<ApiUserEffortReportDto>(`/reports/user-effort${buildQs(fromIso, toIso)}`);
    return {
      fromUtc: dto.fromUtc,
      toUtc: dto.toUtc,
      users: toArray<ApiUserEffortReportItemDto>(dto.users).map(mapEffortItem),
    };
  },

  async getUserTransitionReport(fromIso?: string, toIso?: string): Promise<UserTransitionReport> {
    const dto = await apiRequest<ApiUserTransitionReportDto>(`/reports/user-transitions${buildQs(fromIso, toIso)}`);
    return {
      fromUtc: dto.fromUtc,
      toUtc: dto.toUtc,
      users: toArray<ApiUserTransitionReportItemDto>(dto.users).map(mapTransitionItem),
    };
  },

  async getUserDailyEffort(userId: number, fromIso?: string, toIso?: string): Promise<UserDailyEffortReport> {
    const qs = new URLSearchParams({ userId: String(userId) });
    if (fromIso) qs.set('from', fromIso);
    if (toIso) qs.set('to', toIso);
    const dto = await apiRequest<{ userId: number; userName: string; avatarUrl?: string; fromUtc?: string; toUtc?: string; days: DailyEffortItem[] }>(`/reports/user-daily-effort?${qs.toString()}`);
    return {
      userId: dto.userId,
      userName: dto.userName,
      avatarUrl: dto.avatarUrl,
      fromUtc: dto.fromUtc,
      toUtc: dto.toUtc,
      days: toArray<DailyEffortItem>(dto.days).map(d => ({
        date: d.date,
        productiveSeconds: d.productiveSeconds,
        pausedSeconds: d.pausedSeconds,
        blockedSeconds: d.blockedSeconds,
        underReviewSeconds: d.underReviewSeconds,
        totalElapsedSeconds: d.totalElapsedSeconds,
        taskCount: d.taskCount,
      } satisfies DailyEffortItem)),
    };
  },

  async getHoursSummary(fromIso?: string, toIso?: string, userId?: number, projectId?: number): Promise<HoursSummary> {
    const qs = new URLSearchParams();
    if (fromIso) qs.set('from', fromIso);
    if (toIso) qs.set('to', toIso);
    if (userId != null) qs.set('userId', String(userId));
    if (projectId != null) qs.set('projectId', String(projectId));
    const q = qs.toString();
    const dto = await apiRequest<{
      fromUtc?: string; toUtc?: string;
      totalProductiveSeconds: number; totalWorkingSeconds: number;
      filterUserId?: number; filterProjectId?: number;
      byUser: Array<{ userId: number; userName: string; avatarUrl?: string; productiveSeconds: number; pausedSeconds: number; blockedSeconds: number; underReviewSeconds: number; totalSeconds: number; taskCount: number; estimatedHours: number; workingHoursSpent: number }>;
      byTask: Array<{ taskId: number; taskCode: string; taskTitle: string; taskStatus: string; projectId: number; projectName: string; productiveSeconds: number; pausedSeconds: number; blockedSeconds: number; underReviewSeconds: number; totalSeconds: number }>;
      byProject: Array<{ projectId: number; projectName: string; productiveSeconds: number; pausedSeconds: number; blockedSeconds: number; underReviewSeconds: number; totalSeconds: number; taskCount: number; userCount: number }>;
    }>(`/reports/hours-summary${q ? `?${q}` : ''}`);
    return {
      fromUtc: dto.fromUtc, toUtc: dto.toUtc,
      totalProductiveSeconds: dto.totalProductiveSeconds,
      totalWorkingSeconds: dto.totalWorkingSeconds,
      filterUserId: dto.filterUserId,
      filterProjectId: dto.filterProjectId,
      byUser: toArray<HoursSummaryUserRow>(dto.byUser).map(u => ({ ...u })),
      byTask: toArray<HoursSummaryTaskRow>(dto.byTask).map(t => ({ ...t, taskStatus: t.taskStatus as Status })),
      byProject: toArray<HoursSummaryProjectRow>(dto.byProject).map(p => ({ ...p })),
    };
  },

  async getUserTaskEffort(userId: number, fromIso?: string, toIso?: string): Promise<UserTaskEffortReport> {
    const qs = new URLSearchParams({ userId: String(userId) });
    if (fromIso) qs.set('from', fromIso);
    if (toIso) qs.set('to', toIso);
    const dto = await apiRequest<ApiUserTaskEffortReportDto>(`/reports/user-task-effort?${qs.toString()}`);
    return {
      userId: dto.userId,
      userName: dto.userName,
      avatarUrl: dto.avatarUrl,
      fromUtc: dto.fromUtc,
      toUtc: dto.toUtc,
      tasks: toArray(dto.tasks).map(mapTaskEffortItem),
    };
  },

  async getDailyUtilization(userId: number, month: number, year: number): Promise<UserDailyUtilizationReport> {
    const qs = new URLSearchParams({
      userId: String(userId),
      month: String(month),
      year: String(year),
    });
    return apiRequest<UserDailyUtilizationReport>(`/reports/daily-utilization?${qs.toString()}`);
  },
};
