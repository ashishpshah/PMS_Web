import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Briefcase, CheckSquare, Settings, LogOut, ChevronLeft, ChevronRight,
  Users, Shield, MessageSquare, BarChart2, BookOpen, LayoutTemplate, CalendarDays,
  CalendarCheck, ListChecks, Tag, type LucideIcon,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';
import { useAuth } from '../../context/AuthContext';
import { usePermissions } from '../../hooks/usePermissions';
import { useChat } from '../../context/ChatContext';

interface SidebarProps {
  isCollapsed: boolean;
  setIsCollapsed: (value: boolean) => void;
  isMobileMenuOpen?: boolean;
  setIsMobileMenuOpen?: (value: boolean) => void;
}

interface NavLeaf {
  name: string;
  icon: LucideIcon;
  href: string;
  alwaysShow?: boolean;
  requiredPermission?: string;
  // Gated by isAdmin/isSystemAdmin rather than the page-permission bitmap — used for pages
  // (Holidays, Leave Type) that have no PageModule row, matching how those pages themselves
  // gate access (IsAdminAsync-style, not CanViewAsync).
  adminOnly?: boolean;
}

interface NavGroup {
  name: string;
  icon: LucideIcon;
  children: NavLeaf[];
}

function isGroup(entry: NavLeaf | NavGroup): entry is NavGroup {
  return 'children' in entry;
}

export function Sidebar({ isCollapsed, setIsCollapsed, isMobileMenuOpen, setIsMobileMenuOpen }: SidebarProps) {
  const { logout, isAdmin, isSystemAdmin } = useAuth();
  const navigate = useNavigate();
  const { canView } = usePermissions();
  const { unreadCount } = useChat();
  const isAdminView = isAdmin || isSystemAdmin;

  const handleLogout = () => {
    logout();
    navigate('/auth');
  };

  const isLeafVisible = (item: NavLeaf) =>
    item.alwaysShow || (item.adminOnly ? isAdminView : canView(item.requiredPermission || ''));

  const navModel: (NavLeaf | NavGroup)[] = [
    { name: 'Dashboard', icon: LayoutDashboard, href: '/', alwaysShow: true },
    {
      name: 'Work Management',
      icon: Briefcase,
      children: [
        { name: 'Projects', icon: Briefcase, href: '/projects', requiredPermission: '/projects' },
        { name: 'Tasks', icon: CheckSquare, href: '/tasks', requiredPermission: '/tasks' },
        { name: 'Templates', icon: LayoutTemplate, href: '/templates', requiredPermission: '/templates' },
        { name: 'Reports', icon: BarChart2, href: '/reports', alwaysShow: true },
      ],
    },
    { name: 'Work Diary', icon: BookOpen, href: '/diary', alwaysShow: true },
    {
      name: 'Attendance & Leave',
      icon: CalendarDays,
      children: [
        { name: 'Calendar', icon: CalendarDays, href: '/calendar', alwaysShow: true },
        { name: 'Leaves', icon: CalendarCheck, href: '/leaves', alwaysShow: true },
        { name: 'Holidays', icon: ListChecks, href: '/holidays', alwaysShow: true },
        { name: 'Leave Type', icon: Tag, href: '/leave-types', adminOnly: true },
      ],
    },
    {
      name: 'People & Access',
      icon: Users,
      children: [
        { name: 'Users', icon: Users, href: '/users', requiredPermission: '/users' },
        { name: 'Roles', icon: Shield, href: '/roles', requiredPermission: '/roles' },
      ],
    },
    { name: 'Chat', icon: MessageSquare, href: '/chat', alwaysShow: true },
    { name: 'Settings', icon: Settings, href: '/settings', alwaysShow: true },
  ];

  const renderLeaf = (item: NavLeaf) => (
    <NavLink
      key={item.name}
      to={item.href}
      onClick={() => setIsMobileMenuOpen?.(false)}
      className={({ isActive }) => cn(
        "flex items-center px-2 py-2 rounded-md transition-all group",
        isActive
          ? "bg-indigo-50/50 text-indigo-600 shadow-sm border border-indigo-100/50 dark:bg-indigo-950/30 dark:text-indigo-400 dark:border-indigo-900/30"
          : "text-gray-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-900 border border-transparent"
      )}
    >
      <div className="relative">
        <item.icon className={cn("h-4.5 w-4.5", isCollapsed ? "mx-auto" : "mr-2.5")} />
        {item.name === 'Chat' && unreadCount > 0 && isCollapsed && (
          <span className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-red-500 text-white text-[8px] flex items-center justify-center font-bold">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </div>
      {!isCollapsed && (
        <span className="text-[12px] font-semibold uppercase tracking-tight flex-1">{item.name}</span>
      )}
      {!isCollapsed && item.name === 'Chat' && unreadCount > 0 && (
        <span className="ml-auto text-[10px] bg-red-500 text-white rounded-full px-1.5 py-0.5 font-bold leading-none">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </NavLink>
  );

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 h-full bg-white dark:bg-gray-950 border-r border-gray-100 dark:border-gray-900 transition-all duration-300 z-50",
        isCollapsed ? "w-16" : "w-56",
        "lg:translate-x-0",
        isMobileMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}
    >
      <div className="flex flex-col h-full">
        {/* Logo */}
        <div className="h-14 flex items-center px-4 border-b border-gray-100 dark:border-gray-900 justify-between">
          {!isCollapsed && <span className="font-bold text-lg text-indigo-600 tracking-tight font-display italic">PMS.</span>}
          {isCollapsed && <span className="font-bold text-lg text-indigo-600 tracking-tight font-display">P.</span>}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="p-1 hover:bg-gray-50 dark:hover:bg-gray-900 rounded-md text-gray-400 hidden lg:block border border-transparent hover:border-gray-100 transition-all focus-visible:ring-2 focus-visible:ring-indigo-500 outline-none"
          >
            {isCollapsed ? <ChevronRight size={16} aria-hidden="true" /> : <ChevronLeft size={16} aria-hidden="true" />}
          </button>

          <button
            onClick={() => setIsMobileMenuOpen?.(false)}
            aria-label="Close navigation menu"
            className="p-1 hover:bg-gray-50 dark:hover:bg-gray-900 rounded-md text-gray-400 lg:hidden focus-visible:ring-2 focus-visible:ring-indigo-500 outline-none"
          >
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-2 space-y-0.5 overflow-y-auto">
          {navModel.map(entry => {
            if (!isGroup(entry)) {
              return isLeafVisible(entry) ? renderLeaf(entry) : null;
            }

            const visibleChildren = entry.children.filter(isLeafVisible);
            if (visibleChildren.length === 0) return null;

            return (
              <div key={entry.name} className="pt-3 first:pt-0">
                {!isCollapsed && (
                  <div className="px-2 pb-1 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-gray-400">
                    <entry.icon size={12} />
                    <span>{entry.name}</span>
                  </div>
                )}
                <div className="space-y-0.5">
                  {visibleChildren.map(renderLeaf)}
                </div>
              </div>
            );
          })}
        </nav>

        {/* User / Footer */}
        <div className="p-2 border-t border-gray-50 dark:border-gray-900 mt-auto">
          <Button
            variant="ghost"
            onClick={handleLogout}
            className="w-full justify-start text-red-500 hover:text-red-600 hover:bg-red-50/50 h-9 px-2"
          >
            <LogOut className={cn("h-4.5 w-4.5", isCollapsed ? "mx-auto" : "mr-2.5")} />
            {!isCollapsed && <span className="text-[12px] font-semibold uppercase tracking-tight">Logout</span>}
          </Button>
        </div>
      </div>
    </aside>
  );
}
