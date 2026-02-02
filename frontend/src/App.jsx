import React, { useState, useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import SkillMatrix from './components/SkillMatrix';
import SkillGraph from './components/SkillGraph';
import UserProfile from './components/UserProfile';
import ErrorBoundary from './components/ErrorBoundary';
import ChatPanel from './components/ChatPanel';
import apiFetch from './api';
import './App.css';

function App() {
  const [view, setView] = useState('matrix');
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [currentUser, setCurrentUser] = useState(null); // Logged in user
  const [showLogin, setShowLogin] = useState(false);
  const [users, setUsers] = useState([]);
  const [chatOpen, setChatOpen] = useState(false);

  // Fetch users for login dropdown
  useEffect(() => {
    apiFetch('/api/users')
      .then(res => res.json())
      .then(data => setUsers(data))
      .catch(err => console.error('Failed to fetch users:', err));
  }, []);

  const handleUserSelect = (userId) => {
    setSelectedUserId(userId);
    setView('profile');
  };

  const handleLogin = (userId) => {
    setCurrentUser(users.find(u => u.id === parseInt(userId)));
    setSelectedUserId(parseInt(userId));
    setShowLogin(false);
    setView('profile');
  };

  const handleLogout = () => {
    setCurrentUser(null);
  };

  return (
    <div className="app">
      <div className="data-disclaimer">
        📋 Data shown is guesstimates from Work IQ — not verified skill levels. Help improve accuracy by updating your own profile!
      </div>
      <header className="app-header">
        <div className="header-left">
          <h1>Team Skills Tracker</h1>
          <span className="header-subtitle" title="Find help fast: Click any skill header to see experts. Use search to filter. Log in to update your own skills.">
            Find experts • Track skills • Swarm smart
          </span>
        </div>
        <nav className="nav">
          {/* View Toggle */}
          <div className="view-toggle">
            <button 
              className={view === 'matrix' ? 'active' : ''} 
              onClick={() => setView('matrix')}
              title="Table view of all skills"
            >
              <span className="btn-icon">📊</span>
              Matrix
            </button>
            <button 
              className={view === 'graph' ? 'active' : ''} 
              onClick={() => setView('graph')}
              title="Interactive network visualization"
            >
              <span className="btn-icon">🕸️</span>
              Graph
            </button>
          </div>
          
          {/* Profile / Login */}
          {currentUser ? (
            <div className="user-menu">
              <button 
                className={`profile-btn ${view === 'profile' ? 'active' : ''}`}
                onClick={() => { setSelectedUserId(currentUser.id); setView('profile'); }}
                title="View your profile"
              >
                <span className="btn-icon">👤</span>
                {currentUser.name.split(' ')[0]}
              </button>
              <button 
                className="logout-btn"
                onClick={handleLogout}
                title="Log out"
              >
                Logout
              </button>
            </div>
          ) : (
            <button 
              className="login-btn"
              onClick={() => setShowLogin(true)}
              title="Log in to edit your skills"
            >
              <span className="btn-icon">🔐</span>
              Login
            </button>
          )}
        </nav>
      </header>

      {/* Login Modal */}
      {showLogin && (
        <div className="login-modal-overlay" onClick={() => setShowLogin(false)}>
          <div className="login-modal" onClick={e => e.stopPropagation()}>
            <h2>Login</h2>
            <p className="login-disclaimer">⚠️ This is a demo — no real authentication. Just pick a name to simulate being logged in.</p>
            <select 
              onChange={(e) => e.target.value && handleLogin(e.target.value)}
              defaultValue=""
            >
              <option value="" disabled>Select your name...</option>
              {users.map(user => (
                <option key={user.id} value={user.id}>{user.name}</option>
              ))}
            </select>
            <button className="cancel-btn" onClick={() => setShowLogin(false)}>Cancel</button>
          </div>
        </div>
      )}

      <main className={`app-main ${view === 'graph' ? 'graph-view' : ''} ${chatOpen && view !== 'profile' ? 'chat-open' : ''}`}>
        <ErrorBoundary>
          {view === 'matrix' && <SkillMatrix onUserSelect={handleUserSelect} />}
          {view === 'graph' && <SkillGraph onUserSelect={handleUserSelect} />}
          {view === 'profile' && (
            <>
              <button 
                className="back-btn"
                onClick={() => setView('matrix')}
              >
                ← Back to Matrix
              </button>
              <UserProfile 
                userId={selectedUserId} 
                isOwnProfile={currentUser?.id === selectedUserId}
                onSkillsUpdated={() => {}} 
              />
            </>
          )}
        </ErrorBoundary>
      </main>
      <Toaster 
        position="bottom-right"
        toastOptions={{
          style: { background: '#333', color: '#fff' },
          success: { duration: 3000 },
          error: { duration: 5000 },
        }}
      />
      
      {/* Chat Panel - shown on matrix and graph views */}
      {view !== 'profile' && (
        <ChatPanel 
          isOpen={chatOpen} 
          onToggle={() => setChatOpen(!chatOpen)} 
        />
      )}
    </div>
  );
}

export default App;
