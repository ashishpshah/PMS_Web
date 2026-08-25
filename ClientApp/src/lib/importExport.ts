import { Project, Task } from '../types';

export const exportToCSV = (data: any[], filename: string) => {
  if (data.length === 0) return;
  
  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(','),
    ...data.map(row => 
      headers.map(header => {
        const value = row[header];
        const stringValue = value === null || value === undefined ? '' : String(value);
        return stringValue.includes(',') || stringValue.includes('"') 
          ? `"${stringValue.replace(/"/g, '""')}"` 
          : stringValue;
      }).join(',')
    )
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
};

export const exportProjects = (projects: Project[]) => {
  const exportData = projects.map(p => ({
    Name: p.name,
    Description: p.description,
    Status: p.status,
    StartDate: p.startDate,
    EndDate: p.endDate,
    Progress: p.progress,
    OwnerId: p.ownerId,
  }));
  exportToCSV(exportData, 'projects');
};

export const exportTasks = (tasks: Task[]) => {
  const exportData = tasks.map(t => ({
    Code: t.code || '',
    Title: t.title,
    Status: t.status,
    Priority: t.priority,
    ProjectId: t.projectId,
    Module: t.module || '',
    AssigneeId: t.assigneeId || '',
    DueDate: t.dueDate || '',
    EstimatedHours: t.estimatedHours ?? '',
    ActualHours: t.actualHours ?? '',
    Progress: t.progress,
    Tags: (t.tags || []).join(';'),
    CreatedAt: t.createdAt ? t.createdAt.split('T')[0] : '',
  }));
  exportToCSV(exportData, 'tasks');
};

export const exportProjectWithTasks = (project: Project, tasks: Task[]) => {
  const projectData = [{
    Name: project.name,
    Description: project.description,
    Status: project.status,
    StartDate: project.startDate,
    EndDate: project.endDate,
    Progress: project.progress,
  }];
  
  const taskData = tasks.filter(t => t.projectId === project.id).map(t => ({
    TaskTitle: t.title,
    TaskDescription: t.description,
    TaskStatus: t.status,
    TaskPriority: t.priority,
    TaskAssigneeId: t.assigneeId,
    TaskDueDate: t.dueDate,
    TaskModule: t.module,
    TaskEstimatedHours: t.estimatedHours,
    TaskProgress: t.progress,
  }));

  const csvContent = [
    '## PROJECT ##',
    Object.keys(projectData[0]).join(','),
    Object.values(projectData[0]).join(','),
    '',
    '## TASKS ##',
    Object.keys(taskData[0] || {}).join(','),
    ...taskData.map(row => Object.values(row).join(',')),
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${project.name.replace(/[^a-z0-9]/gi, '_')}_with_tasks.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
};

export const getSampleProjectCSV = () => {
  const sample = `Name,Description,Status,StartDate,EndDate,Progress
Project A,Sample project description,Active,2024-01-01,2024-12-31,50
Project B,Another project,On-Hold,2024-03-01,2024-06-30,25`;
  downloadSampleFile(sample, 'sample_projects.csv');
};

export const getSampleTaskCSV = () => {
  const sample = `Title,Description,Status,Priority,ProjectId,Module,EstimatedHours,Progress
Task 1,Description here,todo,high,1,Development,8,0
Task 2,Another task,in-progress,medium,1,Testing,4,50`;
  downloadSampleFile(sample, 'sample_tasks.csv');
};

export const getSampleProjectWithTasksCSV = () => {
  const sample = `## PROJECT ##
Name,Description,Status,StartDate,EndDate,Progress
Sample Project,This is a sample,Active,2024-01-01,2024-12-31,0

## TASKS ##
Title,Description,Status,Priority,Module,EstimatedHours,Progress
Task 1,First task,todo,high,Development,8,0
Task 2,Second task,in-progress,medium,Testing,4,50`;
  downloadSampleFile(sample, 'sample_project_with_tasks.csv');
};

const downloadSampleFile = (content: string, filename: string) => {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
};

export const parseCSV = (file: File): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const lines = text.split('\n').filter(line => line.trim());
        const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
        
        const data = lines.slice(1).map(line => {
          const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
          const obj: any = {};
          headers.forEach((header, i) => {
            obj[header] = values[i] || '';
          });
          return obj;
        });
        resolve(data);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
};