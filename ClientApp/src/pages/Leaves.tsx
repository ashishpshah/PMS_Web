import { useEffect, useState, useCallback, useMemo } from 'react';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Card, CardContent } from '../components/ui/Card';
import { DateInput } from '../components/ui/DateInput';
import { Modal } from '../components/ui/Modal';
import { VSelect, SelectOption } from '../components/forms/VSelect';
import { PageHeader } from '../components/ui/PageHeader';
import { PageTransition } from '../components/Layout/PageTransition';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useDebounce } from '../hooks/useDebounce';
import { showSuccess, showError } from '../lib/toast';
import { cn } from '../lib/utils';
import { fromIso, toIso, todayMidnight, formatDMY, buildMonthYearOptions } from '../lib/leaveDateUtils';
import { leaveService, LeaveRequest, LeaveType, LeaveBalance, DayType, PaginatedResponse } from '../services/leave.service';
import { X, Check, Plus, Pencil, Trash2, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';

const STATUS_VARIANT: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'info'> = {
  Pending: 'warning',
  Approved: 'success',
  Rejected: 'danger',
};

type SortField = 'user' | 'leaveType' | 'startDate' | 'endDate' | 'dayCount' | 'status';

// Mirrors WorkweekRulesService.GetDayTypeAsync's fallback math (a materialized Holiday row wins
// first, then Sunday is always off, then Saturday is checked against the configured occurrence
// list) — needed here only to synchronously disable non-working days in the date-picker popup;
// the actual leave day count is still always server-computed (previewDayCount), never trusted
// from this client-side copy.
function isNonWorkingDay(date: Date, holidayByDate: Map<string, DayType>, saturdayOccurrences: number[]): boolean {
  const override = holidayByDate.get(toIso(date));
  if (override) return override === 'Holiday';
  if (date.getDay() === 0) return true; // Sunday
  if (date.getDay() === 6) return saturdayOccurrences.includes(Math.ceil(date.getDate() / 7)); // Saturday
  return false;
}

// Balance box coloring ramps from dark green (nothing used yet) through light green, light red,
// to dark red (used up to/past the full allocation) — used vs. allocated, not a fixed day count,
// so it scales with whatever the admin has set for the year.
function balanceColorClasses(usedDays: number, allocatedDays: number) {
  const ratio = allocatedDays > 0 ? usedDays / allocatedDays : (usedDays > 0 ? 1 : 0);
  if (ratio <= 0) {
    return { box: 'bg-emerald-600 dark:bg-emerald-700 border-emerald-700 dark:border-emerald-600', label: 'text-emerald-100', text: 'text-white', sub: 'text-emerald-100' };
  }
  if (ratio <= 1 / 3) {
    return { box: 'bg-emerald-50/80 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-900/40', label: 'text-emerald-600', text: 'text-emerald-700 dark:text-emerald-400', sub: 'text-emerald-500/80' };
  }
  if (ratio <= 2 / 3) {
    return { box: 'bg-rose-50/80 dark:bg-rose-900/20 border-rose-100 dark:border-rose-900/40', label: 'text-rose-600', text: 'text-rose-700 dark:text-rose-400', sub: 'text-rose-500/80' };
  }
  return { box: 'bg-rose-600 dark:bg-rose-700 border-rose-700 dark:border-rose-600', label: 'text-rose-100', text: 'text-white', sub: 'text-rose-100' };
}

// Access: any logged-in user sees only their own requests; admins see everyone's.
// Employee's own Pending row exposes Edit/Delete, gated by that row's allowEdit/allowDelete
// flags (admin-controlled). Admin's Pending rows expose a "Decide" action (approve/reject +
// a note, plus Allow Edit/Allow Delete toggles) in a modal. Once Approved/Rejected a request is
// finalized — no Edit/Delete/Decide for anyone, regardless of the flags.
export default function Leaves() {
  const { isAdmin, isSystemAdmin } = useAuth();
  const { users } = useData();
  const isAdminView = isAdmin || isSystemAdmin;

  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [balance, setBalance] = useState<LeaveBalance | null>(null);
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [loading, setLoading] = useState(true);
  // Drives the date-picker's disabled days (holidays, off-Saturdays, Sundays) — see
  // isNonWorkingDay above.
  const [holidayByDate, setHolidayByDate] = useState<Map<string, DayType>>(new Map());
  const [saturdayOccurrences, setSaturdayOccurrences] = useState<number[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [leaveType, setLeaveType] = useState<SelectOption | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  // Tracks whether the user has deliberately set an End Date different from Start — until then,
  // Start and End stay in sync (a single day is the common case; multi-day is opt-in).
  const [endDateTouched, setEndDateTouched] = useState(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [dayCountPreview, setDayCountPreview] = useState<number | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [noteById, setNoteById] = useState<Record<number, string>>({});
  const [busyId, setBusyId] = useState<number | null>(null);
  const [decidingId, setDecidingId] = useState<number | null>(null);

  // Table filters
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [fromMonthYear, setFromMonthYear] = useState(''); // 'YYYY-MM'
  const [toMonthYear, setToMonthYear] = useState('');     // 'YYYY-MM'

  // Table sorting — defaults to leave (start) date, most recent first.
  const [sortField, setSortField] = useState<SortField>('startDate');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Server-side pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalRequests, setTotalRequests] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const monthYearOptions = useMemo(() => buildMonthYearOptions(), []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const today = todayMidnight();
      const oneYearOut = new Date(today.getFullYear() + 1, today.getMonth(), today.getDate());
      const params: { userId?: number; status?: string } = {};
      if (selectedUserId) params.userId = selectedUserId;
      // Could add status filter based on UI if needed
      
      const [r, b, t, rules, holidays] = await Promise.all([
        isAdminView ? leaveService.getAllRequests(params, page, pageSize) : leaveService.getMyRequests(page, pageSize),
        leaveService.getMyBalance(),
        leaveService.getTypes(),
        leaveService.getRules(),
        leaveService.getHolidays(toIso(today), toIso(oneYearOut)),
      ]);
      setRequests(r.data);
      setTotalRequests(r.totalCount);
      setTotalPages(r.totalPages);
      setBalance(b);
      setTypes(t);
      setSaturdayOccurrences(rules.holidaySaturdayOccurrences);
      setHolidayByDate(new Map(holidays.map(h => [h.date.slice(0, 10), h.dayType])));
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load leave data');
    } finally {
      setLoading(false);
    }
  }, [isAdminView, page, pageSize, selectedUserId]);

  useEffect(() => { load(); }, [load]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [selectedUserId]);

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setLeaveType(null);
    setStartDate('');
    setEndDate('');
    setEndDateTouched(false);
    setReason('');
    setDayCountPreview(null);
  };

  const openEditForm = (r: LeaveRequest) => {
    setEditingId(r.id);
    setLeaveType({ value: r.leaveTypeId, label: r.leaveTypeName });
    setStartDate(r.startDate.slice(0, 10));
    setEndDate(r.endDate.slice(0, 10));
    // An existing request may already be multi-day — don't let a later Start-date tweak
    // silently collapse End back to Start.
    setEndDateTouched(r.startDate.slice(0, 10) !== r.endDate.slice(0, 10));
    setReason(r.reason);
    setShowForm(true);
  };

  // Single-day leave is the common case: picking a Start Date defaults End Date to the same
  // day until the user deliberately picks a different End Date. Same Start/End date is valid
  // and simply counts as 1 leave day.
  const handleStartDateChange = (v: string) => {
    setStartDate(v);
    if (!endDateTouched) setEndDate(v);
  };

  const handleEndDateChange = (v: string) => {
    setEndDate(v);
    setEndDateTouched(true);
  };

  // Live day-count preview — server-computed (same Holiday/WorkingDay math the actual
  // submit uses), debounced so it doesn't fire on every keystroke while typing a date.
  const previewRange = startDate && endDate ? `${startDate}|${endDate}` : '';
  const debouncedPreviewRange = useDebounce(previewRange, 400);

  useEffect(() => {
    if (!debouncedPreviewRange) {
      setDayCountPreview(null);
      return;
    }
    const [s, e] = debouncedPreviewRange.split('|');
    let cancelled = false;
    setPreviewLoading(true);
    leaveService.previewDayCount(s, e)
      .then(count => { if (!cancelled) setDayCountPreview(count); })
      .catch(() => { if (!cancelled) setDayCountPreview(null); })
      .finally(() => { if (!cancelled) setPreviewLoading(false); });
    return () => { cancelled = true; };
  }, [debouncedPreviewRange]);

  const handleSubmit = async () => {
    if (!leaveType || !startDate || !endDate || !reason.trim()) {
      showError('Leave type, dates and reason are all required.');
      return;
    }
    setSubmitting(true);
    try {
      const dto = { leaveTypeId: Number(leaveType.value), startDate, endDate, reason: reason.trim() };
      if (editingId) {
        await leaveService.updateRequest(editingId, dto);
        showSuccess('Leave request updated.');
      } else {
        await leaveService.createRequest(dto);
        showSuccess('Leave request submitted.');
      }
      resetForm();
      await load();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to save leave request');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    setBusyId(id);
    try {
      await leaveService.deleteRequest(id);
      showSuccess('Leave request deleted.');
      await load();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to delete request');
    } finally {
      setBusyId(null);
    }
  };

  const handleDecide = async (id: number, approve: boolean) => {
    const note = noteById[id]?.trim();
    if (!approve && !note) {
      showError('A note is required when rejecting a request.');
      return;
    }
    setBusyId(id);
    try {
      await leaveService.decide(id, { approve, decisionNote: note || undefined });
      showSuccess(approve ? 'Request approved.' : 'Request rejected.');
      setDecidingId(null);
      await load();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to record decision');
    } finally {
      setBusyId(null);
    }
  };

  const handleTogglePermission = async (r: LeaveRequest, field: 'allowEdit' | 'allowDelete') => {
    setBusyId(r.id);
    try {
      await leaveService.setPermissions(r.id, {
        allowEdit: field === 'allowEdit' ? !r.allowEdit : r.allowEdit,
        allowDelete: field === 'allowDelete' ? !r.allowDelete : r.allowDelete,
      });
      await load();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to update permissions');
    } finally {
      setBusyId(null);
    }
  };

  const pendingCount = requests.filter(r => r.status === 'Pending').length;
  const decidedCount = requests.filter(r => r.status === 'Approved' || r.status === 'Rejected').length;
  // Only active types are selectable for a new/edited request; an already-referenced inactive
  // type still displays correctly on existing rows via leaveTypeName from the server.
  const typeOptions: SelectOption[] = types.filter(t => t.isActive).map(t => ({ value: t.id, label: t.name }));

  const today = todayMidnight();
  const bal = balance ? balanceColorClasses(balance.usedDays, balance.allocatedDays) : null;
  const decidingRequest = requests.find(r => r.id === decidingId) ?? null;

  // ── Table: filter → sort → paginate, all client-side (mirrors Diary/Tasks pages) ──
  const filteredRequests = useMemo(() => requests.filter(r => {
    if (isAdminView && selectedUserId != null && r.userId !== selectedUserId) return false;
    const startMonth = r.startDate.slice(0, 7);
    if (fromMonthYear && startMonth < fromMonthYear) return false;
    if (toMonthYear && startMonth > toMonthYear) return false;
    return true;
  }), [requests, isAdminView, selectedUserId, fromMonthYear, toMonthYear]);

  // Server handles pagination and sorting, so we just use the requests as returned
  // For display purposes, we still apply client-side filtering for the filter controls
  // but the actual data is already paginated from the server
  const sortedRequests = useMemo(() => {
    const arr = [...filteredRequests];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'user': cmp = a.userFullName.localeCompare(b.userFullName); break;
        case 'leaveType': cmp = a.leaveTypeName.localeCompare(b.leaveTypeName); break;
        case 'startDate': cmp = a.startDate.localeCompare(b.startDate); break;
        case 'endDate': cmp = a.endDate.localeCompare(b.endDate); break;
        case 'dayCount': cmp = a.dayCount - b.dayCount; break;
        case 'status': cmp = a.status.localeCompare(b.status); break;
      }
      return sortOrder === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [filteredRequests, sortField, sortOrder]);

  // For display, use sortedRequests directly (already paginated from server)
  const pagedRequests = sortedRequests;

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortOrder(o => (o === 'asc' ? 'desc' : 'asc'));
    else { setSortField(field); setSortOrder('asc'); }
    setPage(1);
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortOrder === 'asc' ? <ChevronUp size={12} className="ml-1 inline" /> : <ChevronDown size={12} className="ml-1 inline" />;
  };

  const hasActiveFilters = selectedUserId != null || !!fromMonthYear || !!toMonthYear;

  return (
    <PageTransition>
      <div className="max-w-6xl mx-auto space-y-4">
        <PageHeader title="Leaves" description="Request leave and track your requests." />

        <div className="space-y-5">
          {/* Top Section: summary boxes + Add New Leave */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-3">
              <div className="px-4 py-3 rounded-lg border border-amber-100 dark:border-amber-900/40 bg-amber-50/50 dark:bg-amber-900/10 min-w-[150px]">
                <p className="text-[10px] font-black uppercase tracking-widest text-amber-600">Pending Requests</p>
                <p className="text-2xl font-black text-amber-700 dark:text-amber-400 mt-0.5">{pendingCount}</p>
              </div>
              <div className="px-4 py-3 rounded-lg border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/40 min-w-[190px]">
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Approved / Rejected Requests</p>
                <p className="text-2xl font-black text-gray-700 dark:text-gray-200 mt-0.5">{decidedCount}</p>
              </div>
              {balance && bal && (
                <div className={cn('px-4 py-3 rounded-lg border min-w-[170px]', bal.box)}>
                  <p className={cn('text-[10px] font-black uppercase tracking-widest', bal.label)}>{balance.year} Balance</p>
                  <p className={cn('text-2xl font-black mt-0.5', bal.text)}>{balance.availableDays}/{balance.allocatedDays}d left</p>
                  <p className={cn('text-[10px] font-bold mt-0.5', bal.sub)}>{balance.usedDays}d used</p>
                </div>
              )}
            </div>
            <Button onClick={() => { resetForm(); setShowForm(true); }} className="h-9 px-4 text-[11px] font-black uppercase tracking-widest">
              <Plus size={14} className="mr-1.5" /> Add New Leave
            </Button>
          </div>

          {/* Add/Edit form — in a modal */}
          <Modal isOpen={showForm} onClose={resetForm} title={editingId ? 'Edit Leave' : 'New Leave Request'}>
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <VSelect
                  label="Leave Type"
                  options={typeOptions}
                  value={leaveType}
                  onChange={setLeaveType}
                  placeholder="Select leave type..."
                />
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="block text-[11px] font-black uppercase tracking-widest text-gray-400">Start</label>
                    <DateInput
                      value={startDate}
                      onChange={handleStartDateChange}
                      minDate={today}
                      disabledDate={d => isNonWorkingDay(d, holidayByDate, saturdayOccurrences)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[11px] font-black uppercase tracking-widest text-gray-400">End</label>
                    <DateInput
                      value={endDate}
                      onChange={handleEndDateChange}
                      minDate={startDate ? fromIso(startDate) : today}
                      disabledDate={d => isNonWorkingDay(d, holidayByDate, saturdayOccurrences)}
                    />
                  </div>
                </div>
                <div className="sm:col-span-2 space-y-1">
                  <label className="block text-[11px] font-black uppercase tracking-widest text-gray-400">Reason</label>
                  <textarea
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-1.5 bg-white dark:bg-gray-950 border border-gray-100 dark:border-gray-800 rounded focus:ring-1 focus:ring-indigo-500/30 outline-none text-[13px] font-medium"
                  />
                </div>
                {startDate && endDate && (
                  <div className="sm:col-span-2 text-[11px] font-bold text-gray-500">
                    {previewLoading ? (
                      'Calculating…'
                    ) : dayCountPreview != null ? (
                      <span>= <span className="text-indigo-600 dark:text-indigo-400 font-black">{dayCountPreview}</span> leave day{dayCountPreview === 1 ? '' : 's'}</span>
                    ) : null}
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="ghost" onClick={resetForm} className="h-9 px-4 text-[11px] font-black uppercase tracking-widest">Cancel</Button>
                <Button onClick={handleSubmit} disabled={submitting} className="h-9 px-6 text-[11px] font-black uppercase tracking-widest">
                  {submitting ? 'Saving…' : editingId ? 'Save Changes' : 'Submit Request'}
                </Button>
              </div>
            </div>
          </Modal>

          {/* Admin decide modal — approve/reject with a note, plus per-request Allow Edit/Delete */}
          <Modal isOpen={decidingId != null} onClose={() => setDecidingId(null)} title="Review Leave Request">
            {decidingRequest && (
              <div className="space-y-3">
                <div>
                  <p className="text-[13px] font-bold text-gray-800 dark:text-gray-200">
                    {decidingRequest.userFullName} — {decidingRequest.leaveTypeName} ({decidingRequest.dayCount}d)
                  </p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {formatDMY(decidingRequest.startDate)} to {formatDMY(decidingRequest.endDate)}
                  </p>
                  <p className="text-[12px] text-gray-600 dark:text-gray-300 mt-1.5">{decidingRequest.reason}</p>
                </div>
                <div className="space-y-1">
                  <label className="block text-[11px] font-black uppercase tracking-widest text-gray-400">Decision Note (required to reject)</label>
                  <textarea
                    value={noteById[decidingRequest.id] ?? ''}
                    onChange={e => setNoteById(prev => ({ ...prev, [decidingRequest.id]: e.target.value }))}
                    rows={2}
                    className="w-full px-3 py-1.5 bg-white dark:bg-gray-950 border border-gray-100 dark:border-gray-800 rounded focus:ring-1 focus:ring-indigo-500/30 outline-none text-[13px] font-medium"
                  />
                </div>
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-1.5 text-[11px] font-bold text-gray-500 cursor-pointer">
                    <input type="checkbox" checked={decidingRequest.allowEdit} onChange={() => handleTogglePermission(decidingRequest, 'allowEdit')} disabled={busyId === decidingRequest.id} />
                    Allow Edit
                  </label>
                  <label className="flex items-center gap-1.5 text-[11px] font-bold text-gray-500 cursor-pointer">
                    <input type="checkbox" checked={decidingRequest.allowDelete} onChange={() => handleTogglePermission(decidingRequest, 'allowDelete')} disabled={busyId === decidingRequest.id} />
                    Allow Delete
                  </label>
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="danger" onClick={() => handleDecide(decidingRequest.id, false)} disabled={busyId === decidingRequest.id} className="h-9 px-4 text-[11px] font-black uppercase tracking-widest">
                    <X size={13} className="mr-1" /> Reject
                  </Button>
                  <Button onClick={() => handleDecide(decidingRequest.id, true)} disabled={busyId === decidingRequest.id} className="h-9 px-4 text-[11px] font-black uppercase tracking-widest bg-emerald-600 hover:bg-emerald-700">
                    <Check size={13} className="mr-1" /> Approve
                  </Button>
                </div>
              </div>
            )}
          </Modal>

          {/* ── Filters ── */}
          <Card className="p-0 border-none shadow-sm ring-1 ring-black/5 dark:ring-white/5">
            <CardContent className="p-3">
              <div className={cn(
                'flex flex-col gap-2 md:grid md:items-end',
                isAdminView ? 'md:[grid-template-columns:1fr_1fr_1fr_auto_auto]' : 'md:[grid-template-columns:1fr_1fr_auto_auto]'
              )}>
                {isAdminView && (
                  <div className="space-y-1 min-w-0">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400">User</label>
                    <VSelect
                      options={[{ value: '', label: 'All Users' }, ...users.map(u => ({ value: u.id, label: u.name }))]}
                      value={selectedUserId != null
                        ? { value: selectedUserId, label: users.find(u => u.id === selectedUserId)?.name ?? '' }
                        : { value: '', label: 'All Users' }}
                      onChange={opt => { setSelectedUserId(opt && opt.value !== '' ? Number(opt.value) : null); setPage(1); }}
                      isSearchable
                      isClearable={false}
                      size="sm"
                    />
                  </div>
                )}
                <div className="space-y-1 min-w-0">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400">From Month</label>
                  <VSelect
                    options={[{ value: '', label: 'Any' }, ...monthYearOptions]}
                    value={fromMonthYear ? (monthYearOptions.find(o => o.value === fromMonthYear) ?? { value: '', label: 'Any' }) : { value: '', label: 'Any' }}
                    onChange={opt => { setFromMonthYear(opt && opt.value !== '' ? String(opt.value) : ''); setPage(1); }}
                    isSearchable
                    isClearable={false}
                    size="sm"
                  />
                </div>
                <div className="space-y-1 min-w-0">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400">To Month</label>
                  <VSelect
                    options={[{ value: '', label: 'Any' }, ...monthYearOptions]}
                    value={toMonthYear ? (monthYearOptions.find(o => o.value === toMonthYear) ?? { value: '', label: 'Any' }) : { value: '', label: 'Any' }}
                    onChange={opt => { setToMonthYear(opt && opt.value !== '' ? String(opt.value) : ''); setPage(1); }}
                    isSearchable
                    isClearable={false}
                    size="sm"
                  />
                </div>
                {hasActiveFilters && (
                  <button
                    onClick={() => { setSelectedUserId(null); setFromMonthYear(''); setToMonthYear(''); setPage(1); }}
                    className="h-8 px-3 text-[11px] font-black uppercase tracking-widest text-gray-400 hover:text-rose-500 border border-gray-200 dark:border-gray-700 rounded-md transition-colors whitespace-nowrap"
                  >
                    Clear
                  </button>
                )}
                <span className="text-[11px] font-bold text-gray-400 whitespace-nowrap md:text-right">
                  {sortedRequests.length} {sortedRequests.length === 1 ? 'request' : 'requests'}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* ── Table ── */}
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-8 w-8 rounded-full border-2 border-indigo-600/20 border-t-indigo-600 animate-spin" />
            </div>
          ) : sortedRequests.length === 0 ? (
            <p className="text-[11px] text-gray-400 italic text-center py-10">
              {hasActiveFilters ? 'No leave requests match these filters' : 'No leave requests yet'}
            </p>
          ) : (
            <Card className="border-gray-100/50 p-0">
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-gray-50 dark:border-gray-900 bg-gray-50/30 dark:bg-gray-900/30">
                      {isAdminView && (
                        <th className="px-4 py-2 text-[10px] uppercase font-black text-gray-400 tracking-widest cursor-pointer hover:text-indigo-600 transition-colors whitespace-nowrap" onClick={() => toggleSort('user')}>
                          User <SortIcon field="user" />
                        </th>
                      )}
                      <th className="px-4 py-2 text-[10px] uppercase font-black text-gray-400 tracking-widest cursor-pointer hover:text-indigo-600 transition-colors whitespace-nowrap" onClick={() => toggleSort('leaveType')}>
                        Leave Type <SortIcon field="leaveType" />
                      </th>
                      <th className="px-4 py-2 text-[10px] uppercase font-black text-gray-400 tracking-widest cursor-pointer hover:text-indigo-600 transition-colors whitespace-nowrap" onClick={() => toggleSort('startDate')}>
                        Start <SortIcon field="startDate" />
                      </th>
                      <th className="px-4 py-2 text-[10px] uppercase font-black text-gray-400 tracking-widest cursor-pointer hover:text-indigo-600 transition-colors whitespace-nowrap" onClick={() => toggleSort('endDate')}>
                        End <SortIcon field="endDate" />
                      </th>
                      <th className="px-4 py-2 text-[10px] uppercase font-black text-gray-400 tracking-widest cursor-pointer hover:text-indigo-600 transition-colors whitespace-nowrap" onClick={() => toggleSort('dayCount')}>
                        Days <SortIcon field="dayCount" />
                      </th>
                      <th className="px-4 py-2 text-[10px] uppercase font-black text-gray-400 tracking-widest">Reason</th>
                      <th className="px-4 py-2 text-[10px] uppercase font-black text-gray-400 tracking-widest cursor-pointer hover:text-indigo-600 transition-colors whitespace-nowrap" onClick={() => toggleSort('status')}>
                        Status <SortIcon field="status" />
                      </th>
                      <th className="px-4 py-2 text-right text-[10px] uppercase font-black text-gray-400 tracking-widest">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-900">
                    {pagedRequests.map(r => {
                      const isPending = r.status === 'Pending';
                      return (
                        <tr key={r.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-900/50 transition-colors">
                          {isAdminView && (
                            <td className="px-4 py-2.5 text-[12px] text-gray-700 dark:text-gray-200 whitespace-nowrap">
                              <span className="inline-flex items-center gap-1.5">
                                {r.userAvatarUrl ? (
                                  <img src={r.userAvatarUrl} className="h-5 w-5 rounded-full object-cover shrink-0" alt="" />
                                ) : (
                                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-[9px] font-black text-indigo-600 dark:text-indigo-400 shrink-0">
                                    {(r.userFullName ?? '?')[0]?.toUpperCase()}
                                  </span>
                                )}
                                {r.userFullName}
                              </span>
                            </td>
                          )}
                          <td className="px-4 py-2.5 text-[12px] font-bold text-gray-700 dark:text-gray-200 whitespace-nowrap">{r.leaveTypeName}</td>
                          <td className="px-4 py-2.5 text-[12px] text-gray-600 dark:text-gray-300 whitespace-nowrap font-mono">{formatDMY(r.startDate)}</td>
                          <td className="px-4 py-2.5 text-[12px] text-gray-600 dark:text-gray-300 whitespace-nowrap font-mono">{formatDMY(r.endDate)}</td>
                          <td className="px-4 py-2.5 text-[12px] text-indigo-600 dark:text-indigo-400 font-black whitespace-nowrap">{r.dayCount}d</td>
                          <td className="px-4 py-2.5 text-[12px] text-gray-600 dark:text-gray-300 max-w-[260px]">
                            <p className="line-clamp-1" title={r.reason}>{r.reason}</p>
                          </td>
                          <td className="px-4 py-2.5">
                            <Badge
                              variant={STATUS_VARIANT[r.status] ?? 'default'}
                              title={r.approverName ? `${r.status} by ${r.approverName}${r.decisionNote ? `: ${r.decisionNote}` : ''}` : undefined}
                            >
                              {r.status}
                            </Badge>
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <div className="inline-flex items-center gap-0.5">
                              {isPending && !isAdminView && r.allowEdit && (
                                <button onClick={() => openEditForm(r)} className="p-1 text-gray-400 hover:text-indigo-600 hover:bg-white dark:hover:bg-gray-800 rounded border border-transparent hover:border-gray-100 transition-all" title="Edit">
                                  <Pencil size={13} />
                                </button>
                              )}
                              {isPending && !isAdminView && r.allowDelete && (
                                <button onClick={() => handleDelete(r.id)} disabled={busyId === r.id} className="p-1 text-gray-400 hover:text-rose-600 hover:bg-white dark:hover:bg-gray-800 rounded border border-transparent hover:border-gray-100 transition-all" title="Delete">
                                  <Trash2 size={13} />
                                </button>
                              )}
                              {isPending && isAdminView && (
                                <Button size="sm" onClick={() => setDecidingId(r.id)} className="h-7 px-2.5 text-[10px] font-black uppercase tracking-widest">
                                  Decide
                                </Button>
                              )}
                              {!isPending && <span className="text-gray-300 dark:text-gray-600 text-[11px]">—</span>}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-50 dark:border-gray-900 bg-gray-50/30 dark:bg-gray-900/30">
                <div className="flex items-center gap-2 text-[11px] text-gray-500">
                  <span className="whitespace-nowrap">Rows per page:</span>
                  <VSelect
                    options={[10, 25, 50, 100].map((n): SelectOption => ({ value: n, label: String(n) }))}
                    value={{ value: pageSize, label: String(pageSize) }}
                    onChange={opt => { if (opt) { setPageSize(Number(opt.value)); setPage(1); } }}
                    isSearchable={false}
                    isClearable={false}
                    size="sm"
                    className="w-20"
                  />
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
                  <span className="whitespace-nowrap">
                    {totalRequests === 0 ? '0' : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, totalRequests)}`} of {totalRequests}
                  </span>
                  <div className="flex items-center gap-0.5">
                    <button onClick={() => setPage(1)} disabled={page === 1}
                      className="p-1 rounded border border-gray-200 dark:border-gray-700 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                      <ChevronLeft size={13} />
                    </button>
                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                      className="p-1 rounded border border-gray-200 dark:border-gray-700 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                      <ChevronLeft size={13} />
                    </button>
                    <span className="px-2 py-0.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-[11px] font-bold min-w-[60px] text-center">
                      {page} / {totalPages}
                    </span>
                    <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                      className="p-1 rounded border border-gray-200 dark:border-gray-700 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                      <ChevronRight size={13} />
                    </button>
                    <button onClick={() => setPage(totalPages)} disabled={page === totalPages}
                      className="p-1 rounded border border-gray-200 dark:border-gray-700 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                      <ChevronRight size={13} />
                    </button>
                  </div>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </PageTransition>
  );
}
