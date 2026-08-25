import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronRight, ChevronLeft, Plus, Trash2, GripVertical, ChevronDown, ChevronUp, X } from 'lucide-react';
import { PageTransition } from '../components/Layout/PageTransition';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Card, CardContent } from '../components/ui/Card';
import { VSelect, SelectOption } from '../components/forms/VSelect';
import { showSuccess, showError } from '../lib/toast';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { templateService, SaveTemplateForm, SaveTemplateItemForm } from '../services/template.service';
import { useData } from '../context/DataContext';
import { Priority, RecurrenceType } from '../types';
import { cn } from '../lib/utils';

const PRIORITY_OPTIONS: SelectOption[] = [
  { value: 'low',      label: 'Low' },
  { value: 'medium',   label: 'Medium' },
  { value: 'high',     label: 'High' },
  { value: 'critical', label: 'Critical' },
];

const RECURRENCE_OPTIONS: SelectOption[] = [
  { value: 'daily',   label: 'Daily' },
  { value: 'weekly',  label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'custom',  label: 'Custom interval' },
];

const DAY_OF_WEEK_OPTIONS: SelectOption[] = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];

const DAY_OF_MONTH_OPTIONS: SelectOption[] = Array.from({ length: 28 }, (_, i) => ({
  value: i + 1,
  label: `Day ${i + 1}`,
}));

const SKIP_DOW_OPTIONS: SelectOption[] = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];

function SkipDatesEditor({ dates, onChange }: { dates: string[]; onChange: (d: string[]) => void }) {
  const [input, setInput] = React.useState('');
  const add = () => {
    const v = input.trim();
    if (v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !dates.includes(v)) {
      onChange([...dates, v].sort());
    }
    setInput('');
  };
  return (
    <div className="space-y-1.5">
      {dates.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {dates.map(d => (
            <li key={d} className="flex items-center gap-1 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md px-2 py-0.5 text-[11px] text-amber-800 dark:text-amber-300">
              {d}
              <button type="button" onClick={() => onChange(dates.filter(x => x !== d))} className="text-amber-400 hover:text-red-500">
                <X size={10} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input
          type="date"
          value={input}
          onChange={e => setInput(e.target.value)}
          className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <Button type="button" size="sm" variant="outline" onClick={add}>Add</Button>
      </div>
      <p className="text-[10px] text-gray-400">Add public holidays or one-off blackout dates (yyyy-mm-dd).</p>
    </div>
  );
}

function emptyItem(position: number): SaveTemplateItemForm {
  return {
    position,
    title: '',
    description: '',
    estimatedHours: 1,
    priority: 'medium',
    tags: [],
    checklistItems: [],
    dependsOnPositions: [],
    reviewCriteria: [],
  };
}

function defaultForm(): SaveTemplateForm {
  return {
    name: '',
    description: '',
    recurrenceType: 'weekly',
    dayOfWeek: 1,
    daysOfMonth: [],
    skipDaysOfWeek: [],
    skipDates: [],
    skipDaysOfMonth: [],
    startDate: new Date().toISOString().split('T')[0],
    isActive: true,
    assigneeIds: [],
    items: [emptyItem(1)],
  };
}

type Step = 1 | 2 | 3;

interface ItemEditorProps {
  item: SaveTemplateItemForm;
  index: number;
  total: number;
  userOptions: SelectOption[];
  dependencyOptions: SelectOption[]; // other (preceding) task items this one can depend on
  onChange: (updated: SaveTemplateItemForm) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

function ItemEditor({ item, index, total, userOptions, dependencyOptions, onChange, onRemove, onMoveUp, onMoveDown }: ItemEditorProps) {
  const [expanded, setExpanded] = useState(index === 0);
  const [checkInput, setCheckInput] = useState('');
  const [criteriaInput, setCriteriaInput] = useState('');

  const set = (patch: Partial<SaveTemplateItemForm>) => onChange({ ...item, ...patch });

  const addCheck = () => {
    const t = checkInput.trim();
    if (t) set({ checklistItems: [...item.checklistItems, t] });
    setCheckInput('');
  };

  const addCriteria = () => {
    const t = criteriaInput.trim();
    if (t) set({ reviewCriteria: [...item.reviewCriteria, t] });
    setCriteriaInput('');
  };

  return (
    <Card className="border border-gray-100 dark:border-gray-800">
      <div
        className="flex items-center gap-2 px-4 py-3 cursor-pointer select-none"
        onClick={() => setExpanded(e => !e)}
      >
        <GripVertical size={14} className="text-gray-300 dark:text-gray-600 shrink-0" />
        <span className="text-[11px] font-black uppercase tracking-widest text-gray-400 w-6">{index + 1}</span>
        <span className={cn('flex-1 text-sm font-semibold', item.title ? 'text-gray-900 dark:text-white' : 'text-gray-400')}>
          {item.title || 'Untitled task'}
        </span>
        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
          <button
            type="button"
            disabled={index === 0}
            onClick={onMoveUp}
            className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"
          ><ChevronUp size={14} /></button>
          <button
            type="button"
            disabled={index === total - 1}
            onClick={onMoveDown}
            className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"
          ><ChevronDown size={14} /></button>
          <button
            type="button"
            onClick={onRemove}
            className="p-1 text-red-400 hover:text-red-600"
          ><Trash2 size={14} /></button>
        </div>
        {expanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
      </div>

      {expanded && (
        <CardContent className="pt-0 px-4 pb-4 space-y-4 border-t border-gray-50 dark:border-gray-800">
          {/* Title */}
          <div>
            <label className="block text-[11px] font-black uppercase tracking-widest text-gray-500 mb-1">Title *</label>
            <input
              type="text"
              value={item.title}
              onChange={e => set({ title: e.target.value })}
              placeholder="Task title"
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-[11px] font-black uppercase tracking-widest text-gray-500 mb-1">Description</label>
            <textarea
              rows={2}
              value={item.description || ''}
              onChange={e => set({ description: e.target.value })}
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {/* Estimated hours */}
            <div>
              <label className="block text-[11px] font-black uppercase tracking-widest text-gray-500 mb-1">Est. Hours</label>
              <input
                type="number"
                min={0}
                step={0.5}
                value={item.estimatedHours}
                onChange={e => set({ estimatedHours: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Priority */}
            <div>
              <label className="block text-[11px] font-black uppercase tracking-widest text-gray-500 mb-1">Priority</label>
              <VSelect
                size="sm"
                options={PRIORITY_OPTIONS}
                value={PRIORITY_OPTIONS.find(o => o.value === item.priority) ?? null}
                onChange={opt => set({ priority: (opt?.value as Priority) ?? 'medium' })}
              />
</div>
          </div>

          {/* Assignee + QA Reviewer in one row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Assignee (single, required) */}
            <div>
              <label className="block text-[11px] font-black uppercase tracking-widest text-gray-500 mb-1">Assignee *</label>
              <VSelect
                size="sm"
                options={userOptions}
                value={userOptions.find(o => o.value === item.defaultAssigneeId) ?? null}
                onChange={opt => set({ defaultAssigneeId: opt ? Number(opt.value) : undefined })}
                placeholder={userOptions.length === 0 ? 'Select a project first…' : 'Select assignee…'}
              />
            </div>

            {/* QA Reviewer */}
            <div>
              <label className="block text-[11px] font-black uppercase tracking-widest text-gray-500 mb-1">QA Reviewer</label>
              <VSelect
                size="sm"
                isClearable
                options={userOptions}
                value={userOptions.find(o => o.value === item.qaReviewerId) ?? null}
                onChange={opt => set(opt
                  ? { qaReviewerId: Number(opt.value) }
                  : { qaReviewerId: undefined, reviewCriteria: [] })}
              />
            </div>
          </div>

          {/* Depends On — not shown for the first task (nothing precedes it) */}
          {dependencyOptions.length > 0 && (
            <div>
              <label className="block text-[11px] font-black uppercase tracking-widest text-gray-500 mb-1">Depends On</label>
              <VSelect
                size="sm"
                isMulti
                options={dependencyOptions}
                value={dependencyOptions.filter(o => item.dependsOnPositions.includes(Number(o.value)))}
                onChange={opts => set({ dependsOnPositions: opts.map(o => Number(o.value)) })}
                placeholder="Select prerequisite task(s)…"
              />
              <p className="text-[10px] text-gray-400 mt-0.5">Generated task will be blocked until these are done.</p>
            </div>
          )}

          {/* Checklist */}
          <div>
            <label className="block text-[11px] font-black uppercase tracking-widest text-gray-500 mb-1">Checklist Items</label>
            <ul className="space-y-1 mb-1.5">
              {item.checklistItems.map((ci, ci_i) => (
                <li key={ci_i} className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
                  <span className="flex-1">{ci}</span>
                  <button type="button" onClick={() => set({ checklistItems: item.checklistItems.filter((_, j) => j !== ci_i) })}>
                    <X size={12} className="text-red-400" />
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <input
                type="text"
                value={checkInput}
                onChange={e => setCheckInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCheck(); } }}
                placeholder="Add checklist item…"
                className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <Button type="button" size="sm" variant="outline" onClick={addCheck}>Add</Button>
            </div>
          </div>

          {/* Review Criteria — only relevant when a QA Reviewer verifies the task */}
          {item.qaReviewerId != null && (
            <div>
              <label className="block text-[11px] font-black uppercase tracking-widest text-gray-500 mb-1">Review Criteria</label>
              <p className="text-[10px] text-gray-400 mb-1.5">Acceptance checks the QA Reviewer must resolve before the task passes.</p>
              <ul className="space-y-1 mb-1.5">
                {item.reviewCriteria.map((rc, rc_i) => (
                  <li key={rc_i} className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
                    <span className="flex-1">{rc}</span>
                    <button type="button" onClick={() => set({ reviewCriteria: item.reviewCriteria.filter((_, j) => j !== rc_i) })}>
                      <X size={12} className="text-red-400" />
                    </button>
                  </li>
                ))}
              </ul>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={criteriaInput}
                  onChange={e => setCriteriaInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCriteria(); } }}
                  placeholder="Add review criterion…"
                  className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <Button type="button" size="sm" variant="outline" onClick={addCriteria}>Add</Button>
</div>
              </div>
            )}
          </CardContent>
        )}
      </Card>
    );
  }

export default function TemplateForm() {
  const { id } = useParams<{ id: string }>();
  const isEdit  = Boolean(id);
  const navigate = useNavigate();
  const { projects } = useData();

  const [step, setStep]       = useState<Step>(1);
  const [form, setForm]       = useState<SaveTemplateForm>(defaultForm());
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving]   = useState(false);

  const projectOptions: SelectOption[] = [
    { value: '', label: '— None (all projects) —' },
    ...projects.map(p => ({ value: p.id, label: p.name })),
  ];

  const selectedProject = projects.find(p => p.id === form.projectId);

  const moduleOptions: SelectOption[] = (selectedProject?.modules ?? []).map(m => ({
    value: m,
    label: m,
  }));

  const memberOptions: SelectOption[] = (selectedProject?.members ?? []).map(m => ({
    value: m.userId,
    label: m.fullName,
  }));

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const t = await templateService.getById(Number(id));
      setForm({
        name: t.name,
        description: t.description ?? '',
        projectId: t.projectId,
        module: t.module,
        recurrenceType: t.recurrenceType,
        dayOfWeek: t.dayOfWeek,
        daysOfMonth:    t.daysOfMonth    ?? [],
        skipDaysOfWeek: t.skipDaysOfWeek ?? [],
        skipDates:      t.skipDates      ?? [],
        skipDaysOfMonth: t.skipDaysOfMonth ?? [],
        customIntervalDays: t.customIntervalDays,
        triggerTime: t.triggerTime,
        startDate: t.startDate,
        endDate: t.endDate,
        isActive: t.isActive,
        assigneeIds: t.assigneeIds,
        items: t.items.map(i => ({
          id: i.id,
          position: i.position,
          title: i.title,
          description: i.description ?? '',
          estimatedHours: Number(i.estimatedHours),
          priority: i.priority as Priority,
          defaultAssigneeId: i.defaultAssigneeId,
          qaReviewerId: i.qaReviewerId,
          tags: [...i.tags],
          checklistItems: [...i.checklistItems],
          dependsOnPositions: [...i.dependsOnPositions],
          reviewCriteria: [...i.reviewCriteria],
        })),
      });
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load template');
      navigate('/templates');
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => { load(); }, [load]);

  const setF = (patch: Partial<SaveTemplateForm>) => setForm(prev => ({ ...prev, ...patch }));

  const addItem = () => {
    const pos = form.items.length + 1;
    setForm(prev => ({ ...prev, items: [...prev.items, emptyItem(pos)] }));
  };

  const updateItem = (index: number, updated: SaveTemplateItemForm) => {
    setForm(prev => {
      const items = [...prev.items];
      items[index] = updated;
      return { ...prev, items };
    });
  };

  // Re-number positions to 1..n and drop dependencies that are no longer a valid
  // preceding task (a task may only depend on tasks that come before it).
  const reindex = (items: SaveTemplateItemForm[]): SaveTemplateItemForm[] =>
    items.map((item, i) => {
      const position = i + 1;
      return {
        ...item,
        position,
        dependsOnPositions: item.dependsOnPositions.filter(p => p >= 1 && p < position),
      };
    });

  const removeItem = (index: number) => {
    setForm(prev => ({
      ...prev,
      items: reindex(prev.items.filter((_, i) => i !== index)),
    }));
  };

  const moveItem = (from: number, to: number) => {
    setForm(prev => {
      const items = [...prev.items];
      const [moved] = items.splice(from, 1);
      items.splice(to, 0, moved);
      return { ...prev, items: reindex(items) };
    });
  };

  const validateStep1 = () => {
    if (!form.name.trim()) { showError('Template name is required'); return false; }
    if (!form.startDate) { showError('Start date is required'); return false; }
    return true;
  };

  const validateStep2 = () => {
    for (let i = 0; i < form.items.length; i++) {
      if (!form.items[i].title.trim()) {
        showError(`Task ${i + 1} needs a title`);
        return false;
      }
      if (!form.items[i].defaultAssigneeId) {
        showError(`Task ${i + 1} needs an assignee`);
        return false;
      }
    }
    return true;
  };

  const handleNext = () => {
    if (step === 1 && !validateStep1()) return;
    if (step === 2 && !validateStep2()) return;
    if (step < 3) setStep(prev => (prev + 1) as Step);
  };

  const handleBack = () => {
    if (step > 1) setStep(prev => (prev - 1) as Step);
  };

  const handleSave = async () => {
    if (!validateStep1() || !validateStep2()) return;
    setSaving(true);
    try {
      const payload: SaveTemplateForm = {
        ...form,
        projectId: form.projectId || undefined,
        assigneeIds: [], // template-level fan-out retired; each item carries its own single assignee
      };
      if (isEdit) {
        await templateService.update(Number(id), payload);
        showSuccess('Template updated');
      } else {
        await templateService.create(payload);
        showSuccess('Template created');
      }
      navigate('/templates');
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <LoadingSpinner size="lg" className="h-48" />;
  }

  const stepLabels = ['Settings', 'Task Items', 'Preview'];

  return (
    <PageTransition>
      <PageHeader
        title={isEdit ? 'Edit Template' : 'New Template'}
        description={isEdit ? 'Update template settings and task items' : 'Create a reusable, recurring task template'}
      />

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8">
        {stepLabels.map((label, i) => {
          const s = (i + 1) as Step;
          const active = s === step;
          const done   = s < step;
          return (
            <React.Fragment key={s}>
              <button
                type="button"
                onClick={() => {
                  if (s < step) setStep(s);
                  if (s === step + 1) handleNext();
                }}
                className={cn(
                  'flex items-center gap-2 text-[11px] font-black uppercase tracking-widest transition-colors',
                  active ? 'text-indigo-600 dark:text-indigo-400' : done ? 'text-gray-400' : 'text-gray-300 dark:text-gray-600'
                )}
              >
                <span className={cn(
                  'w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black border-2 transition-all',
                  active ? 'border-indigo-600 bg-indigo-600 text-white' :
                  done   ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400' :
                           'border-gray-200 dark:border-gray-700 text-gray-400'
                )}>
                  {s}
                </span>
                <span className="hidden sm:inline">{label}</span>
              </button>
              {i < stepLabels.length - 1 && (
                <div className={cn('flex-1 h-px', done ? 'bg-indigo-300 dark:bg-indigo-800' : 'bg-gray-100 dark:bg-gray-800')} />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* ── Step 1: Settings ── */}
      {step === 1 && (
        <div className="space-y-6 max-w-2xl">
          <Card>
            <CardContent className="p-6 space-y-4">
              <h3 className="text-[11px] font-black uppercase tracking-widest text-gray-400">Basic Info</h3>

              <div>
                <label className="block text-[11px] font-black uppercase tracking-widest text-gray-500 mb-1">Template Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setF({ name: e.target.value })}
                  placeholder="e.g. Weekly Bug Triage"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-black uppercase tracking-widest text-gray-500 mb-1">Description</label>
                <textarea
                  rows={2}
                  value={form.description || ''}
                  onChange={e => setF({ description: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-widest text-gray-500 mb-1">Project</label>
                  <VSelect
                    options={projectOptions}
                    value={projectOptions.find(o => o.value === (form.projectId ?? '')) ?? projectOptions[0]}
                    onChange={opt => setF({
                      projectId: opt?.value ? Number(opt.value) : undefined,
                      module: undefined,
                      assigneeIds: [],
                    })}
                    isClearable={false}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-widest text-gray-500 mb-1">Module</label>
                  <VSelect
                    options={moduleOptions}
                    value={moduleOptions.find(o => o.value === form.module) ?? null}
                    onChange={opt => setF({ module: opt?.value as string | undefined })}
                    isClearable
                    disabled={!form.projectId || moduleOptions.length === 0}
                    placeholder={
                      !form.projectId
                        ? 'Select a project first…'
                        : moduleOptions.length === 0
                        ? 'No modules defined'
                        : 'Select module…'
                    }
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6 space-y-4">
              <h3 className="text-[11px] font-black uppercase tracking-widest text-gray-400">Recurrence</h3>

              <div>
                <label className="block text-[11px] font-black uppercase tracking-widest text-gray-500 mb-1">Frequency</label>
                <VSelect
                  options={RECURRENCE_OPTIONS}
                  value={RECURRENCE_OPTIONS.find(o => o.value === form.recurrenceType) ?? null}
                  onChange={opt => setF({ recurrenceType: (opt?.value as RecurrenceType) ?? 'weekly' })}
                />
              </div>

              {form.recurrenceType === 'weekly' && (
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-widest text-gray-500 mb-1">Day of Week</label>
                  <VSelect
                    options={DAY_OF_WEEK_OPTIONS}
                    value={DAY_OF_WEEK_OPTIONS.find(o => o.value === form.dayOfWeek) ?? DAY_OF_WEEK_OPTIONS[1]}
                    onChange={opt => setF({ dayOfWeek: opt ? Number(opt.value) : 1 })}
                  />
                </div>
              )}

              {form.recurrenceType === 'monthly' && (
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-widest text-gray-500 mb-1">Days of Month</label>
                  <VSelect
                    isMulti
                    options={DAY_OF_MONTH_OPTIONS}
                    value={DAY_OF_MONTH_OPTIONS.filter(o => (form.daysOfMonth ?? []).includes(Number(o.value)))}
                    onChange={opts => setF({ daysOfMonth: (opts as SelectOption[]).map(o => Number(o.value)) })}
                    placeholder="Select day(s)…"
                  />
                  <p className="text-[10px] text-gray-400 mt-0.5">Each selected day generates tasks independently.</p>
                </div>
              )}

              {form.recurrenceType === 'custom' && (
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-widest text-gray-500 mb-1">Interval (days)</label>
                  <input
                    type="number"
                    min={1}
                    value={form.customIntervalDays ?? 7}
                    onChange={e => setF({ customIntervalDays: parseInt(e.target.value) || 7 })}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              )}

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-widest text-gray-500 mb-1">Start Date *</label>
                  <input
                    type="date"
                    value={form.startDate}
                    onChange={e => setF({ startDate: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-widest text-gray-500 mb-1">End Date</label>
                  <input
                    type="date"
                    value={form.endDate || ''}
                    onChange={e => setF({ endDate: e.target.value || undefined })}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-widest text-gray-500 mb-1">Trigger Time</label>
                  <input
                    type="time"
                    value={form.triggerTime || ''}
                    onChange={e => setF({ triggerTime: e.target.value || undefined })}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <p className="text-[10px] text-gray-400 mt-0.5">Leave blank to run at any hour</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6 space-y-4">
              <h3 className="text-[11px] font-black uppercase tracking-widest text-gray-400">
                Skip Rules <span className="text-gray-400 dark:text-gray-500 font-normal normal-case tracking-normal text-xs">(optional)</span>
              </h3>

              <div>
                <label className="block text-[11px] font-black uppercase tracking-widest text-gray-500 mb-1">Skip Days of Week</label>
                <VSelect
                  isMulti
                  options={SKIP_DOW_OPTIONS}
                  value={SKIP_DOW_OPTIONS.filter(o => (form.skipDaysOfWeek ?? []).includes(Number(o.value)))}
                  onChange={opts => setF({ skipDaysOfWeek: (opts as SelectOption[]).map(o => Number(o.value)) })}
                  placeholder="e.g. Saturday, Sunday…"
                />
                <p className="text-[10px] text-gray-400 mt-0.5">Template will not fire on these days even if the recurrence matches.</p>
              </div>

              <div>
                <label className="block text-[11px] font-black uppercase tracking-widest text-gray-500 mb-1">Skip Days of Month</label>
                <VSelect
                  isMulti
                  options={DAY_OF_MONTH_OPTIONS}
                  value={DAY_OF_MONTH_OPTIONS.filter(o => (form.skipDaysOfMonth ?? []).includes(Number(o.value)))}
                  onChange={opts => setF({ skipDaysOfMonth: (opts as SelectOption[]).map(o => Number(o.value)) })}
                  placeholder="e.g. Day 1, Day 15…"
                />
              </div>

              <div>
                <label className="block text-[11px] font-black uppercase tracking-widest text-gray-500 mb-1">Skip Specific Dates</label>
                <SkipDatesEditor
                  dates={form.skipDates ?? []}
                  onChange={dates => setF({ skipDates: dates })}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={e => setF({ isActive: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Template is active (will run on schedule)</span>
              </label>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Step 2: Task Items ── */}
      {step === 2 && (
        <div className="space-y-3 max-w-2xl">
          {form.items.map((item, index) => (
            <ItemEditor
              key={index}
              item={item}
              index={index}
              total={form.items.length}
              userOptions={memberOptions}
              dependencyOptions={form.items.slice(0, index).map(it => ({
                value: it.position,
                label: `${it.position}. ${it.title || 'Untitled task'}`,
              }))}
              onChange={updated => updateItem(index, updated)}
              onRemove={() => removeItem(index)}
              onMoveUp={() => moveItem(index, index - 1)}
              onMoveDown={() => moveItem(index, index + 1)}
            />
          ))}

          <Button type="button" variant="outline" onClick={addItem} className="w-full">
            <Plus size={14} className="mr-1.5" /> Add Task Item
          </Button>
        </div>
      )}

      {/* ── Step 3: Preview ── */}
      {step === 3 && (
        <div className="max-w-2xl space-y-6">
          <Card>
            <CardContent className="p-6 space-y-3">
              <h3 className="text-[11px] font-black uppercase tracking-widest text-gray-400">Summary</h3>
              <dl className="space-y-2 text-sm">
                <div className="flex gap-2">
                  <dt className="text-gray-500 w-32 shrink-0">Name</dt>
                  <dd className="font-semibold text-gray-900 dark:text-white">{form.name}</dd>
                </div>
                {form.description && (
                  <div className="flex gap-2">
                    <dt className="text-gray-500 w-32 shrink-0">Description</dt>
                    <dd className="text-gray-700 dark:text-gray-300">{form.description}</dd>
                  </div>
                )}
                <div className="flex gap-2">
                  <dt className="text-gray-500 w-32 shrink-0">Recurrence</dt>
                  <dd className="text-gray-700 dark:text-gray-300">
                    {form.recurrenceType === 'weekly' && form.dayOfWeek != null
                      ? `Weekly on ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][form.dayOfWeek]}`
                      : form.recurrenceType === 'monthly' && (form.daysOfMonth ?? []).length > 0
                      ? `Monthly on day${(form.daysOfMonth!).length > 1 ? 's' : ''} ${[...(form.daysOfMonth!)].sort((a,b)=>a-b).join(', ')}`
                      : form.recurrenceType === 'custom' && form.customIntervalDays
                      ? `Every ${form.customIntervalDays} days`
                      : form.recurrenceType.charAt(0).toUpperCase() + form.recurrenceType.slice(1)}
                  </dd>
                </div>
                {(form.skipDaysOfWeek ?? []).length > 0 && (
                  <div className="flex gap-2">
                    <dt className="text-gray-500 w-32 shrink-0">Skip weekdays</dt>
                    <dd className="text-gray-700 dark:text-gray-300">
                      {(form.skipDaysOfWeek!).map(d => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d]).join(', ')}
                    </dd>
                  </div>
                )}
                {(form.skipDaysOfMonth ?? []).length > 0 && (
                  <div className="flex gap-2">
                    <dt className="text-gray-500 w-32 shrink-0">Skip days</dt>
                    <dd className="text-gray-700 dark:text-gray-300">
                      {[...(form.skipDaysOfMonth!)].sort((a,b)=>a-b).map(d => `Day ${d}`).join(', ')}
                    </dd>
                  </div>
                )}
                {(form.skipDates ?? []).length > 0 && (
                  <div className="flex gap-2">
                    <dt className="text-gray-500 w-32 shrink-0">Skip dates</dt>
                    <dd className="text-gray-700 dark:text-gray-300">{(form.skipDates!).join(', ')}</dd>
                  </div>
                )}
                <div className="flex gap-2">
                  <dt className="text-gray-500 w-32 shrink-0">Trigger Time</dt>
                  <dd className="text-gray-700 dark:text-gray-300">{form.triggerTime || '— Any hour'}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-gray-500 w-32 shrink-0">Start Date</dt>
                  <dd className="text-gray-700 dark:text-gray-300">{form.startDate}</dd>
                </div>
                {form.endDate && (
                  <div className="flex gap-2">
                    <dt className="text-gray-500 w-32 shrink-0">End Date</dt>
                    <dd className="text-gray-700 dark:text-gray-300">{form.endDate}</dd>
                  </div>
                )}
                <div className="flex gap-2">
                  <dt className="text-gray-500 w-32 shrink-0">Task Items</dt>
                  <dd className="text-gray-700 dark:text-gray-300">{form.items.length}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-gray-500 w-32 shrink-0">Status</dt>
                  <dd className={form.isActive ? 'text-emerald-600 font-semibold' : 'text-gray-400'}>
                    {form.isActive ? 'Active' : 'Inactive'}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6 space-y-2">
              <h3 className="text-[11px] font-black uppercase tracking-widest text-gray-400 mb-3">Task Items ({form.items.length})</h3>
              <ol className="space-y-1.5">
                {form.items.map((item, i) => {
                  const assignee = memberOptions.find(o => Number(o.value) === item.defaultAssigneeId)?.label;
                  return (
                    <li key={i} className="flex items-center gap-2 text-sm">
                      <span className="w-5 h-5 rounded-full bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 text-[10px] font-black flex items-center justify-center shrink-0">{i + 1}</span>
                      <span className="font-semibold text-gray-900 dark:text-white flex-1">{item.title}</span>
                      <span className="text-[11px] text-indigo-500">{assignee ?? 'No assignee'}</span>
                      <span className="text-[11px] text-gray-400">{item.estimatedHours}h · {item.priority}</span>
                      {item.checklistItems.length > 0 && (
                        <span className="text-[11px] text-gray-400">{item.checklistItems.length} checklist</span>
                      )}
                      {item.dependsOnPositions.length > 0 && (
                        <span className="text-[11px] text-amber-500">↳ after {item.dependsOnPositions.slice().sort((a, b) => a - b).join(', ')}</span>
                      )}
                    </li>
                  );
                })}
              </ol>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Footer nav */}
      <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-100 dark:border-gray-800">
        <Button type="button" variant="outline" onClick={step === 1 ? () => navigate('/templates') : handleBack}>
          <ChevronLeft size={16} className="mr-1" /> {step === 1 ? 'Cancel' : 'Back'}
        </Button>
        {step < 3 ? (
          <Button type="button" onClick={handleNext}>
            Next <ChevronRight size={16} className="ml-1" />
          </Button>
        ) : (
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Update Template' : 'Create Template'}
          </Button>
        )}
      </div>
    </PageTransition>
  );
}
