import React, { useState, useRef, useMemo } from 'react';
import { Plus, Filter, Search, Calendar, User, LayoutGrid, List, Edit2, Trash2, FolderKanban, X, History, ChevronDown, Check, ChevronLeft, ChevronRight, ChevronUp, ArrowUpDown } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { Button } from '../components/ui/Button';
import { Card, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { Project, ProjectStatus, Attachment, PROJECT_STATUS_LABELS, PROJECT_STATUS_BADGE_VARIANT } from '../types';
import { cn, formatDate, formatDateTime, toInputDate } from '../lib/utils';
import { FileUploader } from '../components/ui/FileUploader';
import { DateInput } from '../components/ui/DateInput';
import { InteractiveLink } from '../components/ui/InteractiveLink';
import { PageHeader } from '../components/ui/PageHeader';
import { EmptyState } from '../components/ui/EmptyState';
import { PageTransition } from '../components/Layout/PageTransition';
import { useSweetAlert } from '../context/SweetAlertContext';
import { exportProjects, getSampleProjectCSV, getSampleTaskCSV, getSampleProjectWithTasksCSV, parseCSV } from '../lib/importExport';
import { showSuccess, showError } from '../lib/toast';
import { VSelect, SelectOption } from '../components/forms/VSelect';

export default function Projects() {
  const { projects, users, assignableUsers, tasks, addProject, updateProject, deleteProject, addActivity, updateProjectMembers } = useData();
  const { isAdmin, user: currentUser } = useAuth();
  const { canCreate: canCreateProject, canUpdate: canUpdateProject, canDelete: canDeleteProject } = usePermissions();

  // Create/Edit/Delete Project is restricted to IsAdmin users (on top of the page-permission bitmap).
  const canManageProjects = isAdmin;
  // Owner dropdown only lists IsAdmin users, excluding SystemAdmin (roleId 1).
  const ownerOptions = assignableUsers.filter(
    u => u.isAdmin === true && u.roleId !== 1
  );
  const { showAlert, confirmAlert } = useSweetAlert();
  const [view, setView] = useState<'grid' | 'table'>('grid');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [ownerHistoryProjectId, setOwnerHistoryProjectId] = useState<number | null>(null);
  const [projectModules, setProjectModules] = useState<string[]>([]);
  const [moduleInput, setModuleInput] = useState('');
  const [formStatus, setFormStatus] = useState<ProjectStatus>('active');
  const [formOwnerId, setFormOwnerId] = useState<number>(0);
  const [formMemberIds, setFormMemberIds] = useState<number[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── filter state ──────────────────────────────────────────────────────────
  const [filterStatuses, setFilterStatuses] = useState<string[]>([]);
  const [filterOwnerIds, setFilterOwnerIds] = useState<number[]>([]);
  const [progressFrom, setProgressFrom]     = useState('');
  const [progressTo, setProgressTo]         = useState('');
  const [statusDropOpen, setStatusDropOpen] = useState(false);
  const [ownerDropOpen, setOwnerDropOpen]   = useState(false);

  // ── sort / pagination ─────────────────────────────────────────────────────
  const [tableSortField, setTableSortField] = useState('name');
  const [tableSortDir, setTableSortDir]     = useState<'asc' | 'desc'>('asc');
  const [projPage, setProjPage]             = useState(1);
  const [projPageSize, setProjPageSize]     = useState(10);

  const handleAddModule = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const m = moduleInput.replace(/,/g, '').trim();
      if (m && !projectModules.some(x => x.toLowerCase() === m.toLowerCase())) {
        setProjectModules(prev => [...prev, m]);
      }
      setModuleInput('');
    }
  };

  const removeModule = (mod: string) => {
    setProjectModules(prev => prev.filter(m => m !== mod));
  };

  const handleExport = () => {
    if (projects.length === 0) {
      showAlert('No projects to export', 'warning');
      return;
    }
    exportProjects(projects);
    showAlert('Projects exported successfully', 'success');
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    try {
      const data = await parseCSV(file);
      showAlert(`Found ${data.length} projects to import`, 'info');
      // TODO: Process imported data
      showAlert('Import functionality coming soon', 'info');
    } catch (err) {
      showAlert('Failed to parse CSV file', 'error');
    }
    
    e.target.value = '';
  };

  const handleSampleDownload = (type: 'projects' | 'tasks' | 'projectWithTasks') => {
    if (type === 'projects') getSampleProjectCSV();
    else if (type === 'tasks') getSampleTaskCSV();
    else getSampleProjectWithTasksCSV();
    showAlert('Sample file downloaded', 'success');
  };

  const calculateProjectProgress = (projectId: number) => {
    const projectTasks = tasks.filter(t => t.projectId === projectId);
    if (projectTasks.length === 0) return 0;
    const completedTasks = projectTasks.filter(t => t.status === 'completed').length;
    return Math.round((completedTasks / projectTasks.length) * 100);
  };

  // Precompute progress once for filtering + sorting
  const progressMap = useMemo(() => {
    const m = new Map<number, number>();
    for (const p of projects) m.set(p.id, calculateProjectProgress(p.id));
    return m;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, tasks]);

  const filteredSortedProjects = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    let result = projects.filter(p => {
      if (filterStatuses.length > 0 && !filterStatuses.includes(p.status)) return false;
      if (filterOwnerIds.length > 0 && !filterOwnerIds.includes(p.ownerId)) return false;
      const prog = progressMap.get(p.id) ?? 0;
      if (progressFrom !== '') { const f = Number(progressFrom); if (!isNaN(f) && prog < f) return false; }
      if (progressTo   !== '') { const t = Number(progressTo);   if (!isNaN(t) && prog > t) return false; }
      if (q) return (
        (p.code?.toLowerCase() || '').includes(q) ||
        (p.name?.toLowerCase() || '').includes(q) ||
        (p.description?.toLowerCase() || '').includes(q) ||
        (p.status?.toLowerCase() || '').includes(q)
      );
      return true;
    });
    result = [...result].sort((a, b) => {
      let cmp = 0;
      if      (tableSortField === 'name')      cmp = a.name.localeCompare(b.name);
      else if (tableSortField === 'status')    cmp = a.status.localeCompare(b.status);
      else if (tableSortField === 'startDate') cmp = (a.startDate || '').localeCompare(b.startDate || '');
      else if (tableSortField === 'endDate')   cmp = (a.endDate   || '').localeCompare(b.endDate   || '');
      else if (tableSortField === 'progress')  cmp = (progressMap.get(a.id) ?? 0) - (progressMap.get(b.id) ?? 0);
      else if (tableSortField === 'owner') {
        const oa = users.find(u => u.id === a.ownerId)?.name || '';
        const ob = users.find(u => u.id === b.ownerId)?.name || '';
        cmp = oa.localeCompare(ob);
      }
      return tableSortDir === 'asc' ? cmp : -cmp;
    });
    return result;
  }, [projects, searchQuery, filterStatuses, filterOwnerIds, progressFrom, progressTo, tableSortField, tableSortDir, progressMap, users]);

  const totalProjPages   = Math.max(1, Math.ceil(filteredSortedProjects.length / projPageSize));
  const paginatedProjects = filteredSortedProjects.slice((projPage - 1) * projPageSize, projPage * projPageSize);

  const hasActiveFilters = !!(searchQuery || filterStatuses.length || filterOwnerIds.length || progressFrom || progressTo);

  const clearFilters = () => {
    setSearchQuery('');
    setFilterStatuses([]);
    setFilterOwnerIds([]);
    setProgressFrom('');
    setProgressTo('');
    setStatusDropOpen(false);
    setOwnerDropOpen(false);
    setProjPage(1);
  };

  const toggleSort = (field: string) => {
    if (tableSortField === field) setTableSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setTableSortField(field); setTableSortDir('asc'); }
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (tableSortField !== field) return <ArrowUpDown size={11} className="ml-1 inline opacity-30" />;
    return tableSortDir === 'asc'
      ? <ChevronUp size={11} className="ml-1 inline text-indigo-500" />
      : <ChevronDown size={11} className="ml-1 inline text-indigo-500" />;
  };

  const PaginationBar = ({ total }: { total: number }) => (
    <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-50 dark:border-gray-900 bg-gray-50/30 dark:bg-gray-900/30">
      <div className="flex items-center gap-2 text-[11px] text-gray-500">
        <span className="whitespace-nowrap">Rows per page:</span>
        <VSelect
          options={[10, 25, 50, 100].map((n): SelectOption => ({ value: n, label: String(n) }))}
          value={{ value: projPageSize, label: String(projPageSize) }}
          onChange={opt => { if (opt) { setProjPageSize(Number(opt.value)); setProjPage(1); } }}
          isSearchable={false}
          size="sm"
          className="w-20"
        />
      </div>
      <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
        <span className="whitespace-nowrap">
          {total === 0 ? '0' : `${(projPage - 1) * projPageSize + 1}–${Math.min(projPage * projPageSize, total)}`} of {total}
        </span>
        <div className="flex items-center gap-0.5">
          <button onClick={() => setProjPage(1)} disabled={projPage === 1}
            className="p-1 rounded border border-gray-200 dark:border-gray-700 disabled:opacity-30 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" title="First">
            <ChevronLeft size={11} />
          </button>
          <button onClick={() => setProjPage(p => Math.max(1, p - 1))} disabled={projPage === 1}
            className="p-1 rounded border border-gray-200 dark:border-gray-700 disabled:opacity-30 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" title="Prev">
            <ChevronLeft size={13} />
          </button>
          <span className="px-2 py-0.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-[11px] font-bold min-w-[60px] text-center">
            {projPage} / {totalProjPages}
          </span>
          <button onClick={() => setProjPage(p => Math.min(totalProjPages, p + 1))} disabled={projPage === totalProjPages}
            className="p-1 rounded border border-gray-200 dark:border-gray-700 disabled:opacity-30 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" title="Next">
            <ChevronRight size={13} />
          </button>
          <button onClick={() => setProjPage(totalProjPages)} disabled={projPage === totalProjPages}
            className="p-1 rounded border border-gray-200 dark:border-gray-700 disabled:opacity-30 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" title="Last">
            <ChevronRight size={11} />
          </button>
        </div>
      </div>
    </div>
  );

  const handleOpenModal = (project?: Project) => {
    if (project) {
      setEditingProject(project);
      setAttachments(project.attachments || []);
      setProjectModules(project.modules ?? []);
      setFormStatus((project.status as ProjectStatus) || 'active');
      setFormOwnerId(project.ownerId ?? currentUser?.id ?? 0);
      setFormMemberIds(project.memberIds ?? []);
    } else {
      setEditingProject(null);
      setAttachments([]);
      setProjectModules([]);
      setFormStatus('active');
      setFormOwnerId(currentUser?.id ?? 0);
      setFormMemberIds([]);
    }
    setModuleInput('');
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const projectData: Project = {
      id: editingProject?.id ?? 0,
      name: formData.get('name') as string,
      description: formData.get('description') as string,
      status: formStatus,
      progress: 0,
      startDate: formData.get('startDate') as string,
      endDate: formData.get('endDate') as string,
      ownerId: formOwnerId || currentUser?.id || 0,
      attachments: attachments,
      modules: projectModules,
    };

    try {
      if (editingProject) {
        await updateProject(projectData);
        await updateProjectMembers(projectData.id, formMemberIds);
        await addActivity({ userId: 1, userName: 'Admin', action: 'updated project', targetType: 'project', targetId: projectData.id, targetName: projectData.name });
      } else {
        const newProject = await addProject(projectData);
        if (formMemberIds.length > 0) await updateProjectMembers(newProject.id, formMemberIds);
        await addActivity({ userId: 1, userName: 'Admin', action: 'created project', targetType: 'project', targetId: newProject.id, targetName: newProject.name });
      }
      showSuccess(editingProject ? 'Project updated successfully' : 'Project created successfully');
      setIsModalOpen(false);
      setEditingProject(null);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to save project');
    }
  };

  return (
    <PageTransition>
      <div className="space-y-6 max-w-7xl mx-auto">
        <PageHeader 
          title="Projects" 
          description="Manage and track your ongoing initiatives."
        >
          {canManageProjects && canCreateProject('/projects') && (
            <Button onClick={() => handleOpenModal()}>
              <Plus className="mr-2 h-5 w-5" /> New Project
            </Button>
          )}
        </PageHeader>

        {/* Filters/Toolbar */}
        <Card className="p-0 border-none shadow-sm ring-1 ring-black/5 dark:ring-white/5">
          <CardContent className="p-3">
            <div className="flex flex-wrap items-center gap-2">

              {/* Search */}
              <div className="relative flex-1 min-w-[180px] group">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 group-focus-within:text-indigo-500 transition-colors" />
                <input type="text" placeholder="Search code, name, description…" value={searchQuery}
                  onChange={e => { setSearchQuery(e.target.value); setProjPage(1); }}
                  className="w-full pl-9 pr-7 py-1.5 bg-gray-50 dark:bg-gray-900 border border-transparent focus:border-indigo-500/30 focus:bg-white dark:focus:bg-gray-800 transition-all rounded-md text-[13px] outline-none" />
                {searchQuery && (
                  <button onClick={() => { setSearchQuery(''); setProjPage(1); }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={12} /></button>
                )}
              </div>

              {/* Status filter */}
              <div className="relative">
                <button onClick={() => { setStatusDropOpen(o => !o); setOwnerDropOpen(false); }}
                  className={cn("flex items-center gap-1.5 py-1.5 pl-3 pr-2.5 rounded-md text-[12px] font-medium border transition-all select-none",
                    filterStatuses.length > 0 ? "bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-700/50 text-indigo-700 dark:text-indigo-300" : "bg-gray-50 dark:bg-gray-900 border-transparent text-gray-600 dark:text-gray-400 hover:bg-gray-100"
                  )}>
                  <Filter size={13} />
                  <span>Status{filterStatuses.length > 0 ? ` (${filterStatuses.length})` : ''}</span>
                  <ChevronDown size={12} className={cn("transition-transform", statusDropOpen && "rotate-180")} />
                </button>
                {statusDropOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setStatusDropOpen(false)} />
                    <div className="absolute z-50 top-full left-0 mt-1 w-44 bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-100 dark:border-gray-800 p-1">
                      {([['active', 'Active', 'bg-emerald-500'], ['on-hold', 'On Hold', 'bg-amber-500'], ['completed', 'Completed', 'bg-blue-500']] as const).map(([val, label, dot]) => (
                        <button key={val} onClick={() => { setFilterStatuses(prev => prev.includes(val) ? prev.filter(s => s !== val) : [...prev, val]); setProjPage(1); }}
                          className={cn("w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] transition-colors",
                            filterStatuses.includes(val) ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300" : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                          )}>
                          <span className={cn("h-2 w-2 rounded-full shrink-0", dot)} />
                          <span className="flex-1 text-left">{label}</span>
                          {filterStatuses.includes(val) && <Check size={12} />}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Owner filter */}
              <div className="relative">
                <button onClick={() => { setOwnerDropOpen(o => !o); setStatusDropOpen(false); }}
                  className={cn("flex items-center gap-1.5 py-1.5 pl-3 pr-2.5 rounded-md text-[12px] font-medium border transition-all select-none",
                    filterOwnerIds.length > 0 ? "bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-700/50 text-indigo-700 dark:text-indigo-300" : "bg-gray-50 dark:bg-gray-900 border-transparent text-gray-600 dark:text-gray-400 hover:bg-gray-100"
                  )}>
                  <User size={13} />
                  <span>Owner{filterOwnerIds.length > 0 ? ` (${filterOwnerIds.length})` : ''}</span>
                  <ChevronDown size={12} className={cn("transition-transform", ownerDropOpen && "rotate-180")} />
                </button>
                {ownerDropOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setOwnerDropOpen(false)} />
                    <div className="absolute z-50 top-full left-0 mt-1 w-52 bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-100 dark:border-gray-800 p-1 max-h-64 overflow-y-auto custom-scrollbar">
                      {ownerOptions.map(u => (
                        <button key={u.id} onClick={() => { setFilterOwnerIds(prev => prev.includes(u.id) ? prev.filter(id => id !== u.id) : [...prev, u.id]); setProjPage(1); }}
                          className={cn("w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] transition-colors",
                            filterOwnerIds.includes(u.id) ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300" : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                          )}>
                          <img src={u.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.name)}&size=24`} alt="" className="h-5 w-5 rounded-full object-cover shrink-0" />
                          <span className="flex-1 text-left truncate">{u.name}</span>
                          {filterOwnerIds.includes(u.id) && <Check size={12} />}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Progress range */}
              <div className="flex items-center gap-1.5 py-1.5 px-3 rounded-md bg-gray-50 dark:bg-gray-900 border border-transparent text-[12px]">
                <span className="text-gray-500 dark:text-gray-400 font-medium whitespace-nowrap">Progress %</span>
                <input type="number" min="0" max="100" placeholder="0" value={progressFrom}
                  onChange={e => { setProgressFrom(e.target.value); setProjPage(1); }}
                  className="w-12 bg-transparent text-center text-[12px] outline-none border-b border-gray-200 dark:border-gray-700 focus:border-indigo-400 text-gray-700 dark:text-gray-200" />
                <span className="text-gray-400">–</span>
                <input type="number" min="0" max="100" placeholder="100" value={progressTo}
                  onChange={e => { setProgressTo(e.target.value); setProjPage(1); }}
                  className="w-12 bg-transparent text-center text-[12px] outline-none border-b border-gray-200 dark:border-gray-700 focus:border-indigo-400 text-gray-700 dark:text-gray-200" />
              </div>

              {/* Clear */}
              {hasActiveFilters && (
                <button onClick={clearFilters} className="flex items-center gap-1 py-1.5 px-2.5 rounded-md text-[12px] font-medium text-gray-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors border border-transparent hover:border-red-100">
                  <X size={12} /> Clear
                </button>
              )}

              {/* Count */}
              <span className="text-[11px] font-bold text-gray-400">
                {filteredSortedProjects.length} project{filteredSortedProjects.length !== 1 ? 's' : ''}
              </span>

              {/* View toggle */}
              <div className="flex bg-gray-50 dark:bg-gray-900 rounded-md p-1 border border-gray-100 dark:border-gray-800 ml-auto">
                <button onClick={() => setView('grid')} className={cn("p-1 rounded transition-all", view === 'grid' ? "bg-white dark:bg-gray-800 text-indigo-600 shadow-sm" : "text-gray-400 hover:text-gray-600")} title="Grid"><LayoutGrid size={14} /></button>
                <button onClick={() => setView('table')} className={cn("p-1 rounded transition-all", view === 'table' ? "bg-white dark:bg-gray-800 text-indigo-600 shadow-sm" : "text-gray-400 hover:text-gray-600")} title="Table"><List size={14} /></button>
              </div>
            </div>
          </CardContent>
        </Card>

        {filteredSortedProjects.length === 0 ? (
          <EmptyState
            icon={FolderKanban}
            title="No projects found"
            description={hasActiveFilters ? "No projects match the current filters." : "You haven't created any projects yet."}
            actionLabel={hasActiveFilters ? "Clear Filters" : (canManageProjects && canCreateProject('/projects') ? "Create Project" : undefined)}
            onAction={hasActiveFilters ? clearFilters : (canManageProjects && canCreateProject('/projects') ? handleOpenModal : undefined)}
          />
        ) : view === 'grid' ? (
          <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {paginatedProjects.map((project) => (
              <Card key={project.id} className="group hover:shadow-md transition-all duration-300 flex flex-col">
                <CardContent className="p-4 flex flex-col h-full">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1">
                      <Badge variant={PROJECT_STATUS_BADGE_VARIANT[project.status]}>
                        {PROJECT_STATUS_LABELS[project.status]}
                      </Badge>
                      <InteractiveLink type="project" id={project.id} className="block mt-1.5">
                        {project.code && (
                          <span className="inline-block mb-0.5 px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-300 text-[9px] font-black tracking-widest font-mono">{project.code}</span>
                        )}
                        <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 group-hover:text-indigo-600 transition-colors uppercase tracking-tight font-display line-clamp-1">
                          {project.name}
                        </h3>
                      </InteractiveLink>
                    </div>
                    {canManageProjects && (canUpdateProject('/projects') || canDeleteProject('/projects')) && (
                      <div className="flex transition-opacity">
                        {canUpdateProject('/projects') && (
                          <button
                            onClick={() => handleOpenModal(project)}
                            className="p-1 text-gray-400 hover:text-indigo-600"
                          >
                            <Edit2 size={13} />
                          </button>
                        )}
                        {canDeleteProject('/projects') && (
                          <button
                            onClick={() => confirmAlert('Delete this project? This will also delete all its tasks.', async () => {
                              try { await deleteProject(project.id); showSuccess('Project deleted'); }
                              catch { showError('Failed to delete project'); }
                            })}
                            className="p-1 text-gray-400 hover:text-red-600"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <p className="text-gray-500 text-[11px] mb-4 flex-1 line-clamp-2 leading-relaxed">
                    {project.description}
                  </p>

                  <div className="space-y-3">
                    <div className="flex items-center text-[10px] text-gray-400 font-bold uppercase tracking-tight gap-3">
                      <div className="flex items-center">
                        <Calendar size={12} className="mr-1" />
                        {formatDate(project.endDate)}
                      </div>
                    </div>

                    {(project.members && project.members.length > 0) && (
                      <div className="flex items-center gap-1">
                        <div className="flex -space-x-1.5">
                          {project.members.slice(0, 4).map(m => (
                            <img
                              key={m.userId}
                              src={m.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(m.fullName)}&background=random&size=32`}
                              title={m.fullName}
                              className="h-5 w-5 rounded-full border-2 border-white dark:border-gray-900 object-cover"
                              alt={m.fullName}
                            />
                          ))}
                        </div>
                        {project.members.length > 4 && (
                          <span className="text-[9px] font-black text-gray-400">+{project.members.length - 4}</span>
                        )}
                      </div>
                    )}

                    <div className="space-y-1">
                      {(() => {
                        const progress = progressMap.get(project.id) ?? 0;
                        return (
                          <>
                            <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-tighter">
                              <span className="text-gray-400">Yield</span>
                              <span className="font-mono text-indigo-600">{progress}%</span>
                            </div>
                            <div className="w-full h-1 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-indigo-600 transition-all duration-1000 ease-out"
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <PaginationBar total={filteredSortedProjects.length} />
          </>
        ) : (
          <Card className="border-gray-100/50">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-50 dark:border-gray-900 bg-gray-50/30 dark:bg-gray-900/30">
                    <th className="px-4 py-2 text-[10px] uppercase font-black text-gray-400 tracking-widest cursor-pointer hover:text-indigo-600 select-none" onClick={() => toggleSort('name')}>
                      Project <SortIcon field="name" />
                    </th>
                    <th className="px-4 py-2 text-[10px] uppercase font-black text-gray-400 tracking-widest cursor-pointer hover:text-indigo-600 select-none" onClick={() => toggleSort('status')}>
                      Status <SortIcon field="status" />
                    </th>
                    <th className="px-4 py-2 text-[10px] uppercase font-black text-gray-400 tracking-widest cursor-pointer hover:text-indigo-600 select-none" onClick={() => toggleSort('startDate')}>
                      Start Date <SortIcon field="startDate" />
                    </th>
                    <th className="px-4 py-2 text-[10px] uppercase font-black text-gray-400 tracking-widest cursor-pointer hover:text-indigo-600 select-none" onClick={() => toggleSort('endDate')}>
                      End Date <SortIcon field="endDate" />
                    </th>
                    <th className="px-4 py-2 text-[10px] uppercase font-black text-gray-400 tracking-widest cursor-pointer hover:text-indigo-600 select-none" onClick={() => toggleSort('owner')}>
                      Owner <SortIcon field="owner" />
                    </th>
                    <th className="px-4 py-2 text-[10px] uppercase font-black text-gray-400 tracking-widest cursor-pointer hover:text-indigo-600 select-none" onClick={() => toggleSort('progress')}>
                      Progress <SortIcon field="progress" />
                    </th>
                    <th className="px-4 py-2 text-right text-[10px] uppercase font-black text-gray-400 tracking-widest">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-900">
                  {paginatedProjects.map((project) => {
                    const owner = users.find(u => u.id === project.ownerId);
                    const isHistoryOpen = ownerHistoryProjectId === project.id;
                    return (
                    <tr key={project.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-900/50 transition-colors group">
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-1.5">
                            {project.code && <span className="px-1 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-300 text-[9px] font-black tracking-widest font-mono">{project.code}</span>}
                            <InteractiveLink type="project" id={project.id} className="text-[13px] font-bold text-gray-900 dark:text-gray-100 group-hover:text-indigo-600 transition-colors uppercase tracking-tight font-display leading-tight">
                              {project.name}
                            </InteractiveLink>
                          </div>
                          <span className="text-[10px] text-gray-400 font-medium line-clamp-1">{project.description}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={PROJECT_STATUS_BADGE_VARIANT[project.status]}>
                          {PROJECT_STATUS_LABELS[project.status]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-[11px] font-mono text-gray-500 whitespace-nowrap">
                        {formatDate(project.startDate) || <span className="text-gray-200">—</span>}
                      </td>
                      <td className="px-4 py-3 text-[11px] font-mono text-gray-500 whitespace-nowrap">
                        {formatDate(project.endDate) || <span className="text-gray-200">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="relative">
                          <button
                            onClick={() => setOwnerHistoryProjectId(isHistoryOpen ? null : project.id)}
                            className="flex items-center gap-1.5 px-2 py-1 rounded-full border border-indigo-100 dark:border-indigo-900/40 bg-indigo-50/50 dark:bg-indigo-900/10 hover:border-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-all group/owner"
                            title="Click to view ownership history"
                          >
                            <img
                              src={owner?.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(owner?.name || project.ownerName || 'O')}&background=random&size=24`}
                              alt=""
                              className="h-4 w-4 rounded-full object-cover border border-white dark:border-gray-800"
                            />
                            <span className="text-[10px] font-black text-indigo-700 dark:text-indigo-400 uppercase tracking-tight">
                              {owner?.name || project.ownerName || '—'}
                            </span>
                            <History size={9} className="text-indigo-400 opacity-60 group-hover/owner:opacity-100 transition-opacity" />
                          </button>

                          {isHistoryOpen && (
                            <div className="absolute z-30 top-full left-0 mt-1 w-72 bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
                              <div className="flex items-center justify-between px-3 py-2 border-b border-gray-50 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900">
                                <span className="text-[9px] font-black uppercase tracking-widest text-gray-500 flex items-center gap-1">
                                  <History size={9} className="text-amber-500" /> Ownership History
                                </span>
                                <button onClick={() => setOwnerHistoryProjectId(null)} className="text-gray-400 hover:text-gray-600"><X size={12} /></button>
                              </div>
                              <div className="max-h-52 overflow-y-auto custom-scrollbar p-1.5 space-y-1">
                                {project.assignmentHistory && project.assignmentHistory.length > 0 ? (
                                  project.assignmentHistory.map(h => (
                                    <div key={h.id} className="px-2.5 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700">
                                      <div className="flex items-center justify-between mb-0.5">
                                        <span className="text-[8px] font-black uppercase px-1.5 py-0.5 bg-amber-50 dark:bg-amber-900/20 text-amber-600 rounded tracking-widest">{h.reasonTag}</span>
                                        <span className="text-[8px] text-gray-400 font-mono">{formatDateTime(h.changedAt)}</span>
                                      </div>
                                      <div className="flex items-center gap-1 text-[10px] font-bold text-gray-600 dark:text-gray-400">
                                        <span className="opacity-60">{h.previousOwnerName}</span>
                                        <span className="opacity-30 mx-0.5">→</span>
                                        <span className="text-indigo-600">{h.newOwnerName}</span>
                                      </div>
                                      <div className="text-[9px] text-gray-400 mt-0.5">by {h.changedByName}</div>
                                    </div>
                                  ))
                                ) : (
                                  <p className="text-center text-[10px] text-gray-400 font-bold py-3">No history yet</p>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 w-36">
                        {(() => {
                          const progress = progressMap.get(project.id) ?? 0;
                          return (
                            <div className="flex items-center space-x-2">
                              <div className="flex-1 h-1 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden font-mono">
                                <div className="h-full bg-indigo-600 shadow-sm" style={{ width: `${progress}%` }} />
                              </div>
                              <span className="text-[10px] font-black w-8 font-mono">{progress}%</span>
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {canManageProjects && (canUpdateProject('/projects') || canDeleteProject('/projects')) && (
                          <div className="inline-flex space-x-0.5 transition-opacity">
                            {canUpdateProject('/projects') && <button onClick={() => handleOpenModal(project)} className="p-1 text-gray-400 hover:text-indigo-600 hover:bg-white dark:hover:bg-gray-800 rounded border border-transparent hover:border-gray-100 transition-all"><Edit2 size={13} /></button>}
                            {canDeleteProject('/projects') && <button onClick={() => confirmAlert('Delete this project? This will also delete all its tasks.', async () => { try { await deleteProject(project.id); showSuccess('Project deleted'); } catch { showError('Failed to delete project'); } })} className="p-1 text-gray-400 hover:text-red-600 hover:bg-white dark:hover:bg-gray-800 rounded border border-transparent hover:border-gray-100 transition-all"><Trash2 size={13} /></button>}
                          </div>
                        )}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <PaginationBar total={filteredSortedProjects.length} />
          </Card>
        )}

        {/* Project Modal */}
        <Modal
          isOpen={isModalOpen}
          onClose={() => { setIsModalOpen(false); setEditingProject(null); }}
          title={editingProject ? "Edit Project" : "New Project"}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Read-only code chip — only when editing */}
            {editingProject?.code && (
              <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/50 rounded-lg">
                <span className="text-[9px] font-black uppercase tracking-widest text-indigo-400">Code</span>
                <span className="px-2 py-0.5 rounded bg-white dark:bg-gray-900 text-indigo-600 dark:text-indigo-300 text-[11px] font-black tracking-widest font-mono border border-indigo-100 dark:border-indigo-800/50">{editingProject.code}</span>
                <span className="ml-auto text-[9px] text-indigo-300 dark:text-indigo-600 font-bold italic">auto-generated</span>
              </div>
            )}
            <div>
              <label className="block text-[11px] font-black uppercase tracking-widest text-gray-400 mb-1">Project Name</label>
              <input name="name" required defaultValue={editingProject?.name} className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-[11px] font-black uppercase tracking-widest text-gray-400 mb-1">Description</label>
              <textarea name="description" rows={3} required defaultValue={editingProject?.description} className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-black uppercase tracking-widest text-gray-400 mb-1">Status</label>
                {(() => {
                  const statusOptions: SelectOption[] = [
                    { value: 'active', label: 'Active' },
                    { value: 'on-hold', label: 'On Hold' },
                    { value: 'completed', label: 'Completed' },
                  ];
                  return (
                    <VSelect
                      options={statusOptions}
                      value={statusOptions.find(o => o.value === formStatus) ?? null}
                      onChange={(opt) => { if (opt) setFormStatus(opt.value as ProjectStatus); }}
                      isSearchable={false}
                      placeholder="Select status"
                    />
                  );
                })()}
              </div>
              <div>
                <label className="block text-[11px] font-black uppercase tracking-widest text-gray-400 mb-1">Project Owner</label>
                {(() => {
                  const ownerSelectOptions: SelectOption[] = ownerOptions.map(u => ({ value: u.id, label: `${u.name} - ${u.role}` }));
                  return (
                    <VSelect
                      options={ownerSelectOptions}
                      value={ownerSelectOptions.find(o => o.value === formOwnerId) ?? null}
                      onChange={(opt) => setFormOwnerId(opt ? Number(opt.value) : 0)}
                      isSearchable
                      placeholder="Select owner"
                    />
                  );
                })()}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-black uppercase tracking-widest text-gray-400 mb-1">Start Date</label>
                <DateInput name="startDate" defaultValue={editingProject ? (toInputDate(editingProject.startDate) || '') : new Date().toISOString().split('T')[0]} className="px-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 text-[13px]" />
              </div>
              <div>
                <label className="block text-[11px] font-black uppercase tracking-widest text-gray-400 mb-1">End Date</label>
                <DateInput name="endDate" defaultValue={toInputDate(editingProject?.endDate) || ''} className="px-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 text-[13px]" />
              </div>
            </div>

            {/* Modules — badge-style add-items */}
            <div>
              <label className="block text-[11px] font-black uppercase tracking-widest text-gray-400 mb-1">Modules</label>
              <div className="flex flex-wrap gap-1.5 p-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus-within:ring-2 focus-within:ring-indigo-500 transition-all">
                {projectModules.map(mod => (
                  <Badge key={mod} variant="default" className="pl-2 pr-1 h-5 flex items-center gap-1 bg-white dark:bg-gray-700 text-indigo-600 border-indigo-100 dark:border-indigo-900/50 uppercase text-[9px] font-black tracking-tight">
                    {mod}
                    <button type="button" onClick={e => { e.stopPropagation(); removeModule(mod); }} className="hover:text-red-500 transition-colors p-0.5 rounded-full hover:bg-red-50">
                      <X size={10} />
                    </button>
                  </Badge>
                ))}
                <div className="flex-1 flex items-center min-w-[140px]">
                  <FolderKanban size={12} className="text-gray-300 mr-2" />
                  <input
                    value={moduleInput}
                    onChange={e => setModuleInput(e.target.value)}
                    onKeyDown={handleAddModule}
                    placeholder={projectModules.length === 0 ? 'Add module (e.g. Frontend) — Enter' : 'Add module...'}
                    className="w-full bg-transparent border-none outline-none text-[12px] placeholder:text-gray-400"
                  />
                </div>
              </div>
              <p className="text-[10px] text-gray-400 mt-1">Press Enter or comma to add. These appear as the task Module options for this project.</p>
            </div>

            {/* Team Members multi-select */}
            <div>
              <label className="block text-[11px] font-black uppercase tracking-widest text-gray-400 mb-1">Team Members</label>
              {(() => {
                const memberOptions: SelectOption[] = assignableUsers
                  .filter(u => u.roleId !== 1)
                  .map(u => ({ value: u.id, label: `${u.name} - ${u.role}` }));
                return (
                  <VSelect
                    isMulti
                    options={memberOptions}
                    value={memberOptions.filter(o => formMemberIds.includes(o.value as number))}
                    onChange={(opts) => setFormMemberIds(opts.map(o => o.value as number))}
                    isSearchable
                    isClearable
                    placeholder="Select team members..."
                  />
                );
              })()}
            </div>

            <FileUploader
              attachments={attachments}
              onAdd={(file) => setAttachments([...attachments, file])}
              onRemove={(id) => setAttachments(attachments.filter(a => a.id !== id))}
            />

            <div className="flex space-x-3 pt-4">
              <Button type="button" variant="secondary" className="flex-1" onClick={() => setIsModalOpen(false)}>Cancel</Button>
              <Button type="submit" className="flex-1">{editingProject ? "Update" : "Create"}</Button>
            </div>
          </form>
        </Modal>
      </div>
    </PageTransition>
  );
}
