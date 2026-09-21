import { apiRequest, apiRequestWithMeta, PagedResult } from '../lib/api';
import { User } from '../types';

export interface PaginatedResponse<T> {
  data: T[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface ApiUserDto {
  id: number;
  userName: string;
  email: string;
  firstName?: string;
  lastName?: string;
  fullName: string;
  roleId?: number;
  roleName?: string;
  isAdmin?: boolean;
  avatarUrl?: string;
  contactNo?: string;
  isActive: boolean;
  isDeleted: boolean;
}

const mapApiUser = (apiUser: ApiUserDto): User => ({
  id: apiUser.id,
  name: apiUser.fullName || apiUser.userName,
  firstName: apiUser.firstName,
  lastName: apiUser.lastName,
  username: apiUser.userName,
  email: apiUser.email,
  role: apiUser.roleName || 'Developer',
  roleId: apiUser.roleId,
  isAdmin: apiUser.isAdmin ?? false,
  isActive: apiUser.isActive ?? true,
  isDeleted: apiUser.isDeleted ?? false,
  avatar: apiUser.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(apiUser.fullName || apiUser.userName)}&background=random`,
  contactNo: apiUser.contactNo,
  permissions: [],
});

export const userService = {
  async getAll(page = 1, pageSize = 25, search?: string, isActive?: boolean, isDeleted?: boolean): Promise<PaginatedResponse<User>> {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (search) params.set('search', search);
    if (isActive !== undefined) params.set('isActive', String(isActive));
    if (isDeleted !== undefined) params.set('isDeleted', String(isDeleted));
    
    const result = await apiRequestWithMeta<ApiUserDto[]>(`/users?${params.toString()}`);
    return {
      data: result.data.map(mapApiUser),
      totalCount: result.meta.totalCount,
      page: result.meta.page,
      pageSize: result.meta.pageSize,
      totalPages: result.meta.totalPages,
    };
  },

  // For dropdowns - uses search endpoint with pagination
  async getAssignable(page = 1, pageSize = 25, search?: string): Promise<PaginatedResponse<User>> {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (search) params.set('search', search);
    
    const result = await apiRequestWithMeta<ApiUserDto[]>(`/users/assignable?${params.toString()}`);
    return {
      data: result.data.map(mapApiUser),
      totalCount: result.meta.totalCount,
      page: result.meta.page,
      pageSize: result.meta.pageSize,
      totalPages: result.meta.totalPages,
    };
  },

  async create(user: User, password?: string): Promise<User> {
    const apiUser = {
      userName: user.username || user.email.split('@')[0],
      email: user.email,
      firstName: user.firstName ?? '',
      lastName: user.lastName ?? '',
      contactNo: user.contactNo,
      roleId: user.roleId || 2,
      isActive: user.isActive ?? true,
      password: password && password.length > 0 ? password : 'Az@12345',
    };
    const result = await apiRequest<ApiUserDto>('/users', {
      method: 'POST',
      body: JSON.stringify(apiUser),
    });
    return mapApiUser(result);
  },

  async checkAvailability(
    params: { userName?: string; email?: string; excludeUserId?: number }
  ): Promise<{ userNameChecked: boolean; userNameAvailable: boolean; emailChecked: boolean; emailAvailable: boolean }> {
    const qs = new URLSearchParams();
    if (params.userName) qs.set('userName', params.userName);
    if (params.email) qs.set('email', params.email);
    if (params.excludeUserId != null) qs.set('excludeUserId', String(params.excludeUserId));
    return apiRequest(`/auth/check-availability?${qs.toString()}`);
  },

  async update(user: User): Promise<User> {
    const apiUser = {
      userName: user.username ?? '',
      firstName: user.firstName ?? '',
      lastName: user.lastName ?? '',
      email: user.email,
      contactNo: user.contactNo,
      avatarUrl: user.avatar,
      roleId: user.roleId,
      isActive: user.isActive ?? true,
    };
    const result = await apiRequest<ApiUserDto>(`/users/${user.id}`, {
      method: 'PUT',
      body: JSON.stringify(apiUser),
    });
    return mapApiUser(result);
  },

  async delete(id: number): Promise<void> {
    // if (isLocal()) return;
    return apiRequest<void>(`/users/${id}`, {
      method: 'DELETE',
    });
  },

  async setActive(id: number, isActive: boolean): Promise<User> {
    const result = await apiRequest<ApiUserDto>(`/users/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive }),
    });
    return mapApiUser(result);
  },

  async reactivate(id: number): Promise<User> {
    const result = await apiRequest<ApiUserDto>(`/users/${id}/reactivate`, {
      method: 'PUT',
    });
    return mapApiUser(result);
  },

  async resetPassword(id: number): Promise<void> {
    await apiRequest<string>(`/users/${id}/reset-password`, {
      method: 'POST',
    });
  },
};
