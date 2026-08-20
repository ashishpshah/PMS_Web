import React, { useState } from 'react';
import { X, UserCheck } from 'lucide-react';
import { ReasonTagSelector } from './ReasonTagSelector';
import { ReasonTag } from '../../types';

interface SelectableUser {
  id: number;
  name: string;
  avatar?: string;
}

interface ReassignModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  currentAssigneeId?: number;
  availableUsers: SelectableUser[];
  reasonTags?: ReasonTag[];
  onConfirm: (newUserId: number, reasonTag: ReasonTag) => Promise<void>;
}

export function ReassignModal({ isOpen, onClose, title, currentAssigneeId, availableUsers, reasonTags, onConfirm }: ReassignModalProps) {
  const [selectedUserId, setSelectedUserId] = useState<number>(0);
  const [reasonTag, setReasonTag] = useState<ReasonTag | ''>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const eligible = availableUsers.filter(u => u.id !== currentAssigneeId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) { setError('Please select a user'); return; }
    if (!reasonTag) { setError('Please select a reason'); return; }
    setError('');
    setLoading(true);
    try {
      await onConfirm(selectedUserId, reasonTag as ReasonTag);
      setSelectedUserId(0);
      setReasonTag('');
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Reassignment failed';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <UserCheck size={16} className="text-indigo-600" />
            <h2 className="text-[13px] font-black uppercase tracking-widest text-gray-900 dark:text-gray-100">{title}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X size={16} className="text-gray-400" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* User select */}
          <div className="space-y-1">
            <label className="block text-[9px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-400">
              Assign To <span className="text-red-500">*</span>
            </label>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {eligible.length === 0 ? (
                <p className="text-[11px] text-gray-400 italic py-2">No other members available</p>
              ) : (
                eligible.map(user => (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => setSelectedUserId(user.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-all text-left ${
                      selectedUserId === user.id
                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                        : 'border-gray-100 dark:border-gray-800 hover:border-indigo-200 dark:hover:border-indigo-700'
                    }`}
                  >
                    {user.avatar ? (
                      <img src={user.avatar} className="h-7 w-7 rounded-full object-cover border border-gray-100" alt="" />
                    ) : (
                      <div className="h-7 w-7 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-[10px] font-black text-indigo-600">
                        {user.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="text-[12px] font-bold text-gray-800 dark:text-gray-200">{user.name}</span>
                  </button>
                ))
              )}
            </div>
          </div>

          <ReasonTagSelector value={reasonTag} onChange={setReasonTag} required tags={reasonTags} />

          {error && (
            <p className="text-[11px] text-red-500 font-bold">{error}</p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 text-[11px] font-black uppercase tracking-widest border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || eligible.length === 0}
              className="flex-1 px-4 py-2 text-[11px] font-black uppercase tracking-widest bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Reassigning...' : 'Confirm Reassign'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
