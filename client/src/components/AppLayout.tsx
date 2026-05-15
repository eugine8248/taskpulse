import { ReactNode } from 'react';
import TopBar from './TopBar';
import { useWebSocket } from '../hooks/useWebSocket';

export default function AppLayout({ children }: { children: ReactNode }) {
  useWebSocket();
  return (
    <div className="min-h-screen flex flex-col bg-bg text-text dark:bg-bg-dark dark:text-text-dark">
      <TopBar />
      <main className="flex-1 px-3 sm:px-6 lg:px-8 py-4 sm:py-6">{children}</main>
    </div>
  );
}
