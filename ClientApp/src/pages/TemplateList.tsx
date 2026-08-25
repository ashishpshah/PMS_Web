import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutTemplate, Plus, Pencil, Trash2, Copy, Play, ToggleLeft, ToggleRight, Clock, CalendarClock, RefreshCw, ChevronRight } from 'lucide-react';
import { PageTransition } from '../components/Layout/PageTransition';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Card, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { useSweetAlert } from '../context/SweetAlertContext';
import { showSuccess, showError } from '../lib/toast';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { templateService } from '../services/template.service';
import { TaskTemplate, RecurrenceType } from '../types';
import { cn, formatDateTime } from '../lib/utils';

const RECURRENCE_LABELS: Record<RecurrenceType, string> = {
  daily:   'Daily',
  weekly:  'Weekly',
  monthly: 'Monthly',
  custom:  'Custom',
};

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function recurrenceLabel(t: TaskTemplate): string {
  const base = RECURRENCE_LABELS[t.recurrenceType] ?? t.recurrenceType;
  if (t.recurrenceType === 'weekly' && t.dayOfWeek != null) return `${base} on ${DAY_NAMES[t.dayOfWeek]}`;
  if (t.recurrenceType === 'monthly') {
    const days = t.daysOfMonth ?? [];
    if (days.length > 0) return `${base} on day${days.length > 1 ? 's' : ''} ${[...days].sort((a, b) => a - b).join(', ')}`;
    if (t.dayOfMonth != null) return `${base} on day ${t.dayOfMonth}`;
  }
  if (t.recurrenceType === 'custom' && t.customIntervalDays) return `Every ${t.customIntervalDays} days`;
  return base;
}

export default function TemplateList() {
  const navigate = useNavigate();
  const { confirmAlert } = useSweetAlert();

  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [loading, setLoading]     = useState(true);
  const [generating, setGenerating] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setTemplates(await templateService.getAll());
    } catch {
      showError('Failed to load templates');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleToggleActive = async (t: TaskTemplate) => {
    try {
      await templateService.setActive(t.id, !t.isActive);
      setTemplates(prev => prev.map(x => x.id === t.id ? { ...x, isActive: !x.isActive } : x));
      showSuccess(`Template ${t.isActive ? 'deactivated' : 'activated'}`);
    } catch {
      showError('Failed to update template status');
    }
  };

  const handleDuplicate = async (t: TaskTemplate) => {
    try {
      const copy = await templateService.duplicate(t.id);
      setTemplates(prev => [copy, ...prev]);
      showSuccess('Template duplicated');
    } catch {
      showError('Failed to duplicate template');
    }
  };

  const handleDelete = (t: TaskTemplate) => {
    confirmAlert(`Delete template "${t.name}"? This cannot be undone.`, async () => {
      try {
        await templateService.delete(t.id);
        setTemplates(prev => prev.filter(x => x.id !== t.id));
        showSuccess('Template deleted');
      } catch {
        showError('Failed to delete template');
      }
    });
  };

  const handleGenerate = async (t: TaskTemplate) => {
    setGenerating(t.id);
    try {
      const gen = await templateService.generate(t.id);
      setTemplates(prev => prev.map(x => x.id === t.id
        ? { ...x, generationCount: x.generationCount + 1, lastGeneratedAt: gen.generatedAt }
        : x
      ));
      showSuccess(`Generated ${gen.taskCount} task${gen.taskCount !== 1 ? 's' : ''}`);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGenerating(null);
    }
  };

  const active   = templates.filter(t => t.isActive);
  const inactive = templates.filter(t => !t.isActive);

  return (
    <PageTransition>
      <PageHeader
        title="Task Templates"
        description="Reusable task sets that auto-generate on a schedule"
      >
        <Button onClick={() => navigate('/templates/new')}>
          <Plus size={16} className="mr-1.5" /> New Template
        </Button>
      </PageHeader>

      {loading ? (
        <LoadingSpinner size="lg" className="h-48" />
      ) : templates.length === 0 ? (
        <EmptyState
          icon={LayoutTemplate}
          title="No templates yet"
          description="Create a reusable task template that generates tasks automatically on a schedule."
          actionLabel="New Template"
          onAction={() => navigate('/templates/new')}
        />
      ) : (
        <div className="space-y-6">
          {[{ label: 'Active', list: active }, { label: 'Inactive', list: inactive }].map(group =>
            group.list.length === 0 ? null : (
              <section key={group.label}>
                <h2 className="text-[11px] font-black uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-3 px-0.5">
                  {group.label} ({group.list.length})
                </h2>
                <div className="space-y-3">
                  {group.list.map(t => (
                    <Card key={t.id} className={cn(!t.isActive && 'opacity-60')}>
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <button
                                onClick={() => navigate(`/templates/${t.id}`)}
                                className="text-sm font-bold text-gray-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                              >
                                {t.name}
                              </button>
                              <Badge variant={t.isActive ? 'success' : 'default'}>
                                {t.isActive ? 'Active' : 'Inactive'}
                              </Badge>
                            </div>

                            {t.description && (
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{t.description}</p>
                            )}

                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[11px] text-gray-500 dark:text-gray-400">
                              <span className="flex items-center gap-1">
                                <RefreshCw size={11} /> {recurrenceLabel(t)}
                              </span>
                              <span>{t.itemCount} task{t.itemCount !== 1 ? 's' : ''}</span>
                              {t.assigneeNames.length > 0 && (
                                <span>
                                  {t.assigneeNames.slice(0, 2).join(', ')}
                                  {t.assigneeNames.length > 2 ? ` +${t.assigneeNames.length - 2}` : ''}
                                </span>
                              )}
                              {t.projectName && <span>{t.projectName}</span>}
                              <span className="flex items-center gap-1">
                                <Clock size={11} /> {t.generationCount} run{t.generationCount !== 1 ? 's' : ''}
                                {t.lastGeneratedAt && <span className="whitespace-nowrap"> · last {formatDateTime(t.lastGeneratedAt)}</span>}
                              </span>
                              {t.isActive && t.nextRunAt && (
                                <span className="flex items-center gap-1 text-indigo-600 dark:text-indigo-400 font-medium whitespace-nowrap">
                                  <CalendarClock size={11} /> Next run {formatDateTime(t.nextRunAt)}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-0.5 shrink-0">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleGenerate(t)}
                              disabled={generating === t.id}
                              title="Generate now"
                              className="text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
                            >
                              <Play size={14} />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleToggleActive(t)}
                              title={t.isActive ? 'Deactivate' : 'Activate'}
                            >
                              {t.isActive
                                ? <ToggleRight size={16} className="text-green-500" />
                                : <ToggleLeft size={16} className="text-gray-400" />}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => navigate(`/templates/${t.id}/edit`)}
                              title="Edit"
                            >
                              <Pencil size={14} />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDuplicate(t)}
                              title="Duplicate"
                            >
                              <Copy size={14} />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDelete(t)}
                              title="Delete"
                              className="text-red-500 hover:text-red-600"
                            >
                              <Trash2 size={14} />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => navigate(`/templates/${t.id}`)}
                              title="View history"
                            >
                              <ChevronRight size={14} />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </section>
            )
          )}
        </div>
      )}
    </PageTransition>
  );
}
