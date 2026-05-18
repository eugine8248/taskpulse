import { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from './api/client';
import { useStore } from './store';
import AppLayout from './components/AppLayout';
import LoginPage from './routes/LoginPage';
import SetupPage from './routes/SetupPage';
import BoardPage from './routes/BoardPage';
import ProjectListPage from './routes/ProjectListPage';
import ReportsPage from './routes/ReportsPage';
import SettingsPage from './routes/SettingsPage';
import TodayPane from './components/TodayPane';

interface AuthStatus {
  hasUsers: boolean;
  noAuth: boolean;
}

export default function App() {
  const theme = useStore((s) => s.theme);
  const token = useStore((s) => s.token);
  const setToken = useStore((s) => s.setToken);
  const location = useLocation();
  const navigate = useNavigate();

  // Apply theme to <html>
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
  }, [theme]);

  // Initial auth status
  const { data: status, isLoading } = useQuery<AuthStatus>({
    queryKey: ['auth-status'],
    queryFn: () => api.get<AuthStatus>('/api/auth/status'),
  });

  // Routing decisions based on auth status
  useEffect(() => {
    if (!status) return;
    const path = location.pathname;
    if (status.noAuth) {
      if (path === '/login' || path === '/setup') navigate('/', { replace: true });
      return;
    }
    if (!status.hasUsers && path !== '/setup') {
      navigate('/setup', { replace: true });
      return;
    }
    if (status.hasUsers && !token && path !== '/login' && path !== '/setup') {
      navigate('/login', { replace: true });
    }
  }, [status, location.pathname, token, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-textMuted dark:text-textMuted-dark bg-bg dark:bg-bg-dark">
        Loading…
      </div>
    );
  }

  // setup / login render outside the layout (no TopBar)
  if (location.pathname === '/login') return <LoginPage />;
  if (location.pathname === '/setup') return <SetupPage onLogin={setToken} />;

  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<ProjectListPage />} />
        <Route path="/today" element={<TodayPane />} />
        <Route path="/boards/:id" element={<BoardPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/reports/:project/:date/:category" element={<ReportsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppLayout>
  );
}
