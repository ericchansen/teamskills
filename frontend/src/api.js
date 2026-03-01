// API utility for making requests to the backend
import { InteractionRequiredAuthError } from '@azure/msal-browser';
import { msalInstance, loginRequest } from './authConfig';
import { getConfig } from './config';

const API_BASE_URL = getConfig('VITE_API_URL');

/**
 * Get access token for API calls.
 * Falls back to interactive login if the refresh token is expired.
 * Returns null only if no account is signed in.
 */
async function getAccessToken() {
  const accounts = msalInstance.getAllAccounts();
  if (accounts.length === 0) {
    return null;
  }

  try {
    const response = await msalInstance.acquireTokenSilent({
      ...loginRequest,
      account: accounts[0]
    });
    return response.accessToken;
  } catch (error) {
    if (error instanceof InteractionRequiredAuthError) {
      // Refresh token expired or consent required — redirect to login
      await msalInstance.acquireTokenRedirect(loginRequest);
      // acquireTokenRedirect navigates away; this line is never reached
      return null;
    }
    console.warn('[API] Could not get access token:', error.message);
    return null;
  }
}

/**
 * Fetch wrapper that adds auth headers when available
 */
export const apiFetch = async (endpoint, options = {}) => {
  const url = `${API_BASE_URL}${endpoint}`;
  
  // Get access token if authenticated
  const token = await getAccessToken();
  
  // Merge headers
  const headers = {
    ...options.headers
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers
  });
  
  return response;
};

export default apiFetch;
