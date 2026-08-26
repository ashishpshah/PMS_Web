import { useEffect, useState } from 'react';
import { useDebounce } from './useDebounce';
import { projectService } from '../services/project.service';
import type { AvailabilityState } from './useAvailability';

interface Options {
  /** Skip the check until the field is non-empty / the modal is open. */
  enabled?: boolean;
  /** Exclude this project id (edit form ignores the project's own current name). */
  excludeProjectId?: number;
}

/**
 * Debounced live duplicate-name check for a Project. A conflict only counts against another
 * project that isn't already "completed" — see Services/ProjectService.cs ProjectNameConflictsAsync.
 * Returns 'idle' until a non-empty, enabled value settles, then 'checking' → 'available' | 'taken'.
 */
export function useProjectNameAvailability(name: string, { enabled = true, excludeProjectId }: Options): AvailabilityState {
  const debounced = useDebounce(name.trim(), 450);
  const [state, setState] = useState<AvailabilityState>('idle');

  useEffect(() => {
    if (!enabled || !debounced) {
      setState('idle');
      return;
    }
    let cancelled = false;
    setState('checking');
    projectService
      .checkNameAvailable(debounced, excludeProjectId)
      .then(available => { if (!cancelled) setState(available ? 'available' : 'taken'); })
      .catch(() => { if (!cancelled) setState('idle'); });
    return () => { cancelled = true; };
  }, [debounced, enabled, excludeProjectId]);

  return state;
}
