import { getApiUrl } from '../config/dataSource';
import { beginRequest, endRequest } from './loadingBus';

// Access token lives in module memory only — never persisted to localStorage.
// This prevents XSS from stealing the short-lived access token via localStorage reads.
let _accessToken: string | null = null;

export const setAccessToken  = (token: string | null) => { _accessToken = token; };
export const getAccessToken  = () => _accessToken;
const getToken               = () => _accessToken;
const getRefreshToken        = () => localStorage.getItem('pms_refresh_token');

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
  // `silent` requests skip the global loading bus so a caller can show its own
  // local loader (e.g. an in-widget spinner) without triggering the app overlay.
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
      // Access token expired — try silent refresh then replay the request once
      const newToken = await tryRefreshAccessToken();
      if (newToken) return fetchJson(endpoint, options, true, silent);
      window.location.href = '/auth';
      throw new Error('Session expired. Please log in again.');
    }

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      if (response.status === 401) {
        if (!endpoint.startsWith('/auth/')) window.location.href = '/auth';
        throw new Error((errorBody as { message?: string }).message || 'Invalid email or password');
      }
      if (response.status === 403) {
        throw new Error((errorBody as { message?: string }).message || 'Access Denied: You do not have permission to perform this action.');
      }
      throw new Error((errorBody as { message?: string }).message || `API error: ${response.status}`);
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
