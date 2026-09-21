import { apiRequest, apiRequestWithMeta, PagedResult } from '../lib/api';

export interface PaginatedResponse<T> {
  data: T[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export type LeaveRequestStatus = 'Pending' | 'Approved' | 'Rejected';
export type DayType = 'Holiday' | 'WorkingDay';

export interface LeaveRequest {
  id: number;
  userId: number;
  userFullName: string;
  userAvatarUrl?: string;
  leaveTypeId: number;
  leaveTypeName: string;
  startDate: string;
  endDate: string;
  dayCount: number;
  reason: string;
  status: LeaveRequestStatus;
  approverId?: number;
  approverName?: string;
  decisionAt?: string;
  decisionNote?: string;
  // Admin-controlled, meaningful only while Pending — gate the owner's Edit/Delete buttons.
  allowEdit: boolean;
  allowDelete: boolean;
  createdAt: string;
}

export interface CreateLeaveRequestDto {
  leaveTypeId: number;
  startDate: string;
  endDate: string;
  reason: string;
}

export type UpdateLeaveRequestDto = CreateLeaveRequestDto;

export interface DecideLeaveRequestDto {
  approve: boolean;
  decisionNote?: string;
}

export interface SetLeaveRequestPermissionsDto {
  allowEdit: boolean;
  allowDelete: boolean;
}

export interface LeaveType {
  id: number;
  name: string;
  isActive: boolean;
}

export interface SaveLeaveTypeDto {
  name: string;
  isActive: boolean;
}

// Type-agnostic — one pooled balance per user per year, sourced from AnnualLeaveAllocation.
export interface LeaveBalance {
  year: number;
  allocatedDays: number;
  usedDays: number;
  availableDays: number;
}

export interface AnnualLeaveAllocation {
  year: number;
  leaveDays: number;
}

export interface UpdateAnnualLeaveAllocationDto {
  leaveDays: number;
}

export interface Holiday {
  id: number;
  date: string;
  name: string;
  dayType: DayType;
  isManualOverride: boolean;
}

export interface SetHolidayOverrideDto {
  date: string;
  name: string;
  dayType: DayType;
}

export interface WorkweekRules {
  workStartTime: string;
  workEndTime: string;
  breakMinMinutes: number;
  breakMaxMinutes: number;
  holidaySaturdayOccurrences: number[];
  updatedAt?: string;
}

export interface UpdateWorkweekRulesDto {
  workStartTime: string;
  workEndTime: string;
  breakMinMinutes: number;
  breakMaxMinutes: number;
  holidaySaturdayOccurrences: number[];
}

export const leaveService = {
  // ── Requests ──────────────────────────────────────────────────────────
  async getMyRequests(page = 1, pageSize = 25): Promise<PaginatedResponse<LeaveRequest>> {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    const result = await apiRequestWithMeta<LeaveRequest[]>(`/leave/requests/mine?${params.toString()}`);
    return {
      data: result.data,
      totalCount: result.meta.totalCount,
      page: result.meta.page,
      pageSize: result.meta.pageSize,
      totalPages: result.meta.totalPages,
    };
  },

  // Server-computed day count for a not-yet-submitted date range (Holiday/WorkingDay
  // math lives once in LeaveService — this just previews it live instead of duplicating it
  // client-side). Silent so it doesn't flash the global loader as dates are picked.
  async previewDayCount(start: string, end: string): Promise<number> {
    const p = new URLSearchParams({ start, end });
    return apiRequest<number>(`/leave/requests/preview?${p.toString()}`, {}, { silent: true });
  },

  async getAllRequests(params?: { userId?: number; status?: string }, page = 1, pageSize = 25): Promise<PaginatedResponse<LeaveRequest>> {
    const p = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (params?.userId != null) p.set('userId', String(params.userId));
    if (params?.status) p.set('status', params.status);
    const result = await apiRequestWithMeta<LeaveRequest[]>(`/leave/requests/all?${p.toString()}`);
    return {
      data: result.data,
      totalCount: result.meta.totalCount,
      page: result.meta.page,
      pageSize: result.meta.pageSize,
      totalPages: result.meta.totalPages,
    };
  },

  async createRequest(dto: CreateLeaveRequestDto): Promise<LeaveRequest> {
    return apiRequest<LeaveRequest>('/leave/requests', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  async updateRequest(id: number, dto: UpdateLeaveRequestDto): Promise<LeaveRequest> {
    return apiRequest<LeaveRequest>(`/leave/requests/${id}`, {
      method: 'PUT',
      body: JSON.stringify(dto),
    });
  },

  async decide(id: number, dto: DecideLeaveRequestDto): Promise<LeaveRequest> {
    return apiRequest<LeaveRequest>(`/leave/requests/${id}/decide`, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  async setPermissions(id: number, dto: SetLeaveRequestPermissionsDto): Promise<LeaveRequest> {
    return apiRequest<LeaveRequest>(`/leave/requests/${id}/permissions`, {
      method: 'PUT',
      body: JSON.stringify(dto),
    });
  },

  async deleteRequest(id: number): Promise<boolean> {
    return apiRequest<boolean>(`/leave/requests/${id}`, { method: 'DELETE' });
  },

  // ── Balances ──────────────────────────────────────────────────────────
  async getMyBalance(): Promise<LeaveBalance> {
    return apiRequest<LeaveBalance>('/leave/balances/mine');
  },

  // ── Leave types (admin CRUD) ─────────────────────────────────────────
  async getTypes(): Promise<LeaveType[]> {
    return apiRequest<LeaveType[]>('/leave/types');
  },

  // For dropdowns - uses search endpoint with pagination
  async searchTypes(page = 1, pageSize = 25, search?: string): Promise<PaginatedResponse<LeaveType>> {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (search) params.set('q', search);
    
    const result = await apiRequestWithMeta<LeaveType[]>(`/leave/types/search?${params.toString()}`);
    return {
      data: result.data,
      totalCount: result.meta.totalCount,
      page: result.meta.page,
      pageSize: result.meta.pageSize,
      totalPages: result.meta.totalPages,
    };
  },

  async createType(dto: SaveLeaveTypeDto): Promise<LeaveType> {
    return apiRequest<LeaveType>('/leave/types', { method: 'POST', body: JSON.stringify(dto) });
  },

  async updateType(id: number, dto: SaveLeaveTypeDto): Promise<LeaveType> {
    return apiRequest<LeaveType>(`/leave/types/${id}`, { method: 'PUT', body: JSON.stringify(dto) });
  },

  async deleteType(id: number): Promise<boolean> {
    return apiRequest<boolean>(`/leave/types/${id}`, { method: 'DELETE' });
  },

  // ── Holidays ──────────────────────────────────────────────────────────
  async getHolidays(from: string, to: string): Promise<Holiday[]> {
    const p = new URLSearchParams({ from, to });
    return apiRequest<Holiday[]>(`/leave/holidays?${p.toString()}`);
  },

  async setHolidayOverride(dto: SetHolidayOverrideDto): Promise<Holiday> {
    return apiRequest<Holiday>('/leave/holidays/override', { method: 'POST', body: JSON.stringify(dto) });
  },

  async deleteHoliday(id: number): Promise<boolean> {
    return apiRequest<boolean>(`/leave/holidays/${id}`, { method: 'DELETE' });
  },

  // ── Annual Leave Allocation (admin) ──────────────────────────────────
  async getAllocations(): Promise<AnnualLeaveAllocation[]> {
    return apiRequest<AnnualLeaveAllocation[]>('/leave/allocations');
  },

  async updateCurrentAllocation(dto: UpdateAnnualLeaveAllocationDto): Promise<AnnualLeaveAllocation> {
    return apiRequest<AnnualLeaveAllocation>('/leave/allocations/current', { method: 'PUT', body: JSON.stringify(dto) });
  },

  // ── Rules Settings ────────────────────────────────────────────────────
  async getRules(): Promise<WorkweekRules> {
    return apiRequest<WorkweekRules>('/leave/rules');
  },

  async updateRules(dto: UpdateWorkweekRulesDto): Promise<WorkweekRules> {
    return apiRequest<WorkweekRules>('/leave/rules', { method: 'PUT', body: JSON.stringify(dto) });
  },
};
