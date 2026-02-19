// API utility for making requests to the backend
import { msalInstance, loginRequest } from './authConfig';
import { getConfig } from './config';

const API_BASE_URL = getConfig('VITE_API_URL');

/**
 * Get access token for API calls
 * Returns null if not authenticated or auth not configured
 */
async function getAccessToken() {
  try {
    const accounts = msalInstance.getAllAccounts();
    if (accounts.length === 0) {
      return null;
    }

    const response = await msalInstance.acquireTokenSilent({
      ...loginRequest,
      account: accounts[0]
    });

    return response.accessToken;
  } catch (error) {
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
