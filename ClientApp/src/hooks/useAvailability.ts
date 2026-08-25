import { useEffect, useState } from 'react';
import { useDebounce } from './useDebounce';
import { userService } from '../services/user.service';

export type AvailabilityState = 'idle' | 'checking' | 'available' | 'taken';

interface Options {
  /** Skip the check until the value passes basic format validation. */
  enabled?: boolean;
  /** Exclude this user id (edit form ignores the user's own current value). */
  excludeUserId?: number;
  field: 'userName' | 'email';
}

/**
 * Debounced live availability check for a username or email.
 * Returns 'idle' until a non-empty, enabled value settles, then 'checking' → 'available' | 'taken'.
 */
export function useAvailability(value: string, { enabled = true, excludeUserId, field }: Options): AvailabilityState {
  const debounced = useDebounce(value.trim(), 450);
  const [state, setState] = useState<AvailabilityState>('idle');

  useEffect(() => {
    if (!enabled || !debounced) {
      setState('idle');
      return;
    }
    let cancelled = false;
    setState('checking');
    userService
      .checkAvailability({ [field]: debounced, excludeUserId } as { userName?: string; email?: string; excludeUserId?: number })
      .then(res => {
        if (cancelled) return;
        const available = field === 'userName' ? res.userNameAvailable : res.emailAvailable;
        const checked = field === 'userName' ? res.userNameChecked : res.emailChecked;
        setState(checked ? (available ? 'available' : 'taken') : 'idle');
      })
      .catch(() => { if (!cancelled) setState('idle'); });
    return () => { cancelled = true; };
  }, [debounced, enabled, excludeUserId, field]);

  return state;
}
