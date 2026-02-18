import React from 'react'
import ReactDOM from 'react-dom/client'
import { MsalProvider } from '@azure/msal-react'
import { msalInstance, initializeMsal } from './authConfig'
import App from './App'
import './index.css'

// Initialize MSAL before rendering
initializeMsal().then(() => {
  // If this window is an MSAL popup/redirect, don't render the app.
  // MSAL will handle communication back to the opener window and close this popup.
  if (window.opener && window.opener !== window) {
    return; // Let MSAL close the popup
  }

  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <MsalProvider instance={msalInstance}>
        <App />
      </MsalProvider>
    </React.StrictMode>,
  )
})
