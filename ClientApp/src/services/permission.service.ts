import { apiRequest } from '../lib/api';

export interface PageModule {
  id: number;
  name: string;
  route: string;
  description?: string;
}

export interface RolePermission {
  id: number;
  roleId: number;
  pageModuleId: number;
  pageModule?: PageModule;
  permissions: number;
}

export interface UserPermission {
  id: number;
  userId: number;
  pageModuleId: number;
  pageModule?: PageModule;
  permissions: number;
}

export interface PermissionUpdate {
  pageModuleId: number;
  permissions: number;
}

export const permissionService = {
  async getPageModules(): Promise<PageModule[]> {
    return apiRequest<PageModule[]>('/permissions/pages');
  },

  async getRoles(): Promise<{ id: number; name: string; description?: string }[]> {
    return apiRequest<{ id: number; name: string; description?: string }[]>('/permissions/roles');
  },

  async getRolePermissions(roleId: number): Promise<RolePermission[]> {
    return apiRequest<RolePermission[]>(`/permissions/role/${roleId}`);
  },

  async updateRolePermissions(roleId: number, permissions: PermissionUpdate[]): Promise<void> {
    return apiRequest<void>(`/permissions/role/${roleId}`, {
      method: 'PUT',
      body: JSON.stringify(permissions),
    });
  },

  async getUserPermissions(userId: number): Promise<UserPermission[]> {
    return apiRequest<UserPermission[]>(`/permissions/user/${userId}`);
  },

  async updateUserPermissions(userId: number, permissions: PermissionUpdate[]): Promise<void> {
    return apiRequest<void>(`/permissions/user/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(permissions),
    });
  },

  async clearUserPermissions(userId: number): Promise<void> {
    return apiRequest<void>(`/permissions/user/${userId}`, {
      method: 'DELETE',
    });
  },
};