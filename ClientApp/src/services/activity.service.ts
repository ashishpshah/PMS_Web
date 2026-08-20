import { apiRequest } from '../lib/api';
import { Activity } from '../types';

export const activityService = {
  async getAll(): Promise<Activity[]> {
    return apiRequest<Activity[]>('/activities');
  },

  async create(activity: Omit<Activity, 'id' | 'timestamp'>): Promise<Activity> {
    // if (isLocal()) {
    //   return {
    //     ...activity,
    //     id: Math.random().toString(36).substr(2, 9),
    //     timestamp: new Date().toISOString()
    //   } as Activity;
    // }
    return apiRequest<Activity>('/activities', {
      method: 'POST',
      body: JSON.stringify(activity),
    });
  },
};
