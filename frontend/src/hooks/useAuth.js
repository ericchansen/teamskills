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
  const [loadingMessage, setLoadingMessage] = useState('Loading your profile...');

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

      const abortController = new AbortController();
      const TIMEOUT_MS = 60000; // 60 seconds - must be >= Azure Flex Server wake time (45-60s)
      
      // Progressive loading messages
      const messageTimers = [
        setTimeout(() => setLoadingMessage('Still connecting to the database, please wait...'), 10000),
        setTimeout(() => setLoadingMessage('The database is waking up, this may take a moment...'), 30000)
      ];

      const timeoutId = setTimeout(() => {
        abortController.abort();
        messageTimers.forEach(clearTimeout);
      }, TIMEOUT_MS);

      try {
        const response = await apiFetch('/api/auth/me', {
          signal: abortController.signal
        });
        
        clearTimeout(timeoutId);
        messageTimers.forEach(clearTimeout);
        
        if (response.ok) {
          const user = await response.json();
          setBackendUser(user);
        } else if (response.status === 401) {
          // Token expired or invalid — set error so UI can show retry
          setBackendUser(null);
          setError('Session expired or token rejected. Please sign in again.');
        } else {
          throw new Error('Failed to fetch user profile');
        }
      } catch (err) {
        clearTimeout(timeoutId);
        messageTimers.forEach(clearTimeout);
        
        console.error('[useAuth] Error fetching user:', err);
        
        if (err.name === 'AbortError') {
          setError('Connection timeout. The server is taking too long to respond. Please try again.');
        } else {
          setError(err.message);
        }
      } finally {
        setLoading(false);
        setLoadingMessage('Loading your profile...');
      }
    }

    if (!isInteracting) {
      fetchUser();
    }
  }, [isAuthenticated, isInteracting]);

  // Login with redirect (full page redirect to Microsoft login)
  const login = useCallback(async () => {
    try {
      setError(null);
      await instance.loginRedirect(loginRequest);
    } catch (err) {
      console.error('[useAuth] Login error:', err);
      setError(err.message);
    }
  }, [instance]);

  // Logout
  const logout = useCallback(async () => {
    try {
      setBackendUser(null);
      await instance.logoutRedirect({
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
    isAdmin: backendUser?.is_admin || false,
    error,
    loadingMessage,
    
    // User info
    user: backendUser,
    account, // MSAL account (contains claims)
    
    // Actions
    login,
    logout
  };
}

export default useAuth;
