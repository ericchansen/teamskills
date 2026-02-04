// Overlay shown when database is waking up
import React from 'react';

const DatabaseWakeOverlay = ({ status, message, onRetry }) => {
  if (status === 'ready') return null;

  return (
    <div className="db-wake-overlay">
      <div className="db-wake-modal">
        {status === 'checking' && (
          <>
            <div className="spinner"></div>
            <h2>Connecting to database...</h2>
            <p>Please wait while we establish a connection.</p>
          </>
        )}
        
        {status === 'waking' && (
          <>
            <div className="spinner"></div>
            <h2>🌅 Waking up the database</h2>
            <p>{message}</p>
            <p className="subtext">The database was sleeping to save costs. It typically takes 3-5 minutes to start.</p>
            <div className="progress-bar">
              <div className="progress-bar-inner"></div>
            </div>
          </>
        )}
        
        {status === 'error' && (
          <>
            <h2>❌ Connection Error</h2>
            <p>{message}</p>
            <button onClick={onRetry} className="retry-btn">
              Try Again
            </button>
          </>
        )}
      </div>
      
      <style>{`
        .db-wake-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.8);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10000;
        }
        
        .db-wake-modal {
          background: #1a1a2e;
          border-radius: 12px;
          padding: 40px;
          text-align: center;
          max-width: 400px;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
        }
        
        .db-wake-modal h2 {
          color: #fff;
          margin: 20px 0 10px;
        }
        
        .db-wake-modal p {
          color: #aaa;
          margin: 10px 0;
        }
        
        .db-wake-modal .subtext {
          color: #666;
          font-size: 0.85em;
        }
        
        .spinner {
          width: 50px;
          height: 50px;
          border: 4px solid #333;
          border-top-color: #4CAF50;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin: 0 auto;
        }
        
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        
        .progress-bar {
          height: 4px;
          background: #333;
          border-radius: 2px;
          margin-top: 20px;
          overflow: hidden;
        }
        
        .progress-bar-inner {
          height: 100%;
          background: linear-gradient(90deg, #4CAF50, #8BC34A);
          animation: progress 3s ease-in-out infinite;
        }
        
        @keyframes progress {
          0% { width: 0; }
          50% { width: 70%; }
          100% { width: 100%; }
        }
        
        .retry-btn {
          background: #4CAF50;
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 1em;
          margin-top: 20px;
        }
        
        .retry-btn:hover {
          background: #45a049;
        }
      `}</style>
    </div>
  );
};

export default DatabaseWakeOverlay;
