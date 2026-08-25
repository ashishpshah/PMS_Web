import { useAuth } from '../context/AuthContext';

interface PermissionOptions {
  action: 'view' | 'create' | 'update' | 'delete';
  resource: string;
}

const BITS: Record<string, number> = {
  view: 1,
  create: 2,
  update: 4,
  delete: 8,
};

export const usePermissions = () => {
  const { user, isAdmin, pagePermissions } = useAuth();

  const hasPermission = (options: PermissionOptions): boolean => {
    if (!user) return false;

    // SystemAdmin and any IsAdmin role get full access everywhere
    if (isAdmin) return true;

    // Dashboard is always visible
    const route = options.resource.toLowerCase();
    if (route === '/' || route === '' || route === 'dashboard') return true;

    const bit = BITS[options.action] ?? 1;
    const bitmap = pagePermissions[route] ?? 0;
    return (bitmap & bit) === bit;
  };

  const canView   = (resource: string) => hasPermission({ action: 'view',   resource });
  const canCreate = (resource: string) => hasPermission({ action: 'create', resource });
  const canUpdate = (resource: string) => hasPermission({ action: 'update', resource });
  const canDelete = (resource: string) => hasPermission({ action: 'delete', resource });

  return { canView, canCreate, canUpdate, canDelete, hasPermission };
};
