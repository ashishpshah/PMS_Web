import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { PageHeader } from '../components/ui/PageHeader';
import { Card, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Mail, Shield, Briefcase, CheckCircle2, ChevronLeft, MapPin, Clock, ListTodo, AlertCircle, Check, Save, X } from 'lucide-react';
import { InteractiveLink } from '../components/ui/InteractiveLink';
import { cn, formatDateTime, toHHMM } from '../lib/utils';
import { PageTransition } from '../components/Layout/PageTransition';
import { EmptyState } from '../components/ui/EmptyState';
import { useAuth } from '../context/AuthContext';
import { permissionService, PageModule, UserPermission, PermissionUpdate } from '../services/permission.service';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { VSelect, SelectOption } from '../components/forms/VSelect';
import { useSweetAlert } from '../context/SweetAlertContext';
import { showError, showSuccess } from '../lib/toast';

const PERMISSION_OPTIONS = [
  { value: 0, label: 'Inherit from Role' },
  { value: 1, label: 'View Only' },
  { value: 3, label: 'View + Create' },
  { value: 5, label: 'View + Update' },
  { value: 9, label: 'View + Delete' },
  { value: 7, label: 'View + Create + Update' },
  { value: 15, label: 'Full Access' },
];

export default function UserDetails() {
  const { id } = useParams<{ id: string }>();
  const { users, tasks, projects, activities } = useData();
  const { isSystemAdmin } = useAuth();
  const navigate = useNavigate();
  const { confirmAlert } = useSweetAlert();
  
  const [pageModules, setPageModules] = useState<PageModule[]>([]);
  const [userPermissions, setUserPermissions] = useState<UserPermission[]>([]);
  const [localPermissions, setLocalPermissions] = useState<{ [key: number]: number }>({});
  const [isLoadingPerms, setIsLoadingPerms] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isSystemAdmin && id) {
      loadPermissions();
    }
  }, [isSystemAdmin, id]);

  const loadPermissions = async () => {
    if (!id) return;
    setIsLoadingPerms(true);
    try {
      const [pages, perms] = await Promise.all([
        permissionService.getPageModules(),
        permissionService.getUserPermissions(Number(id)),
      ]);
      setPageModules(pages);
      setUserPermissions(perms);

      const localPerms: { [key: number]: number } = {};
      perms.forEach(p => {
        localPerms[p.pageModuleId] = p.permissions;
      });
      setLocalPermissions(localPerms);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load permissions');
    } finally {
      setIsLoadingPerms(false);
    }
  };

  const handleSavePermissions = async () => {
    if (!id) return;
    setIsSaving(true);
    try {
      const updates: PermissionUpdate[] = Object.entries(localPermissions)
        .filter(([, perms]) => perms > 0)
        .map(([pageId, perms]) => ({
          pageModuleId: Number(pageId),
          permissions: perms,
        }));

      await permissionService.updateUserPermissions(Number(id), updates);
      showSuccess('Permissions saved successfully!');
      loadPermissions();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to save permissions');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearPermissions = () => {
    if (!id) return;
    confirmAlert('Clear all user-specific permission overrides?', async () => {
      try {
        await permissionService.clearUserPermissions(Number(id));
        setLocalPermissions({});
        showSuccess('User permissions cleared. Now using role-based permissions.');
      } catch (err) {
        showError(err instanceof Error ? err.message : 'Failed to clear permissions');
      }
    });
  };

  const updateLocalPermission = (pageModuleId: number, permissions: number) => {
    setLocalPermissions(prev => ({
      ...prev,
      [pageModuleId]: permissions,
    }));
  };

  const user = users.find(u => u.id === Number(id));
  if (!user) {
    return (
      <PageTransition>
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <EmptyState 
            icon={AlertCircle}
            title="Member not found"
            description="The team member you are looking for does not exist or has been removed."
            actionLabel="Back to Users"
            onAction={() => navigate('/users')}
          />
        </div>
      </PageTransition>
    );
  }

  const userTasks = tasks.filter(t => t.assigneeId === user.id);
  const userProjects = projects.filter(p => p.ownerId === user.id);
  const completedTasks = userTasks.filter(t => t.status === 'completed').length;
  const userActivities = activities.filter(a => a.userId === user.id);

  return (
    <PageTransition>
      <div className="space-y-4 max-w-7xl mx-auto">
        <nav className="flex items-center text-[10px] font-black uppercase text-gray-400 tracking-widest px-1">
          <Link to="/users" className="hover:text-indigo-600 flex items-center transition-colors">
            <ChevronLeft size={14} className="mr-1" /> Users
          </Link>
          <span className="mx-2 opacity-30">/</span>
          <span className="text-gray-900 dark:text-gray-100 italic tracking-tighter">{user.name}</span>
        </nav>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
          {/* Profile Card */}
          <div className="md:col-span-3">
            <Card className="overflow-hidden border-none shadow-md ring-1 ring-black/5 dark:ring-white/5">
              <div className="h-16 bg-indigo-600" />
              <CardContent className="p-4 relative -mt-6">
                <div className="relative inline-block mb-3">
                  <img 
                    src={user.avatar} 
                    alt={user.name} 
                    className="h-14 w-14 rounded-xl object-cover border-2 border-white dark:border-gray-900 shadow-sm"
                  />
                  <div className="absolute -bottom-1 -right-1 h-3 w-3 bg-emerald-500 rounded-full border-2 border-white dark:border-gray-900 shadow-sm" />
                </div>
                
                <div className="space-y-1 mb-4">
                  <h1 className="text-[15px] font-black text-gray-900 dark:text-gray-100 uppercase italic tracking-tighter leading-none font-display">{user.name}</h1>
                  <div className="inline-flex px-1.5 py-0.5 bg-indigo-50 dark:bg-indigo-900/30 rounded border border-indigo-100/30">
                    <span className="text-[9px] font-black uppercase text-indigo-600 tracking-widest">{user.role}</span>
                  </div>
                </div>

                <div className="space-y-1.5 text-left border-b border-gray-50 dark:border-gray-900 pb-4 mb-4">
                  <div className="flex items-center text-[11px] text-gray-500 font-medium truncate">
                    <Mail size={10} className="mr-2 text-indigo-400 shrink-0" />
                    <span className="truncate">{user.email}</span>
                  </div>
                  <div className="flex items-center text-[11px] text-gray-500 font-medium">
                    <MapPin size={10} className="mr-2 text-indigo-400 shrink-0" />
                    <span>San Francisco, CA</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-4">
                  <div className="bg-gray-50 dark:bg-gray-900/50 p-2 rounded-md border border-gray-100 dark:border-gray-800 text-center">
                    <div className="text-base font-black font-mono text-indigo-600 leading-none">{userTasks.length}</div>
                    <div className="text-[8px] uppercase font-black text-gray-400 tracking-tighter mt-1">Units</div>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-900/50 p-2 rounded-md border border-gray-100 dark:border-gray-800 text-center">
                    <div className="text-base font-black font-mono text-emerald-500 leading-none">{completedTasks}</div>
                    <div className="text-[8px] uppercase font-black text-gray-400 tracking-tighter mt-1">Ready</div>
                  </div>
                </div>

                <Button className="w-full font-black uppercase h-8 text-[11px] tracking-widest" size="sm">Connect</Button>
              </CardContent>
            </Card>
          </div>

          {/* Dynamic Content */}
          <div className="md:col-span-9 space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Active Assignments */}
              <section className="space-y-1.5">
                <h2 className="text-[10px] font-black uppercase tracking-widest text-gray-400 flex items-center px-1">
                  <Briefcase size={12} className="mr-2 text-indigo-500" /> Current Assignments
                </h2>
                <div className="space-y-2">
                  {userTasks.slice(0, 4).map(task => (
                    <Card key={task.id} className="hover:border-indigo-300 transform transition-all cursor-pointer shadow-sm">
                      <CardContent className="p-2.5 flex justify-between items-center bg-gray-50/20">
                        <div className="overflow-hidden mr-2">
                          <InteractiveLink type="task" id={task.id}>
                            <h4 className="font-bold text-[12px] hover:text-indigo-600 transition-colors uppercase tracking-tight truncate font-display">{task.title}</h4>
                          </InteractiveLink>
                          <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-0.5 font-mono flex items-center gap-1">
                            <Clock size={9} className="opacity-60" /> {task.estimatedHours != null ? toHHMM(task.estimatedHours) : '—'}
                          </p>
                        </div>
                        <Badge variant={task.status === 'completed' ? 'success' : 'info'} className="text-[9px] uppercase tracking-tighter h-5">{task.status}</Badge>
                      </CardContent>
                    </Card>
                  ))}
                  {userTasks.length === 0 && (
                    <div className="p-8 bg-gray-50/50 dark:bg-gray-900/30 rounded-xl border border-dashed border-gray-100 dark:border-gray-800 text-center">
                      <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 italic">Idle State</p>
                    </div>
                  )}
                </div>
              </section>

              {/* Managed Projects */}
              <section className="space-y-1.5">
                <h2 className="text-[10px] font-black uppercase tracking-widest text-gray-400 flex items-center px-1">
                  <ListTodo size={12} className="mr-2 text-indigo-500" /> Owned Projects
                </h2>
                <div className="space-y-2">
                  {userProjects.map(proj => (
                    <Card key={proj.id} className="bg-white dark:bg-gray-900 border-gray-100 dark:border-gray-800 hover:bg-gray-50/50 transition-all shadow-sm">
                      <CardContent className="p-2.5 flex flex-col">
                        <div className="flex justify-between items-start mb-2">
                          <InteractiveLink type="project" id={proj.id} className="font-black italic uppercase tracking-tighter text-[13px] text-gray-900 dark:text-gray-100 hover:text-indigo-600 truncate leading-none">
                            {proj.name}
                          </InteractiveLink>
                          <span className="text-[10px] font-black font-mono text-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 px-1 py-0.5 rounded leading-none border border-indigo-100/30">{proj.progress}%</span>
                        </div>
                        <div className="w-full h-1 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-500 shadow-sm" style={{ width: `${proj.progress}%` }} />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {userProjects.length === 0 && (
                    <div className="p-8 bg-gray-50/50 dark:bg-gray-900/30 rounded-xl border border-dashed border-gray-100 dark:border-gray-800 text-center">
                      <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 italic">No Lead Projects</p>
                    </div>
                  )}
                </div>
              </section>

              {/* Project Clearances */}
              <section className="md:col-span-2 space-y-1.5">
                <h2 className="text-[10px] font-black uppercase tracking-widest text-gray-400 flex items-center px-1">
                  <Shield size={12} className="mr-2 text-indigo-500" /> Control Clearances
                </h2>
                <Card className="shadow-sm overflow-hidden border-gray-100/50">
                  <CardContent className="p-0">
                    <div className="w-full">
                      <div className="grid grid-cols-12 gap-2 p-3 bg-gray-50/50 dark:bg-gray-900/50 border-b border-gray-100 dark:border-gray-900">
                        <div className="col-span-8 text-[9px] font-black uppercase text-gray-400 tracking-widest">Designated Project</div>
                        <div className="col-span-4 text-[9px] font-black uppercase text-gray-400 tracking-widest text-right px-2">Access Type</div>
                      </div>
                      <div className="divide-y divide-gray-50 dark:divide-gray-900">
                        {user.permissions?.map(perm => {
                          const project = projects.find(p => p.id === perm.projectId);
                          if (!project) return null;
                          return (
                            <div key={perm.projectId} className="grid grid-cols-12 gap-2 p-3 items-center hover:bg-gray-50/30 transition-colors">
                              <div className="col-span-8 min-w-0 flex flex-col">
                                <InteractiveLink type="project" id={project.id} className="font-bold text-[12px] uppercase tracking-tight text-gray-900 dark:text-gray-100 truncate hover:text-indigo-600 transition-colors">
                                  {project.name}
                                </InteractiveLink>
                                <span className="text-[8px] uppercase font-black text-gray-400 tracking-tighter">SEC_ID: {project.id}</span>
                              </div>
                              <div className="col-span-4 flex justify-end px-1">
                                <Badge 
                                  variant={perm.access === 'manage' ? 'warning' : perm.access === 'edit' ? 'info' : 'default'}
                                  className="uppercase text-[8px] font-black tracking-widest px-2 h-4.5"
                                >
                                  {perm.access}
                                </Badge>
                              </div>
                            </div>
                          );
                        })}
                        {(!user.permissions || user.permissions.length === 0) && (
                          <div className="p-8 text-center bg-white dark:bg-gray-950">
                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 italic">No Specialized Clearances Detected</p>
                            <p className="text-[8px] uppercase font-bold text-gray-300 mt-1">Check team settings to provision access</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </section>

              {/* Page Permissions Override */}
              {isSystemAdmin && (
                <section className="md:col-span-2 space-y-1.5">
                  <h2 className="text-[10px] font-black uppercase tracking-widest text-gray-400 flex items-center px-1">
                    <Shield size={12} className="mr-2 text-indigo-500" /> Page Permissions Override
                  </h2>
                  <Card className="shadow-sm overflow-hidden border-gray-100/50">
                    <CardContent className="p-0">
                      {isLoadingPerms ? (
                        <LoadingSpinner className="p-8" />
                      ) : (
                        <div className="max-h-[300px] overflow-y-auto">
                          <div className="grid grid-cols-12 gap-2 p-3 bg-gray-50/50 dark:bg-gray-900/50 border-b border-gray-100 dark:border-gray-900 sticky top-0">
                            <div className="col-span-6 text-[9px] font-black uppercase text-gray-400 tracking-widest">Page / Module</div>
                            <div className="col-span-6 text-[9px] font-black uppercase text-gray-400 tracking-widest text-right">Permission Level</div>
                          </div>
                          <div className="divide-y divide-gray-50 dark:divide-gray-900">
                            {pageModules.map(pm => (
                              <div key={pm.id} className="grid grid-cols-12 gap-2 p-3 items-center hover:bg-gray-50/30 transition-colors">
                                <div className="col-span-6 min-w-0 flex flex-col">
                                  <span className="font-bold text-[12px] uppercase tracking-tight text-gray-900 dark:text-gray-100 truncate">
                                    {pm.name}
                                  </span>
                                  <span className="text-[8px] uppercase font-black text-gray-400 tracking-tighter">{pm.route}</span>
                                </div>
                                <div className="col-span-6 flex justify-end">
                                  <VSelect
                                    options={PERMISSION_OPTIONS}
                                    value={PERMISSION_OPTIONS.find(o => o.value === (localPermissions[pm.id] || 0)) ?? null}
                                    onChange={(opt: SelectOption | null) => updateLocalPermission(pm.id, opt ? Number(opt.value) : 0)}
                                    isSearchable={false}
                                    size="sm"
                                    className="w-48"
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                          <div className="p-3 border-t border-gray-100 dark:border-gray-900 bg-gray-50/50 dark:bg-gray-900/30 flex gap-2">
                            <Button 
                              onClick={handleSavePermissions} 
                              disabled={isSaving} 
                              className="flex-1 text-[10px] h-8"
                            >
                              <Save className="mr-1.5 h-3 w-3" /> {isSaving ? 'Saving...' : 'Save Override'}
                            </Button>
                            <Button 
                              variant="secondary" 
                              onClick={handleClearPermissions}
                              className="flex-1 text-[10px] h-8"
                            >
                              <X className="mr-1.5 h-3 w-3" /> Clear
                            </Button>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </section>
              )}
            </div>

            {/* Activity Logs */}
            <section className="space-y-1.5">
              <h2 className="text-[10px] font-black uppercase tracking-widest text-gray-400 flex items-center px-1">
                <Clock size={12} className="mr-2 text-indigo-500" /> Activity stream
              </h2>
              <Card className="shadow-sm overflow-hidden border-gray-100/50">
                <CardContent className="p-0">
                  <div className="divide-y divide-gray-50 dark:divide-gray-900">
                    {userActivities.slice(0, 5).map((activity) => (
                      <div key={activity.id} className="p-3 flex items-start space-x-3 group">
                        <div className="h-6 w-6 rounded bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center shrink-0 border border-indigo-100 dark:border-indigo-900/40">
                          <img src={user.avatar} className="h-4 w-4 rounded-sm object-cover" alt="" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] text-gray-600 dark:text-gray-400 leading-snug">
                            <span className="font-bold text-gray-900 dark:text-gray-200">{user.name}</span> {' '}
                            <span className="opacity-80 italic">{activity.action}</span> {' '}
                            <InteractiveLink type={activity.targetType} id={activity.targetId} className="font-black text-indigo-600 hover:underline uppercase text-[11px] tracking-tighter">
                              {activity.targetName}
                            </InteractiveLink>
                          </p>
                          <time className="text-[9px] font-black text-gray-400 uppercase mt-1 block font-mono">{formatDateTime(activity.timestamp)}</time>
                        </div>
                      </div>
                    ))}
                    {userActivities.length === 0 && (
                      <div className="text-center py-8">
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 italic">Silent stream</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </section>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
