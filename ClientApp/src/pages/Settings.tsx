import React, { useState } from 'react';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { User, Palette, Lock, Check, Users, KeyRound, RotateCcw, Eye, EyeOff } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { cn } from '../lib/utils';
import { PageHeader } from '../components/ui/PageHeader';
import { PageTransition } from '../components/Layout/PageTransition';
import { userService } from '../services/user.service';
import { apiRequest } from '../lib/api';
import { showSuccess, showError } from '../lib/toast';

type TabId = 'profile' | 'appearance' | 'password' | 'usermgmt';

export default function Settings() {
  const { theme, setTheme } = useTheme();
  const { user, isSystemAdmin, checkAuthStatus } = useAuth();
  const { users, updateUser } = useData();
  const [activeTab, setActiveTab] = useState<TabId>('profile');
  const [resettingId, setResettingId] = useState<number | null>(null);

  // Profile form state
  const [profileName, setProfileName] = useState(user?.name ?? '');
  const [profileEmail, setProfileEmail] = useState(user?.email ?? '');
  const [profileContact, setProfileContact] = useState(user?.contactNo ?? '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

  // Password form state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  if (!user) return null;

  const tabs = [
    { id: 'profile'    as TabId, label: 'Profile',      icon: User },
    { id: 'appearance' as TabId, label: 'Appearance',   icon: Palette },
    { id: 'password'   as TabId, label: 'Change Password',     icon: Lock },
    ...(isSystemAdmin ? [{ id: 'usermgmt' as TabId, label: 'User Passwords', icon: KeyRound }] : []),
  ];

  const handleSaveProfile = async () => {
    if (!profileName.trim() || !profileEmail.trim()) return;
    setSavingProfile(true);
    try {
      await updateUser({
        ...user,
        name: profileName.trim(),
        email: profileEmail.trim(),
        contactNo: profileContact.trim() || undefined,
      });
      await checkAuthStatus();
      setProfileSaved(true);
      showSuccess('Profile updated');
      setTimeout(() => setProfileSaved(false), 2500);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to update profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    setPasswordError('');
    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError('All fields are required');
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match');
      return;
    }
    setSavingPassword(true);
    try {
      await apiRequest<unknown>('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      showSuccess('Password changed successfully. Please sign in again next time you visit.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Current password is incorrect');
    } finally {
      setSavingPassword(false);
    }
  };

  const handleResetPassword = async (userId: number, userName: string) => {
    setResettingId(userId);
    try {
      await userService.resetPassword(userId);
      showSuccess(`Password reset to "Az@12345" for ${userName}`);
    } catch (err) {
      showError(err instanceof Error ? err.message : `Failed to reset password for ${userName}`);
    } finally {
      setResettingId(null);
    }
  };

  return (
    <PageTransition>
      <div className="max-w-4xl mx-auto space-y-4">
        <PageHeader
          title="Settings"
          description="Manage your profile, appearance and account security."
        />

        <div className="flex flex-col md:flex-row gap-4">
          {/* Sidebar Tabs */}
          <aside className="w-full md:w-48 space-y-0.5">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "w-full flex items-center space-x-2.5 px-3 py-2 rounded border border-transparent transition-all font-black text-[11px] uppercase tracking-wider",
                  activeTab === tab.id
                    ? "bg-white dark:bg-gray-800 text-indigo-600 shadow-sm border-gray-100 dark:border-gray-700"
                    : "text-gray-400 hover:text-gray-600 hover:bg-gray-50/50 dark:hover:bg-gray-900/50"
                )}
              >
                <tab.icon size={14} className={cn(activeTab === tab.id ? "text-indigo-500" : "opacity-50")} />
                <span>{tab.label}</span>
              </button>
            ))}
          </aside>

          {/* Content */}
          <div className="flex-1">
            <Card className="border-none shadow-md ring-1 ring-black/5 dark:ring-white/5">
              <CardContent className="p-5">

                {/* ── Profile ── */}
                {activeTab === 'profile' && (
                  <div className="space-y-5">
                    <div className="flex items-center space-x-4 pb-4 border-b border-gray-50 dark:border-gray-900">
                      <img src={user.avatar} alt="Profile" className="h-12 w-12 rounded border border-gray-100 dark:border-gray-800 object-cover shadow-sm" />
                      <div className="min-w-0">
                        <h3 className="text-sm font-black uppercase tracking-tight italic font-display truncate">{user.name}</h3>
                        <p className="text-gray-400 text-[11px] font-medium truncate">{user.email}</p>
                        <span className="inline-block mt-1 px-1.5 py-0.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 text-[9px] font-black uppercase tracking-widest rounded">{user.role}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="block text-[11px] font-black uppercase tracking-widest text-gray-400 mb-1">Full Name <span className="text-red-500">*</span></label>
                        <input
                          type="text"
                          value={profileName}
                          onChange={e => setProfileName(e.target.value)}
                          className="w-full px-3 py-1.5 bg-gray-50/50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded focus:ring-1 focus:ring-indigo-500/30 outline-none text-[13px] font-medium"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="block text-[11px] font-black uppercase tracking-widest text-gray-400 mb-1">Email <span className="text-red-500">*</span></label>
                        <input
                          type="email"
                          value={profileEmail}
                          onChange={e => setProfileEmail(e.target.value)}
                          className="w-full px-3 py-1.5 bg-gray-50/50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded focus:ring-1 focus:ring-indigo-500/30 outline-none text-[13px] font-medium"
                        />
                      </div>
                      <div className="space-y-1 sm:col-span-2">
                        <label className="block text-[11px] font-black uppercase tracking-widest text-gray-400 mb-1">Contact No.</label>
                        <input
                          type="text"
                          value={profileContact}
                          onChange={e => setProfileContact(e.target.value)}
                          placeholder="Optional"
                          className="w-full px-3 py-1.5 bg-gray-50/50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded focus:ring-1 focus:ring-indigo-500/30 outline-none text-[13px] font-medium placeholder:text-gray-300"
                        />
                      </div>
                    </div>

                    <div className="pt-3 border-t border-gray-50 dark:border-gray-900 flex justify-end">
                      <Button
                        onClick={handleSaveProfile}
                        disabled={savingProfile || !profileName.trim() || !profileEmail.trim()}
                        className={cn("px-6 h-9 text-[11px] font-black uppercase tracking-widest", profileSaved && "bg-emerald-600 hover:bg-emerald-700")}
                      >
                        {profileSaved ? <><Check size={14} className="mr-2" /> Saved</> : savingProfile ? 'Saving…' : 'Save Profile'}
                      </Button>
                    </div>
                  </div>
                )}

                {/* ── Appearance ── */}
                {activeTab === 'appearance' && (
                  <div className="space-y-4">
                    <h3 className="text-xs font-black uppercase tracking-widest text-gray-400 flex items-center">
                      <Palette size={14} className="mr-2 text-indigo-500" /> Interface Mode
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => setTheme('light')}
                        className={cn(
                          "p-3 rounded border transition-all text-left group",
                          theme === 'light' ? "border-indigo-500 bg-indigo-50/30 shadow-sm" : "border-gray-100 dark:border-gray-800 hover:border-gray-200"
                        )}
                      >
                        <div className="h-10 w-full bg-white border border-gray-100 rounded mb-2 group-hover:scale-[1.01] transition-transform shadow-sm" />
                        <span className="font-bold text-[11px] uppercase tracking-widest">Light</span>
                      </button>
                      <button
                        onClick={() => setTheme('dark')}
                        className={cn(
                          "p-3 rounded border transition-all text-left group",
                          theme === 'dark' ? "border-indigo-500 bg-indigo-900/10 shadow-sm" : "border-gray-100 dark:border-gray-800 hover:border-gray-200"
                        )}
                      >
                        <div className="h-10 w-full bg-gray-900 border border-gray-800 rounded mb-2 group-hover:scale-[1.01] transition-transform shadow-sm" />
                        <span className="font-bold text-[11px] uppercase tracking-widest">Dark</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* ── Change Password ── */}
                {activeTab === 'password' && (
                  <div className="space-y-4">
                    <h3 className="text-xs font-black uppercase tracking-widest text-gray-400 flex items-center">
                      <Lock size={14} className="mr-2 text-rose-500" /> Change Password
                    </h3>

                    <div className="space-y-3">
                      {[
                        { label: 'Current Password', value: currentPassword, set: setCurrentPassword, show: showCurrent, toggle: () => setShowCurrent(v => !v) },
                        { label: 'New Password',     value: newPassword,     set: setNewPassword,     show: showNew,     toggle: () => setShowNew(v => !v) },
                        { label: 'Confirm Password', value: confirmPassword, set: setConfirmPassword, show: showConfirm, toggle: () => setShowConfirm(v => !v) },
                      ].map(field => (
                        <div key={field.label} className="space-y-1">
                          <label className="block text-[11px] font-black uppercase tracking-widest text-gray-400 mb-1">{field.label} <span className="text-red-500">*</span></label>
                          <div className="relative">
                            <input
                              type={field.show ? 'text' : 'password'}
                              value={field.value}
                              onChange={e => field.set(e.target.value)}
                              className="w-full px-3 py-1.5 pr-9 bg-gray-50/50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded focus:ring-1 focus:ring-indigo-500/30 outline-none text-[13px] font-medium"
                            />
                            <button
                              type="button"
                              onClick={field.toggle}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                            >
                              {field.show ? <EyeOff size={13} /> : <Eye size={13} />}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {passwordError && (
                      <p className="text-[11px] text-rose-500 font-bold">{passwordError}</p>
                    )}

                    <div className="pt-3 border-t border-gray-50 dark:border-gray-900 flex justify-end">
                      <Button
                        onClick={handleChangePassword}
                        disabled={savingPassword}
                        className="px-6 h-9 text-[11px] font-black uppercase tracking-widest bg-rose-600 hover:bg-rose-700"
                      >
                        {savingPassword ? 'Updating…' : 'Update Password'}
                      </Button>
                    </div>
                  </div>
                )}

                {/* ── User Password Reset (SystemAdmin only) ── */}
                {activeTab === 'usermgmt' && isSystemAdmin && (
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-xs font-black uppercase tracking-widest text-gray-400 flex items-center">
                        <Users size={14} className="mr-2 text-amber-500" /> User Password Reset
                      </h3>
                      <p className="text-[10px] text-gray-400 mt-1 font-medium">
                        Reset any user's password to <span className="font-black text-gray-600 dark:text-gray-300 font-mono">Az@12345</span>. System Admin only.
                      </p>
                    </div>

                    <div className="p-3 bg-amber-50/40 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30 rounded-lg flex items-start gap-2">
                      <Lock size={12} className="text-amber-500 mt-0.5 shrink-0" />
                      <p className="text-[10px] text-amber-700 dark:text-amber-400 font-medium leading-snug">
                        This immediately resets the selected user's password. The user should change it on next login.
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      {users.filter(u => u.id !== user.id).map(u => (
                        <div
                          key={u.id}
                          className="flex items-center justify-between px-3 py-2.5 bg-gray-50/50 dark:bg-gray-900/40 border border-gray-100 dark:border-gray-800 rounded-lg hover:border-gray-200 dark:hover:border-gray-700 transition-colors"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <img src={u.avatar} alt="" className="h-7 w-7 rounded border border-gray-100 dark:border-gray-800 object-cover shrink-0" />
                            <div className="min-w-0">
                              <p className="text-[12px] font-bold text-gray-800 dark:text-gray-200 truncate leading-none">{u.name}</p>
                              <p className="text-[9px] text-gray-400 font-mono truncate mt-0.5">{u.email}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 ml-3">
                            <span className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-500 rounded">{u.role}</span>
                            <button
                              type="button"
                              onClick={() => handleResetPassword(u.id, u.name)}
                              disabled={resettingId === u.id}
                              className="flex items-center gap-1 px-2.5 py-1.5 text-[9px] font-black uppercase tracking-widest bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-rose-600 hover:bg-rose-100 dark:hover:bg-rose-900/40 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <RotateCcw size={10} className={resettingId === u.id ? 'animate-spin' : ''} />
                              {resettingId === u.id ? 'Resetting…' : 'Reset'}
                            </button>
                          </div>
                        </div>
                      ))}
                      {users.filter(u => u.id !== user.id).length === 0 && (
                        <p className="text-[11px] text-gray-400 italic text-center py-6">No other users found</p>
                      )}
                    </div>
                  </div>
                )}

              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
