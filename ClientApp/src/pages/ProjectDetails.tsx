import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { PageHeader } from '../components/ui/PageHeader';
import { Card, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Calendar, ListTodo, ChevronLeft, LayoutGrid, Clock, AlertCircle, FileText, ExternalLink, UserCheck, History, Users, Plus, X, Copy, Check } from 'lucide-react';
import { InteractiveLink } from '../components/ui/InteractiveLink';
import { PageTransition } from '../components/Layout/PageTransition';
import { EmptyState } from '../components/ui/EmptyState';
import { ReassignModal } from '../components/ui/ReassignModal';
import { ProgressBar } from '../components/ui/ProgressBar';
import { cn, formatDate, formatDateTime, copyToClipboard, toHHMM } from '../lib/utils';
import { ReasonTag, Task } from '../types';
import { showSuccess, showError } from '../lib/toast';
import { taskService } from '../services/task.service';

export default function ProjectDetails() {
  const { id } = useParams<{ id: string }>();
  const { projects, users, assignableUsers, activities, reassignProject, updateProjectMembers, removeMemberFromProject } = useData();
  const { user: currentUser } = useAuth();
  const { canUpdate: canUpdateProject } = usePermissions();
  const navigate = useNavigate();
  const [isReassignOpen, setIsReassignOpen] = useState(false);
  const [isAddMembersOpen, setIsAddMembersOpen] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [copiedMemberId, setCopiedMemberId] = useState<number | null>(null);
  const [projectTasks, setProjectTasks] = useState<Task[]>([]);

  const handleCopyEmail = async (email: string, userId: number) => {
    const ok = await copyToClipboard(email);
    if (ok) { setCopiedMemberId(userId); setTimeout(() => setCopiedMemberId(null), 1500); }
  };

  const project = projects.find(p => p.id === Number(id));

  useEffect(() => {
    if (!project) return;
    taskService.getAll({ projectId: project.id }, 1, 1000).then(r => setProjectTasks(r.tasks)).catch(() => {});
  }, [project?.id]);

  if (!project) {
    return (
      <PageTransition>
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <EmptyState 
            icon={AlertCircle}
            title="Project not found"
            description="The project you are looking for does not exist or has been removed."
            actionLabel="Back to Projects"
            onAction={() => navigate('/projects')}
          />
        </div>
      </PageTransition>
    );
  }

  const completedTasks = projectTasks.filter(t => t.status === 'completed').length;
  const activeContributors = new Set(projectTasks.map(t => t.assigneeId).filter(Boolean)).size;
  const progress = project.progress ?? (projectTasks.length > 0 ? Math.round((completedTasks / projectTasks.length) * 100) : 0);
  const owner = users.find(u => u.id === project.ownerId);
  const canReassign = canUpdateProject('/projects') && project.status !== 'completed';
  const canManageMembers = canUpdateProject('/projects');
  const memberUserIds = new Set((project.members || []).map(m => m.userId));
  const nonMembers = users.filter(u => !memberUserIds.has(u.id));
  const availableUsers = assignableUsers.map(u => ({ id: u.id, name: u.name, avatar: u.avatar }));
  const projectTaskIds = new Set(projectTasks.map(t => t.id));
  const projectActivities = activities.filter(a =>
    (a.targetType === 'project' && a.targetId === project.id) ||
    (a.targetType === 'task' && projectTaskIds.has(a.targetId))
  );

  return (
    <PageTransition>
      <div className="space-y-4 max-w-7xl mx-auto">
        <nav className="flex items-center text-[10px] font-black uppercase text-gray-400 tracking-widest px-1">
          <Link to="/projects" className="hover:text-indigo-600 flex items-center transition-colors">
            <ChevronLeft size={14} className="mr-1" /> Projects
          </Link>
          <span className="mx-2 opacity-30">/</span>
          <span className="text-gray-900 dark:text-gray-100 italic">{project.name}</span>
        </nav>

        <PageHeader
          title={project.name}
          description={project.description}
        >
          <div className="flex items-center gap-2">
            <Badge variant={project.status === 'completed' ? 'info' : project.status === 'active' ? 'success' : 'warning'}>
              {project.status}
            </Badge>
            {canReassign && (
              <Button variant="secondary" size="sm" onClick={() => setIsReassignOpen(true)}>
                <UserCheck size={13} className="mr-1" /> Reassign
              </Button>
            )}
          </div>
        </PageHeader>

        <ReassignModal
          isOpen={isReassignOpen}
          onClose={() => setIsReassignOpen(false)}
          title="Reassign Project"
          currentAssigneeId={project.ownerId}
          availableUsers={availableUsers}
          onConfirm={async (newUserId: number, reasonTag: ReasonTag) => {
            await reassignProject(project.id, newUserId, reasonTag);
            showSuccess('Project reassigned successfully');
          }}
        />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Main Content: Tasks */}
          <div className="lg:col-span-8 space-y-3">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-xs font-black uppercase tracking-widest text-gray-400 flex items-center">
                <ListTodo size={14} className="mr-2 text-indigo-600" />
                Project Tasks
              </h2>
              <Link to="/tasks">
                <Button size="sm" variant="ghost" className="text-indigo-600 h-7 text-[10px] px-2 font-black uppercase">Add Task</Button>
              </Link>
            </div>

            <div className="space-y-2">
              {projectTasks.map(task => (
                <Card key={task.id} className="hover:border-indigo-200 dark:hover:border-indigo-800 transition-all cursor-pointer group shadow-sm">
                  <CardContent className="p-3 flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className={cn(
                        "h-1.5 w-1.5 rounded-full shrink-0",
                        task.status === 'completed' ? "bg-emerald-500" : task.status === 'in-progress' ? "bg-indigo-500" : "bg-gray-300"
                      )} />
                      <div>
                        <InteractiveLink type="task" id={task.id}>
                          <h3 className="text-[13px] font-bold text-gray-900 dark:text-gray-100 group-hover:text-indigo-600 transition-colors leading-tight font-display">{task.title}</h3>
                        </InteractiveLink>
                        <div className="flex items-center mt-0.5 space-x-2 text-[10px] font-bold text-gray-400 uppercase tracking-tighter">
                          {task.module && (
                            <span className="bg-gray-50 dark:bg-gray-800 text-gray-500 px-1 py-0.5 rounded text-[8px] font-black">{task.module}</span>
                          )}
                          <span className="flex items-center"><Clock size={10} className="mr-1" /> {task.estimatedHours != null ? toHHMM(task.estimatedHours) : '—'}</span>
                          <span className={cn(
                            "px-1 rounded-sm",
                            task.priority === 'critical' ? "text-rose-600 bg-rose-50 dark:bg-rose-900/10" : task.priority === 'high' ? "text-red-500 bg-red-50 dark:bg-red-900/10" : "text-gray-400"
                          )}>{task.priority}</span>
                        </div>
                      </div>
                    </div>
                    {(() => {
                      const assignee = users.find(u => u.id === task.assigneeId);
                      return assignee ? (
                        <InteractiveLink type="user" id={task.assigneeId} className="flex items-center gap-1.5 shrink-0">
                          <img src={assignee.avatar} className="h-6 w-6 rounded border border-gray-100 dark:border-gray-800 object-cover" alt="" />
                          <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 hidden sm:block">{assignee.name.split(' ')[0]}</span>
                        </InteractiveLink>
                      ) : (
                        <span className="text-[10px] font-bold text-gray-400 shrink-0">Unassigned</span>
                      );
                    })()}
                  </CardContent>
                </Card>
              ))}
              {projectTasks.length === 0 && (
                <div className="text-center py-10 bg-gray-50/50 dark:bg-gray-900/30 rounded-xl border border-dashed border-gray-100 dark:border-gray-800">
                  <LayoutGrid size={24} className="mx-auto text-gray-200 mb-2" />
                  <p className="text-[11px] text-gray-400 font-bold uppercase tracking-widest italic">No tasks assigned</p>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar: Stats & Activity */}
          <div className="lg:col-span-4 space-y-4">
            {/* Stats Card */}
            <Card className="bg-indigo-600 text-white border-none shadow-md">
              <CardContent className="p-4 space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-[9px] font-black uppercase tracking-widest opacity-80">Execution Progress</span>
                  <div className="text-[10px] font-black px-1.5 py-0.5 bg-white/20 rounded-md font-mono">{progress}%</div>
                </div>
                <div className="space-y-1.5">
                  <div className="text-lg font-black italic uppercase tracking-tighter truncate leading-none">{project.name}</div>
                  <div className="w-full h-1 bg-black/10 rounded-full overflow-hidden">
                    <div className="h-full bg-white transition-all duration-1000" style={{ width: `${progress}%` }} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <div className="text-[8px] font-black uppercase opacity-60 tracking-wider">Total Units</div>
                    <div className="text-base font-black font-mono">{projectTasks.length}</div>
                  </div>
                  <div>
                    <div className="text-[8px] font-black uppercase opacity-60 tracking-wider">Resolved</div>
                    <div className="text-base font-black font-mono">{completedTasks}</div>
                  </div>
                  <div>
                    <div className="text-[8px] font-black uppercase opacity-60 tracking-wider">Contributors</div>
                    <div className="text-base font-black font-mono">{activeContributors}</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Modules Section */}
            {project.modules && project.modules.length > 0 && (
              <section className="space-y-1.5">
                <h3 className="text-[9px] font-black uppercase tracking-widest text-gray-400 px-1">Modules</h3>
                <Card className="shadow-sm">
                  <CardContent className="p-2.5 flex flex-wrap gap-1.5">
                    {project.modules.map((mod) => (
                      <span
                        key={mod}
                        className="bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-300 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-tight"
                      >
                        {mod}
                      </span>
                    ))}
                  </CardContent>
                </Card>
              </section>
            )}

            {/* Checklist-driven task progress breakdown */}
            {projectTasks.some(t => (t.checklistItems?.length ?? 0) > 0) && (
              <section className="space-y-1.5">
                <h3 className="text-[9px] font-black uppercase tracking-widest text-gray-400 px-1">Task Progress</h3>
                <Card className="shadow-sm">
                  <CardContent className="p-2.5 space-y-2">
                    {projectTasks.filter(t => (t.checklistItems?.length ?? 0) > 0).map(t => {
                      const done = t.checklistItems?.filter(i => i.isCompleted).length ?? 0;
                      const total = t.checklistItems?.length ?? 0;
                      return (
                        <div key={t.id} className="space-y-0.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-gray-700 dark:text-gray-300 truncate">{t.title}</span>
                            <span className="text-[9px] font-mono text-gray-400 shrink-0 ml-2">{done}/{total}</span>
                          </div>
                          <ProgressBar value={t.progress ?? 0} showLabel={false} size="sm" variant={t.progress === 100 ? 'emerald' : 'indigo'} />
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              </section>
            )}

            {/* Documents Section */}
            {project.attachments && project.attachments.length > 0 && (
              <section className="space-y-1.5">
                <h3 className="text-[9px] font-black uppercase tracking-widest text-gray-400 px-1">Assets</h3>
                <Card className="shadow-sm">
                  <CardContent className="p-1.5 space-y-0.5">
                    {project.attachments.map((file) => (
                      <div key={file.id} className="flex items-center justify-between p-2 hover:bg-gray-50 dark:hover:bg-gray-900 rounded-lg transition-colors cursor-pointer group">
                        <div className="flex items-center overflow-hidden">
                          <FileText size={12} className="text-gray-400 mr-2 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-[11px] font-bold text-gray-800 dark:text-gray-200 truncate group-hover:text-indigo-600 transition-colors">{file.name}</p>
                            <p className="text-[9px] text-gray-400 font-bold uppercase font-mono">{file.size}</p>
                          </div>
                        </div>
                        <ExternalLink size={10} className="text-gray-300 transition-all shrink-0 ml-2" />
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </section>
            )}

            {/* Owner Section */}
            <section className="space-y-1.5">
              <h3 className="text-[9px] font-black uppercase tracking-widest text-gray-400 px-1">Project Owner</h3>
              <Card className="shadow-sm">
                <CardContent className="p-2.5 flex items-center space-x-3">
                  <img src={owner?.avatar} className="h-8 w-8 rounded border border-gray-100 dark:border-gray-800 object-cover" alt="" />
                  <div>
                    <InteractiveLink type="user" id={owner?.id ?? 0} className="text-[12px] font-bold text-gray-900 dark:text-gray-100 uppercase tracking-tight hover:text-indigo-600 transition-colors">
                      {owner?.name}
                    </InteractiveLink>
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{owner?.role}</p>
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* Team Members Section */}
            <section className="space-y-1.5">
              <h3 className="text-[9px] font-black uppercase tracking-widest text-gray-400 px-1 flex items-center justify-between">
                <span className="flex items-center gap-1"><Users size={10} className="text-indigo-400" /> Team Members</span>
                {canManageMembers && (
                  <button
                    onClick={() => { setSelectedUserIds([]); setIsAddMembersOpen(true); }}
                    className="flex items-center gap-0.5 text-indigo-500 hover:text-indigo-700 transition-colors"
                  >
                    <Plus size={10} /> <span>Add</span>
                  </button>
                )}
              </h3>
              <Card className="shadow-sm">
                <CardContent className="p-1.5 space-y-0.5">
                  {(project.members && project.members.length > 0) ? project.members.map(m => (
                    <div key={m.userId} className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors group">
                      <div className="flex items-center gap-2">
                        <img
                          src={m.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(m.fullName)}&background=random&size=32`}
                          alt={m.fullName}
                          className="h-6 w-6 rounded-full object-cover border border-gray-100 dark:border-gray-800"
                        />
                        <div>
                          <p className="text-[11px] font-bold text-gray-900 dark:text-gray-100 leading-none">{m.fullName}</p>
                          {m.roleInProject && (
                            <span className="text-[8px] font-black text-indigo-500 uppercase tracking-widest">{m.roleInProject}</span>
                          )}
                          {m.email && (
                            <button
                              type="button"
                              onClick={() => handleCopyEmail(m.email!, m.userId)}
                              className="flex items-center gap-1 mt-0.5 text-[9px] text-gray-400 hover:text-indigo-500 transition-colors"
                              title="Copy email"
                            >
                              {copiedMemberId === m.userId
                                ? <><Check size={9} className="text-emerald-500" /><span className="text-emerald-500">Copied!</span></>
                                : <><Copy size={9} /><span className="truncate max-w-[110px]">{m.email}</span></>
                              }
                            </button>
                          )}
                        </div>
                      </div>
                      {canManageMembers && (
                        <button
                          onClick={async () => {
                            try {
                              await removeMemberFromProject(project.id, m.userId);
                              showSuccess(`${m.fullName} removed from project`);
                            } catch {
                              showError('Failed to remove member');
                            }
                          }}
                          className="transition-opacity text-gray-300 hover:text-red-500"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  )) : (
                    <p className="text-center text-[10px] text-gray-400 font-black uppercase tracking-widest py-3">No members yet</p>
                  )}
                </CardContent>
              </Card>
            </section>

            {/* Add Members Modal */}
            {isAddMembersOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                    <h2 className="text-[11px] font-black uppercase tracking-widest text-gray-700 dark:text-gray-300">Add Team Members</h2>
                    <button onClick={() => setIsAddMembersOpen(false)} className="text-gray-400 hover:text-gray-600">
                      <X size={14} />
                    </button>
                  </div>
                  <div className="px-4 py-2 max-h-64 overflow-y-auto custom-scrollbar space-y-0.5">
                    {nonMembers.length === 0 ? (
                      <p className="text-center text-[10px] text-gray-400 font-bold py-4">All users are already members</p>
                    ) : nonMembers.map(u => (
                      <label key={u.id} className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors">
                        <input
                          type="checkbox"
                          className="rounded accent-indigo-600"
                          checked={selectedUserIds.includes(u.id)}
                          onChange={e => {
                            setSelectedUserIds(prev =>
                              e.target.checked ? [...prev, u.id] : prev.filter(id => id !== u.id)
                            );
                          }}
                        />
                        <img
                          src={u.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.name)}&background=random&size=32`}
                          alt={u.name}
                          className="h-6 w-6 rounded-full object-cover border border-gray-100 dark:border-gray-800"
                        />
                        <div>
                          <p className="text-[12px] font-bold text-gray-900 dark:text-gray-100">{u.name}</p>
                          <p className="text-[9px] text-gray-400 uppercase font-black tracking-widest">{u.role}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                  <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50">
                    <span className="text-[10px] text-gray-400 font-bold">{selectedUserIds.length} selected</span>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setIsAddMembersOpen(false)}>Cancel</Button>
                      <Button
                        size="sm"
                        disabled={selectedUserIds.length === 0}
                        onClick={async () => {
                          try {
                            const currentMemberIds = (project.members || []).map(m => m.userId);
                            await updateProjectMembers(project.id, [...currentMemberIds, ...selectedUserIds]);
                            showSuccess(`${selectedUserIds.length} member(s) added`);
                            setIsAddMembersOpen(false);
                          } catch {
                            showError('Failed to add members');
                          }
                        }}
                      >
                        Add Members
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Created By Section */}
            <section className="space-y-1.5">
              <h3 className="text-[9px] font-black uppercase tracking-widest text-gray-400 px-1 flex items-center gap-1">
                <UserCheck size={10} className="text-indigo-400" /> Created By
              </h3>
              <Card className="shadow-sm">
                <CardContent className="p-2.5 flex items-center justify-between">
                  <span className="text-[12px] font-bold text-gray-900 dark:text-gray-100 uppercase tracking-tight">
                    {project.createdByName || 'Unknown'}
                  </span>
                  {project.createdAt && (
                    <span className="text-[9px] font-mono text-gray-400 font-bold">{formatDate(project.createdAt)}</span>
                  )}
                </CardContent>
              </Card>
            </section>

            {/* Ownership History */}
            {project.assignmentHistory && project.assignmentHistory.length > 0 && (
              <section className="space-y-1.5">
                <h3 className="text-[9px] font-black uppercase tracking-widest text-gray-400 px-1 flex items-center gap-1">
                  <History size={10} className="text-amber-500" /> Ownership History
                </h3>
                <Card className="shadow-sm">
                  <CardContent className="p-1.5 space-y-0.5">
                    {project.assignmentHistory.map(h => (
                      <div key={h.id} className="p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-[9px] font-mono text-gray-400">{formatDateTime(h.changedAt)}</span>
                          <span className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 bg-amber-50 dark:bg-amber-900/20 text-amber-600 rounded">{h.reasonTag}</span>
                        </div>
                        <div className="flex items-center gap-1 text-[10px] font-bold text-gray-600 dark:text-gray-400">
                          <span className="opacity-60">{h.previousOwnerName}</span>
                          <span className="opacity-30">→</span>
                          <span className="text-indigo-600">{h.newOwnerName}</span>
                        </div>
                        <div className="text-[9px] text-gray-400 mt-0.5">by {h.changedByName}</div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </section>
            )}

            {/* Activity Timeline */}
            <section className="space-y-1.5">
              <h3 className="text-[9px] font-black uppercase tracking-widest text-gray-400 px-1">Timeline</h3>
              <Card className="shadow-sm overflow-hidden">
                <CardContent className="p-0">
                  <ul className="divide-y divide-gray-50 dark:divide-gray-900">
                    {projectActivities.slice(0, 5).map(activity => (
                      <li key={activity.id} className="p-2.5">
                        <p className="text-[11px] text-gray-600 dark:text-gray-400 leading-tight">
                          <span className="font-bold text-gray-900 dark:text-gray-200">{activity.userName}</span> {activity.action} {' '}
                          <InteractiveLink type={activity.targetType} id={activity.targetId} className="font-black text-indigo-600/80 uppercase text-[10px] tracking-tighter">
                            {activity.targetName}
                          </InteractiveLink>
                        </p>
                        <div className="flex items-center text-[9px] text-gray-400 font-bold uppercase mt-1 font-mono">
                          <Clock size={10} className="mr-1" />
                          {formatDateTime(activity.timestamp)}
                        </div>
                      </li>
                    ))}
                    {projectActivities.length === 0 && (
                      <li className="p-6 text-center text-[9px] text-gray-400 uppercase font-black tracking-widest">Idle</li>
                    )}
                  </ul>
                </CardContent>
              </Card>
            </section>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
