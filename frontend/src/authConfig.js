/**
 * Microsoft Entra ID / MSAL Configuration
 * 
 * Configuration is loaded from environment variables (VITE_*) or
 * fetched from the backend /api/auth/config endpoint.
 */

import { PublicClientApplication, LogLevel } from '@azure/msal-browser';

// Default configuration (can be overridden by backend config)
const clientId = import.meta.env.VITE_AZURE_AD_CLIENT_ID || '';
const redirectUri = import.meta.env.VITE_REDIRECT_URI || window.location.origin;

/**
 * MSAL configuration object
 */
export const msalConfig = {
  auth: {
    clientId,
    authority: 'https://login.microsoftonline.com/organizations',
    redirectUri,
    postLogoutRedirectUri: redirectUri,
    navigateToLoginRequestUrl: true
  },
  cache: {
    cacheLocation: 'sessionStorage', // More secure than localStorage
    storeAuthStateInCookie: false
  },
  system: {
    loggerOptions: {
      loggerCallback: (level, message, containsPii) => {
        if (containsPii) return;
        switch (level) {
          case LogLevel.Error:
            console.error('[MSAL]', message);
            break;
          case LogLevel.Warning:
            console.warn('[MSAL]', message);
            break;
          case LogLevel.Info:
            // Suppress info logs in production
            if (import.meta.env.DEV) {
              console.info('[MSAL]', message);
            }
            break;
          default:
            break;
        }
      },
      piiLoggingEnabled: false
    }
  }
};

/**
 * Scopes for API access
 */
export const loginRequest = {
  scopes: clientId ? [`api://${clientId}/access_as_user`] : [],
  redirectUri: `${window.location.origin}/redirect.html`
};

/**
 * Scopes for Microsoft Graph (optional, for user photos etc)
 */
export const graphScopes = {
  scopes: ['User.Read']
};

/**
 * Create MSAL instance
 */
export const msalInstance = new PublicClientApplication(msalConfig);

/**
 * Initialize MSAL (must be called before use)
 */
export async function initializeMsal() {
  await msalInstance.initialize();
  
  // Handle redirect response (if returning from login)
  try {
    const response = await msalInstance.handleRedirectPromise();
    if (response) {
      console.log('[MSAL] Login successful via redirect');
    }
  } catch (error) {
    console.error('[MSAL] Error handling redirect:', error);
  }
}

/**
 * Check if authentication is configured
 */
export function isAuthConfigured() {
  return Boolean(clientId);
}
