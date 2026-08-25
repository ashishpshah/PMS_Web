import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Pencil, Play, Clock, RefreshCw, CheckSquare, Tag, User, Calendar, ExternalLink, ChevronLeft } from 'lucide-react';
import { PageTransition } from '../components/Layout/PageTransition';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Card, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { showSuccess, showError } from '../lib/toast';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { templateService } from '../services/template.service';
import { TaskTemplate, TaskTemplateGeneration, RecurrenceType } from '../types';
import { cn, formatDateTime } from '../lib/utils';

type TabId = 'overview' | 'history';

const RECURRENCE_LABELS: Record<RecurrenceType, string> = {
  daily:   'Daily',
  weekly:  'Weekly',
  monthly: 'Monthly',
  custom:  'Custom',
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function recurrenceDetail(t: TaskTemplate): string {
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

const PRIORITY_COLORS: Record<string, string> = {
  low:      'text-gray-500',
  medium:   'text-blue-600 dark:text-blue-400',
  high:     'text-amber-600 dark:text-amber-400',
  critical: 'text-red-600 dark:text-red-400',
};

export default function TemplateDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [template, setTemplate] = useState<TaskTemplate | null>(null);
  const [history,  setHistory]  = useState<TaskTemplateGeneration[]>([]);
  const [tab, setTab]           = useState<TabId>('overview');
  const [loading, setLoading]   = useState(true);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      const [t, h] = await Promise.all([
        templateService.getById(Number(id)),
        templateService.getHistory(Number(id)),
      ]);
      setTemplate(t);
      setHistory(h);
    } catch {
      showError('Failed to load template');
      navigate('/templates');
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => { load(); }, [load]);

  const handleGenerate = async () => {
    if (!template) return;
    setGenerating(true);
    try {
      const gen = await templateService.generate(template.id);
      setHistory(prev => [gen, ...prev]);
      setTemplate(t => t ? { ...t, generationCount: t.generationCount + 1, lastGeneratedAt: gen.generatedAt } : t);
      showSuccess(`Generated ${gen.taskCount} task${gen.taskCount !== 1 ? 's' : ''}`);
      setTab('history');
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return <LoadingSpinner size="lg" className="h-64" />;
  }

  if (!template) return null;

  return (
    <PageTransition>
      <PageHeader
        title={template.name}
        description={template.description}
      >
        <Button variant="outline" onClick={() => navigate('/templates')}>
          <ChevronLeft size={14} className="mr-1.5" /> Back
        </Button>
        <Button variant="outline" onClick={() => navigate(`/templates/${template.id}/edit`)}>
          <Pencil size={14} className="mr-1.5" /> Edit
        </Button>
        <Button onClick={handleGenerate} disabled={generating}>
          <Play size={14} className="mr-1.5" /> {generating ? 'Generating…' : 'Generate Now'}
        </Button>
      </PageHeader>

      {/* Status + meta row */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <Badge variant={template.isActive ? 'success' : 'default'}>
          {template.isActive ? 'Active' : 'Inactive'}
        </Badge>
        <span className="flex items-center gap-1.5 text-xs text-gray-500">
          <RefreshCw size={12} /> {recurrenceDetail(template)}
        </span>
        <span className="flex items-center gap-1.5 text-xs text-gray-500">
          <Calendar size={12} /> From {template.startDate}{template.endDate ? ` to ${template.endDate}` : ''}
        </span>
        <span className="flex items-center gap-1.5 text-xs text-gray-500">
          <Clock size={12} /> {template.generationCount} run{template.generationCount !== 1 ? 's' : ''}
          {template.lastGeneratedAt && <> · last {formatDateTime(template.lastGeneratedAt)}</>}
        </span>
        {template.projectName && (
          <span className="text-xs text-gray-500">{template.projectName}</span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-100 dark:border-gray-800 mb-6">
        {([['overview', 'Overview'], ['history', 'Generation History']] as [TabId, string][]).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'px-4 py-2 text-[11px] font-black uppercase tracking-widest transition-colors border-b-2 -mb-px',
              tab === t
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400'
                : 'border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
            )}
          >
            {label} {t === 'history' && history.length > 0 && `(${history.length})`}
          </button>
        ))}
      </div>

      {/* ── Overview tab ── */}
      {tab === 'overview' && (
        <div className="space-y-6">
          {/* Assignees */}
          {template.assigneeNames.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <h3 className="text-[11px] font-black uppercase tracking-widest text-gray-400 mb-3">Assignees</h3>
                <div className="flex flex-wrap gap-2">
                  {template.assigneeNames.map(name => (
                    <span key={name} className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-700 text-gray-700 dark:text-gray-300">
                      <User size={11} className="text-gray-400" /> {name}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Skip Rules */}
          {((template.skipDaysOfWeek?.length ?? 0) +
            (template.skipDates?.length ?? 0) +
            (template.skipDaysOfMonth?.length ?? 0)) > 0 && (
            <Card>
              <CardContent className="p-4">
                <h3 className="text-[11px] font-black uppercase tracking-widest text-gray-400 mb-3">Skip Rules</h3>
                <dl className="space-y-1.5 text-xs">
                  {(template.skipDaysOfWeek?.length ?? 0) > 0 && (
                    <div className="flex gap-2">
                      <dt className="text-gray-500 w-32 shrink-0">Skip weekdays</dt>
                      <dd className="text-gray-700 dark:text-gray-300">
                        {template.skipDaysOfWeek!.map(d => DAY_NAMES[d]).join(', ')}
                      </dd>
                    </div>
                  )}
                  {(template.skipDaysOfMonth?.length ?? 0) > 0 && (
                    <div className="flex gap-2">
                      <dt className="text-gray-500 w-32 shrink-0">Skip days of month</dt>
                      <dd className="text-gray-700 dark:text-gray-300">
                        {[...template.skipDaysOfMonth!].sort((a, b) => a - b).map(d => `Day ${d}`).join(', ')}
                      </dd>
                    </div>
                  )}
                  {(template.skipDates?.length ?? 0) > 0 && (
                    <div className="flex gap-2">
                      <dt className="text-gray-500 w-32 shrink-0">Skip dates</dt>
                      <dd className="text-gray-700 dark:text-gray-300">
                        {template.skipDates!.join(', ')}
                      </dd>
                    </div>
                  )}
                </dl>
              </CardContent>
            </Card>
          )}

          {/* Task Items */}
          <div>
            <h3 className="text-[11px] font-black uppercase tracking-widest text-gray-400 mb-3">
              Task Items ({template.items.length})
            </h3>
            <div className="space-y-3">
              {template.items.map(item => (
                <Card key={item.id} className="border border-gray-100 dark:border-gray-800">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <span className="w-6 h-6 rounded-full bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5">
                        {item.position}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-gray-900 dark:text-white">{item.title}</span>
                          <span className={cn('text-[11px] font-bold uppercase', PRIORITY_COLORS[item.priority] ?? '')}>{item.priority}</span>
                          {item.estimatedHours > 0 && (
                            <span className="text-[11px] text-gray-400">{item.estimatedHours}h estimated</span>
                          )}
                          {item.dueDateOffsetDays > 0 && (
                            <span className="text-[11px] text-gray-400">due +{item.dueDateOffsetDays}d</span>
                          )}
                        </div>

                        {item.description && (
                          <p className="text-xs text-gray-500 mt-1">{item.description}</p>
                        )}

                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-gray-400">
                          {item.defaultAssigneeName && (
                            <span className="flex items-center gap-1"><User size={10} /> {item.defaultAssigneeName}</span>
                          )}
                          {item.qaReviewerName && (
                            <span className="flex items-center gap-1"><CheckSquare size={10} /> QA: {item.qaReviewerName}</span>
                          )}
                        </div>

                        {item.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {item.tags.map(tag => (
                              <span key={tag} className="flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 rounded border border-indigo-100 dark:border-indigo-900/30">
                                <Tag size={9} /> {tag}
                              </span>
                            ))}
                          </div>
                        )}

                        {item.checklistItems.length > 0 && (
                          <div className="mt-2">
                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Checklist ({item.checklistItems.length})</p>
                            <ul className="space-y-0.5">
                              {item.checklistItems.map((ci, i) => (
                                <li key={i} className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                                  <CheckSquare size={11} className="text-gray-300 shrink-0" /> {ci}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {item.reviewCriteria.length > 0 && (
                          <div className="mt-2">
                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Review Criteria</p>
                            <ul className="space-y-0.5">
                              {item.reviewCriteria.map((rc, i) => (
                                <li key={i} className="text-xs text-gray-600 dark:text-gray-400 pl-2 border-l-2 border-indigo-200 dark:border-indigo-800">{rc}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── History tab ── */}
      {tab === 'history' && (
        <div className="space-y-4">
          {history.length === 0 ? (
            <div className="text-center py-16 text-gray-400 text-sm">No runs yet. Click "Generate Now" to create the first batch of tasks.</div>
          ) : (
            history.map(gen => (
              <Card key={gen.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-gray-900 dark:text-white">{gen.periodKey}</span>
                        <Badge variant="info">{gen.taskCount} tasks</Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-[11px] text-gray-400">
                        <span className="flex items-center gap-1"><Clock size={10} /> {formatDateTime(gen.generatedAt)}</span>
                        {gen.generatedByName && <span>by {gen.generatedByName}</span>}
                        {gen.notes && <span className="italic">{gen.notes}</span>}
                      </div>
                    </div>
                  </div>

                  {gen.tasks.length > 0 && (
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-100 dark:border-gray-800">
                          <th className="text-left pb-1.5 text-[10px] font-black uppercase tracking-widest text-gray-400">Task</th>
                          <th className="text-left pb-1.5 text-[10px] font-black uppercase tracking-widest text-gray-400">Template Item</th>
                          <th className="text-left pb-1.5 text-[10px] font-black uppercase tracking-widest text-gray-400">Assignee</th>
                          <th className="pb-1.5 w-6" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                        {gen.tasks.map(gt => (
                          <tr key={gt.taskId} className="group">
                            <td className="py-1.5 text-gray-700 dark:text-gray-300 pr-3">{gt.taskTitle}</td>
                            <td className="py-1.5 text-gray-500 pr-3">{gt.templateItemTitle}</td>
                            <td className="py-1.5 text-gray-500">{gt.assigneeName}</td>
                            <td className="py-1.5">
                              <button
                                onClick={() => navigate(`/tasks?id=${gt.taskId}`)}
                                className="opacity-0 group-hover:opacity-100 p-1 text-indigo-500 hover:text-indigo-700 transition-opacity"
                                title="View task"
                              >
                                <ExternalLink size={11} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}
    </PageTransition>
  );
}
