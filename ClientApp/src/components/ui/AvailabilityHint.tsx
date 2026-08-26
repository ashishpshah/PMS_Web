import type { AvailabilityState } from '../../hooks/useAvailability';

/**
 * Inline "is this taken?" hint shown under a field wired to a live debounced-availability hook
 * (see useProjectNameAvailability / useTaskTitleAvailability). Visual style mirrors the local
 * AvailabilityHint already defined in Users.tsx — shared here for Projects/Tasks so a 3rd/4th
 * consumer doesn't just re-copy it again. Auth.tsx/Users.tsx keep their own existing local copies
 * untouched (not retrofitted onto this one) to avoid any regression risk on those shipped flows.
 */
export function AvailabilityHint({ state, label }: { state: AvailabilityState; label: string }) {
  if (state === 'idle') return null;
  if (state === 'checking') return <p className="text-[11px] text-gray-400 mt-1">Checking {label}…</p>;
  if (state === 'available') return <p className="text-[11px] text-emerald-600 mt-1">✓ {label} is available</p>;
  return <p className="text-[11px] text-red-500 mt-1">✕ {label} is already taken</p>;
}
