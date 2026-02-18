/**
 * useAuth hook
 * 
 * Provides authentication state and actions using MSAL
 */

import { useState, useEffect, useCallback } from 'react';
import { useMsal, useAccount } from '@azure/msal-react';
import { InteractionStatus } from '@azure/msal-browser';
import { loginRequest, isAuthConfigured } from '../authConfig';
import apiFetch from '../api';

export function useAuth() {
  const { instance, accounts, inProgress } = useMsal();
  const account = useAccount(accounts[0] || {});
  const [backendUser, setBackendUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const isAuthenticated = accounts.length > 0;
  const isAuthAvailable = isAuthConfigured();
  const isInteracting = inProgress !== InteractionStatus.None;

  // Fetch backend user profile when authenticated
  useEffect(() => {
    async function fetchUser() {
      if (!isAuthenticated) {
        setBackendUser(null);
        setLoading(false);
        return;
      }

      try {
        const response = await apiFetch('/api/auth/me');
        if (response.ok) {
          const user = await response.json();
          setBackendUser(user);
        } else if (response.status === 401) {
          // Token expired or invalid
          setBackendUser(null);
        } else {
          throw new Error('Failed to fetch user profile');
        }
      } catch (err) {
        console.error('[useAuth] Error fetching user:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    if (!isInteracting) {
      fetchUser();
    }
  }, [isAuthenticated, isInteracting]);

  // Login with popup
  const login = useCallback(async () => {
    try {
      setError(null);
      await instance.loginPopup(loginRequest);
    } catch (err) {
      console.error('[useAuth] Login error:', err);
      setError(err.message);
    }
  }, [instance]);

  // Login with redirect (alternative)
  const loginRedirect = useCallback(async () => {
    try {
      setError(null);
      await instance.loginRedirect(loginRequest);
    } catch (err) {
      console.error('[useAuth] Login redirect error:', err);
      setError(err.message);
    }
  }, [instance]);

  // Logout
  const logout = useCallback(async () => {
    try {
      setBackendUser(null);
      await instance.logoutPopup({
        postLogoutRedirectUri: window.location.origin
      });
    } catch (err) {
      console.error('[useAuth] Logout error:', err);
      setError(err.message);
    }
  }, [instance]);

  return {
    // State
    isAuthenticated,
    isAuthAvailable,
    isLoading: loading || isInteracting,
    error,
    
    // User info
    user: backendUser,
    account, // MSAL account (contains claims)
    
    // Actions
    login,
    loginRedirect,
    logout
  };
}

export default useAuth;
