import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Status, StatusTransitionGraph } from '../types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// A single HH:MM "hours spent in this action" entry (actual hours logged on a status
// transition / block / unblock) can't exceed one calendar day. This does NOT apply to a
// task's overall EstimatedHours, which is a total-effort figure and is legitimately allowed
// to exceed 24h (see backend DTOs/GeneralDtos.cs CreateTaskDto: [Range(0.01, 100000)]).
export const MAX_HOURS_PER_ENTRY = 24;

/** True when hoursInput parses to a value in (0, MAX_HOURS_PER_ENTRY]. */
export function isValidHoursEntry(hours: number | null | undefined): hours is number {
  return hours != null && hours > 0 && hours <= MAX_HOURS_PER_ENTRY;
}

// The transition graph itself is no longer hardcoded here — it's fetched once from
// GET /api/tasks/status-transitions (backed by appsettings.json's TaskStatusTransitions) and
// cached in DataContext, then threaded through to these pure helper functions. This closes a
// drift bug where this file's own hardcoded copy silently diverged from the backend's.

/** Allowed next statuses for a given status, per the fetched transition graph. */
export function getAllowedNextStatuses(graph: StatusTransitionGraph, status: Status): Status[] {
  return Object.keys(graph[status] ?? {}) as Status[];
}

/** True when the given (from, to) edge requires ActualHours to be supplied. */
export function requiresActualHours(graph: StatusTransitionGraph, from: Status, to: Status): boolean {
  return graph[from]?.[to]?.requiresActualHours ?? false;
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Returns DD-MM-YYYY from any ISO/date string, or '' if invalid. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

/** Returns DD-MM-YYYY hh:mm AM/PM from any ISO/date string, or '' if invalid. */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${dd}-${mm}-${yyyy} ${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
}

/** Extracts YYYY-MM-DD from any ISO/date string for use in <input type="date"> defaultValue. */
export function toInputDate(value: string | null | undefined): string {
  if (!value) return '';
  return value.split('T')[0];
}

/** Converts a decimal hours number to "hh:mm" string (e.g. 2.5 → "02:30"). */
export function toHHMM(value: number | null | undefined): string {
  if (value == null || isNaN(value)) return '';
  const totalMin = Math.round(value * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Formats a duration in seconds as a compact label (e.g. 0 → "0m", 2700 → "45m", 7500 → "2h 05m"). */
export function formatSeconds(total: number | null | undefined): string {
  if (total == null || isNaN(total) || total <= 0) return '0m';
  const s = Math.floor(total);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h === 0 ? `${m}m` : `${h}h ${String(m).padStart(2, '0')}m`;
}

/** Parses "hh:mm" string to decimal hours (e.g. "02:30" → 2.5). Returns undefined for empty/invalid. */
export function fromHHMM(value: string): number | undefined {
  if (!value) return undefined;
  const match = value.match(/^(\d{1,2}):([0-5]\d)$/);
  if (!match) return undefined;
  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  if (h > 99) return undefined;
  return h + m / 60;
}
