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
 * Fetch wrapper that adds auth headers and retries on transient errors.
 * Retries up to 3 times with exponential backoff on 503 or network failures.
 */
export const apiFetch = async (endpoint, options = {}) => {
  const url = `${API_BASE_URL}${endpoint}`;
  const maxRetries = options._noRetry ? 0 : 3;

  // Get access token if authenticated
  const token = await getAccessToken();

  // Merge headers
  const headers = { ...options.headers };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const fetchOptions = { ...options, headers };
  delete fetchOptions._noRetry;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, fetchOptions);

      // Retry on 503 (DB unavailable) — don't retry other status codes
      if (response.status === 503 && attempt < maxRetries) {
        const delayMs = 1000 * 2 ** attempt; // 1s, 2s, 4s
        console.warn(
          `[API] 503 on ${endpoint}, retrying in ${delayMs}ms (${attempt + 1}/${maxRetries})`
        );
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }

      return response;
    } catch (err) {
      // AbortError — user/controller cancelled; rethrow immediately
      if (err.name === 'AbortError') {
        throw err;
      }
      // Network error (fetch failed entirely) — retry
      if (attempt < maxRetries) {
        const delayMs = 1000 * 2 ** attempt;
        console.warn(
          `[API] Network error on ${endpoint}, retrying in ${delayMs}ms (${attempt + 1}/${maxRetries}): ${err.message}`
        );
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      throw err;
    }
  }
};

export default apiFetch;
