import { apiRequest, apiRequestWithMeta } from '../lib/api';

export interface PaginatedResponse<T> {
  data: T[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface WorkDiaryEntry {
  id: number;
  userId: number;
  userFullName?: string;
  userAvatarUrl?: string;
  date: string;
  description: string;
  category?: string;
  hoursSpent?: number;
  projectId?: number;
  projectName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWorkDiaryDto {
  date: string;
  description: string;
  category?: string;
  hoursSpent?: number;
  projectId?: number;
}

export interface UpdateWorkDiaryDto {
  description: string;
  category?: string;
  hoursSpent?: number;
  projectId?: number;
}

export interface DiaryProjectOption {
  id: number;
  code?: string;
  name: string;
}

export const diaryService = {
  async getCategories(): Promise<string[]> {
    return apiRequest<string[]>('/workdiary/categories');
  },

  // All projects, selectable by any user regardless of project access.
  async getProjects(): Promise<DiaryProjectOption[]> {
    return apiRequest<DiaryProjectOption[]>('/workdiary/projects');
  },

  async getMyDiary(params?: { month?: number; year?: number; from?: string; to?: string; page?: number; pageSize?: number }, silent = false): Promise<PaginatedResponse<WorkDiaryEntry>> {
    const p = new URLSearchParams();
    if (params?.page) p.set('page', String(params.page));
    else p.set('page', '1');
    if (params?.pageSize) p.set('pageSize', String(params.pageSize));
    else p.set('pageSize', '25');
    if (params?.from) { p.set('from', params.from); }
    else if (params?.month != null) p.set('month', String(params.month));
    if (params?.to)   { p.set('to',   params.to);   }
    else if (params?.year  != null) p.set('year',  String(params.year));
    const qs = p.toString();
    const result = await apiRequestWithMeta<WorkDiaryEntry[]>(`/workdiary${qs ? `?${qs}` : ''}`, {}, { silent });
    return {
      data: result.data,
      totalCount: result.meta.totalCount,
      page: result.meta.page,
      pageSize: result.meta.pageSize,
      totalPages: result.meta.totalPages,
    };
  },

  async getAllDiary(params?: { userId?: number; month?: number; year?: number; from?: string; to?: string; page?: number; pageSize?: number }, silent = false): Promise<PaginatedResponse<WorkDiaryEntry>> {
    const p = new URLSearchParams();
    if (params?.page) p.set('page', String(params.page));
    else p.set('page', '1');
    if (params?.pageSize) p.set('pageSize', String(params.pageSize));
    else p.set('pageSize', '25');
    if (params?.userId != null) p.set('userId', String(params.userId));
    if (params?.from) { p.set('from', params.from); }
    else if (params?.month != null) p.set('month', String(params.month));
    if (params?.to)   { p.set('to',   params.to);   }
    else if (params?.year  != null) p.set('year',  String(params.year));
    const qs = p.toString();
    const result = await apiRequestWithMeta<WorkDiaryEntry[]>(`/workdiary/all${qs ? `?${qs}` : ''}`, {}, { silent });
    return {
      data: result.data,
      totalCount: result.meta.totalCount,
      page: result.meta.page,
      pageSize: result.meta.pageSize,
      totalPages: result.meta.totalPages,
    };
  },

  async add(dto: CreateWorkDiaryDto): Promise<WorkDiaryEntry> {
    return apiRequest<WorkDiaryEntry>('/workdiary', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  async update(id: number, dto: UpdateWorkDiaryDto): Promise<WorkDiaryEntry> {
    return apiRequest<WorkDiaryEntry>(`/workdiary/${id}`, {
      method: 'PUT',
      body: JSON.stringify(dto),
    });
  },

  async remove(id: number): Promise<void> {
    return apiRequest<void>(`/workdiary/${id}`, { method: 'DELETE' });
  },
};
