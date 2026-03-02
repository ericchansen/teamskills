import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
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
  const [showExperimental, setShowExperimental] = useState(false);
  
  // Real authentication via MSAL
  const { 
    isAuthenticated, 
    isAuthAvailable, 
    isLoading: authLoading,
    isAdmin,
    error: authError,
    loadingMessage,
    user: authUser, 
    login, 
    logout 
  } = useAuth();
  
  // Check if database is awake, wake it if needed
  const { dbStatus, wakeMessage, retryWake } = useDatabaseWake();

  // Current user is either authenticated user or demo user
  const currentUser = authUser || demoUser;

  // Demo mode only allowed in local development (not deployed)
  const isLocalDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  // Auto-login: on deployed instances with auth configured, redirect to Microsoft login automatically
  const autoLoginTriggered = useRef(false);
  const [autoLoginDone, setAutoLoginDone] = useState(() => {
    return sessionStorage.getItem('msal_auto_login') === 'true';
  });

  useEffect(() => {
    if (isAuthAvailable && !isAuthenticated && !authLoading && !isLocalDev && !autoLoginDone && !autoLoginTriggered.current) {
      autoLoginTriggered.current = true;
      sessionStorage.setItem('msal_auto_login', 'true');
      setAutoLoginDone(true);
      login();
    }
  }, [isAuthAvailable, isAuthenticated, authLoading, isLocalDev, autoLoginDone, login]);

  // Clear auto-login flag on successful authentication (so next session auto-redirects again)
  useEffect(() => {
    if (isAuthenticated) {
      sessionStorage.removeItem('msal_auto_login');
    }
  }, [isAuthenticated]);

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
    } else if (isLocalDev) {
      setShowDemoLogin(true);
    }
  };

  // Auth gate: block all content until user is authenticated
  // Order matters: loading → authenticated-but-loading → auth gate → main app

  // 1. Show loading while MSAL is initializing or processing redirect
  if (authLoading) {
    return (
      <div className="app">
        <div className="auth-gate">
          <h1>Team Skills Tracker</h1>
          <p>{loadingMessage || (isAuthenticated ? 'Loading your profile...' : 'Authenticating...')}</p>
        </div>
      </div>
    );
  }

  // 2. MSAL authenticated but backend profile not loaded (fetch failed or still resolving)
  if (isAuthenticated && !currentUser) {
    return (
      <div className="app">
        <div className="auth-gate">
          <h1>Team Skills Tracker</h1>
          {authError ? (
            <>
              <p className="auth-error-msg">Unable to load your profile. Please try again.</p>
              <button className="auth-retry-btn" onClick={() => window.location.reload()}>
                Retry
              </button>
              <button className="auth-retry-btn" onClick={logout} style={{ marginLeft: '0.5rem' }}>
                Sign out
              </button>
            </>
          ) : (
            <p>Loading your profile...</p>
          )}
        </div>
      </div>
    );
  }

  // 3. Not authenticated — show auth gate
  if (!currentUser) {
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

    // Auto-redirect pending — show loading instead of button
    if (isAuthAvailable && !isLocalDev && !autoLoginDone) {
      return (
        <div className="app">
          <div className="auth-gate">
            <h1>Team Skills Tracker</h1>
            <p>Redirecting to sign in...</p>
          </div>
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
          ) : isLocalDev ? (
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
          ) : (
            <div className="auth-error">
              <p>🔒 Authentication is not configured. Please contact your administrator.</p>
            </div>
          )}
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
            {showExperimental && (
              <>
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
              </>
            )}
            <button 
              className={`experimental-toggle ${showExperimental ? 'active' : ''}`}
              onClick={() => setShowExperimental(!showExperimental)}
              title={showExperimental ? 'Hide experimental views' : 'Show experimental views'}
            >
              <span className="btn-icon">🧪</span>
              Experimental
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
          ) : (isAuthAvailable || isLocalDev) ? (
            <button 
              className="login-btn"
              onClick={handleLogin}
              disabled={authLoading || (!isAuthAvailable && !isLocalDev)}
              title={isAuthAvailable ? "Sign in with Microsoft" : "Log in to edit your skills"}
            >
              <span className="btn-icon">{isAuthAvailable ? '🔑' : '🔐'}</span>
              {authLoading ? 'Loading...' : (isAuthAvailable ? 'Sign in' : 'Demo Login')}
            </button>
          ) : null}
        </nav>
      </header>

      {/* Demo Login Modal (local dev only, when auth not configured) */}
      {showDemoLogin && isLocalDev && (
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
