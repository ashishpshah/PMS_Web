import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { Project, Task, User, Activity, Notification, Status, AddBlockItem, StatusTransitionGraph } from '../types';
import { useAuth } from './AuthContext';
import { projectService } from '../services/project.service';
import { taskService } from '../services/task.service';
import { userService } from '../services/user.service';
import { activityService } from '../services/activity.service';
import { showError } from '../lib/toast';

interface DataContextType {
  projects: Project[];
  tasks: Task[];
  users: User[];
  assignableUsers: User[];
  activities: Activity[];
  notifications: Notification[];
  statusTransitions: StatusTransitionGraph;
  loading: boolean;
  error: string | null;
  activeAlert: Notification | null;
  dismissAlert: () => void;
  addProject: (project: Project) => Promise<Project>;
  updateProject: (project: Project) => Promise<void>;
  deleteProject: (id: number) => Promise<void>;
  reassignProject: (projectId: number, newOwnerId: number, reasonTag: string) => Promise<void>;
  updateProjectMembers: (projectId: number, userIds: number[]) => Promise<void>;
  removeMemberFromProject: (projectId: number, userId: number) => Promise<void>;
  addTask: (task: Task, checklistItems?: string[]) => Promise<Task>;
  updateTask: (task: Task) => Promise<void>;
  deleteTask: (id: number) => Promise<void>;
  addTaskComment: (taskId: number, comment: { text: string }) => Promise<void>;
  reassignTask: (taskId: number, newAssigneeId: number | null, reasonTag: string) => Promise<void>;
  addChecklistItem: (taskId: number, title: string, orderIndex: number) => Promise<void>;
  toggleChecklistItem: (taskId: number, itemId: number, isCompleted: boolean) => Promise<void>;
  updateChecklistItem: (taskId: number, itemId: number, title: string, orderIndex: number) => Promise<void>;
  deleteChecklistItem: (taskId: number, itemId: number) => Promise<void>;
  markAllChecklistComplete: (taskId: number) => Promise<void>;
  setTaskBlock: (taskId: number, isBlocked: boolean, blockItems?: AddBlockItem[], reason?: string) => Promise<void>;
  startTask: (taskId: number) => Promise<void>;
  changeTaskStatus: (taskId: number, toStatus: Status, reason?: string, actualHours?: number, blockItems?: AddBlockItem[]) => Promise<void>;
  toggleTaskCondition: (taskId: number, conditionName: 'HasIssues' | 'IsPaused', value: boolean, reason?: string) => Promise<void>;
  addTaskIssueEntry: (taskId: number, description: string) => Promise<void>;
  resolveTaskIssueEntry: (taskId: number, entryId: number, isResolved: boolean) => Promise<void>;
  deleteTaskIssueEntry: (taskId: number, entryId: number) => Promise<void>;
  addTaskReviewIssue: (taskId: number, description: string) => Promise<void>;
  resolveTaskReviewIssue: (taskId: number, issueId: number, isResolved: boolean) => Promise<void>;
  deleteTaskReviewIssue: (taskId: number, issueId: number) => Promise<void>;
  completeReview: (taskId: number) => Promise<Task>;
  addUser: (user: User, password?: string) => Promise<User>;
  updateUser: (user: User) => Promise<void>;
  deleteUser: (id: number) => Promise<void>;
  setUserActive: (id: number, isActive: boolean) => Promise<void>;
  reactivateUser: (id: number) => Promise<void>;
  addActivity: (activity: Omit<Activity, 'id' | 'timestamp'>) => Promise<void>;
  markNotificationAsRead: (id: number) => void;
  clearAllNotifications: () => void;
  ingestNotification: (n: { title: string; body: string; type?: string; taskId?: number }) => void;
  refreshData: () => Promise<void>;
}

// Backend notification types that should also pop a modal dialog (not just feed).
const DIALOG_TYPES = new Set(['block', 'issue', 'overdue']);

const DataContext = createContext<DataContextType | undefined>(undefined);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const { user: currentUser, isSystemAdmin, isAdmin, isLoading: authLoading } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [assignableUsers, setAssignableUsers] = useState<User[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [statusTransitions, setStatusTransitions] = useState<StatusTransitionGraph>({});
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeAlert, setActiveAlert] = useState<Notification | null>(null);
  // P5-B: useRef so mutations don't trigger re-renders
  const shownAlerts = useRef<Set<string>>(new Set());
  // P5-G: monotonic counter via useRef — avoids Date.now() collision
  const nextNotifId = useRef(1);

  const playNotificationSound = () => {
    try {
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.25);
      osc.onended = () => ctx.close();
    } catch {
      // Web Audio unavailable — silently ignore
    }
  };

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [projectsData, usersData, assignableData, activitiesData, statusTransitionsData] = await Promise.all([
        projectService.getAll().catch(() => []),
        userService.getAll().catch(() => []),
        userService.getAssignable().catch(() => []),
        activityService.getAll().catch(() => []),
        taskService.getStatusTransitions().catch(() => ({})),
      ]);

      setProjects(projectsData || []);
      setTasks([]);
      setUsers(usersData || []);
      setAssignableUsers(assignableData || []);
      setActivities(activitiesData || []);
      setStatusTransitions(statusTransitionsData || {});
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Some data failed to load. Please refresh to try again.');
      setProjects([]);
      setTasks([]);
      setUsers([]);
      setAssignableUsers([]);
      setActivities([]);
      setStatusTransitions({});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Wait for the auth bootstrap to finish so the access token is in memory before
    // firing data requests — otherwise the first burst goes out tokenless and 401s.
    if (authLoading) return;
    if (currentUser) {
      fetchData();
    } else {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, authLoading, isSystemAdmin, isAdmin]);

  // No more due date reminders — due dates removed
  useEffect(() => {
    if (!currentUser || tasks.length === 0) return;

    const checkReminders = () => {
      setNotifications(currentNotifications => {
        // Placeholder for future reminder logic (e.g., stalled tasks, upcoming reviews)
        return currentNotifications;
      });
    };

    checkReminders();
    const interval = setInterval(checkReminders, 1000 * 60 * 60);
    return () => clearInterval(interval);
  }, [tasks, currentUser?.id]);

  const refreshData = fetchData;

  const addProject = async (project: Project): Promise<Project> => {
    try {
      const newProject = await projectService.create(project);
      setProjects(prev => [newProject, ...prev]);
      return newProject;
    } catch (err) {
      throw err;
    }
  };

  const updateProject = async (project: Project) => {
    try {
      const updated = await projectService.update(project);
      setProjects(prev => prev.map(p => p.id === updated.id ? updated : p));
    } catch (err) {
      throw err;
    }
  };

  const deleteProject = async (id: number) => {
    try {
      await projectService.delete(id);
      setProjects(prev => prev.filter(p => p.id !== id));
      setTasks(prev => prev.filter(t => t.projectId !== id));
    } catch (err) {
      throw err;
    }
  };

  const reassignProject = async (projectId: number, newOwnerId: number, reasonTag: string) => {
    try {
      const updated = await projectService.reassign(projectId, newOwnerId, reasonTag);
      setProjects(prev => prev.map(p => p.id === updated.id ? updated : p));
    } catch (err) {
      throw err;
    }
  };

  const updateProjectMembers = async (projectId: number, userIds: number[]) => {
    try {
      const updated = await projectService.setMembers(projectId, userIds);
      setProjects(prev => prev.map(p => p.id === updated.id ? updated : p));
    } catch (err) {
      throw err;
    }
  };

  const removeMemberFromProject = async (projectId: number, userId: number) => {
    try {
      await projectService.removeMember(projectId, userId);
      setProjects(prev => prev.map(p => {
        if (p.id !== projectId) return p;
        return {
          ...p,
          memberIds: (p.memberIds || []).filter(id => id !== userId),
          members: (p.members || []).filter(m => m.userId !== userId),
        };
      }));
    } catch (err) {
      throw err;
    }
  };

  const addTask = async (task: Task, checklistItems?: string[]): Promise<Task> => {
    try {
      const newTask = await taskService.create(task, checklistItems);
      setTasks(prev => [newTask, ...prev]);
      return newTask;
    } catch (err) {
      throw err;
    }
  };

  const updateTask = async (task: Task) => {
    try {
      const updated = await taskService.update(task);
      setTasks(prev => prev.map(t => t.id === updated.id ? updated : t));
    } catch (err) {
      throw err;
    }
  };

  const deleteTask = async (id: number) => {
    try {
      await taskService.delete(id);
      setTasks(prev => prev.filter(t => t.id !== id));
    } catch (err) {
      throw err;
    }
  };

  const pushNotification = (title: string, message: string, link?: string) => {
    const id = nextNotifId.current++;
    const notif: Notification = {
      id,
      userId: 0,
      title,
      message,
      type: 'update',
      read: false,
      timestamp: new Date().toISOString(),
      link,
    };
    // Feed-only: the modal dialog is reserved for high-signal events (block / issue / overdue),
    // which arrive via ingestNotification (backend) or the overdue-reminder effect.
    setNotifications(current => [notif, ...current]);
    playNotificationSound();
  };

  // Ingest a notification pushed from the backend over SignalR: always add to the feed,
  // but only pop the modal dialog for high-signal types (block / issue / overdue).
  const ingestNotification = (n: { title: string; body: string; type?: string; taskId?: number }) => {
    // Show a native browser notification when the tab is in the background.
    // Use the global via window to avoid name collision with the local Notification type.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const NativeNotif = (window as any).Notification as (typeof globalThis)['Notification'] | undefined;
    if (document.hidden && NativeNotif && NativeNotif.permission === 'granted') {
      try { new NativeNotif(n.title, { body: n.body, icon: '/favicon.ico' }); } catch { /* ignore */ }
    }

    const isDialog = DIALOG_TYPES.has((n.type ?? '').toLowerCase());
    const notif: Notification = {
      id: nextNotifId.current++,
      userId: 0,
      title: n.title,
      message: n.body,
      type: isDialog ? 'reminder' : 'update',
      read: false,
      timestamp: new Date().toISOString(),
      link: n.taskId ? `/tasks?id=${n.taskId}` : undefined,
    };
    setNotifications(current => [notif, ...current]);
    if (isDialog) setActiveAlert(notif);
    playNotificationSound();
  };

  const reassignTask = async (taskId: number, newAssigneeId: number | null, reasonTag: string) => {
    try {
      const updated = await taskService.reassign(taskId, newAssigneeId, reasonTag);
      setTasks(prev => prev.map(t => t.id === updated.id ? updated : t));
      const newAssignee = users.find(u => u.id === newAssigneeId);
      if (newAssignee && currentUser && newAssignee.id !== currentUser.id) {
        pushNotification(
          'Task Reassigned',
          `Task "${updated.title}" has been reassigned to ${newAssignee.name}. Reason: ${reasonTag}`,
          `/tasks?id=${taskId}`
        );
      }
    } catch (err) {
      throw err;
    }
  };

  const addChecklistItem = async (taskId: number, title: string, orderIndex: number) => {
    try {
      await taskService.addChecklistItem(taskId, title, orderIndex);
      const updatedTask = await taskService.getById(taskId);
      setTasks(prev => prev.map(t => t.id === taskId ? updatedTask : t));
      const task = tasks.find(t => t.id === taskId);
      if (task && currentUser && task.assigneeId !== currentUser.id) {
        pushNotification('Checklist Item Added', `New item "${title}" added to task "${task.title}"`, `/tasks?id=${taskId}`);
      }
    } catch (err) {
      throw err;
    }
  };

  const toggleChecklistItem = async (taskId: number, itemId: number, isCompleted: boolean) => {
    try {
      await taskService.toggleChecklistItem(taskId, itemId, isCompleted);
      const updatedTask = await taskService.getById(taskId);
      setTasks(prev => prev.map(t => t.id === taskId ? updatedTask : t));
    } catch (err) {
      throw err;
    }
  };

  const updateChecklistItem = async (taskId: number, itemId: number, title: string, orderIndex: number) => {
    try {
      await taskService.updateChecklistItem(taskId, itemId, title, orderIndex);
      const updatedTask = await taskService.getById(taskId);
      setTasks(prev => prev.map(t => t.id === taskId ? updatedTask : t));
      const task = tasks.find(t => t.id === taskId);
      if (task && currentUser && task.assigneeId !== currentUser.id) {
        pushNotification('Checklist Updated', `A checklist item was updated on task "${task.title}"`, `/tasks?id=${taskId}`);
      }
    } catch (err) {
      throw err;
    }
  };

  const deleteChecklistItem = async (taskId: number, itemId: number) => {
    try {
      await taskService.deleteChecklistItem(taskId, itemId);
      const updatedTask = await taskService.getById(taskId);
      setTasks(prev => prev.map(t => t.id === taskId ? updatedTask : t));
    } catch (err) {
      throw err;
    }
  };

  const markAllChecklistComplete = async (taskId: number) => {
    try {
      await taskService.markAllChecklistComplete(taskId);
      const updatedTask = await taskService.getById(taskId);
      setTasks(prev => prev.map(t => t.id === taskId ? updatedTask : t));
    } catch (err) {
      throw err;
    }
  };

  const setTaskBlock = async (taskId: number, isBlocked: boolean, blockItems?: AddBlockItem[], reason?: string) => {
    try {
      const updatedTask = await taskService.setBlock(taskId, isBlocked, blockItems, reason);
      setTasks(prev => prev.map(t => t.id === taskId ? updatedTask : t));
      if (isBlocked) {
        pushNotification('Task Blocked', `"${updatedTask.title}" has been blocked.`, '/tasks');
      }
    } catch (err) {
      throw err;
    }
  };

  const startTask = async (taskId: number) => {
    try {
      const updatedTask = await taskService.start(taskId);
      setTasks(prev => prev.map(t => t.id === taskId ? updatedTask : t));
    } catch (err) {
      throw err;
    }
  };

  const changeTaskStatus = async (taskId: number, toStatus: Status, reason?: string, actualHours?: number, blockItems?: AddBlockItem[]) => {
    try {
      const updatedTask = await taskService.changeStatus(taskId, toStatus, reason, actualHours, blockItems);
      setTasks(prev => prev.map(t => t.id === taskId ? updatedTask : t));
    } catch (err) {
      throw err;
    }
  };

  const toggleTaskCondition = async (taskId: number, conditionName: 'HasIssues' | 'IsPaused', value: boolean, reason?: string) => {
    try {
      const updatedTask = await taskService.toggleCondition(taskId, conditionName, value, reason);
      setTasks(prev => prev.map(t => t.id === taskId ? updatedTask : t));
    } catch (err) {
      throw err;
    }
  };

  const addTaskIssueEntry = async (taskId: number, description: string) => {
    try {
      const updatedTask = await taskService.addIssueEntry(taskId, description);
      setTasks(prev => prev.map(t => t.id === taskId ? updatedTask : t));
    } catch (err) {
      throw err;
    }
  };

  const resolveTaskIssueEntry = async (taskId: number, entryId: number, isResolved: boolean) => {
    try {
      const updatedTask = await taskService.resolveIssueEntry(taskId, entryId, isResolved);
      setTasks(prev => prev.map(t => t.id === taskId ? updatedTask : t));
    } catch (err) {
      throw err;
    }
  };

  const deleteTaskIssueEntry = async (taskId: number, entryId: number) => {
    try {
      const updatedTask = await taskService.deleteIssueEntry(taskId, entryId);
      setTasks(prev => prev.map(t => t.id === taskId ? updatedTask : t));
    } catch (err) {
      throw err;
    }
  };

  const addTaskReviewIssue = async (taskId: number, description: string) => {
    const updatedTask = await taskService.addReviewIssue(taskId, description);
    setTasks(prev => prev.map(t => t.id === taskId ? updatedTask : t));
  };

  const resolveTaskReviewIssue = async (taskId: number, issueId: number, isResolved: boolean) => {
    const updatedTask = await taskService.resolveReviewIssue(taskId, issueId, isResolved);
    setTasks(prev => prev.map(t => t.id === taskId ? updatedTask : t));
  };

  const deleteTaskReviewIssue = async (taskId: number, issueId: number) => {
    const updatedTask = await taskService.deleteReviewIssue(taskId, issueId);
    setTasks(prev => prev.map(t => t.id === taskId ? updatedTask : t));
  };

  const completeReview = async (taskId: number) => {
    const updatedTask = await taskService.completeReview(taskId);
    setTasks(prev => prev.map(t => t.id === taskId ? updatedTask : t));
    return updatedTask;
  };

  const addTaskComment = async (taskId: number, comment: { text: string }) => {
    try {
      const saved = await taskService.addComment(taskId, comment.text);
      const newComment = {
        id: saved.id,
        userId: saved.userId,
        userName: saved.userName,
        avatarUrl: saved.avatarUrl,
        text: saved.text,
        timestamp: saved.timestamp,
      };
      setTasks(prev => prev.map(task => {
        if (task.id === taskId) {
          return { ...task, comments: [...(task.comments || []), newComment] };
        }
        return task;
      }));
    } catch (err) {
      throw err;
    }
  };

  const addUser = async (user: User, password?: string): Promise<User> => {
    try {
      const newUser = await userService.create(user, password);
      setUsers(prev => [newUser, ...prev]);
      return newUser;
    } catch (err) {
      throw err;
    }
  };

  const updateUser = async (user: User) => {
    try {
      const updated = await userService.update(user);
      setUsers(prev => prev.map(u => u.id === updated.id ? updated : u));
    } catch (err) {
      throw err;
    }
  };

  const deleteUser = async (id: number) => {
    try {
      await userService.delete(id);
      setUsers(prev => prev.map(u => u.id === id ? { ...u, isDeleted: true, isActive: false } : u));
    } catch (err) {
      throw err;
    }
  };

  const setUserActive = async (id: number, isActive: boolean) => {
    try {
      const updated = await userService.setActive(id, isActive);
      setUsers(prev => prev.map(u => u.id === id ? updated : u));
    } catch (err) {
      throw err;
    }
  };

  const reactivateUser = async (id: number) => {
    try {
      const updated = await userService.reactivate(id);
      setUsers(prev => prev.map(u => u.id === id ? updated : u));
    } catch (err) {
      throw err;
    }
  };

  const addActivity = async (activity: Omit<Activity, 'id' | 'timestamp'>) => {
    try {
      const newActivity = await activityService.create(activity);
      setActivities(prev => [newActivity, ...prev]);
    } catch (err) {
      throw err;
    }
  };

  const markNotificationAsRead = (id: number) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const clearAllNotifications = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const dismissAlert = () => setActiveAlert(null);

  return (
    <DataContext.Provider value={{
      projects, tasks, users, assignableUsers, activities, statusTransitions, notifications, loading, error,
      activeAlert, dismissAlert,
      addProject, updateProject, deleteProject, reassignProject, updateProjectMembers, removeMemberFromProject,
      addTask, updateTask, deleteTask, addTaskComment,
      reassignTask, addChecklistItem, toggleChecklistItem, updateChecklistItem, deleteChecklistItem, markAllChecklistComplete, setTaskBlock, startTask, changeTaskStatus, toggleTaskCondition,
      addTaskIssueEntry, resolveTaskIssueEntry, deleteTaskIssueEntry,
      addTaskReviewIssue, resolveTaskReviewIssue, deleteTaskReviewIssue, completeReview,
      addUser, updateUser, deleteUser, setUserActive, reactivateUser,
      addActivity, markNotificationAsRead, clearAllNotifications, ingestNotification,
      refreshData,
    }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const context = useContext(DataContext);
  if (context === undefined) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
}
