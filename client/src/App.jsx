import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import ConnectPage from './pages/ConnectPage.jsx';
import MessagesPage from './pages/MessagesPage.jsx';
import ReviewPage from './pages/ReviewPage.jsx';
import { useMessageStats } from './hooks/useMessages.js';

export default function App() {
  const stats = useMessageStats();
  const waiting = stats.needs_review ?? 0;
  return (
    <div className="app">
      <header className="topbar">
        <strong>WhatsApp Message Intelligence</strong>
        <nav>
          <NavLink to="/connect">Connect</NavLink>
          <NavLink to="/messages">Messages</NavLink>
          <NavLink to="/review">
            Review {waiting > 0 && <span className="count">{waiting}</span>}
          </NavLink>
        </nav>
      </header>
      <main className="content">
        <Routes>
          <Route path="/" element={<Navigate to="/connect" replace />} />
          <Route path="/connect" element={<ConnectPage />} />
          <Route path="/messages" element={<MessagesPage />} />
          <Route path="/review" element={<ReviewPage />} />
          <Route path="/review/:id" element={<ReviewPage />} />
        </Routes>
      </main>
    </div>
  );
}
