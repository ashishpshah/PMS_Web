import { getApiUrl } from '../config/dataSource';
import { beginRequest, endRequest } from './loadingBus';

// Access token lives in module memory only — never persisted to localStorage.
// This prevents XSS from stealing the short-lived access token via localStorage reads.
let _accessToken: string | null = null;

export const setAccessToken  = (token: string | null) => { _accessToken = token; };
export const getAccessToken  = () => _accessToken;
const getToken               = () => _accessToken;
const getRefreshToken        = () => localStorage.getItem('pms_refresh_token');

export interface ValidationError {
  field: string;
  message: string;
}

export interface ApiError extends Error {
  validationErrors?: ValidationError[];
  errorCode?: string;
}

function clearAuth() {
  _accessToken = null;
  localStorage.removeItem('pms_refresh_token');
  localStorage.removeItem('pms_user');
}

// Prevent multiple concurrent refresh requests racing each other
let refreshPromise: Promise<string | null> | null = null;

export async function tryRefreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    // The server sets a pms_rt httpOnly cookie; the browser sends it automatically.
    // We also send the body token as a fallback for users whose cookie was set by an older build.
    const rt = getRefreshToken();
    try {
      const res = await fetch(`${getApiUrl()}/auth/refresh`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: rt ? JSON.stringify({ refreshToken: rt }) : undefined,
      });
      if (!res.ok) { clearAuth(); return null; }
      const json = await res.json();
      const data = json?.data ?? json;
      if (data?.token) {
        _accessToken = data.token as string;
        // Rotate refresh token in localStorage if server returned one (legacy / first login).
        if (data.refreshToken) localStorage.setItem('pms_refresh_token', data.refreshToken);
        return _accessToken;
      }
      clearAuth();
      return null;
    } catch {
      clearAuth();
      return null;
    }
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

async function fetchJson(endpoint: string, options: RequestInit = {}, isRetry = false, silent = false): Promise<unknown> {
  const url   = `${getApiUrl()}${endpoint}`;
  const token = getToken();
  if (!silent) beginRequest();
  try {
    const response = await fetch(url, {
      ...options,
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });

    if (response.status === 401 && !isRetry && !endpoint.startsWith('/auth/')) {
      const newToken = await tryRefreshAccessToken();
      if (newToken) return fetchJson(endpoint, options, true, silent);
      window.location.href = '/auth';
      throw new Error('Session expired. Please log in again.');
    }

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      const message = (errorBody as { message?: string }).message || `API error: ${response.status}`;
      const errorCode = (errorBody as { errorCode?: string }).errorCode;
      // The API serializes with the default camelCase policy, so this is "errors", not "Errors"
      // — reading the PascalCase name here always produced undefined, silently dropping every
      // validation error's detail (the .message string above was left as the only thing shown,
      // and it used to be a generic "One or more validation errors occurred." — see
      // Filters/ValidationFilter.cs, which now puts the real, readable text there instead).
      const rawErrors = (errorBody as { errors?: string[] }).errors;

      // Each entry is now a complete, self-contained sentence ("First name is required.") with
      // no "Field: " prefix (ValidationFilter no longer adds one), so there's nothing to split
      // out into a field name here — field stays empty. Per-field inline-error UI would need
      // the backend to return {field, message} pairs explicitly instead of flat strings.
      let validationErrors: ValidationError[] | undefined;
      if (rawErrors && Array.isArray(rawErrors) && rawErrors.length > 0) {
        validationErrors = rawErrors.map(e => ({ field: '', message: e }));
      }

      const err = new Error(message) as ApiError;
      err.validationErrors = validationErrors;
      err.errorCode = errorCode;
      throw err;
    }
    return await response.json();
  } finally {
    if (!silent) endRequest();
  }
}

export interface ApiRequestOpts {
  /** Skip the global loading overlay for this request (caller shows its own loader). */
  silent?: boolean;
}

export async function apiRequest<T>(endpoint: string, options: RequestInit = {}, opts?: ApiRequestOpts): Promise<T> {
  const json = await fetchJson(endpoint, options, false, opts?.silent ?? false);
  if (json && typeof json === 'object' && 'success' in (json as object) && 'data' in (json as object)) {
    return (json as { data: T }).data;
  }
  return json as T;
}

export interface ApiPageMeta {
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface PagedResult<T> {
  data: T;
  meta: ApiPageMeta;
}

/** Like apiRequest but also returns pagination metadata from the ApiResponse envelope. */
export async function apiRequestWithMeta<T>(endpoint: string, options: RequestInit = {}): Promise<PagedResult<T>> {
  const json = await fetchJson(endpoint, options) as Record<string, unknown>;
  const data = (json && typeof json === 'object' && 'success' in json && 'data' in json)
    ? (json.data as T)
    : (json as T);
  const meta: ApiPageMeta = {
    totalCount: (json?.totalCount as number) ?? 0,
    page:       (json?.page       as number) ?? 1,
    pageSize:   (json?.pageSize   as number) ?? 0,
    totalPages: (json?.totalPages as number) ?? 1,
  };
  return { data, meta };
}
