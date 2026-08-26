import { useEffect, useState } from 'react';
import { useDebounce } from './useDebounce';
import { taskService } from '../services/task.service';
import type { AvailabilityState } from './useAvailability';

interface Options {
  /** Skip the check until the field is non-empty / the modal is open / a project is selected. */
  enabled?: boolean;
  /** Task title uniqueness is scoped per-project, so the check needs the destination project. */
  projectId?: number;
  /** Exclude this task id (edit form ignores the task's own current title). */
  excludeTaskId?: number;
}

/**
 * Debounced live duplicate-title check for a Task, scoped to a single project. A conflict only
 * counts against another task in the same project that isn't already "completed" — see
 * Services/TaskService.cs TaskTitleConflictsAsync. Re-fires whenever `projectId` changes (e.g. the
 * modal's own Project dropdown), not just when the title changes.
 * Returns 'idle' until a non-empty, enabled value settles, then 'checking' → 'available' | 'taken'.
 */
export function useTaskTitleAvailability(title: string, { enabled = true, projectId, excludeTaskId }: Options): AvailabilityState {
  const debounced = useDebounce(title.trim(), 450);
  const [state, setState] = useState<AvailabilityState>('idle');

  useEffect(() => {
    if (!enabled || !debounced || !projectId) {
      setState('idle');
      return;
    }
    let cancelled = false;
    setState('checking');
    taskService
      .checkTitleAvailable(debounced, projectId, excludeTaskId)
      .then(available => { if (!cancelled) setState(available ? 'available' : 'taken'); })
      .catch(() => { if (!cancelled) setState('idle'); });
    return () => { cancelled = true; };
  }, [debounced, enabled, projectId, excludeTaskId]);

  return state;
}
