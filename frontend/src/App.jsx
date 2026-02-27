import React, { useState, useEffect, lazy, Suspense } from 'react';
import { Toaster } from 'react-hot-toast';
import SkillMatrix from './components/SkillMatrix';
const SkillGraph = lazy(() => import('./components/SkillGraph'));
const RadarChart = lazy(() => import('./components/RadarChart'));
const CoverageDashboard = lazy(() => import('./components/CoverageDashboard'));
const TrendsChart = lazy(() => import('./components/TrendsChart'));
const GapAnalysis = lazy(() => import('./components/GapAnalysis'));
import UserProfile from './components/UserProfile';
import ErrorBoundary from './components/ErrorBoundary';
import ChatPanel from './components/ChatPanel';
import DatabaseWakeOverlay from './components/DatabaseWakeOverlay';
import useDatabaseWake from './hooks/useDatabaseWake';
import useAuth from './hooks/useAuth';
import apiFetch from './api';
import './App.css';

function App() {
  const [view, setView] = useState('matrix');
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [showDemoLogin, setShowDemoLogin] = useState(false);
  const [demoUser, setDemoUser] = useState(null); // Fallback demo login
  const [users, setUsers] = useState([]);
  const [chatOpen, setChatOpen] = useState(false);
  
  // Real authentication via MSAL
  const { 
    isAuthenticated, 
    isAuthAvailable, 
    isLoading: authLoading,
    isAdmin,
    user: authUser, 
    login, 
    logout 
  } = useAuth();
  
  // Check if database is awake, wake it if needed
  const { dbStatus, wakeMessage, retryWake } = useDatabaseWake();

  // Current user is either authenticated user or demo user
  const currentUser = authUser || demoUser;

  // Fetch users for demo login dropdown (only when DB is ready AND user is authenticated or auth not available)
  useEffect(() => {
    if (dbStatus !== 'ready') return;
    // Only fetch when authenticated or in demo mode without a demo user yet
    if (isAuthAvailable && !isAuthenticated) return;
    
    apiFetch('/api/users')
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch users');
        return res.json();
      })
      .then(data => { if (Array.isArray(data)) setUsers(data); })
      .catch(err => console.error('Failed to fetch users:', err));
  }, [dbStatus, isAuthenticated, isAuthAvailable]);

  const handleUserSelect = (userId) => {
    setSelectedUserId(userId);
    setView('profile');
  };

  // Demo login (fallback when auth not configured)
  const handleDemoLogin = (userId) => {
    setDemoUser(users.find(u => u.id === parseInt(userId)));
    setSelectedUserId(parseInt(userId));
    setShowDemoLogin(false);
    setView('profile');
  };

  const handleLogout = async () => {
    if (isAuthenticated) {
      await logout();
    }
    setDemoUser(null);
  };

  const handleLogin = () => {
    if (isAuthAvailable) {
      login();
    } else {
      setShowDemoLogin(true);
    }
  };

  // Auth gate: block all content until user is authenticated
  // In MSAL mode: show "Sign in with Microsoft" 
  // In demo mode: auto-show the demo login picker
  if (!currentUser && !authLoading) {
    // Still waiting for DB to be ready — show wake overlay only
    if (dbStatus !== 'ready') {
      return (
        <div className="app">
          <DatabaseWakeOverlay 
            status={dbStatus} 
            message={wakeMessage} 
            onRetry={retryWake} 
          />
        </div>
      );
    }

    return (
      <div className="app">
        <div className="auth-gate">
          <h1>Team Skills Tracker</h1>
          <p>Sign in to view and manage team skills.</p>
          {isAuthAvailable ? (
            <button className="login-btn auth-gate-btn" onClick={login}>
              <span className="btn-icon">🔑</span>
              Sign in with Microsoft
            </button>
          ) : (
            <div className="demo-login-inline">
              <p className="login-disclaimer">⚠️ Authentication is not configured. Select a user to continue in demo mode.</p>
              <select 
                onChange={(e) => {
                  if (e.target.value) {
                    const userId = parseInt(e.target.value);
                    setDemoUser(users.find(u => u.id === userId));
                  }
                }}
                defaultValue=""
              >
                <option value="" disabled>Select your name...</option>
                {users.map(user => (
                  <option key={user.id} value={user.id}>{user.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Show loading spinner while auth is initializing
  if (authLoading) {
    return (
      <div className="app">
        <div className="auth-gate">
          <h1>Team Skills Tracker</h1>
          <p>Authenticating...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      {/* Database wake overlay - shown when DB is starting up */}
      <DatabaseWakeOverlay 
        status={dbStatus} 
        message={wakeMessage} 
        onRetry={retryWake} 
      />
      
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
            <button 
              className={view === 'radar' ? 'active' : ''} 
              onClick={() => setView('radar')}
              title="Radar chart comparing skill profiles"
            >
              <span className="btn-icon">🎯</span>
              Radar
            </button>
            <button 
              className={view === 'coverage' ? 'active' : ''} 
              onClick={() => setView('coverage')}
              title="Skill coverage and bus factor dashboard"
            >
              <span className="btn-icon">📈</span>
              Coverage
            </button>
            <button 
              className={view === 'trends' ? 'active' : ''} 
              onClick={() => setView('trends')}
              title="Proficiency trends over time"
            >
              <span className="btn-icon">📉</span>
              Trends
            </button>
            <button 
              className={view === 'gaps' ? 'active' : ''} 
              onClick={() => setView('gaps')}
              title="Skill gap analysis vs targets"
            >
              <span className="btn-icon">🔍</span>
              Gaps
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
              onClick={handleLogin}
              disabled={authLoading}
              title={isAuthAvailable ? "Sign in with Microsoft" : "Log in to edit your skills"}
            >
              <span className="btn-icon">{isAuthAvailable ? '🔑' : '🔐'}</span>
              {authLoading ? 'Loading...' : (isAuthAvailable ? 'Sign in' : 'Demo Login')}
            </button>
          )}
        </nav>
      </header>

      {/* Demo Login Modal (fallback when auth not configured) */}
      {showDemoLogin && (
        <div className="login-modal-overlay" onClick={() => setShowDemoLogin(false)}>
          <div className="login-modal" onClick={e => e.stopPropagation()}>
            <h2>Demo Login</h2>
            <p className="login-disclaimer">⚠️ Real authentication is not configured. Pick a name to simulate being logged in.</p>
            <select 
              onChange={(e) => e.target.value && handleDemoLogin(e.target.value)}
              defaultValue=""
            >
              <option value="" disabled>Select your name...</option>
              {users.map(user => (
                <option key={user.id} value={user.id}>{user.name}</option>
              ))}
            </select>
            <button className="cancel-btn" onClick={() => setShowDemoLogin(false)}>Cancel</button>
          </div>
        </div>
      )}

      <main className={`app-main ${(view === 'graph' || view === 'radar' || view === 'coverage' || view === 'trends' || view === 'gaps') ? 'graph-view' : ''} ${chatOpen && view !== 'profile' ? 'chat-open' : ''}`}>
        <ErrorBoundary>
          {view === 'matrix' && <SkillMatrix onUserSelect={handleUserSelect} isAdmin={isAdmin} isAuthenticated={!!currentUser} />}
          <Suspense fallback={<div style={{ color: '#888', textAlign: 'center', padding: '3rem' }}>Loading visualization...</div>}>
            {view === 'graph' && <SkillGraph onUserSelect={handleUserSelect} />}
            {view === 'radar' && <RadarChart onUserSelect={handleUserSelect} />}
            {view === 'coverage' && <CoverageDashboard />}
            {view === 'trends' && <TrendsChart />}
            {view === 'gaps' && <GapAnalysis />}
          </Suspense>
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
