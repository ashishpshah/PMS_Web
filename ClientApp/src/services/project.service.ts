import { apiRequest } from '../lib/api';
import { Project, ProjectMember, ProjectAssignmentHistory, ReasonTag } from '../types';

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

export const projectService = {
  async getAll(): Promise<Project[]> {
    const dtos = await apiRequest<ApiProjectDto[]>('/projects');
    return dtos.map(mapApiProject);
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
