import { apiRequest } from '../lib/api';
import { DashboardStats, DashboardEffort, ProjectStatusMatrix, AtRiskData } from '../types';

export const dashboardService = {
  async getStats(userId?: number, from?: string, to?: string): Promise<DashboardStats> {
    const qs = new URLSearchParams();
    if (userId != null) qs.set('userId', String(userId));
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    const q = qs.toString();
    return apiRequest<DashboardStats>(`/tasks/dashboard-stats${q ? `?${q}` : ''}`);
  },

  async getEffortStats(from?: string, to?: string, userId?: number): Promise<DashboardEffort> {
    const qs = new URLSearchParams();
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    if (userId != null) qs.set('userId', String(userId));
    const q = qs.toString();
    return apiRequest<DashboardEffort>(`/tasks/effort-stats${q ? `?${q}` : ''}`);
  },

  async getStatusMatrix(axis: 'project' | 'assignee', from?: string, to?: string, userId?: number): Promise<ProjectStatusMatrix> {
    const qs = new URLSearchParams({ axis });
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    if (userId != null) qs.set('userId', String(userId));
    return apiRequest<ProjectStatusMatrix>(`/tasks/status-matrix?${qs}`);
  },

  async getAtRisk(userId?: number): Promise<AtRiskData> {
    const qs = new URLSearchParams();
    if (userId != null) qs.set('userId', String(userId));
    const q = qs.toString();
    return apiRequest<AtRiskData>(`/tasks/at-risk${q ? `?${q}` : ''}`);
  },
};
