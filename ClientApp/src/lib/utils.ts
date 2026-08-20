import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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
