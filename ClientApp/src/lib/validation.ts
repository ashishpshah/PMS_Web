// Lightweight, dependency-free form validation helpers.
// Each validator returns an error message string, or '' when valid.

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// 3-30 chars: letters, digits, dot, underscore, hyphen.
export const USERNAME_REGEX = /^[a-zA-Z0-9._-]{3,30}$/;
// Optional phone: digits, spaces, +, -, parentheses; 7-15 digits overall.
const CONTACT_ALLOWED = /^[0-9+\-()\s]+$/;

export function validateRequired(value: string | undefined | null, label: string): string {
  return value && value.trim() ? '' : `${label} is required.`;
}

export function validateName(value: string | undefined | null, label: string): string {
  const v = (value ?? '').trim();
  if (!v) return `${label} is required.`;
  if (v.length < 2) return `${label} must be at least 2 characters.`;
  if (v.length > 100) return `${label} must be at most 100 characters.`;
  return '';
}

export function validateUsername(value: string | undefined | null): string {
  const v = (value ?? '').trim();
  if (!v) return 'Username is required.';
  if (!USERNAME_REGEX.test(v)) return 'Username must be 3-30 chars (letters, digits, . _ -).';
  return '';
}

export function validateEmail(value: string | undefined | null): string {
  const v = (value ?? '').trim();
  if (!v) return 'Email is required.';
  if (!EMAIL_REGEX.test(v)) return 'Enter a valid email address.';
  return '';
}

export function validateContact(value: string | undefined | null): string {
  const v = (value ?? '').trim();
  if (!v) return ''; // optional
  if (!CONTACT_ALLOWED.test(v)) return 'Contact number contains invalid characters.';
  const digits = v.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return 'Contact number must have 7-15 digits.';
  return '';
}

export function validatePassword(value: string | undefined | null): string {
  const v = value ?? '';
  if (!v) return 'Password is required.';
  if (v.length < 6) return 'Password must be at least 6 characters.';
  return '';
}

/** Strips empty-string entries so a caller can check `Object.keys(errors).length === 0`. */
export function collectErrors(map: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(map)) {
    if (v) out[k] = v;
  }
  return out;
}
