import { apiRequest } from '../lib/api';

export interface ApiRoleDto {
  id: number;
  name: string;
  code?: string;
  level?: number;
  description?: string;
  isAdmin?: boolean;
  isActive?: boolean;
}

export const roleService = {
  async getAll(): Promise<ApiRoleDto[]> {
    return apiRequest<ApiRoleDto[]>('/roles');
  },

  async save(role: ApiRoleDto): Promise<ApiRoleDto> {
    return apiRequest<ApiRoleDto>('/roles', {
      method: 'POST',
      body: JSON.stringify(role),
    });
  },

  async delete(id: number): Promise<void> {
    return apiRequest<void>(`/roles/${id}`, {
      method: 'DELETE',
    });
  },
};