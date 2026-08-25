import { Bell, Search, Sun, Moon, Menu, LogOut } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { cn } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';
import { NotificationDropdown } from './NotificationDropdown';
import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

interface NavbarProps {
  onMenuClick?: () => void;
  isCollapsed?: boolean;
}

export function Navbar({ onMenuClick, isCollapsed }: NavbarProps) {
  const { resolvedTheme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!showUserMenu) return;
    const handler = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showUserMenu]);

  const handleLogout = () => {
    logout();
    navigate('/auth');
  };

  return (
    <header
      className={cn(
        'fixed top-0 right-0 h-14 bg-white/70 dark:bg-gray-950/70 backdrop-blur-md border-b border-gray-100 dark:border-gray-900 z-20 flex items-center px-4 sm:px-6 transition-all duration-300',
        'left-0 lg:left-56',
        isCollapsed && 'lg:left-16'
      )}
    >
      <button
        onClick={onMenuClick}
        aria-label="Open navigation menu"
        className="p-1.5 mr-2 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-900 rounded-md lg:hidden focus-visible:ring-2 focus-visible:ring-indigo-500 outline-none"
      >
        <Menu size={18} aria-hidden="true" />
      </button>

      <div className="flex-1 flex items-center max-w-sm hidden md:flex">
        <div className="relative w-full group">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 group-focus-within:text-indigo-500 transition-colors" aria-hidden="true" />
          <input
            type="search"
            placeholder="Search tasks, projects..."
            aria-label="Search tasks and projects"
            className="w-full pl-9 pr-3 py-1.5 bg-gray-50 dark:bg-gray-900 border border-transparent focus:border-indigo-500/30 focus:bg-white dark:focus:bg-gray-800 transition-all rounded-md text-[13px] outline-none"
          />
        </div>
      </div>

      <div className="ml-auto flex items-center space-x-1.5">
        <button
          onClick={toggleTheme}
          aria-label={resolvedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          className="p-1.5 rounded-md bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-200 dark:hover:border-indigo-700 transition-all focus-visible:ring-2 focus-visible:ring-indigo-500 outline-none"
        >
          {resolvedTheme === 'dark' ? <Sun size={14} aria-hidden="true" /> : <Moon size={14} aria-hidden="true" />}
        </button>

        <NotificationDropdown />

        <div className="h-6 w-px bg-gray-100 dark:bg-gray-800 mx-1" aria-hidden="true" />

        <div className="relative" ref={userMenuRef}>
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            aria-haspopup="true"
            aria-expanded={showUserMenu}
            aria-label={`User menu for ${user?.name || 'Guest'}`}
            className="flex items-center space-x-2 cursor-pointer group pl-1 focus-visible:ring-2 focus-visible:ring-indigo-500 outline-none rounded"
          >
            <div className="flex flex-col items-end hidden sm:flex">
              <span className="text-[12px] font-bold text-gray-900 dark:text-gray-100 group-hover:text-indigo-600 transition-colors leading-none mb-0.5">{user?.name || 'Guest User'}</span>
              <span className="text-[9px] uppercase font-black tracking-widest text-gray-400 leading-none">{user?.role || 'User'}</span>
            </div>
            <img
              src={user?.avatar || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop&q=80'}
              alt={user?.name ? `${user.name} avatar` : 'User avatar'}
              className="h-8 w-8 rounded-lg border border-gray-100 dark:border-gray-800 shadow-sm"
            />
          </button>

          {showUserMenu && (
            <div
              role="menu"
              className="absolute right-0 top-full mt-2 w-40 bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-100 dark:border-gray-800 py-1 z-50"
            >
              <button
                role="menuitem"
                onClick={handleLogout}
                className="flex items-center w-full px-4 py-2 text-left text-[12px] font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 outline-none"
              >
                <LogOut size={14} className="mr-2" aria-hidden="true" />
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
