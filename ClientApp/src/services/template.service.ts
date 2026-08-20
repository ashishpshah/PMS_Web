import { apiRequest } from '../lib/api';
import { TaskTemplate, TaskTemplateItem, TaskTemplateGeneration, GeneratedTaskLink, Priority, RecurrenceType } from '../types';

interface ApiTemplateItemDto {
  id: number;
  position: number;
  title: string;
  description?: string;
  estimatedHours: number;
  priority: string;
  defaultAssigneeId?: number;
  defaultAssigneeName?: string;
  qaReviewerId?: number;
  qaReviewerName?: string;
  dueDateOffsetDays: number;
  tags: string[];
  checklistItems: string[];
  dependsOnPositions: number[];
  reviewCriteria: string[];
}

interface ApiTemplateDto {
  id: number;
  name: string;
  description?: string;
  projectId?: number;
  projectName?: string;
  module?: string;
  recurrenceType: string;
  dayOfWeek?: number;
  dayOfMonth?: number;
  daysOfMonth?: number[];
  skipDaysOfWeek?: number[];
  skipDates?: string[];
  skipDaysOfMonth?: number[];
  customIntervalDays?: number;
  triggerTime?: string;
  startDate: string;
  endDate?: string;
  isActive: boolean;
  createdByName: string;
  createdAt: string;
  generationCount: number;
  lastGeneratedAt?: string;
  nextRunAt?: string;
  itemCount: number;
  assigneeIds: number[];
  assigneeNames: string[];
  items: ApiTemplateItemDto[];
}

interface ApiGenerationDto {
  id: number;
  periodKey: string;
  generatedAt: string;
  generatedByName?: string;
  taskCount: number;
  notes?: string;
  tasks: { taskId: number; taskTitle: string; assigneeName: string; templateItemTitle: string }[];
}

function mapItem(dto: ApiTemplateItemDto): TaskTemplateItem {
  return {
    id: dto.id,
    position: dto.position,
    title: dto.title,
    description: dto.description,
    estimatedHours: dto.estimatedHours,
    priority: dto.priority?.toLowerCase() as Priority,
    defaultAssigneeId: dto.defaultAssigneeId,
    defaultAssigneeName: dto.defaultAssigneeName,
    qaReviewerId: dto.qaReviewerId,
    qaReviewerName: dto.qaReviewerName,
    dueDateOffsetDays: dto.dueDateOffsetDays,
    tags: dto.tags || [],
    checklistItems: dto.checklistItems || [],
    dependsOnPositions: dto.dependsOnPositions || [],
    reviewCriteria: dto.reviewCriteria || [],
  };
}

function mapTemplate(dto: ApiTemplateDto): TaskTemplate {
  return {
    id: dto.id,
    name: dto.name,
    description: dto.description,
    projectId: dto.projectId,
    projectName: dto.projectName,
    module: dto.module,
    recurrenceType: dto.recurrenceType?.toLowerCase() as RecurrenceType,
    dayOfWeek: dto.dayOfWeek,
    dayOfMonth: dto.dayOfMonth,
    daysOfMonth:    dto.daysOfMonth     ?? [],
    skipDaysOfWeek: dto.skipDaysOfWeek  ?? [],
    skipDates:      dto.skipDates       ?? [],
    skipDaysOfMonth: dto.skipDaysOfMonth ?? [],
    customIntervalDays: dto.customIntervalDays,
    triggerTime: dto.triggerTime,
    startDate: dto.startDate ? dto.startDate.split('T')[0] : '',
    endDate: dto.endDate ? dto.endDate.split('T')[0] : undefined,
    isActive: dto.isActive,
    createdByName: dto.createdByName,
    createdAt: dto.createdAt,
    generationCount: dto.generationCount,
    lastGeneratedAt: dto.lastGeneratedAt,
    nextRunAt: dto.nextRunAt,
    itemCount: dto.itemCount ?? (dto.items?.length ?? 0),
    assigneeIds: dto.assigneeIds || [],
    assigneeNames: dto.assigneeNames || [],
    items: (dto.items || []).map(mapItem),
  };
}

function mapGeneration(dto: ApiGenerationDto): TaskTemplateGeneration {
  return {
    id: dto.id,
    periodKey: dto.periodKey,
    generatedAt: dto.generatedAt,
    generatedByName: dto.generatedByName,
    taskCount: dto.taskCount,
    notes: dto.notes,
    tasks: (dto.tasks || []).map(t => ({
      taskId: t.taskId,
      taskTitle: t.taskTitle,
      assigneeName: t.assigneeName,
      templateItemTitle: t.templateItemTitle,
    } as GeneratedTaskLink)),
  };
}

export interface SaveTemplateItemForm {
  id?: number;
  position: number;
  title: string;
  description?: string;
  estimatedHours: number;
  priority: Priority;
  defaultAssigneeId?: number;
  qaReviewerId?: number;
  dueDateOffsetDays: number;
  tags: string[];
  checklistItems: string[];
  dependsOnPositions: number[];
  reviewCriteria: string[];
}

export interface SaveTemplateForm {
  name: string;
  description?: string;
  projectId?: number;
  module?: string;
  recurrenceType: RecurrenceType;
  dayOfWeek?: number;
  daysOfMonth?: number[];
  skipDaysOfWeek?: number[];
  skipDates?: string[];
  skipDaysOfMonth?: number[];
  customIntervalDays?: number;
  triggerTime?: string;
  startDate: string;
  endDate?: string;
  isActive: boolean;
  assigneeIds: number[];
  items: SaveTemplateItemForm[];
}

export const templateService = {
  async getAll(): Promise<TaskTemplate[]> {
    const dtos = await apiRequest<ApiTemplateDto[]>('/task-templates');
    return (dtos || []).map(mapTemplate);
  },

  async getById(id: number): Promise<TaskTemplate> {
    const dto = await apiRequest<ApiTemplateDto>(`/task-templates/${id}`);
    return mapTemplate(dto);
  },

  async create(form: SaveTemplateForm): Promise<TaskTemplate> {
    const dto = await apiRequest<ApiTemplateDto>('/task-templates', {
      method: 'POST',
      body: JSON.stringify(form),
    });
    return mapTemplate(dto);
  },

  async update(id: number, form: SaveTemplateForm): Promise<TaskTemplate> {
    const dto = await apiRequest<ApiTemplateDto>(`/task-templates/${id}`, {
      method: 'PUT',
      body: JSON.stringify(form),
    });
    return mapTemplate(dto);
  },

  async setActive(id: number, isActive: boolean): Promise<void> {
    await apiRequest<boolean>(`/task-templates/${id}/active`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive }),
    });
  },

  async duplicate(id: number): Promise<TaskTemplate> {
    const dto = await apiRequest<ApiTemplateDto>(`/task-templates/${id}/duplicate`, {
      method: 'POST',
    });
    return mapTemplate(dto);
  },

  async delete(id: number): Promise<void> {
    await apiRequest<boolean>(`/task-templates/${id}`, { method: 'DELETE' });
  },

  async generate(id: number, notes?: string, forDate?: string): Promise<TaskTemplateGeneration> {
    const dto = await apiRequest<ApiGenerationDto>(`/task-templates/${id}/generate`, {
      method: 'POST',
      body: JSON.stringify({ notes, forDate: forDate || null }),
    });
    return mapGeneration(dto);
  },

  async getHistory(id: number): Promise<TaskTemplateGeneration[]> {
    const dtos = await apiRequest<ApiGenerationDto[]>(`/task-templates/${id}/history`);
    return (dtos || []).map(mapGeneration);
  },
};
