import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { User } from '../types';
import { apiRequest, setAccessToken, tryRefreshAccessToken, getAccessToken } from '../lib/api';

// Effective permission bitmap per page route, keyed by route (e.g. '/projects')
export type PagePermissions = Record<string, number>;

export interface RegisterPayload {
  firstName: string;
  lastName: string;
  username?: string;
  email: string;
  contactNo?: string;
  password: string;
}

interface AuthContextType {
  user: User | null;
  login: (identifier: string, password: string) => Promise<void>;
  register: (data: RegisterPayload) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
  isSystemAdmin: boolean;
  isAdmin: boolean;
  pagePermissions: PagePermissions;
  checkAuthStatus: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function fetchMyPermissions(): Promise<PagePermissions> {
  try {
    const data = await apiRequest<{ pageModuleId: number; route: string; permissions: number }[]>('/permissions/my');
    const map: PagePermissions = {};
    for (const p of data) {
      map[p.route.toLowerCase()] = p.permissions;
    }
    return map;
  } catch {
    return {};
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pagePermissions, setPagePermissions] = useState<PagePermissions>({});
  const authCheckRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    checkAuthStatus();
  }, []);

  type AuthApiResponse = { token: string; refreshToken?: string; user: Partial<User> & { roleName?: string; RoleName?: string; isAdmin?: boolean; firstName?: string; lastName?: string; userName?: string; fullName?: string; isImpersonated?: boolean; impersonatedByName?: string } };

  const applyAuthResponse = async (response: AuthApiResponse, fallbackName: string) => {
    const mappedUser: User = {
      ...response.user,
      name: response.user.fullName || (response.user as any).FullName || response.user.name || fallbackName,
      firstName: response.user.firstName,
      lastName: response.user.lastName,
      username: response.user.userName,
      role: response.user.role || response.user.roleName || response.user.RoleName || 'Developer',
      isAdmin: response.user.isAdmin ?? false,
      isImpersonated: response.user.isImpersonated ?? false,
      impersonatedByName: response.user.impersonatedByName,
    } as User;

    // Access token stored in memory only — never in localStorage.
    setAccessToken(response.token);
    // Refresh token stored in localStorage as fallback; server also sets an httpOnly cookie.
    if (response.refreshToken) localStorage.setItem('pms_refresh_token', response.refreshToken);
    // Only non-sensitive identity kept in localStorage (for page-refresh UX).
    localStorage.setItem('pms_user', JSON.stringify(mappedUser));
    setUser(mappedUser);
    const perms = await fetchMyPermissions();
    setPagePermissions(perms);
  };

  const login = async (identifier: string, password: string) => {
    try {
      const response = await apiRequest<AuthApiResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ usernameOrEmail: identifier, password }),
      });
      await applyAuthResponse(response, identifier);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Login failed';
      throw new Error(message);
    }
  };

  const register = async (data: RegisterPayload) => {
    try {
      const response = await apiRequest<AuthApiResponse>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          firstName: data.firstName,
          lastName: data.lastName,
          userName: data.username,
          email: data.email,
          contactNo: data.contactNo,
          password: data.password,
        }),
      });
      await applyAuthResponse(response, `${data.firstName} ${data.lastName}`.trim());
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Registration failed';
      throw new Error(message);
    }
  };

  const logout = () => {
    // Best-effort server-side token revocation (fire-and-forget)
    const token = getAccessToken() ?? undefined;
    const apiBase = import.meta.env.VITE_API_URL || '/api';
    fetch(`${apiBase}/auth/logout`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }).catch(() => { /* ignore */ });
    setAccessToken(null);
    setUser(null);
    setPagePermissions({});
    localStorage.removeItem('pms_user');
    localStorage.removeItem('pms_token');
    localStorage.removeItem('pms_refresh_token');
    window.location.href = '/auth';
  };

  const checkAuthStatus = async () => {
    // Prevent multiple simultaneous auth checks (e.g., multiple tabs opening)
    if (authCheckRef.current) {
      try {
        await authCheckRef.current;
      } catch {
        // Previous check failed, proceed with new check
      }
      return;
    }

    authCheckRef.current = (async () => {
      try {
        const savedUser = localStorage.getItem('pms_user');
        // Show cached user data immediately for optimistic UX during re-auth
        if (savedUser) {
          try {
            const parsed = JSON.parse(savedUser);
            if (!parsed.name && parsed.fullName) parsed.name = parsed.fullName;
            setUser(parsed);
          } catch { /* ignore malformed */ }
        }

        // Obtain a fresh access token via the httpOnly cookie or localStorage refresh token.
        const newToken = await tryRefreshAccessToken();
        if (!newToken) {
          // Refresh failed — clear stale user data and require re-login
          setUser(null);
          setPagePermissions({});
          localStorage.removeItem('pms_user');
          localStorage.removeItem('pms_refresh_token');
          return;
        }

        // Validate token with backend and refresh user data (restores impersonation state)
        try {
          const validated = await apiRequest<User & { isImpersonated?: boolean; impersonatedByName?: string; fullName?: string }>('/auth/validate');
          if (validated) {
            const cached = savedUser ? JSON.parse(savedUser) : {};
            const refreshed: User = {
              ...cached,
              ...validated,
              name: (validated as any).fullName || validated.name || cached.name,
              isImpersonated: (validated as any).isImpersonated ?? false,
              impersonatedByName: (validated as any).impersonatedByName,
            };
            setUser(refreshed);
            localStorage.setItem('pms_user', JSON.stringify(refreshed));
          }
        } catch {
          // validate failed even with a fresh token — treat as expired
          setUser(null);
          setPagePermissions({});
          localStorage.removeItem('pms_user');
          localStorage.removeItem('pms_refresh_token');
          return;
        }

        const perms = await fetchMyPermissions();
        setPagePermissions(perms);
      } finally {
        setIsLoading(false);
        authCheckRef.current = null;
      }
    })();

    try {
      await authCheckRef.current;
    } catch {
      // Error handled inside
    }
  };

  const isSystemAdmin = user?.roleId === 1;
  const isAdmin = (user?.isAdmin ?? false);

  return (
    <AuthContext.Provider value={{ user, login, register, logout, isLoading, isSystemAdmin, isAdmin, pagePermissions, checkAuthStatus }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
