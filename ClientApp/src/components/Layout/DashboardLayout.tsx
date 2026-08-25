import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Navbar } from './Navbar';
import { cn } from '../../lib/utils';
import { QuickViewContainer } from '../QuickView/QuickViewContainer';
import { useAuth } from '../../context/AuthContext';
import { ShieldAlert, LogOut } from 'lucide-react';

function ImpersonationBanner() {
  const { user, logout } = useAuth();
  if (!user?.isImpersonated) return null;

  return (
    <div className="fixed top-0 inset-x-0 z-[100] flex items-center justify-between gap-3 px-4 py-2 bg-amber-400 dark:bg-amber-500 shadow-md">
      <div className="flex items-center gap-2 min-w-0">
        <ShieldAlert size={16} className="text-amber-900 shrink-0" />
        <span className="text-[12px] font-black uppercase tracking-widest text-amber-900 truncate">
          Admin session
        </span>
        <span className="text-[12px] text-amber-800 truncate hidden sm:inline">
          &mdash; Viewing as <strong>{user.name}</strong>
          {user.impersonatedByName && (
            <> &nbsp;&bull;&nbsp; Entered by <strong>{user.impersonatedByName}</strong></>
          )}
        </span>
      </div>
      <button
        onClick={logout}
        className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-amber-900 hover:text-red-800 transition-colors shrink-0 whitespace-nowrap"
        title="Exit admin session"
      >
        <LogOut size={13} /> Exit Session
      </button>
    </div>
  );
}

export function DashboardLayout() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { user } = useAuth();
  const bannerOffset = user?.isImpersonated ? 'pt-9' : '';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0d0d12] text-gray-900 dark:text-gray-100 transition-colors duration-300">
      <ImpersonationBanner />

      {/* Mobile Backdrop */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      <Sidebar
        isCollapsed={isCollapsed}
        setIsCollapsed={setIsCollapsed}
        isMobileMenuOpen={isMobileMenuOpen}
        setIsMobileMenuOpen={setIsMobileMenuOpen}
      />

      <div className={cn(
        "flex flex-col min-h-screen transition-all duration-300",
        "lg:pl-56",
        isCollapsed && "lg:pl-16",
        bannerOffset
      )} id="main-content">
        <Navbar onMenuClick={() => setIsMobileMenuOpen(true)} isCollapsed={isCollapsed} />
        <main className="flex-1 pt-16 p-4 lg:p-6 lg:pt-16 custom-scrollbar overflow-x-hidden">
          <Outlet />
        </main>
      </div>
      <QuickViewContainer />
    </div>
  );
}
