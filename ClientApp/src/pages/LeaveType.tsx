import { useEffect, useState, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { TimeInput } from '../components/ui/TimeInput';
import { PageHeader } from '../components/ui/PageHeader';
import { PageTransition } from '../components/Layout/PageTransition';
import { useAuth } from '../context/AuthContext';
import { cn } from '../lib/utils';
import { showSuccess, showError } from '../lib/toast';
import { leaveService, LeaveType as LeaveTypeModel, AnnualLeaveAllocation, WorkweekRules } from '../services/leave.service';
import { Tag, Settings as SettingsIcon, X, Plus, Pencil, Trash2 } from 'lucide-react';

type TabId = 'types' | 'rules';

// Access: IsAdmin only.
export default function LeaveTypePage() {
  const { isAdmin, isSystemAdmin } = useAuth();
  if (!isAdmin && !isSystemAdmin) return <Navigate to="/leaves" replace />;

  return <LeaveTypeContent />;
}

function LeaveTypeContent() {
  const [activeTab, setActiveTab] = useState<TabId>('types');
  const tabs = [
    { id: 'types' as TabId, label: 'Leave Type', icon: Tag },
    { id: 'rules' as TabId, label: 'Rules Settings', icon: SettingsIcon },
  ];

  return (
    <PageTransition>
      <div className="max-w-4xl mx-auto space-y-4">
        <PageHeader title="Leave Type" description="Manage leave types, the annual leave allocation, and workweek rules." />

        <div className="flex flex-col md:flex-row gap-4">
          <aside className="w-full md:w-48 space-y-0.5">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'w-full flex items-center space-x-2.5 px-3 py-2 rounded border border-transparent transition-all font-black text-[11px] uppercase tracking-wider',
                  activeTab === tab.id
                    ? 'bg-white dark:bg-gray-800 text-indigo-600 shadow-sm border-gray-100 dark:border-gray-700'
                    : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50/50 dark:hover:bg-gray-900/50'
                )}
              >
                <tab.icon size={14} className={cn(activeTab === tab.id ? 'text-indigo-500' : 'opacity-50')} />
                <span>{tab.label}</span>
              </button>
            ))}
          </aside>

          <div className="flex-1 min-w-0">
            <Card className="border-none shadow-md ring-1 ring-black/5 dark:ring-white/5">
              <CardContent className="p-5">
                {activeTab === 'types' && <LeaveTypesSection />}
                {activeTab === 'rules' && <RulesSettingsSection />}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}

// ── Leave Type CRUD + Annual Leave Allocation ─────────────────────────────

function LeaveTypesSection() {
  const currentYear = new Date().getFullYear();

  const [types, setTypes] = useState<LeaveTypeModel[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(true);
  const [showTypeForm, setShowTypeForm] = useState(false);
  const [editingTypeId, setEditingTypeId] = useState<number | null>(null);
  const [typeName, setTypeName] = useState('');
  const [typeActive, setTypeActive] = useState(true);
  const [savingType, setSavingType] = useState(false);

  const [allocations, setAllocations] = useState<AnnualLeaveAllocation[]>([]);
  const [loadingAllocations, setLoadingAllocations] = useState(true);
  const [showAllocationModal, setShowAllocationModal] = useState(false);
  const [allocationDraft, setAllocationDraft] = useState('');
  const [savingAllocation, setSavingAllocation] = useState(false);

  const loadTypes = useCallback(async () => {
    setLoadingTypes(true);
    try {
      setTypes(await leaveService.getTypes());
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load leave types');
    } finally {
      setLoadingTypes(false);
    }
  }, []);

  const loadAllocations = useCallback(async () => {
    setLoadingAllocations(true);
    try {
      setAllocations(await leaveService.getAllocations());
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load annual leave allocation');
    } finally {
      setLoadingAllocations(false);
    }
  }, []);

  useEffect(() => { loadTypes(); loadAllocations(); }, [loadTypes, loadAllocations]);

  const resetTypeForm = () => {
    setShowTypeForm(false);
    setEditingTypeId(null);
    setTypeName('');
    setTypeActive(true);
  };

  const openEditTypeForm = (t: LeaveTypeModel) => {
    setEditingTypeId(t.id);
    setTypeName(t.name);
    setTypeActive(t.isActive);
    setShowTypeForm(true);
  };

  const handleSaveType = async () => {
    if (!typeName.trim()) {
      showError('Name is required.');
      return;
    }
    setSavingType(true);
    try {
      const dto = { name: typeName.trim(), isActive: typeActive };
      if (editingTypeId) {
        await leaveService.updateType(editingTypeId, dto);
        showSuccess('Leave type updated.');
      } else {
        await leaveService.createType(dto);
        showSuccess('Leave type created.');
      }
      resetTypeForm();
      await loadTypes();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to save leave type');
    } finally {
      setSavingType(false);
    }
  };

  const handleDeleteType = async (id: number) => {
    try {
      await leaveService.deleteType(id);
      showSuccess('Leave type deleted.');
      await loadTypes();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to delete leave type');
    }
  };

  const openAllocationModal = () => {
    const current = allocations.find(a => a.year === currentYear);
    setAllocationDraft(String(current?.leaveDays ?? 12));
    setShowAllocationModal(true);
  };

  const handleSaveAllocation = async () => {
    const value = Number(allocationDraft);
    if (!allocationDraft || Number.isNaN(value) || value <= 0) {
      showError('Enter a valid number of leave days.');
      return;
    }
    setSavingAllocation(true);
    try {
      await leaveService.updateCurrentAllocation({ leaveDays: value });
      showSuccess('Annual leave allocation updated.');
      setShowAllocationModal(false);
      await loadAllocations();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to update allocation');
    } finally {
      setSavingAllocation(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Leave Type CRUD */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-black uppercase tracking-widest text-gray-400">Leave Types</h3>
          <Button onClick={() => { resetTypeForm(); setShowTypeForm(true); }} className="h-9 px-4 text-[11px] font-black uppercase tracking-widest">
            <Plus size={14} className="mr-1.5" /> Add Leave Type
          </Button>
        </div>

        {showTypeForm && (
          <div className="p-4 rounded-lg border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/40 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black uppercase tracking-widest text-gray-400">{editingTypeId ? 'Edit Leave Type' : 'New Leave Type'}</h4>
              <button onClick={resetTypeForm} className="text-gray-400 hover:text-gray-600" aria-label="Close form"><X size={16} /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
              <div className="sm:col-span-2 space-y-1">
                <label className="block text-[11px] font-black uppercase tracking-widest text-gray-400">Name</label>
                <input
                  type="text"
                  value={typeName}
                  onChange={e => setTypeName(e.target.value)}
                  className="w-full px-3 py-1.5 bg-white dark:bg-gray-950 border border-gray-100 dark:border-gray-800 rounded text-[13px] font-medium"
                />
              </div>
              <label className="flex items-center gap-2 text-[11px] font-bold text-gray-500 pb-2 cursor-pointer">
                <input type="checkbox" checked={typeActive} onChange={e => setTypeActive(e.target.checked)} />
                Active
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={resetTypeForm} className="h-9 px-4 text-[11px] font-black uppercase tracking-widest">Cancel</Button>
              <Button onClick={handleSaveType} disabled={savingType} className="h-9 px-6 text-[11px] font-black uppercase tracking-widest">
                {savingType ? 'Saving…' : editingTypeId ? 'Save Changes' : 'Create'}
              </Button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto rounded-lg border border-gray-100 dark:border-gray-800">
          <table className="w-full text-[12px]">
            <thead className="bg-gray-50 dark:bg-gray-900/60">
              <tr className="text-left text-[10px] font-black uppercase tracking-widest text-gray-400">
                <th className="px-3 py-2">Leave Type</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {types.map(t => (
                <tr key={t.id} className="border-t border-gray-50 dark:border-gray-900">
                  <td className="px-3 py-2 font-bold">{t.name}</td>
                  <td className="px-3 py-2">
                    <Badge variant={t.isActive ? 'success' : 'default'}>{t.isActive ? 'Active' : 'Inactive'}</Badge>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => openEditTypeForm(t)} className="p-1 text-gray-400 hover:text-indigo-500" aria-label="Edit leave type"><Pencil size={14} /></button>
                      <button onClick={() => handleDeleteType(t.id)} className="p-1 text-gray-400 hover:text-rose-500" aria-label="Delete leave type"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loadingTypes && types.length === 0 && (
            <p className="text-[11px] text-gray-400 italic text-center py-6">No leave types yet</p>
          )}
        </div>
      </div>

      {/* Annual Leave Allocation */}
      <div className="space-y-3 pt-4 border-t border-gray-50 dark:border-gray-900">
        <h3 className="text-xs font-black uppercase tracking-widest text-gray-400">Annual Leave Allocation</h3>
        <div className="overflow-x-auto rounded-lg border border-gray-100 dark:border-gray-800">
          <table className="w-full text-[12px]">
            <thead className="bg-gray-50 dark:bg-gray-900/60">
              <tr className="text-left text-[10px] font-black uppercase tracking-widest text-gray-400">
                <th className="px-3 py-2">Year</th>
                <th className="px-3 py-2">Leave Days</th>
              </tr>
            </thead>
            <tbody>
              {allocations.map(a => (
                <tr key={a.year} className="border-t border-gray-50 dark:border-gray-900">
                  <td className="px-3 py-2 font-bold">{a.year}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span>{a.leaveDays}</span>
                      {a.year === currentYear && (
                        <button onClick={openAllocationModal} className="p-1 text-gray-400 hover:text-indigo-500" aria-label="Edit current year leave days">
                          <Pencil size={13} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loadingAllocations && allocations.length === 0 && (
            <p className="text-[11px] text-gray-400 italic text-center py-6">No allocation records yet</p>
          )}
        </div>
      </div>

      <Modal isOpen={showAllocationModal} onClose={() => setShowAllocationModal(false)} title={`Update ${currentYear} Leave Days`}>
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="block text-[11px] font-black uppercase tracking-widest text-gray-400">Leave Days</label>
            <input
              type="number"
              value={allocationDraft}
              onChange={e => setAllocationDraft(e.target.value)}
              className="w-full px-3 py-1.5 bg-gray-50/50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded focus:ring-1 focus:ring-indigo-500/30 outline-none text-[13px] font-medium"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowAllocationModal(false)} className="h-9 px-4 text-[11px] font-black uppercase tracking-widest">Cancel</Button>
            <Button onClick={handleSaveAllocation} disabled={savingAllocation} className="h-9 px-6 text-[11px] font-black uppercase tracking-widest">
              {savingAllocation ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ── Rules Settings ────────────────────────────────────────────────────────

const OCCURRENCES = [1, 2, 3, 4, 5];

function RulesSettingsSection() {
  const [rules, setRules] = useState<WorkweekRules | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    leaveService.getRules()
      .then(setRules)
      .catch(err => showError(err instanceof Error ? err.message : 'Failed to load rules'))
      .finally(() => setLoading(false));
  }, []);

  const toggleOccurrence = (n: number) => {
    if (!rules) return;
    const current = rules.holidaySaturdayOccurrences;
    const next = current.includes(n) ? current.filter(x => x !== n) : [...current, n];
    setRules({ ...rules, holidaySaturdayOccurrences: next });
  };

  const handleSave = async () => {
    if (!rules) return;
    setSaving(true);
    try {
      const saved = await leaveService.updateRules({
        workStartTime: rules.workStartTime,
        workEndTime: rules.workEndTime,
        breakMinMinutes: rules.breakMinMinutes,
        breakMaxMinutes: rules.breakMaxMinutes,
        holidaySaturdayOccurrences: rules.holidaySaturdayOccurrences,
      });
      setRules(saved);
      showSuccess('Rules Settings updated.');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to save rules');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !rules) return <p className="text-[11px] text-gray-400 italic">Loading…</p>;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="block text-[11px] font-black uppercase tracking-widest text-gray-400">Work Start Time</label>
          <TimeInput value={rules.workStartTime} onChange={v => setRules({ ...rules, workStartTime: v })} />
        </div>
        <div className="space-y-1">
          <label className="block text-[11px] font-black uppercase tracking-widest text-gray-400">Work End Time</label>
          <TimeInput value={rules.workEndTime} onChange={v => setRules({ ...rules, workEndTime: v })} />
        </div>
        <div className="space-y-1">
          <label className="block text-[11px] font-black uppercase tracking-widest text-gray-400">Break Minimum (minutes)</label>
          <input
            type="number"
            value={rules.breakMinMinutes}
            onChange={e => setRules({ ...rules, breakMinMinutes: Number(e.target.value) })}
            className="w-full px-3 py-1.5 bg-gray-50/50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded focus:ring-1 focus:ring-indigo-500/30 outline-none text-[13px] font-medium"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-[11px] font-black uppercase tracking-widest text-gray-400">Break Maximum (minutes)</label>
          <input
            type="number"
            value={rules.breakMaxMinutes}
            onChange={e => setRules({ ...rules, breakMaxMinutes: Number(e.target.value) })}
            className="w-full px-3 py-1.5 bg-gray-50/50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded focus:ring-1 focus:ring-indigo-500/30 outline-none text-[13px] font-medium"
          />
        </div>
      </div>

      <div className="pt-4 border-t border-gray-50 dark:border-gray-900 space-y-3">
        <h3 className="text-xs font-black uppercase tracking-widest text-gray-400">Saturday Policy</h3>
        <p className="text-[10px] text-gray-400">Pick which occurrence of Saturday in the month is a full day off. An occurrence left unpicked is a normal full working day. (A specific Saturday can still be individually overridden to Holiday or Working Day via Holiday List — that's a per-date override, not part of this recurring pattern.)</p>

        <div className="space-y-2">
          <p className="text-[11px] font-bold text-gray-500">Holiday Saturdays</p>
          <div className="flex gap-2">
            {OCCURRENCES.map(n => (
              <button
                key={n}
                onClick={() => toggleOccurrence(n)}
                className={cn(
                  'h-8 w-8 rounded-full text-[11px] font-black border transition-colors',
                  rules.holidaySaturdayOccurrences.includes(n)
                    ? 'bg-rose-500 border-rose-500 text-white'
                    : 'border-gray-200 dark:border-gray-700 text-gray-400'
                )}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="pt-3 border-t border-gray-50 dark:border-gray-900 flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="px-6 h-9 text-[11px] font-black uppercase tracking-widest">
          {saving ? 'Saving…' : 'Save Rules'}
        </Button>
      </div>
    </div>
  );
}
