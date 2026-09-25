import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import ConnectPage from './pages/ConnectPage.jsx';
import MessagesPage from './pages/MessagesPage.jsx';
import ReviewPage from './pages/ReviewPage.jsx';

export default function App() {
  return (
    <div className="app">
      <header className="topbar">
        <strong>WhatsApp Message Intelligence</strong>
        <nav>
          <NavLink to="/connect">Connect</NavLink>
          <NavLink to="/messages">Messages</NavLink>
          <NavLink to="/review">Review</NavLink>
        </nav>
      </header>
      <main className="content">
        <Routes>
          <Route path="/" element={<Navigate to="/connect" replace />} />
          <Route path="/connect" element={<ConnectPage />} />
          <Route path="/messages" element={<MessagesPage />} />
          <Route path="/review" element={<ReviewPage />} />
        </Routes>
      </main>
    </div>
  );
}
