import { APIRequestContext } from '@playwright/test';

const API_BASE = 'http://localhost:5178';

let _adminToken: string | null = null;
let _adminHeaders: Record<string, string> = {};

export async function getAdminToken(request: APIRequestContext): Promise<string> {
  if (_adminToken) return _adminToken;
  const res = await request.post(`${API_BASE}/api/auth/login`, {
    data: { usernameOrEmail: 'admin', password: 'admin@123' },
  });
  const body = await res.json();
  _adminToken = body.data.token;
  _adminHeaders = { Authorization: `Bearer ${_adminToken}`, 'Content-Type': 'application/json' };
  return _adminToken;
}

export function adminHeaders(): Record<string, string> {
  return _adminHeaders;
}

export async function createProject(request: APIRequestContext, name?: string): Promise<number> {
  await getAdminToken(request);
  const res = await request.post(`${API_BASE}/api/projects`, {
    headers: _adminHeaders,
    data: {
      id: 0,
      name: name ?? `E2E Project ${Date.now()}`,
      description: 'E2E test project',
      status: 'Active',
      startDate: '2026-04-01',
      endDate: '2026-12-31',
      ownerId: 1,
      modules: ['Frontend', 'Backend'],
    },
  });
  const body = await res.json();
  return body.data.id;
}

export async function deleteProject(request: APIRequestContext, projectId: number): Promise<void> {
  await getAdminToken(request);
  await request.delete(`${API_BASE}/api/projects/${projectId}`, { headers: _adminHeaders });
}

export async function createTask(
  request: APIRequestContext,
  overrides: Record<string, unknown> = {}
): Promise<{ id: number; code?: string }> {
  await getAdminToken(request);
  const defaults: Record<string, unknown> = {
    title: `E2E Task ${Date.now()}`,
    description: 'E2E test task',
    status: 'new',
    priority: 'Medium',
    projectId: null,
    assignedToId: 1,
    dueDate: '2026-04-15',
    module: 'Backend',
    tags: ['e2e'],
    estimatedHours: 4,
    actualHours: null,
    parentTaskId: null,
  };
  const data = { ...defaults, ...overrides };
  const res = await request.post(`${API_BASE}/api/tasks`, {
    headers: _adminHeaders,
    data,
  });
  const body = await res.json();
  return { id: body.data?.id, code: body.data?.code };
}

export async function deleteTask(request: APIRequestContext, taskId: number): Promise<void> {
  await getAdminToken(request);
  await request.delete(`${API_BASE}/api/tasks/${taskId}`, { headers: _adminHeaders });
}

export async function createUser(
  request: APIRequestContext,
  overrides: Record<string, unknown> = {}
): Promise<{ id: number; userName?: string }> {
  await getAdminToken(request);
  const suffix = Date.now();
  const defaults: Record<string, unknown> = {
    userName: `E2E_User_${suffix}`,
    email: `E2E_user_${suffix}@pms.com`,
    firstName: 'E2E',
    lastName: `User_${suffix}`,
    password: 'Pms@123',
    roleId: 2,
    contactNo: '+91 9876543210',
    isActive: true,
  };
  const data = { ...defaults, ...overrides };
  const res = await request.post(`${API_BASE}/api/users`, {
    headers: _adminHeaders,
    data,
  });
  if (!res.ok()) {
    const err = await res.json();
    return { id: 0, userName: data.userName as string };
  }
  const body = await res.json();
  return { id: body.data?.id, userName: body.data?.userName };
}

export async function createRole(
  request: APIRequestContext,
  overrides: Record<string, unknown> = {}
): Promise<{ id: number; name?: string }> {
  await getAdminToken(request);
  const suffix = Date.now();
  const defaults: Record<string, unknown> = {
    id: 0,
    name: `E2E Role ${suffix}`,
    code: `E2E${suffix}`.slice(0, 10).toUpperCase(),
    level: 3,
    description: 'E2E test role',
    isAdmin: false,
    isActive: true,
  };
  const data = { ...defaults, ...overrides };
  const res = await request.post(`${API_BASE}/api/roles`, {
    headers: _adminHeaders,
    data,
  });
  if (!res.ok()) {
    return { id: 0 };
  }
  const body = await res.json();
  return { id: body.data?.id };
}

export async function deleteRole(request: APIRequestContext, roleId: number): Promise<void> {
  await getAdminToken(request);
  await request.delete(`${API_BASE}/api/roles/${roleId}`, { headers: _adminHeaders });
}

export async function apiPost(
  request: APIRequestContext,
  path: string,
  data: Record<string, unknown>
): Promise<{ ok: boolean; status: number; body: any }> {
  await getAdminToken(request);
  const res = await request.post(`${API_BASE}${path}`, { headers: _adminHeaders, data });
  const body = res.ok() ? await res.json().catch(() => ({})) : await res.json().catch(() => ({}));
  return { ok: res.ok(), status: res.status(), body };
}

export async function apiPut(
  request: APIRequestContext,
  path: string,
  data: Record<string, unknown>
): Promise<{ ok: boolean; status: number; body: any }> {
  await getAdminToken(request);
  const res = await request.put(`${API_BASE}${path}`, { headers: _adminHeaders, data });
  const body = res.ok() ? await res.json().catch(() => ({})) : await res.json().catch(() => ({}));
  return { ok: res.ok(), status: res.status(), body };
}

export async function apiGet(
  request: APIRequestContext,
  path: string
): Promise<{ ok: boolean; status: number; body: any }> {
  await getAdminToken(request);
  const res = await request.get(`${API_BASE}${path}`, { headers: _adminHeaders });
  const body = res.ok() ? await res.json().catch(() => ({})) : await res.json().catch(() => ({}));
  return { ok: res.ok(), status: res.status(), body };
}

export async function apiDelete(
  request: APIRequestContext,
  path: string
): Promise<{ ok: boolean; status: number; body: any }> {
  await getAdminToken(request);
  const res = await request.delete(`${API_BASE}${path}`, { headers: _adminHeaders });
  const body = res.ok() ? await res.json().catch(() => ({})) : await res.json().catch(() => ({}));
  return { ok: res.ok(), status: res.status(), body };
}
