import { apiRequest } from '../lib/api';

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

  async getMyDiary(params?: { month?: number; year?: number; from?: string; to?: string }, silent = false): Promise<WorkDiaryEntry[]> {
    const p = new URLSearchParams();
    if (params?.from) { p.set('from', params.from); }
    else if (params?.month != null) p.set('month', String(params.month));
    if (params?.to)   { p.set('to',   params.to);   }
    else if (params?.year  != null) p.set('year',  String(params.year));
    const qs = p.toString();
    return apiRequest<WorkDiaryEntry[]>(`/workdiary${qs ? `?${qs}` : ''}`, {}, { silent });
  },

  async getAllDiary(params?: { userId?: number; month?: number; year?: number; from?: string; to?: string }, silent = false): Promise<WorkDiaryEntry[]> {
    const p = new URLSearchParams();
    if (params?.userId != null) p.set('userId', String(params.userId));
    if (params?.from) { p.set('from', params.from); }
    else if (params?.month != null) p.set('month', String(params.month));
    if (params?.to)   { p.set('to',   params.to);   }
    else if (params?.year  != null) p.set('year',  String(params.year));
    const qs = p.toString();
    return apiRequest<WorkDiaryEntry[]>(`/workdiary/all${qs ? `?${qs}` : ''}`, {}, { silent });
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
