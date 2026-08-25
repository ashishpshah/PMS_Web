import React, { lazy, Suspense, Component, ErrorInfo, ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Toaster } from 'sonner';
import { ThemeProvider } from './context/ThemeContext';
import { DataProvider } from './context/DataContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ChatProvider } from './context/ChatContext';
import { QuickViewProvider } from './context/QuickViewContext';
import { SweetAlertProvider } from './context/SweetAlertContext';
import { DashboardLayout } from './components/Layout/DashboardLayout';
import { NotificationPopup } from './components/NotificationPopup';
import { GlobalLoader } from './components/ui/GlobalLoader';
import { LoadingSpinner } from './components/ui/LoadingSpinner';
import { useData } from './context/DataContext';
import { usePushNotifications } from './hooks/usePushNotifications';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Projects = lazy(() => import('./pages/Projects'));
const Tasks = lazy(() => import('./pages/Tasks'));
const Users = lazy(() => import('./pages/Users'));
const Roles = lazy(() => import('./pages/Roles'));
const Auth = lazy(() => import('./pages/Auth'));
const Settings = lazy(() => import('./pages/Settings'));
const ProjectDetails = lazy(() => import('./pages/ProjectDetails'));
const UserDetails = lazy(() => import('./pages/UserDetails'));
const NotFound = lazy(() => import('./pages/NotFound'));
const Chat = lazy(() => import('./pages/Chat'));
const Reports = lazy(() => import('./pages/Reports'));
const Diary = lazy(() => import('./pages/Diary'));
const TemplateList   = lazy(() => import('./pages/TemplateList'));
const TemplateForm   = lazy(() => import('./pages/TemplateForm'));
const TemplateDetail = lazy(() => import('./pages/TemplateDetail'));

const LoadingFallback = () => (
  <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
    <LoadingSpinner size="lg" />
  </div>
);

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    console.error('[ErrorBoundary]', _error, _info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-6">
          <div className="text-center max-w-md">
            <div className="h-16 w-16 rounded-2xl bg-red-50 dark:bg-red-900/20 flex items-center justify-center mx-auto mb-6 border border-red-100 dark:border-red-900/40">
              <span className="text-2xl">⚠️</span>
            </div>
            <h1 className="text-xl font-black uppercase tracking-tighter text-gray-900 dark:text-white mb-2">
              Something went wrong
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              An unexpected error occurred. Please refresh the page to continue.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-black uppercase tracking-widest rounded-xl hover:bg-indigo-700 transition-colors"
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function PushNotificationInit() {
  usePushNotifications();
  return null;
}

function ProtectedRoute() {
  const { user, isLoading: authLoading } = useAuth();
  const { loading: dataLoading } = useData();

  if (authLoading || dataLoading) {
    return <LoadingFallback />;
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return <Outlet />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <GlobalLoader />
      <ThemeProvider>
        <SweetAlertProvider>
          <AuthProvider>
            <DataProvider>
              <QuickViewProvider>
                <BrowserRouter>
                  <ChatProvider>
                  <Toaster
                    position="top-right"
                    richColors
                    closeButton
                    duration={4000}
                  />
                  <PushNotificationInit />
                  <NotificationPopup />
                  <Suspense fallback={<LoadingFallback />}>
                    <Routes>
                      <Route path="/auth" element={<Auth />} />

                      <Route element={<ProtectedRoute />}>
                        <Route element={<DashboardLayout />}>
                          <Route path="/" element={<Dashboard />} />
                          <Route path="/projects" element={<Projects />} />
                          <Route path="/projects/:id" element={<ProjectDetails />} />
                          <Route path="/tasks" element={<Tasks />} />
                          <Route path="/users" element={<Users />} />
                          <Route path="/users/:id" element={<UserDetails />} />
                          <Route path="/roles" element={<Roles />} />
                          <Route path="/settings" element={<Settings />} />
                          <Route path="/chat" element={<Chat />} />
                          <Route path="/reports" element={<Reports />} />
                          <Route path="/diary" element={<Diary />} />
                          <Route path="/templates" element={<TemplateList />} />
                          <Route path="/templates/new" element={<TemplateForm />} />
                          <Route path="/templates/:id/edit" element={<TemplateForm />} />
                          <Route path="/templates/:id" element={<TemplateDetail />} />
                        </Route>
                      </Route>

                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </Suspense>
                  </ChatProvider>
                </BrowserRouter>
              </QuickViewProvider>
            </DataProvider>
          </AuthProvider>
        </SweetAlertProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
