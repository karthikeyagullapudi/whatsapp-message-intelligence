import { Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';
import { LiveProvider } from './hooks/useLive.jsx';
import Shell from './components/layout/Shell.jsx';
import InboxPage from './pages/InboxPage.jsx';
import MessagesPage from './pages/MessagesPage.jsx';
import ConnectionPage from './pages/ConnectionPage.jsx';

export default function App() {
  return (
    <LiveProvider>
      <Shell>
        <Routes>
          <Route path="/" element={<Navigate to="/inbox" replace />} />
          <Route path="/inbox" element={<InboxPage />} />
          <Route path="/messages" element={<MessagesPage />} />
          <Route path="/connection" element={<ConnectionPage />} />
          {/* old paths */}
          <Route path="/review/*" element={<Navigate to="/inbox" replace />} />
          <Route path="/connect" element={<Navigate to="/connection" replace />} />
          <Route path="*" element={<Navigate to="/inbox" replace />} />
        </Routes>
      </Shell>
      <Toaster
        theme="dark"
        position="bottom-right"
        toastOptions={{
          style: {
            background: 'var(--raised)',
            border: '1px solid var(--border-strong)',
            color: 'var(--text)',
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--text-sm)',
            borderRadius: 'var(--radius-md)',
          },
        }}
      />
    </LiveProvider>
  );
}
