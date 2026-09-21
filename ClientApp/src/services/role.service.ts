import { apiRequest, apiRequestWithMeta } from '../lib/api';

export interface ApiRoleDto {
  id: number;
  name: string;
  code?: string;
  level?: number;
  description?: string;
  isAdmin?: boolean;
  isActive?: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export const roleService = {
  async getAll(page = 1, pageSize = 25): Promise<PaginatedResponse<ApiRoleDto>> {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    const result = await apiRequestWithMeta<ApiRoleDto[]>(`/roles?${params.toString()}`);
    return {
      data: result.data,
      totalCount: result.meta.totalCount,
      page: result.meta.page,
      pageSize: result.meta.pageSize,
      totalPages: result.meta.totalPages,
    };
  },

  // For dropdowns - uses search endpoint with pagination
  async search(page = 1, pageSize = 25, search?: string): Promise<PaginatedResponse<ApiRoleDto>> {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (search) params.set('q', search);
    
    const result = await apiRequestWithMeta<ApiRoleDto[]>(`/roles/search?${params.toString()}`);
    return {
      data: result.data,
      totalCount: result.meta.totalCount,
      page: result.meta.page,
      pageSize: result.meta.pageSize,
      totalPages: result.meta.totalPages,
    };
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