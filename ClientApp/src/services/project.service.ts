import { apiRequest, apiRequestWithMeta } from '../lib/api';
import { Project, ProjectMember, ProjectAssignmentHistory, ReasonTag } from '../types';

export interface PaginatedResponse<T> {
  data: T[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface ApiProjectAssignmentHistoryDto {
  id: number;
  projectId: number;
  previousOwnerId: number;
  previousOwnerName?: string;
  newOwnerId: number;
  newOwnerName?: string;
  changedById: number;
  changedByName: string;
  changedAt: string;
  reasonTag: string;
}

interface ApiProjectMemberDto {
  userId: number;
  fullName: string;
  avatarUrl?: string;
  roleInProject?: string;
}

interface ApiProjectDto {
  id: number;
  code?: string;
  name: string;
  description?: string;
  status: string;
  startDate?: string;
  endDate?: string;
  ownerId: number;
  ownerName?: string;
  createdById: number;
  createdByName?: string;
  memberCount: number;
  memberIds?: number[];
  members?: ApiProjectMemberDto[];
  taskCount: number;
  progress: number;
  createdAt: string;
  assignmentHistory?: ApiProjectAssignmentHistoryDto[];
  modules?: string[];
}

const mapApiProject = (dto: ApiProjectDto): Project => ({
  id: dto.id,
  code: dto.code,
  name: dto.name,
  description: dto.description || '',
  status: dto.status?.toLowerCase() as Project['status'],
  progress: dto.progress || 0,
  startDate: dto.startDate ? dto.startDate.split('T')[0] : '',
  endDate: dto.endDate ? dto.endDate.split('T')[0] : '',
  ownerId: dto.ownerId,
  ownerName: dto.ownerName,
  createdById: dto.createdById,
  createdAt: dto.createdAt,
  createdByName: dto.createdByName,
  memberIds: dto.memberIds ?? [],
  modules: dto.modules ?? [],
  members: (dto.members || []).map(m => ({
    userId: m.userId,
    fullName: m.fullName,
    avatarUrl: m.avatarUrl,
    roleInProject: m.roleInProject,
  } as ProjectMember)),
  assignmentHistory: (dto.assignmentHistory || []).map(h => ({
    id: h.id,
    projectId: h.projectId,
    previousOwnerId: h.previousOwnerId,
    previousOwnerName: h.previousOwnerName,
    newOwnerId: h.newOwnerId,
    newOwnerName: h.newOwnerName,
    changedById: h.changedById,
    changedByName: h.changedByName,
    changedAt: h.changedAt,
    reasonTag: h.reasonTag as ReasonTag,
  } as ProjectAssignmentHistory)),
});

const mapProjectToApi = (project: Project) => ({
  id: project.id,
  name: project.name,
  description: project.description,
  status: project.status,
  startDate: project.startDate || null,
  endDate: project.endDate || null,
  ownerId: project.ownerId,
  modules: project.modules ?? [],
});

export interface PaginatedResponse<T> {
  data: T[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export const projectService = {
  async getAll(page = 1, pageSize = 25, search?: string, status?: string, ownerId?: number, progressFrom?: number, progressTo?: number, sortField?: string, sortDir?: string): Promise<PaginatedResponse<Project>> {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (search) params.set('search', search);
    if (status) params.set('status', status);
    if (ownerId) params.set('ownerId', String(ownerId));
    if (progressFrom !== undefined) params.set('progressFrom', String(progressFrom));
    if (progressTo !== undefined) params.set('progressTo', String(progressTo));
    if (sortField) params.set('sortField', sortField);
    if (sortDir) params.set('sortDir', sortDir);
    
    const result = await apiRequestWithMeta<ApiProjectDto[]>(`/projects?${params.toString()}`);
    return {
      data: result.data.map(mapApiProject),
      totalCount: result.meta.totalCount,
      page: result.meta.page,
      pageSize: result.meta.pageSize,
      totalPages: result.meta.totalPages,
    };
  },

  // For dropdowns - uses search endpoint with pagination
  async search(page = 1, pageSize = 25, search?: string): Promise<PaginatedResponse<Project>> {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (search) params.set('q', search);
    
    const result = await apiRequestWithMeta<ApiProjectDto[]>(`/projects/search?${params.toString()}`);
    return {
      data: result.data.map(mapApiProject),
      totalCount: result.meta.totalCount,
      page: result.meta.page,
      pageSize: result.meta.pageSize,
      totalPages: result.meta.totalPages,
    };
  },

  async getById(id: number): Promise<Project> {
    const dto = await apiRequest<ApiProjectDto>(`/projects/${id}`);
    return mapApiProject(dto);
  },

  async create(project: Project): Promise<Project> {
    const dto = await apiRequest<ApiProjectDto>('/projects', {
      method: 'POST',
      body: JSON.stringify(mapProjectToApi(project)),
    });
    return mapApiProject(dto);
  },

  async update(project: Project): Promise<Project> {
    const dto = await apiRequest<ApiProjectDto>(`/projects/${project.id}`, {
      method: 'PUT',
      body: JSON.stringify(mapProjectToApi(project)),
    });
    return mapApiProject(dto);
  },

  async checkNameAvailable(name: string, excludeProjectId?: number): Promise<boolean> {
    const qs = new URLSearchParams({ name });
    if (excludeProjectId != null) qs.set('excludeProjectId', String(excludeProjectId));
    const res = await apiRequest<{ available: boolean }>(`/projects/check-name?${qs.toString()}`);
    return res.available;
  },

  async delete(id: number): Promise<void> {
    return apiRequest<void>(`/projects/${id}`, {
      method: 'DELETE',
    });
  },

  async reassign(projectId: number, newOwnerId: number, reasonTag: string): Promise<Project> {
    const dto = await apiRequest<ApiProjectDto>(`/projects/${projectId}/reassign`, {
      method: 'PUT',
      body: JSON.stringify({ newOwnerId, reasonTag }),
    });
    return mapApiProject(dto);
  },

  async getAssignmentHistory(projectId: number): Promise<ProjectAssignmentHistory[]> {
    const dtos = await apiRequest<ApiProjectAssignmentHistoryDto[]>(`/projects/${projectId}/assignment-history`);
    return dtos.map(h => ({
      id: h.id,
      projectId: h.projectId,
      previousOwnerId: h.previousOwnerId,
      previousOwnerName: h.previousOwnerName,
      newOwnerId: h.newOwnerId,
      newOwnerName: h.newOwnerName,
      changedById: h.changedById,
      changedByName: h.changedByName,
      changedAt: h.changedAt,
      reasonTag: h.reasonTag as ReasonTag,
    }));
  },

  async setMembers(projectId: number, userIds: number[]): Promise<Project> {
    const dto = await apiRequest<ApiProjectDto>(`/projects/${projectId}/members`, {
      method: 'PUT',
      body: JSON.stringify(userIds),
    });
    return mapApiProject(dto);
  },

  async removeMember(projectId: number, userId: number): Promise<void> {
    return apiRequest<void>(`/projects/${projectId}/members/${userId}`, {
      method: 'DELETE',
    });
  },
};
