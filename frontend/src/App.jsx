import React, { useState, useEffect } from 'react';
import SkillMatrix from './components/SkillMatrix';
import SkillGraph from './components/SkillGraph';
import UserProfile from './components/UserProfile';
import './App.css';

function App() {
  const [view, setView] = useState('matrix');
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [currentUser, setCurrentUser] = useState(null); // Logged in user
  const [showLogin, setShowLogin] = useState(false);
  const [users, setUsers] = useState([]);

  // Fetch users for login dropdown
  useEffect(() => {
    fetch('/api/users')
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
            <p>Select your name to log in and edit your skills:</p>
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

      <main className={`app-main ${view === 'graph' ? 'graph-view' : ''}`}>
        {view === 'matrix' && <SkillMatrix onUserSelect={handleUserSelect} />}
        {view === 'graph' && <SkillGraph onUserSelect={handleUserSelect} />}
        {view === 'profile' && (
          <UserProfile 
            userId={selectedUserId} 
            isOwnProfile={currentUser?.id === selectedUserId}
            onSkillsUpdated={() => {}} 
          />
        )}
      </main>
    </div>
  );
}

export default App;
