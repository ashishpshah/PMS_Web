import { useEffect, useState, useCallback, useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { DateInput } from '../components/ui/DateInput';
import { PageHeader } from '../components/ui/PageHeader';
import { PageTransition } from '../components/Layout/PageTransition';
import { useAuth } from '../context/AuthContext';
import { showSuccess, showError } from '../lib/toast';
import { formatDMY, toIso, todayMidnight as getTodayMidnight } from '../lib/leaveDateUtils';
import { leaveService, Holiday, DayType } from '../services/leave.service';
import { X, Plus, Pencil, Trash2, Lock } from 'lucide-react';

const DAY_TYPE_LABEL: Record<DayType, string> = {
  Holiday: 'Holiday',
  WorkingDay: 'Working Day',
};

export default function Holidays() {
  const { isAdmin, isSystemAdmin } = useAuth();
  const isAdminUser = isAdmin || isSystemAdmin;

  return <HolidayListContent isAdmin={isAdminUser} />;
}

function HolidayListContent({ isAdmin }: { isAdmin: boolean }) {
  const currentYear = new Date().getFullYear();
  const yearOptions = useMemo(() => [currentYear, currentYear - 1, currentYear - 2, currentYear - 3], [currentYear]);
  const [year, setYear] = useState(currentYear);
  const todayMidnight = getTodayMidnight();
  const todayIso = toIso(todayMidnight);

  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formDate, setFormDate] = useState('');
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<DayType>('Holiday');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await leaveService.getHolidays(`${year}-01-01`, `${year}-12-31`);
      // The same Holidays table also carries the auto-generated alternating-Saturday rows
      // (isManualOverride: false) that drive Calendar/leave day-count math — those are governed
      // by Rules Settings' Saturday Policy, not individually managed here. This admin list is
      // for the holidays an admin actually curates (New Year, Republic Day, etc.), so only show
      // manually-added/overridden rows — otherwise every Saturday would clutter this list.
      const manual = list.filter(h => h.isManualOverride);
      setHolidays(manual.sort((a, b) => a.date.localeCompare(b.date)));
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load holidays');
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => { load(); }, [load]);

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormDate('');
    setFormName('');
    setFormType('Holiday');
  };

  const openEditForm = (h: Holiday) => {
    setEditingId(h.id);
    setFormDate(h.date.slice(0, 10));
    setFormName(h.name);
    setFormType(h.dayType);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formDate || !formName.trim()) {
      showError('Date and name are required.');
      return;
    }
    if (formDate < todayIso) {
      showError('Only today or a future date can be added or edited — past holidays are locked historical records.');
      return;
    }
    setSaving(true);
    try {
      await leaveService.setHolidayOverride({ date: formDate, name: formName.trim(), dayType: formType });
      showSuccess(editingId ? 'Holiday updated.' : 'Holiday added.');
      resetForm();
      await load();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to save holiday');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await leaveService.deleteHoliday(id);
      showSuccess('Holiday deleted.');
      await load();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to delete holiday');
    }
  };

  return (
    <PageTransition>
      <div className="max-w-3xl mx-auto space-y-4">
        <PageHeader title="Holidays" description={`Manage the ${year} holiday calendar.`} />

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <label className="block text-[11px] font-black uppercase tracking-widest text-gray-400">Year</label>
              <select
                value={year}
                onChange={e => setYear(Number(e.target.value))}
                className="px-3 py-1.5 bg-white dark:bg-gray-950 border border-gray-100 dark:border-gray-800 rounded text-[13px] font-bold"
              >
                {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            {isAdmin && (
              <Button onClick={() => { resetForm(); setShowForm(true); }} className="h-9 px-4 text-[11px] font-black uppercase tracking-widest">
                <Plus size={14} className="mr-1.5" /> Add New Holiday
              </Button>
            )}
          </div>

          {isAdmin && showForm && (
            <div className="p-4 rounded-lg border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/40 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black uppercase tracking-widest text-gray-400">{editingId ? 'Edit Holiday' : 'New Holiday'}</h4>
                <button onClick={resetForm} className="text-gray-400 hover:text-gray-600" aria-label="Close form"><X size={16} /></button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
                <div className="space-y-1">
                  <label className="block text-[11px] font-black uppercase tracking-widest text-gray-400">Date</label>
                  <DateInput value={formDate} onChange={setFormDate} minDate={todayMidnight} />
                </div>
                <div className="space-y-1">
                  <label className="block text-[11px] font-black uppercase tracking-widest text-gray-400">Holiday Name</label>
                  <input
                    type="text"
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white dark:bg-gray-950 border border-gray-100 dark:border-gray-800 rounded text-[13px] font-medium"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[11px] font-black uppercase tracking-widest text-gray-400">Type</label>
                  <select
                    value={formType}
                    onChange={e => setFormType(e.target.value as DayType)}
                    className="w-full px-3 py-1.5 bg-white dark:bg-gray-950 border border-gray-100 dark:border-gray-800 rounded text-[13px] font-medium"
                  >
                    <option value="Holiday">Holiday</option>
                    <option value="WorkingDay">Working Day</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={resetForm} className="h-9 px-4 text-[11px] font-black uppercase tracking-widest">Cancel</Button>
                <Button onClick={handleSave} disabled={saving} className="h-9 px-6 text-[11px] font-black uppercase tracking-widest">
                  {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Add Holiday'}
                </Button>
              </div>
            </div>
          )}

          <div className="overflow-x-auto rounded-lg border border-gray-100 dark:border-gray-800">
            <table className="w-full text-[12px]">
              <thead className="bg-gray-50 dark:bg-gray-900/60">
                <tr className="text-left text-[10px] font-black uppercase tracking-widest text-gray-400">
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Day</th>
                  <th className="px-3 py-2">Holiday</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {holidays.map(h => {
                  const isPast = h.date.slice(0, 10) < todayIso;
                  return (
                    <tr key={h.id} className="border-t border-gray-50 dark:border-gray-900">
                      <td className="px-3 py-2 font-mono">{formatDMY(h.date)}</td>
                      <td className="px-3 py-2 text-gray-500">{new Date(h.date.slice(0, 10)).toLocaleDateString(undefined, { weekday: 'long' })}</td>
                      <td className="px-3 py-2 font-bold">
                        {h.name}
                        {h.dayType !== 'Holiday' && (
                          <span className="ml-1.5 text-[9px] text-gray-400 uppercase font-black">({DAY_TYPE_LABEL[h.dayType]})</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-2">
                          {isPast ? (
                            <span className="p-1 text-gray-300 dark:text-gray-700" title="Past holidays are locked historical records"><Lock size={14} /></span>
                          ) : (
                            <>
                              {isAdmin && (
                                <>
                                  <button onClick={() => openEditForm(h)} className="p-1 text-gray-400 hover:text-indigo-500" aria-label="Edit holiday"><Pencil size={14} /></button>
                                  <button onClick={() => handleDelete(h.id)} className="p-1 text-gray-400 hover:text-rose-500" aria-label="Delete holiday"><Trash2 size={14} /></button>
                                </>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!loading && holidays.length === 0 && (
              <p className="text-[11px] text-gray-400 italic text-center py-6">No holidays recorded for {year} yet</p>
            )}
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
