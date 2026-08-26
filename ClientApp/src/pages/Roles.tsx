import { useState, useEffect } from 'react';
import { PageHeader } from '../components/ui/PageHeader';
import { PageTransition } from '../components/Layout/PageTransition';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { Plus, Trash2, Edit2, Shield, Eye, PlusCircle, Pencil, Trash, Check, ShieldCheck } from 'lucide-react';
import { roleService, ApiRoleDto } from '../services/role.service';
import { permissionService, PageModule, RolePermission, PermissionUpdate } from '../services/permission.service';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { showError, showSuccess } from '../lib/toast';
import { useSweetAlert } from '../context/SweetAlertContext';
import { VSelect, SelectOption } from '../components/forms/VSelect';

interface Role {
  id: number;
  name: string;
  code?: string;
  level?: number;
  description?: string;
  isAdmin?: boolean;
  isActive?: boolean;
}

type TabType = 'roles' | 'permissions';

const PERMISSION_LABELS = [
  { value: 1, label: 'View', icon: Eye },
  { value: 2, label: 'Create', icon: PlusCircle },
  { value: 4, label: 'Update', icon: Pencil },
  { value: 8, label: 'Delete', icon: Trash },
];

interface PermissionState {
  view: boolean;
  create: boolean;
  update: boolean;
  delete: boolean;
}

const PERM_COLUMNS = [
  { key: 'noAccess', label: 'NoAccess', bit: 0 },
  { key: 'create', label: 'Create', bit: 2 },
  { key: 'view', label: 'View', bit: 1 },
  { key: 'update', label: 'Update', bit: 4 },
  { key: 'delete', label: 'Delete', bit: 8 },
  { key: 'fullAccess', label: 'FullAccess', bit: 15 },
];

export default function Roles() {
  const { isSystemAdmin } = useAuth();
  const { canCreate, canUpdate, canDelete } = usePermissions();
  const canCreateRole = canCreate('/roles');
  const canUpdateRole = canUpdate('/roles');
  const canDeleteRole = canDelete('/roles');
  const { confirmAlert } = useSweetAlert();
  const [roles, setRoles] = useState<Role[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('roles');
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [roleForm, setRoleForm] = useState({ id: 0, name: '', code: '', level: 0, description: '', isAdmin: false, isActive: true });
  const [pageModules, setPageModules] = useState<PageModule[]>([]);
  const [rolePermissions, setRolePermissions] = useState<RolePermission[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [permStates, setPermStates] = useState<{ [pageModuleId: number]: PermissionState }>({});

  useEffect(() => {
    loadRoles();
  }, []);

  useEffect(() => {
    if (activeTab === 'permissions' && isSystemAdmin) {
      loadPageModules();
    }
  }, [activeTab, isSystemAdmin]);

  useEffect(() => {
    if (selectedRoleId && activeTab === 'permissions') {
      loadRolePermissions(selectedRoleId);
    }
  }, [selectedRoleId, activeTab]);

const loadRoles = async () => {
      setIsSaving(true);
      try {
        const data = await roleService.getAll();
        setRoles(data);
        if (data.length > 0 && !selectedRoleId) {
          setSelectedRoleId(data[0].id);
        }
      } catch (err) {
        showError(err instanceof Error ? err.message : 'Failed to load roles');
      } finally {
        setIsSaving(false);
      }
    };

    const loadPageModules = async () => {
      setIsSaving(true);
      try {
        const data = await permissionService.getPageModules();
        setPageModules(data);
        const initialStates: { [pageModuleId: number]: PermissionState } = {};
        data.forEach(pm => {
          initialStates[pm.id] = { view: false, create: false, update: false, delete: false };
        });
        setPermStates(initialStates);
      } catch (err) {
        showError(err instanceof Error ? err.message : 'Failed to load page modules');
      } finally {
        setIsSaving(false);
      }
    };

    const loadRolePermissions = async (roleId: number) => {
      setIsSaving(true);
      try {
        const data = await permissionService.getRolePermissions(roleId);
        setRolePermissions(data);

        const states: { [pageModuleId: number]: PermissionState } = {};
        data.forEach(rp => {
          const perms = rp.permissions;
          states[rp.pageModuleId] = {
            view: (perms & 1) === 1,
            create: (perms & 2) === 2,
            update: (perms & 4) === 4,
            delete: (perms & 8) === 8,
          };
        });
        setPermStates(states);
      } catch (err) {
        showError(err instanceof Error ? err.message : 'Failed to load role permissions');
      } finally {
        setIsSaving(false);
      }
    };

  const handlePermissionChange = (pageModuleId: number, key: keyof PermissionState | 'noAccess' | 'fullAccess', checked: boolean) => {
    setPermStates(prev => {
      const current = prev[pageModuleId] || { view: false, create: false, update: false, delete: false };
      const newState = { ...current };

      if (key === 'noAccess') {
        if (checked) {
          newState.view = false;
          newState.create = false;
          newState.update = false;
          newState.delete = false;
        }
      } else if (key === 'fullAccess') {
        if (checked) {
          newState.view = true;
          newState.create = true;
          newState.update = true;
          newState.delete = true;
        } else {
          newState.view = false;
          newState.create = false;
          newState.update = false;
          newState.delete = false;
        }
      } else {
        (newState as any)[key] = checked;
        
        // If any permission is checked, ensure NoAccess appears unchecked (hasAnyPermission will be true)
        // If all permissions checked, FullAccess should be checked
      }

      return { ...prev, [pageModuleId]: newState };
    });
  };

  const getPermissionValue = (pageModuleId: number): number => {
    const state = permStates[pageModuleId];
    if (!state) return 0;
    if (state.view && state.create && state.update && state.delete) return 15;
    if (state.view && !state.create && !state.update && !state.delete) return 1;
    let val = 0;
    if (state.view) val |= 1;
    if (state.create) val |= 2;
    if (state.update) val |= 4;
    if (state.delete) val |= 8;
    return val;
  };

const handleSavePermissions = async () => {
      if (!selectedRoleId) return;
      setIsSaving(true);
      try {
        const updates: PermissionUpdate[] = pageModules.map(pm => ({
          pageModuleId: pm.id,
          permissions: getPermissionValue(pm.id),
        }));
        await permissionService.updateRolePermissions(selectedRoleId, updates);
        showSuccess('Permissions saved successfully!');
      } catch (err) {
        showError(err instanceof Error ? err.message : 'Failed to save permissions');
      } finally {
        setIsSaving(false);
      }
    };

  const updatePermission = (pageModuleId: number, permissions: number) => {
    setRolePermissions(prev => 
      prev.map(rp => 
        rp.pageModuleId === pageModuleId 
          ? { ...rp, permissions }
          : rp
      )
    );
  };

  const handleSaveRole = async () => {
    try {
      await roleService.save(roleForm);
      showSuccess(roleForm.id > 0 ? 'Role updated successfully' : 'Role created successfully');
      setIsRoleModalOpen(false);
      setEditingRole(null);
      setRoleForm({ id: 0, name: '', code: '', level: 0, description: '', isAdmin: false, isActive: true });
      loadRoles();
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Failed to save role');
    }
  };

  const handleDeleteRole = (id: number) => {
    confirmAlert('Are you sure you want to delete this role?', async () => {
      try {
        await roleService.delete(id);
        showSuccess('Role deleted');
        loadRoles();
      } catch (err) {
        showError(err instanceof Error ? err.message : 'Failed to delete role');
      }
    });
  };

  const openEditRole = (role: Role) => {
    setEditingRole(role);
    setRoleForm({ id: role.id, name: role.name, code: role.code || '', level: role.level ?? 0, description: role.description || '', isAdmin: role.isAdmin ?? false, isActive: role.isActive ?? true });
    setIsRoleModalOpen(true);
  };

  return (
    <PageTransition>
      <div className="space-y-6 max-w-4xl mx-auto">
        <PageHeader 
          title="Role Management" 
          description="Manage user roles and permissions in the organization."
        >
          {activeTab === 'roles' && canCreateRole && (
            <Button onClick={() => { setEditingRole(null); setRoleForm({ id: 0, name: '', code: '', level: 0, description: '', isAdmin: false, isActive: true }); setIsRoleModalOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" /> Add Role
            </Button>
          )}
        </PageHeader>

        {isSystemAdmin && (
          <div className="flex space-x-1 bg-gray-100 dark:bg-gray-900 p-1 rounded-lg w-fit">
            <button
              onClick={() => setActiveTab('roles')}
              className={`px-4 py-2 text-[11px] font-bold uppercase tracking-wider rounded-md transition-all ${
                activeTab === 'roles'
                  ? 'bg-white dark:bg-gray-800 text-indigo-600 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              Roles
            </button>
            <button
              onClick={() => setActiveTab('permissions')}
              className={`px-4 py-2 text-[11px] font-bold uppercase tracking-wider rounded-md transition-all ${
                activeTab === 'permissions'
                  ? 'bg-white dark:bg-gray-800 text-indigo-600 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              Permissions
            </button>
          </div>
        )}

        <Card className="border-none shadow-sm">
          <CardContent className="p-4">
             {activeTab === 'roles' ? (
               isSaving ? (
                 <LoadingSpinner size="lg" className="py-8" />
               ) : (
                 roles.length > 0 ? (
                   <div className="space-y-2">
                     {roles.map((role) => (
                       <div key={role.id} className="flex items-center justify-between p-3 bg-gray-50/50 dark:bg-gray-900/30 rounded border border-gray-100 dark:border-gray-800 group">
                         <div className="flex items-center gap-3">
                           <div className="p-2 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg">
                             <Shield size={16} className="text-indigo-600 dark:text-indigo-400" />
                           </div>
                           <div>
                             <div className="flex items-center gap-2">
                               {role.code && (
                                 <span className="px-1.5 py-0.5 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-300 rounded text-[9px] font-black tracking-widest font-mono">{role.code}</span>
                               )}
                               <p className="font-bold text-[13px] uppercase tracking-tight">{role.name}</p>
                               {typeof role.level === 'number' && role.level > 0 && (
                                 <span className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 rounded text-[9px] font-black uppercase tracking-wider">L{role.level}</span>
                               )}
                               {role.isAdmin && (
                                 <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 rounded text-[9px] font-black uppercase tracking-wider">
                                   <ShieldCheck size={10} /> Admin
                                 </span>
                               )}
                             </div>
                             <p className="text-[10px] text-gray-400">{role.description || 'No description'}</p>
                           </div>
                         </div>
                         <div className="flex space-x-1 transition-opacity">
                           {canUpdateRole && (
                             <button onClick={() => openEditRole(role)} className="p-1.5 text-gray-400 hover:text-indigo-600 rounded hover:bg-indigo-50 dark:hover:bg-indigo-900/30">
                               <Edit2 size={14} />
                             </button>
                           )}
                           {canDeleteRole && (
                             <button onClick={() => handleDeleteRole(role.id)} className="p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-red-50 dark:hover:bg-red-900/30">
                               <Trash2 size={14} />
                             </button>
                           )}
                         </div>
                       </div>
                     ))}
                   </div>
                 ) : (
                   <p className="text-[12px] text-gray-400 text-center py-8">No roles found. Create one to get started.</p>
                 )
               )
             ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-4 mb-4">
                  <label className="block text-[11px] font-black uppercase tracking-widest text-gray-400 mb-1">Select Role:</label>
                  {(() => {
                    const roleOpts: SelectOption[] = roles.map(r => ({ value: r.id, label: r.name }));
                    return (
                      <VSelect
                        options={roleOpts}
                        value={roleOpts.find(o => o.value === selectedRoleId) ?? null}
                        onChange={(opt) => setSelectedRoleId(opt ? Number(opt.value) : null)}
                        isSearchable={false}
                        placeholder="Select role"
                        className="w-48"
                      />
                    );
                  })()}
                  <Button onClick={handleSavePermissions} disabled={isSaving} className="ml-auto">
                    <Check className="mr-2 h-4 w-4" /> {isSaving ? 'Saving...' : 'Save Permissions'}
                  </Button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700">
                        <th className="text-left py-2 px-3 text-[10px] font-black uppercase text-gray-400">Page / Module</th>
                        {PERM_COLUMNS.map(col => (
                          <th key={col.key} className="text-center py-2 px-2 text-[10px] font-black uppercase text-gray-400">
                            {col.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pageModules.map(pm => {
                        const state = permStates[pm.id] || { view: false, create: false, update: false, delete: false };
                        const isFullAccess = state.view && state.create && state.update && state.delete;
                        const hasAnyPermission = state.view || state.create || state.update || state.delete;
                        
                        return (
                          <tr key={pm.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900/30">
                            <td className="py-2 px-3 font-bold uppercase">{pm.name}</td>
                            
                            {/* NoAccess */}
                            <td className="text-center py-2 px-2">
                              <input
                                type="checkbox"
                                checked={!hasAnyPermission}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setPermStates(prev => ({
                                      ...prev,
                                      [pm.id]: { view: false, create: false, update: false, delete: false }
                                    }));
                                  }
                                }}
                                className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                              />
                            </td>
                            
                            {/* Create */}
                            <td className="text-center py-2 px-2">
                              <input
                                type="checkbox"
                                checked={state.create}
                                onChange={(e) => {
                                  setPermStates(prev => ({
                                    ...prev,
                                    [pm.id]: { ...prev[pm.id], create: e.target.checked }
                                  }));
                                }}
                                className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                              />
                            </td>
                            
                            {/* View */}
                            <td className="text-center py-2 px-2">
                              <input
                                type="checkbox"
                                checked={state.view}
                                onChange={(e) => {
                                  setPermStates(prev => ({
                                    ...prev,
                                    [pm.id]: { ...prev[pm.id], view: e.target.checked }
                                  }));
                                }}
                                className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                              />
                            </td>
                            
                            {/* Update */}
                            <td className="text-center py-2 px-2">
                              <input
                                type="checkbox"
                                checked={state.update}
                                onChange={(e) => {
                                  setPermStates(prev => ({
                                    ...prev,
                                    [pm.id]: { ...prev[pm.id], update: e.target.checked }
                                  }));
                                }}
                                className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                              />
                            </td>
                            
                            {/* Delete */}
                            <td className="text-center py-2 px-2">
                              <input
                                type="checkbox"
                                checked={state.delete}
                                onChange={(e) => {
                                  setPermStates(prev => ({
                                    ...prev,
                                    [pm.id]: { ...prev[pm.id], delete: e.target.checked }
                                  }));
                                }}
                                className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                              />
                            </td>
                            
                            {/* FullAccess */}
                            <td className="text-center py-2 px-2">
                              <input
                                type="checkbox"
                                checked={isFullAccess}
                                onChange={(e) => {
                                  setPermStates(prev => ({
                                    ...prev,
                                    [pm.id]: e.target.checked 
                                      ? { view: true, create: true, update: true, delete: true }
                                      : { view: false, create: false, update: false, delete: false }
                                  }));
                                }}
                                className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {isRoleModalOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-900 rounded-lg p-6 w-96 shadow-xl border border-gray-100 dark:border-gray-800">
              <h3 className="text-sm font-black uppercase tracking-widest mb-4">
                {editingRole ? 'Edit Role' : 'New Role'}
              </h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-widest text-gray-400 mb-1">Role Name <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={roleForm.name}
                    onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-[12px] outline-none focus:ring-1 ring-indigo-500/30"
                    placeholder="e.g., Manager"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-widest text-gray-400 mb-1">Code</label>
                    <input
                      type="text"
                      value={roleForm.code}
                      onChange={(e) => setRoleForm({ ...roleForm, code: e.target.value.toUpperCase() })}
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-[12px] outline-none focus:ring-1 ring-indigo-500/30 font-mono uppercase"
                      placeholder="e.g., MGR"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-widest text-gray-400 mb-1">Level <span className="text-red-500">*</span> <span className="normal-case font-normal text-gray-400">(1=highest)</span></label>
                    <input
                      type="number"
                      min={0}
                      value={roleForm.level}
                      onChange={(e) => setRoleForm({ ...roleForm, level: Number(e.target.value) || 0 })}
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-[12px] outline-none focus:ring-1 ring-indigo-500/30"
                      placeholder="0"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-widest text-gray-400 mb-1">Description</label>
                  <textarea
                    value={roleForm.description}
                    onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-[12px] outline-none focus:ring-1 ring-indigo-500/30 resize-none"
                    rows={3}
                    placeholder="Optional description"
                  />
                </div>
                <div className="flex items-center gap-3 pt-1">
                  <input
                    type="checkbox"
                    id="isAdminToggle"
                    checked={roleForm.isAdmin}
                    onChange={(e) => setRoleForm({ ...roleForm, isAdmin: e.target.checked })}
                    className="w-4 h-4 rounded border-gray-300 text-amber-500 focus:ring-amber-500"
                  />
                  <label htmlFor="isAdminToggle" className="text-[11px] font-black uppercase text-gray-500 cursor-pointer select-none">
                    Admin Role <span className="text-[9px] font-normal normal-case text-gray-400">(can create/edit/delete projects & tasks)</span>
                  </label>
                </div>
                <div className="flex items-center gap-3 pt-1">
                  <input
                    type="checkbox"
                    id="isActiveToggle"
                    checked={roleForm.isActive}
                    onChange={(e) => setRoleForm({ ...roleForm, isActive: e.target.checked })}
                    className="w-4 h-4 rounded border-gray-300 text-emerald-500 focus:ring-emerald-500"
                  />
                  <label htmlFor="isActiveToggle" className="text-[11px] font-black uppercase text-gray-500 cursor-pointer select-none">
                    Is Active
                  </label>
                </div>
              </div>
              <div className="flex space-x-2 mt-6">
                <Button variant="secondary" className="flex-1" onClick={() => setIsRoleModalOpen(false)}>Cancel</Button>
                <Button className="flex-1" onClick={handleSaveRole}>Save</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageTransition>
  );
}