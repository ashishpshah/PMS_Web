import React, { useState, useEffect, useCallback } from 'react';
import { BookOpen, Plus, Pencil, Trash2, Clock, X, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { PageTransition } from '../components/Layout/PageTransition';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Card, CardContent } from '../components/ui/Card';
import { DateInput } from '../components/ui/DateInput';
import { TimeInput } from '../components/ui/TimeInput';
import { EmptyState } from '../components/ui/EmptyState';
import { useSweetAlert } from '../context/SweetAlertContext';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { showSuccess, showError } from '../lib/toast';
import {
  diaryService,
  WorkDiaryEntry,
  DiaryProjectOption,
  PaginatedResponse,
} from '../services/diary.service';
import { isAllowedDiaryDate, getPreviousWorkingDay } from '../lib/diaryDateUtils';
import { cn, formatDate, fromHHMM, toHHMM } from '../lib/utils';
import { VSelect, SelectOption } from '../components/forms/VSelect';

// ── helpers ───────────────────────────────────────────────────────────────────


function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

type DatePreset = 'today' | 'yesterday' | 'this-week' | 'this-month' | 'last-month' | 'last-30' | 'custom';

const PRESETS: { label: string; value: DatePreset }[] = [
  { label: 'Today',        value: 'today' },
  { label: 'Yesterday',    value: 'yesterday' },
  { label: 'This Week',    value: 'this-week' },
  { label: 'This Month',   value: 'this-month' },
  { label: 'Last Month',   value: 'last-month' },
  { label: 'Last 30 Days', value: 'last-30' },
  { label: 'Custom',       value: 'custom' },
];

function getRange(preset: DatePreset, customFrom: string, customTo: string): { from: string; to: string } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  switch (preset) {
    case 'today':
      return { from: toISO(today), to: toISO(today) };
    case 'yesterday': {
      const y = new Date(today); y.setDate(y.getDate() - 1);
      return { from: toISO(y), to: toISO(y) };
    }
    case 'this-week': {
      const dow = today.getDay();
      const mon = new Date(today); mon.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
      return { from: toISO(mon), to: toISO(today) };
    }
    case 'this-month': {
      const fm = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: toISO(fm), to: toISO(today) };
    }
    case 'last-month': {
      const lf = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const ll = new Date(today.getFullYear(), today.getMonth(), 0);
      return { from: toISO(lf), to: toISO(ll) };
    }
    case 'last-30': {
      const l30 = new Date(today); l30.setDate(l30.getDate() - 29);
      return { from: toISO(l30), to: toISO(today) };
    }
    case 'custom':
      return { from: customFrom, to: customTo };
  }
}

const CATEGORY_COLORS: Record<string, string> = {
  Development:   'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  Meeting:       'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  Review:        'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  Testing:       'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  Documentation: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  Other:         'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
};

const PAGE_SIZE = 25;

interface RowData {
  description: string;
  hours: string;
  category: string;
  projectId: string;
}

const EMPTY_ROW = (): RowData => ({ description: '', hours: '', category: '', projectId: '' });

const FIELD_CLS = 'w-full text-[12px] border border-gray-200 dark:border-gray-700 rounded-md px-2.5 py-1.5 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 placeholder-gray-300 dark:placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400 transition-colors';

// ── main page ─────────────────────────────────────────────────────────────────

export default function Diary() {
  const { confirmAlert } = useSweetAlert();
  const { isAdmin, isSystemAdmin } = useAuth();
  const { users } = useData();
  const isAdminView = isAdmin || isSystemAdmin;

  // All projects — any user may log against any project, independent of project access.
  const [projects, setProjects] = useState<DiaryProjectOption[]>([]);
  useEffect(() => {
    diaryService.getProjects().then(setProjects).catch(() => {});
  }, []);

  const projectOptions: SelectOption[] = projects.map(p => ({ value: p.id, label: p.code ? `${p.code} — ${p.name}` : p.name }));

  // categories (loaded from API)
  const [categories, setCategories] = useState<string[]>([]);

  useEffect(() => {
    diaryService.getCategories().then(setCategories).catch(() => {});
  }, []);

  // filter state
  const [preset, setPreset]             = useState<DatePreset>('this-month');
  const [customFrom, setCustomFrom]     = useState('');
  const [customTo, setCustomTo]         = useState('');
  const [searchQuery, setSearchQuery]   = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedUserId, setSelectedUserId]     = useState<number | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  // Server-side pagination
  const [page, setPage]                 = useState(1);
  const [pageSize, setPageSize]         = useState(25);
  const [totalEntries, setTotalEntries] = useState(0);
  const [totalPages, setTotalPages]     = useState(1);

  // entries
  const [entries, setEntries]   = useState<WorkDiaryEntry[]>([]);
  const [loading, setLoading]   = useState(false);

  // inline form
  const [showForm, setShowForm]       = useState(false);
  const [editingEntry, setEditingEntry] = useState<WorkDiaryEntry | undefined>();
  const [formDate, setFormDate]       = useState(() => toISO(new Date()));
  const [rows, setRows]               = useState<RowData[]>([EMPTY_ROW()]);
  const [saving, setSaving]           = useState(false);

  const load = useCallback(async () => {
    if (preset === 'custom' && (!customFrom || !customTo)) return;
    const { from, to } = getRange(preset, customFrom, customTo);
    setLoading(true);
    try {
      const data = isAdminView
        ? await diaryService.getAllDiary({ userId: selectedUserId ?? undefined, from, to, page, pageSize })
        : await diaryService.getMyDiary({ from, to, page, pageSize });
      setEntries(data.data);
      setTotalEntries(data.totalCount);
      setTotalPages(data.totalPages);
      setPage(data.page);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load diary entries.');
    } finally {
      setLoading(false);
    }
  }, [preset, customFrom, customTo, isAdminView, selectedUserId]);

  useEffect(() => { load(); }, [load]);

  // ── form helpers ──────────────────────────────────────────────────────────

  const updateRow = (i: number, patch: Partial<RowData>) =>
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r));

  const openAdd = () => {
    setEditingEntry(undefined);
    setFormDate(toISO(new Date()));
    setRows([EMPTY_ROW()]);
    setShowForm(true);
  };

  const openEdit = (entry: WorkDiaryEntry) => {
    setEditingEntry(entry);
    setRows([{ description: entry.description, hours: toHHMM(entry.hoursSpent), category: entry.category ?? '', projectId: entry.projectId != null ? String(entry.projectId) : '' }]);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingEntry(undefined);
    setRows([EMPTY_ROW()]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEntry) {
      if (!formDate) { showError('Date is required.'); return; }
      if (!isAllowedDiaryDate(new Date(formDate))) { showError('Selected date is not a valid working day.'); return; }
    }
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const n = rows.length > 1 ? ` (row ${i + 1})` : '';
      if (!r.description.trim()) { showError(`Description is required${n}.`); return; }
      if (!r.hours) { showError(`Time Spent is required${n}.`); return; }
      if (!r.category) { showError(`Category is required${n}.`); return; }
    }

    setSaving(true);
    try {
      if (editingEntry) {
        const r = rows[0];
        await diaryService.update(editingEntry.id, {
          description: r.description.trim(),
          category: r.category || undefined,
          hoursSpent: fromHHMM(r.hours),
          projectId: r.projectId ? Number(r.projectId) : undefined,
        });
        showSuccess('Entry updated.');
      } else {
        await Promise.all(rows.map(r => diaryService.add({
          date: formDate,
          description: r.description.trim(),
          category: r.category || undefined,
          hoursSpent: fromHHMM(r.hours),
          projectId: r.projectId ? Number(r.projectId) : undefined,
        })));
        showSuccess(rows.length === 1 ? 'Entry added.' : `${rows.length} entries added.`);
      }
      closeForm();
      await load();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (entry: WorkDiaryEntry) => {
    confirmAlert('Delete this diary entry? This cannot be undone.', async () => {
      try {
        await diaryService.remove(entry.id);
        showSuccess('Entry deleted.');
        await load();
      } catch (err) {
        showError(err instanceof Error ? err.message : 'Failed to delete entry.');
      }
    });
  };

  // client-side search + category filter
  const filtered = entries.filter(e => {
    if (selectedCategory && e.category !== selectedCategory) return false;
    if (selectedProjectId != null && e.projectId !== selectedProjectId) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      e.description.toLowerCase().includes(q) ||
      (e.category ?? '').toLowerCase().includes(q) ||
      (e.projectName ?? '').toLowerCase().includes(q)
    );
  });

  const totalSpent = filtered.reduce((sum, e) => sum + (e.hoursSpent ?? 0), 0);

  const SEL_CLS = 'text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500';

  return (
    <PageTransition>
      <div className="space-y-4 max-w-7xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <PageHeader title="Work Diary" description="Log your daily work notes" />
          {!showForm && (
            <Button onClick={openAdd}><Plus size={15} className="mr-1" /> Add Entry</Button>
          )}
        </div>

        {/* ── Inline form ── */}
        {showForm && (
          <Card className="border-none shadow-sm ring-1 ring-indigo-200 dark:ring-indigo-800 overflow-hidden">
            {/* Card header */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-indigo-50/60 dark:bg-indigo-900/20 border-b border-indigo-100 dark:border-indigo-800/50">
              <h3 className="text-[11px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
                {editingEntry ? 'Edit Entry' : 'New Entry'}
              </h3>
              {editingEntry && (
                <span className="text-[11px] font-semibold text-gray-500">{formatDate(editingEntry.date.slice(0, 10))}</span>
              )}
            </div>

            <CardContent className="p-4">
              <form onSubmit={handleSubmit} className="space-y-3">

                {/* Date row — create only */}
                {!editingEntry && (() => {
                    const todayISO = toISO(new Date());
                    const prevISO  = toISO(getPreviousWorkingDay());
                    const dateOptions: SelectOption[] = [
                      { value: todayISO, label: `Today — ${formatDate(todayISO)}` },
                      { value: prevISO,  label: `Past Working Day — ${formatDate(prevISO)}` },
                    ];
                    return (
                      <div className="flex items-center gap-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 shrink-0">Date <span className="text-red-400">*</span></label>
                        <div className="w-64">
                          <VSelect
                            options={dateOptions}
                            value={dateOptions.find(o => o.value === formDate) ?? null}
                            onChange={(opt) => { if (opt) setFormDate(String(opt.value)); }}
                            isSearchable={false}
                            isClearable={false}
                            size="sm"
                          />
                        </div>
                        <div className="flex-1" />
                        <button
                          type="button"
                          onClick={() => {
                            const last = rows[rows.length - 1];
                            if (!last.description.trim()) { showError('Fill in the Description before adding a new row.'); return; }
                            if (!last.hours)              { showError('Fill in the Time Spent before adding a new row.'); return; }
                            if (!last.category)           { showError('Select a Category before adding a new row.'); return; }
                            setRows(prev => [...prev, EMPTY_ROW()]);
                          }}
                          className="flex items-center gap-1 text-[11px] font-black uppercase tracking-widest text-indigo-600 hover:text-indigo-700 transition-colors shrink-0"
                        >
                          <Plus size={12} /> Add Row
                        </button>
                      </div>
                    );
                  })()}

                {/* Column headers — desktop only */}
                <div className="hidden sm:grid gap-2 items-end sm:[grid-template-columns:1fr_96px_150px_160px_28px]">
                  <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 pl-0.5">Description <span className="text-red-400">*</span></span>
                  <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 pl-0.5">Time Spent <span className="text-red-400">*</span></span>
                  <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 pl-0.5">Category <span className="text-red-400">*</span></span>
                  <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 pl-0.5">Project</span>
                  <span />
                </div>

                {/* Entry rows */}
                <div className="space-y-3 sm:space-y-2">
                  {rows.map((row, i) => (
                    <div
                      key={i}
                      className="flex flex-col gap-2 p-3 sm:p-0 bg-gray-50/60 dark:bg-gray-900/30 sm:bg-transparent sm:dark:bg-transparent border border-gray-100 dark:border-gray-800 sm:border-0 rounded-lg sm:rounded-none sm:grid sm:gap-2 sm:items-center sm:[grid-template-columns:1fr_96px_150px_160px_28px]"
                    >
                      {/* Description */}
                      <div>
                        <label className="block text-[9px] font-black uppercase tracking-widest text-gray-400 mb-1 sm:hidden">
                          Description <span className="text-red-400">*</span>
                        </label>
                        <input
                          type="text"
                          value={row.description}
                          onChange={e => updateRow(i, { description: e.target.value })}
                          placeholder="What did you work on?"
                          className={FIELD_CLS}
                        />
                      </div>

                      {/* Time Spent */}
                      <div>
                        <label className="block text-[9px] font-black uppercase tracking-widest text-gray-400 mb-1 sm:hidden">
                          Time Spent <span className="text-red-400">*</span>
                        </label>
                        <TimeInput
                          value={row.hours}
                          onChange={v => updateRow(i, { hours: v })}
                          placeholder="HH:MM"
                          className={FIELD_CLS}
                        />
                      </div>

                      {/* Category */}
                      <div>
                        <label className="block text-[9px] font-black uppercase tracking-widest text-gray-400 mb-1 sm:hidden">
                          Category <span className="text-red-400">*</span>
                        </label>
                        <VSelect
                          options={categories.map(c => ({ value: c, label: c }))}
                          value={row.category ? { value: row.category, label: row.category } : null}
                          onChange={(opt) => updateRow(i, { category: opt ? String(opt.value) : '' })}
                          isSearchable={false}
                          isClearable
                          placeholder="Select Category"
                          size="sm"
                        />
                      </div>

                      {/* Project */}
                      <div>
                        <label className="block text-[9px] font-black uppercase tracking-widest text-gray-400 mb-1 sm:hidden">
                          Project
                        </label>
                        <VSelect
                          options={projectOptions}
                          value={row.projectId ? projectOptions.find(o => String(o.value) === row.projectId) ?? null : null}
                          onChange={(opt) => updateRow(i, { projectId: opt ? String(opt.value) : '' })}
                          isSearchable
                          isClearable
                          placeholder="Select Project"
                          size="sm"
                        />
                      </div>

                      {/* Remove row button */}
                      {rows.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => setRows(prev => prev.filter((_, idx) => idx !== i))}
                          className="self-end sm:self-auto flex items-center justify-center text-gray-300 hover:text-red-500 transition-colors"
                          title="Remove row"
                        >
                          <X size={15} />
                        </button>
                      ) : <span className="hidden sm:block" />}
                    </div>
                  ))}
                </div>

                {/* Footer: centered Save/Cancel */}
                <div className="flex items-center justify-center gap-2 pt-1">
                  <Button type="submit" disabled={saving}>
                    {saving ? 'Saving…' : editingEntry ? 'Update' : rows.length > 1 ? `Save ${rows.length} Entries` : 'Save Entry'}
                  </Button>
                  <Button type="button" variant="secondary" onClick={closeForm} disabled={saving}>Cancel</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* ── Filter + Search bar ── */}
        <Card className="p-0 border-none shadow-sm ring-1 ring-black/5 dark:ring-white/5">
          <CardContent className="p-3 space-y-2">

            {/* Row 1 — Date preset chips + count */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map(p => (
                  <button
                    key={p.value}
                    onClick={() => { setPreset(p.value); setPage(1); }}
                    className={cn(
                      'px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-widest border transition-all',
                      preset === p.value
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                        : 'bg-transparent text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-indigo-400 hover:text-indigo-600'
                    )}
                  >
                    {p.label}
                  </button>
                ))}
                {preset === 'custom' && (
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[11px] font-black uppercase tracking-widest text-gray-400 shrink-0">From</span>
                    <div className="w-32 shrink-0">
                      <DateInput value={customFrom} onChange={v => { setCustomFrom(v); setPage(1); }} className={SEL_CLS} />
                    </div>
                    <span className="text-[11px] font-black uppercase tracking-widest text-gray-400 shrink-0">To</span>
                    <div className="w-32 shrink-0">
                      <DateInput value={customTo} onChange={v => { setCustomTo(v); setPage(1); }} className={SEL_CLS} />
                    </div>
                  </div>
                )}
              </div>
              <span className="text-[11px] font-bold text-gray-400 shrink-0">
                {filtered.length} {filtered.length === 1 ? 'entry' : 'entries'}
              </span>
            </div>

            {/* Row 2 — Search | [Users] | Category | Project (md+); stacked on small */}
            <div className={cn(
              'flex flex-col gap-2 md:grid md:items-center',
              isAdminView
                ? 'md:[grid-template-columns:2fr_1fr_1fr_1fr]'
                : 'md:[grid-template-columns:2fr_1fr_1fr]'
            )}>
              {/* Search */}
              <div className="relative group min-w-0">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 group-focus-within:text-indigo-500 transition-colors" />
                <input
                  type="text"
                  placeholder="Search description…"
                  value={searchQuery}
                  onChange={e => { setSearchQuery(e.target.value); setPage(1); }}
                  className="w-full pl-9 pr-7 py-1.5 bg-gray-50 dark:bg-gray-900 border border-transparent focus:border-indigo-500/30 focus:bg-white dark:focus:bg-gray-800 transition-all rounded-md text-[13px] outline-none"
                />
                {searchQuery && (
                  <button onClick={() => { setSearchQuery(''); setPage(1); }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    <X size={12} />
                  </button>
                )}
              </div>

              {/* Users — admin only */}
              {isAdminView && (
                <VSelect
                  className="min-w-0"
                  options={[
                    { value: '', label: 'All Users' },
                    ...users.map(u => ({ value: u.id, label: u.name })),
                  ]}
                  value={selectedUserId
                    ? { value: selectedUserId, label: users.find(u => u.id === selectedUserId)?.name ?? '' }
                    : { value: '', label: 'All Users' }
                  }
                  onChange={opt => { setSelectedUserId(opt && opt.value !== '' ? Number(opt.value) : null); setPage(1); }}
                  isSearchable
                  isClearable={false}
                  size="sm"
                />
              )}

              {/* Category */}
              <VSelect
                className="min-w-0"
                options={[{ value: '', label: '-- Select Category --' }, ...categories.map(c => ({ value: c, label: c }))]}
                value={selectedCategory ? { value: selectedCategory, label: selectedCategory } : { value: '', label: '-- Select Category --' }}
                onChange={(opt) => { setSelectedCategory(opt ? String(opt.value) : ''); setPage(1); }}
                isSearchable={false}
                isClearable={false}
                size="sm"
              />

              {/* Project */}
              <VSelect
                className="min-w-0"
                options={[{ value: '', label: '-- Select Project --' }, ...projectOptions]}
                value={selectedProjectId != null
                  ? (projectOptions.find(o => Number(o.value) === selectedProjectId) ?? { value: '', label: '-- Select Project --' })
                  : { value: '', label: '-- Select Project --' }}
                onChange={(opt) => { setSelectedProjectId(opt && opt.value !== '' ? Number(opt.value) : null); setPage(1); }}
                isSearchable
                isClearable={false}
                placeholder="-- Select Project --"
                size="sm"
              />
            </div>
          </CardContent>
        </Card>

        {/* ── Table ── */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 rounded-full border-2 border-indigo-600/20 border-t-indigo-600 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No diary entries"
            description={searchQuery ? `No entries matching "${searchQuery}"` : 'No entries for the selected period. Click "Add Entry" to log your work.'}
            icon={BookOpen}
          />
        ) : (
          <Card className="border-gray-100/50 p-0">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-50 dark:border-gray-900 bg-gray-50/30 dark:bg-gray-900/30">
                    <th className="px-4 py-2 text-[10px] uppercase font-black text-gray-400 tracking-widest w-[110px]">Date</th>
                    {isAdminView && <th className="px-4 py-2 text-[10px] uppercase font-black text-gray-400 tracking-widest w-[160px]">User</th>}
                    <th className="px-4 py-2 text-[10px] uppercase font-black text-gray-400 tracking-widest">Description</th>
                    <th className="px-4 py-2 text-[10px] uppercase font-black text-gray-400 tracking-widest w-[150px]">Project</th>
                    <th className="px-4 py-2 text-[10px] uppercase font-black text-gray-400 tracking-widest w-[120px]">Category</th>
                    <th className="px-4 py-2 text-[10px] uppercase font-black text-gray-400 tracking-widest w-[100px]">Time Spent</th>
                    <th className="px-4 py-2 text-right text-[10px] uppercase font-black text-gray-400 tracking-widest w-[80px]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-900">
                  {paged.map(entry => (
                    <tr key={entry.id} className={cn('hover:bg-gray-50/50 dark:hover:bg-gray-900/50 transition-all group', editingEntry?.id === entry.id && 'bg-indigo-50/40 dark:bg-indigo-900/10')}>
                      <td className="px-4 py-2.5 text-[12px] font-bold text-gray-700 dark:text-gray-300 whitespace-nowrap">
                        {formatDate(entry.date.slice(0, 10))}
                      </td>
                      {isAdminView && (
                        <td className="px-4 py-2.5 text-[12px] text-gray-600 dark:text-gray-300 whitespace-nowrap">
                          {entry.userAvatarUrl ? (
                            <span className="inline-flex items-center gap-1.5">
                              <img src={entry.userAvatarUrl} className="h-5 w-5 rounded-full object-cover shrink-0" alt="" />
                              {entry.userFullName}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5">
                              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-[9px] font-black text-indigo-600 dark:text-indigo-400 shrink-0">
                                {(entry.userFullName ?? '?')[0]?.toUpperCase()}
                              </span>
                              {entry.userFullName}
                            </span>
                          )}
                        </td>
                      )}
                      <td className="px-4 py-2.5 text-[12px] text-gray-700 dark:text-gray-200 max-w-[340px]">
                        <p className="line-clamp-2 leading-relaxed">{entry.description}</p>
                      </td>
                      <td className="px-4 py-2.5 text-[12px] text-gray-600 dark:text-gray-300">
                        {entry.projectName
                          ? <span className="line-clamp-1">{entry.projectName}</span>
                          : <span className="text-gray-300 dark:text-gray-600">—</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        {entry.category ? (
                          <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold', CATEGORY_COLORS[entry.category] ?? CATEGORY_COLORS.Other)}>
                            {entry.category}
                          </span>
                        ) : <span className="text-gray-300 dark:text-gray-600 text-[12px]">—</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        {entry.hoursSpent != null ? (
                          <span className="inline-flex items-center gap-1 text-[12px] text-indigo-600 dark:text-indigo-400 font-medium">
                            <Clock size={11} /> {toHHMM(entry.hoursSpent)}
                          </span>
                        ) : <span className="text-gray-300 dark:text-gray-600 text-[12px]">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="inline-flex items-center gap-0.5">
                          <button
                            onClick={() => openEdit(entry)}
                            className="p-1 text-gray-400 hover:text-indigo-600 hover:bg-white dark:hover:bg-gray-800 rounded border border-transparent hover:border-gray-100 transition-all"
                            title="Edit"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={() => handleDelete(entry)}
                            className="p-1 text-gray-400 hover:text-red-600 hover:bg-white dark:hover:bg-gray-800 rounded border border-transparent hover:border-gray-100 transition-all"
                            title="Delete"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/30">
                  <tr>
                    <td colSpan={isAdminView ? 5 : 4} className="px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-gray-400">
                      Total — {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-1 text-[12px] text-indigo-600 dark:text-indigo-400 font-black">
                        <Clock size={11} /> {toHHMM(totalSpent)}
                      </span>
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-50 dark:border-gray-900">
                <span className="text-[11px] font-bold text-gray-400">
                  {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, totalEntries)} of {totalEntries}
                </span>
                <div className="flex items-center gap-1">
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1 rounded text-gray-400 hover:text-indigo-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                    <ChevronLeft size={15} />
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(n => n === 1 || n === totalPages || Math.abs(n - page) <= 1)
.reduce<(number | '…')[]>((acc, n, idx, arr) => {
                      if (idx > 0 && (arr[idx - 1] as number) + 1 < n) acc.push('…');
                      acc.push(n);
                      return acc;
                    }, [])
                    .map((n, i) =>
                      n === '…' ? (
                        <span key={`e${i}`} className="px-1 text-gray-400 text-[11px]">…</span>
                      ) : (
                        <button
                          key={n}
                          onClick={() => setPage(n as number)}
                          className={cn('min-w-[26px] h-[26px] rounded text-[11px] font-black transition-all', page === n ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800')}
                        >
                          {n}
                        </button>
)
                    )
                  }
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-1 rounded text-gray-400 hover:text-indigo-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                    <ChevronRight size={15} />
                  </button>
                </div>
              </div>
            )}
          </Card>
        )}
      </div>
    </PageTransition>
  );
}
