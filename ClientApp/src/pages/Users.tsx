import React, { useState, useRef, useEffect } from 'react';
import { Plus, Search, Mail, Trash2, Edit2, LayoutGrid, List, Upload, Camera, Phone, Copy, Check, X, UserCheck, UserX, RotateCcw } from 'lucide-react';
import { roleService } from '../services/role.service';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';
import { Card, CardContent } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';
import { VSelect, SelectOption } from '../components/forms/VSelect';
import { User } from '../types';
import { cn, copyToClipboard } from '../lib/utils';
import { validateName, validateEmail, validateContact, validatePassword, collectErrors } from '../lib/validation';
import { useAvailability } from '../hooks/useAvailability';
import { Badge } from '../components/ui/Badge';
import { InteractiveLink } from '../components/ui/InteractiveLink';
import { PageHeader } from '../components/ui/PageHeader';
import { EmptyState } from '../components/ui/EmptyState';
import { Users as UsersIcon } from 'lucide-react';
import { PageTransition } from '../components/Layout/PageTransition';
import { useSweetAlert } from '../context/SweetAlertContext';
import { showError, showSuccess } from '../lib/toast';
import { usePermissions } from '../hooks/usePermissions';
import type { AvailabilityState } from '../hooks/useAvailability';

type StatusFilter = 'active' | 'inactive' | 'deleted';

const STATUS_FILTER_OPTIONS: { label: string; value: StatusFilter }[] = [
  { label: 'Active',   value: 'active' },
  { label: 'Inactive', value: 'inactive' },
  { label: 'Deleted',  value: 'deleted' },
];

function AvailabilityHint({ state, label }: { state: AvailabilityState; label: string }) {
  if (state === 'idle') return null;
  if (state === 'checking') return <p className="text-[11px] text-gray-400 mt-1">Checking {label}…</p>;
  if (state === 'available') return <p className="text-[11px] text-emerald-600 mt-1">✓ {label} is available</p>;
  return <p className="text-[11px] text-red-500 mt-1">✕ {label} is already taken</p>;
}

function StatusBadge({ user }: { user: User }) {
  if (user.isDeleted) return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-widest bg-red-50 text-red-600 border border-red-100 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900/40">Deleted</span>;
  if (!user.isActive) return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-widest bg-amber-50 text-amber-600 border border-amber-100 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900/40">Inactive</span>;
  return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-widest bg-emerald-50 text-emerald-600 border border-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/40">Active</span>;
}

export default function Users() {
  const { users, tasks, projects, addUser, updateUser, deleteUser, setUserActive, reactivateUser, addActivity } = useData();
  const { isSystemAdmin } = useAuth();
  const { canCreate: _canCreate, canUpdate: _canUpdate, canDelete: _canDelete } = usePermissions();
  const canCreateUser  = _canCreate('/users');
  const canUpdateUser  = _canUpdate('/users');
  const canDeleteUser  = _canDelete('/users');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [view, setView] = useState<'grid' | 'table'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [roles, setRoles] = useState<{ id: number; name: string; code?: string }[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<number>(0);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [emailValue, setEmailValue] = useState('');
  const [isActiveValue, setIsActiveValue] = useState(true);
  const { showAlert, confirmAlert } = useSweetAlert();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const emailAvail = useAvailability(emailValue, {
    field: 'email',
    enabled: isModalOpen && !validateEmail(emailValue),
    excludeUserId: editingUser?.id,
  });

  useEffect(() => {
    roleService.getAll().then(setRoles).catch(() => {});
  }, []);

  const handleCopy = async (text: string, field: string) => {
    const success = await copyToClipboard(text);
    if (success) {
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 1500);
    }
  };

  // Apply status filter then search
  const filteredUsers = users.filter(u => {
    // Status gate
    if (statusFilter === 'active'   && (u.isDeleted || !u.isActive)) return false;
    if (statusFilter === 'inactive' && (u.isDeleted || u.isActive !== false)) return false;
    if (statusFilter === 'deleted'  && !u.isDeleted) return false;

    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (u.name?.toLowerCase() || '').includes(q) ||
      (u.email?.toLowerCase() || '').includes(q) ||
      (u.role?.toLowerCase() || '').includes(q) ||
      (u.contactNo?.toLowerCase() || '').includes(q)
    );
  });

  const getUserStats = (userId: number) => {
    const userTasks = tasks.filter(t => t.assigneeId === userId);
    const totalTasks = userTasks.length;
    const completedTasks = userTasks.filter(t => t.status === 'completed').length;
    const successRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
    const userProjectsCount = projects.filter(p => p.ownerId === userId).length;
    return { totalTasks, successRate, userProjectsCount };
  };

  const handleOpenModal = (user?: User) => {
    setFormErrors({});
    if (user) {
      setEditingUser(user);
      setAvatarPreview(user.avatar ?? null);
      setSelectedRoleId(user.roleId || 0);
      setEmailValue(user.email ?? '');
      setIsActiveValue(user.isActive ?? true);
    } else {
      setEditingUser(null);
      setAvatarPreview(null);
      setSelectedRoleId(roles[0]?.id || 0);
      setEmailValue('');
      setIsActiveValue(true);
    }
    setIsModalOpen(true);
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) { showAlert("Image too large. Max 2MB.", 'warning'); return; }
      const reader = new FileReader();
      reader.onload = (event) => setAvatarPreview(event.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const roleId = selectedRoleId || Number(formData.get('roleId'));
    const firstName = ((formData.get('firstName') as string) || '').trim();
    const lastName = ((formData.get('lastName') as string) || '').trim();
    const email = emailValue.trim();
    const contactNo = ((formData.get('contactNo') as string) || '').trim();
    const password = (formData.get('password') as string) || '';

    const errors = collectErrors({
      firstName: validateName(firstName, 'First name'),
      lastName: validateName(lastName, 'Last name'),
      email: validateEmail(email) || (emailAvail === 'taken' ? 'This email is already registered.' : ''),
      contactNo: validateContact(contactNo),
      password: editingUser ? '' : validatePassword(password),
    });
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const userData: User = {
      id: editingUser?.id || Date.now(),
      name: `${firstName} ${lastName}`.trim(),
      firstName,
      lastName,
      email,
      contactNo: contactNo || undefined,
      role: roles.find(r => r.id === roleId)?.name || '',
      roleId,
      isActive: isActiveValue,
      avatar: avatarPreview || `https://images.unsplash.com/photo-${Math.floor(Math.random() * 1000000000)}?w=100&h=100&fit=crop&q=80`,
    };

    try {
      if (editingUser) {
        await updateUser(userData);
        await addActivity({ userId: 1, userName: 'Admin', action: 'updated member', targetType: 'project', targetId: userData.id, targetName: userData.name });
        showSuccess('Member updated successfully');
      } else {
        const newUser = await addUser(userData, password);
        await addActivity({ userId: 1, userName: 'Admin', action: 'added member', targetType: 'project', targetId: newUser.id, targetName: newUser.name });
        showSuccess('Member added successfully');
      }
      setIsModalOpen(false);
      setEditingUser(null);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to save member');
    }
  };

  const handleDelete = (user: User) => {
    confirmAlert(
      `Soft-delete ${user.name}? They will be marked as Deleted and lose all access. Only System Admin can reactivate them.`,
      async () => {
        try {
          await deleteUser(user.id);
          showSuccess(`${user.name} has been deleted.`);
        } catch {
          showError('Failed to delete user.');
        }
      }
    );
  };

  const handleSetActive = (user: User, isActive: boolean) => {
    confirmAlert(
      isActive
        ? `Activate ${user.name}? They will regain access to the system.`
        : `Deactivate ${user.name}? They will lose access but their data is preserved.`,
      async () => {
        try {
          await setUserActive(user.id, isActive);
          showSuccess(isActive ? `${user.name} has been activated.` : `${user.name} has been deactivated.`);
        } catch {
          showError('Failed to update user status.');
        }
      }
    );
  };

  const handleReactivate = (user: User) => {
    confirmAlert(
      `Reactivate ${user.name}? They will be restored as an Active user.`,
      async () => {
        try {
          await reactivateUser(user.id);
          showSuccess(`${user.name} has been reactivated.`);
        } catch {
          showError('Failed to reactivate user.');
        }
      }
    );
  };

  // Per-user action buttons depending on their current state
  function UserActions({ user, size = 'sm' }: { user: User; size?: 'sm' | 'xs' }) {
    const btnCls = size === 'xs'
      ? 'p-1 rounded border border-transparent transition-all text-gray-400'
      : 'p-1 rounded border border-transparent hover:bg-white dark:hover:bg-gray-800 hover:border-gray-100 transition-all text-gray-400';

    if (user.isDeleted) {
      return (
        <div className="inline-flex items-center gap-0.5">
          {isSystemAdmin && (
            <button
              title="Reactivate user"
              onClick={() => handleReactivate(user)}
              className={cn(btnCls, 'hover:text-emerald-600')}
            >
              <RotateCcw size={size === 'xs' ? 12 : 13} />
            </button>
          )}
        </div>
      );
    }

    return (
      <div className="inline-flex items-center gap-0.5">
        {canUpdateUser && (
          <button title="Edit" onClick={() => handleOpenModal(user)} className={cn(btnCls, 'hover:text-indigo-600')}>
            <Edit2 size={size === 'xs' ? 12 : 13} />
          </button>
        )}
        {canUpdateUser && (
          user.isActive
            ? <button title="Deactivate" onClick={() => handleSetActive(user, false)} className={cn(btnCls, 'hover:text-amber-600')}>
                <UserX size={size === 'xs' ? 12 : 13} />
              </button>
            : <button title="Activate" onClick={() => handleSetActive(user, true)} className={cn(btnCls, 'hover:text-emerald-600')}>
                <UserCheck size={size === 'xs' ? 12 : 13} />
              </button>
        )}
        {canDeleteUser && (
          <button title="Delete" onClick={() => handleDelete(user)} className={cn(btnCls, 'hover:text-red-600')}>
            <Trash2 size={size === 'xs' ? 12 : 13} />
          </button>
        )}
      </div>
    );
  }

  return (
    <PageTransition>
      <div className="space-y-6 max-w-7xl mx-auto">
        <PageHeader
          title="Users"
          description="Manage users and their roles in the organization."
        >
          {canCreateUser && (
            <Button onClick={() => handleOpenModal()}>
              <Plus className="mr-2 h-5 w-5" /> Add User
            </Button>
          )}
        </PageHeader>

        {/* Filter + Search bar */}
        <Card className="p-0 border-none shadow-sm ring-1 ring-black/5 dark:ring-white/5">
          <CardContent className="p-3 flex items-center gap-2">

            {/* Search */}
            <div className="relative flex-1 min-w-0 group">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 group-focus-within:text-indigo-500 transition-colors" />
              <input
                type="text"
                placeholder="Search by name, email, role, contact..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-7 py-1.5 bg-gray-50 dark:bg-gray-900 border border-transparent focus:border-indigo-500/30 focus:bg-white dark:focus:bg-gray-800 transition-all rounded-md text-[13px] outline-none"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Status dropdown */}
            <VSelect
              options={STATUS_FILTER_OPTIONS.map((opt): SelectOption => ({ value: opt.value, label: opt.label }))}
              value={STATUS_FILTER_OPTIONS.map((opt): SelectOption => ({ value: opt.value, label: opt.label })).find(o => o.value === statusFilter) ?? null}
              onChange={opt => opt && setStatusFilter(opt.value as StatusFilter)}
              isSearchable={false}
              size="sm"
              className="w-36 shrink-0"
            />

            {/* View toggle button group */}
            <div className="flex bg-gray-50 dark:bg-gray-900 rounded-md p-1 border border-gray-100 dark:border-gray-800 shrink-0">
              <button
                onClick={() => setView('grid')}
                className={cn("p-1 rounded transition-all", view === 'grid' ? "bg-white dark:bg-gray-800 text-indigo-600 shadow-sm" : "text-gray-400 hover:text-gray-600")}
              >
                <LayoutGrid size={14} />
              </button>
              <button
                onClick={() => setView('table')}
                className={cn("p-1 rounded transition-all", view === 'table' ? "bg-white dark:bg-gray-800 text-indigo-600 shadow-sm" : "text-gray-400 hover:text-gray-600")}
              >
                <List size={14} />
              </button>
            </div>
          </CardContent>
        </Card>

        {filteredUsers.length === 0 ? (
          <EmptyState
            icon={UsersIcon}
            title="No members found"
            description={searchQuery ? `No members matching "${searchQuery}"` : `No ${statusFilter} users.`}
            actionLabel={searchQuery ? "Clear Search" : undefined}
            onAction={searchQuery ? () => setSearchQuery('') : undefined}
          />
        ) : view === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {filteredUsers.map((user) => (
              <Card
                key={user.id}
                className={cn(
                  'group hover:shadow-md transition-all duration-300',
                  user.isDeleted  ? 'opacity-50 grayscale' : !user.isActive ? 'opacity-70' : ''
                )}
              >
                <CardContent className="p-4">
                  <div className="flex justify-between items-start mb-3">
                    <div className="relative">
                      <InteractiveLink type="user" id={user.id}>
                        <img
                          src={user.avatar}
                          alt={user.name}
                          className="h-10 w-10 rounded border border-gray-100 dark:border-gray-800 shadow-sm group-hover:scale-105 transition-transform object-cover"
                        />
                      </InteractiveLink>
                    </div>
                    <UserActions user={user} size="xs" />
                  </div>

                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <InteractiveLink type="user" id={user.id}>
                        <h3 className="text-[13px] font-bold group-hover:text-indigo-600 transition-colors uppercase tracking-tight font-display">{user.name}</h3>
                      </InteractiveLink>
                      <StatusBadge user={user} />
                    </div>
                    <div
                      className="flex items-center text-[10px] text-gray-400 font-medium cursor-pointer hover:text-indigo-500 transition-colors group"
                      onClick={(e) => { e.preventDefault(); handleCopy(user.email, `email-${user.id}`); }}
                    >
                      <Mail size={10} className="mr-1 opacity-50 group-hover:text-indigo-500" />
                      <span className="truncate max-w-[120px]">{user.email}</span>
                      {copiedField === `email-${user.id}` ? <Check size={10} className="ml-1 text-emerald-500" /> : <Copy size={10} className="ml-1 opacity-0 group-hover:opacity-50" />}
                    </div>
                    {user.contactNo && (
                      <div
                        className="flex items-center text-[10px] text-gray-400 font-medium cursor-pointer hover:text-indigo-500 transition-colors group"
                        onClick={(e) => { e.preventDefault(); handleCopy(user.contactNo!, `contact-${user.id}`); }}
                      >
                        <Phone size={10} className="mr-1 opacity-50 group-hover:text-indigo-500" />
                        <span className="truncate max-w-[120px]">{user.contactNo}</span>
                        {copiedField === `contact-${user.id}` ? <Check size={10} className="ml-1 text-emerald-500" /> : <Copy size={10} className="ml-1 opacity-0 group-hover:opacity-50" />}
                      </div>
                    )}
                    <div className="pt-1">
                      <span className="inline-flex items-center text-[9px] font-black uppercase tracking-widest text-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 px-1.5 py-0.5 rounded border border-indigo-100/30">
                        {user.role}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-gray-50 dark:border-gray-900 grid grid-cols-3 gap-1">
                    {(() => {
                      const stats = getUserStats(user.id);
                      return (
                        <>
                          <div className="text-center">
                            <span className="block text-sm font-black font-mono">{stats.totalTasks}</span>
                            <span className="text-[8px] text-gray-400 uppercase font-black tracking-tighter">Units</span>
                          </div>
                          <div className="text-center">
                            <span className="block text-sm font-black font-mono text-emerald-500">{stats.successRate}%</span>
                            <span className="text-[8px] text-gray-400 uppercase font-black tracking-tighter">Rate</span>
                          </div>
                          <div className="text-center">
                            <span className="block text-sm font-black font-mono text-indigo-500">{stats.userProjectsCount}</span>
                            <span className="text-[8px] text-gray-400 uppercase font-black tracking-tighter">Leads</span>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="border-gray-100/50">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-50 dark:border-gray-900 bg-gray-50/30 dark:bg-gray-900/30">
                    <th className="px-4 py-2 text-[10px] uppercase font-black text-gray-400 tracking-widest">Member</th>
                    <th className="px-4 py-2 text-[10px] uppercase font-black text-gray-400 tracking-widest">Role</th>
                    <th className="px-4 py-2 text-[10px] uppercase font-black text-gray-400 tracking-widest">Contact</th>
                    <th className="px-4 py-2 text-[10px] uppercase font-black text-gray-400 tracking-widest">Status</th>
                    <th className="px-4 py-2 text-right text-[10px] uppercase font-black text-gray-400 tracking-widest">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-900">
                  {filteredUsers.map((user) => (
                    <tr
                      key={user.id}
                      className={cn(
                        'hover:bg-gray-50/50 dark:hover:bg-gray-900/50 transition-all group',
                        user.isDeleted ? 'opacity-50' : !user.isActive ? 'opacity-70' : ''
                      )}
                    >
                      <td className="px-4 py-2">
                        <InteractiveLink type="user" id={user.id} className="flex items-center">
                          <img src={user.avatar} alt="" className="h-6 w-6 rounded border border-gray-100 dark:border-gray-800 shadow-sm mr-2.5 object-cover" />
                          <span className="text-[13px] font-bold text-gray-900 dark:text-gray-100 uppercase tracking-tight font-display">{user.name}</span>
                        </InteractiveLink>
                      </td>
                      <td className="px-4 py-2">
                        <Badge variant="info" className="uppercase text-[9px] font-black">{user.role}</Badge>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center text-[11px] text-gray-500 font-medium">
                          <Mail size={12} className="mr-1.5 opacity-50" />
                          {user.email}
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <StatusBadge user={user} />
                      </td>
                      <td className="px-4 py-2 text-right">
                        <UserActions user={user} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* Add / Edit modal */}
        <Modal
          isOpen={isModalOpen}
          onClose={() => { setIsModalOpen(false); setEditingUser(null); }}
          title={editingUser ? "Edit Member" : "Add New Member"}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex flex-col items-center mb-6">
              <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                <div className="h-24 w-24 rounded-2xl overflow-hidden border-2 border-dashed border-gray-200 dark:border-gray-700 hover:border-indigo-500 transition-all">
                  {avatarPreview ? (
                    <img src={avatarPreview} alt="Preview" className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900 text-gray-400">
                      <Camera size={24} />
                      <span className="text-[10px] font-bold uppercase mt-1">Upload</span>
                    </div>
                  )}
                </div>
                <div className="absolute -bottom-2 -right-2 h-8 w-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-indigo-600/30">
                  <Upload size={14} />
                </div>
              </div>
              <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleAvatarChange} />
              <p className="text-[10px] font-bold text-gray-400 uppercase mt-4">Photo JPG, PNG (Max 2MB)</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-black uppercase tracking-widest text-gray-400 mb-1">First Name</label>
                <input name="firstName" type="text" defaultValue={editingUser?.firstName} className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="John" />
                {formErrors.firstName && <p className="text-[11px] text-red-500 mt-1">{formErrors.firstName}</p>}
              </div>
              <div>
                <label className="block text-[11px] font-black uppercase tracking-widest text-gray-400 mb-1">Last Name</label>
                <input name="lastName" type="text" defaultValue={editingUser?.lastName} className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="Doe" />
                {formErrors.lastName && <p className="text-[11px] text-red-500 mt-1">{formErrors.lastName}</p>}
              </div>
            </div>
            {!editingUser && (
              <div>
                <label className="block text-[11px] font-black uppercase tracking-widest text-gray-400 mb-1">Password</label>
                <input name="password" type="password" autoComplete="new-password" className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="At least 6 characters" />
                {formErrors.password && <p className="text-[11px] text-red-500 mt-1">{formErrors.password}</p>}
              </div>
            )}
            <div>
              <label className="block text-[11px] font-black uppercase tracking-widest text-gray-400 mb-1">Email Address</label>
              <input name="email" type="email" value={emailValue} onChange={e => setEmailValue(e.target.value)} className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="john@example.com" />
              {formErrors.email ? <p className="text-[11px] text-red-500 mt-1">{formErrors.email}</p> : <AvailabilityHint state={emailAvail} label="Email" />}
            </div>
            <div>
              <label className="block text-[11px] font-black uppercase tracking-widest text-gray-400 mb-1">Mobile No</label>
              <input name="contactNo" type="tel" defaultValue={editingUser?.contactNo} className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="+91 98765 43210" />
              {formErrors.contactNo && <p className="text-[11px] text-red-500 mt-1">{formErrors.contactNo}</p>}
            </div>
            <div>
              <label className="block text-[11px] font-black uppercase tracking-widest text-gray-400 mb-1">Role</label>
              {(() => {
                const roleOptions: SelectOption[] = roles
                  .filter(r => r.id !== 1 || editingUser?.roleId === 1)
                  .map(r => ({ value: r.id, label: r.name }));
                return (
                  <VSelect
                    options={roleOptions}
                    value={roleOptions.find(o => o.value === selectedRoleId) ?? null}
                    onChange={opt => setSelectedRoleId(opt ? Number(opt.value) : 0)}
                    disabled={editingUser?.roleId === 1}
                    placeholder="-- Select --"
                  />
                );
              })()}
              <input type="hidden" name="roleId" value={selectedRoleId} />
              {editingUser?.roleId === 1 && (
                <p className="text-[10px] text-gray-400 mt-1">System Admin role is fixed for this account.</p>
              )}
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="userIsActiveToggle"
                checked={isActiveValue}
                onChange={(e) => setIsActiveValue(e.target.checked)}
                disabled={editingUser?.roleId === 1}
                className="w-4 h-4 rounded border-gray-300 text-emerald-500 focus:ring-emerald-500 disabled:opacity-60"
              />
              <label htmlFor="userIsActiveToggle" className="text-sm font-semibold text-gray-600 dark:text-gray-300 cursor-pointer select-none">
                Is Active
              </label>
            </div>

            <div className="pt-4 flex space-x-3">
              <Button type="button" variant="secondary" className="flex-1" onClick={() => setIsModalOpen(false)}>Cancel</Button>
              <Button type="submit" className="flex-1">{editingUser ? "Save Changes" : "Create Member"}</Button>
            </div>
          </form>
        </Modal>
      </div>
    </PageTransition>
  );
}
