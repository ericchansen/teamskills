/**
 * Singleton auth composable — MSAL Browser integration.
 * Handles login, logout, token acquisition, and demo mode fallback.
 */
import { ref, computed, readonly } from 'vue';
import { PublicClientApplication, InteractionRequiredAuthError } from '@azure/msal-browser';
import { fetchAuthConfig, buildMsalConfig, buildLoginRequest } from '../auth/authConfig';
import { getBaseUrl } from '../utils/config';

// ── Singleton state ──────────────────────────────────
const user = ref(null);
const isLoading = ref(true);
const authEnabled = ref(false);
const error = ref(null);

let msalInstance = null;
let loginRequest = null;
let initialized = false;

// ── Public composable ────────────────────────────────
export function useAuth() {
  const isAuthenticated = computed(() => !!user.value);

  /**
   * Initialize auth — call once at app startup.
   * Fetches config from backend, sets up MSAL if enabled,
   * handles redirect callback, checks for existing session.
   */
  async function initialize() {
    if (initialized) return;
    initialized = true;
    isLoading.value = true;
    error.value = null;

    try {
      const cfg = await fetchAuthConfig();
      authEnabled.value = cfg.enabled;

      if (!cfg.enabled) {
        // Demo mode — try to get demo user from backend
        await loadDemoUser();
        return;
      }

      // Initialize MSAL
      msalInstance = new PublicClientApplication(buildMsalConfig(cfg));
      loginRequest = buildLoginRequest(cfg);
      await msalInstance.initialize();

      // Handle redirect callback (if returning from login redirect)
      const response = await msalInstance.handleRedirectPromise();
      if (response?.account) {
        msalInstance.setActiveAccount(response.account);
      }

      // Check for existing session
      const accounts = msalInstance.getAllAccounts();
      if (accounts.length > 0) {
        msalInstance.setActiveAccount(accounts[0]);
        await loadCurrentUser();
      }
    } catch (err) {
      console.error('Auth initialization failed:', err);
      error.value = err.message;
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * Interactive login via popup.
   */
  async function login() {
    if (!msalInstance || !authEnabled.value) return;
    error.value = null;

    try {
      const response = await msalInstance.loginPopup(loginRequest);
      msalInstance.setActiveAccount(response.account);
      await loadCurrentUser();
    } catch (err) {
      // User cancelled or popup blocked
      if (err.errorCode !== 'user_cancelled') {
        console.error('Login failed:', err);
        error.value = err.message;
      }
    }
  }

  /**
   * Logout — clears session.
   */
  async function logout() {
    if (!msalInstance) {
      user.value = null;
      return;
    }

    try {
      await msalInstance.logoutPopup({
        mainWindowRedirectUri: window.location.origin,
      });
    } catch {
      // Fallback: clear local state
    }

    user.value = null;
  }

  /**
   * Acquire an access token silently (or via popup if needed).
   * Returns the token string, or null if not authenticated.
   */
  async function getToken() {
    if (!msalInstance || !authEnabled.value) return null;

    const account = msalInstance.getActiveAccount();
    if (!account) return null;

    try {
      const response = await msalInstance.acquireTokenSilent({
        ...loginRequest,
        account,
      });
      return response.accessToken;
    } catch (err) {
      if (err instanceof InteractionRequiredAuthError) {
        try {
          const response = await msalInstance.acquireTokenPopup(loginRequest);
          return response.accessToken;
        } catch {
          return null;
        }
      }
      return null;
    }
  }

  /**
   * Load current user from /api/auth/me.
   */
  async function loadCurrentUser() {
    try {
      const token = await getToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${getBaseUrl()}/api/auth/me`, { headers });
      if (res.ok) {
        user.value = await res.json();
      }
    } catch (err) {
      console.error('Failed to load user:', err);
    }
  }

  /**
   * Demo mode — backend returns demo user without auth.
   */
  async function loadDemoUser() {
    try {
      const res = await fetch(`${getBaseUrl()}/api/auth/me`);
      if (res.ok) {
        user.value = await res.json();
      }
    } catch {
      // Backend not available — that's fine, run offline
    }
  }

  return {
    user: readonly(user),
    isAuthenticated,
    isLoading: readonly(isLoading),
    authEnabled: readonly(authEnabled),
    error: readonly(error),
    initialize,
    login,
    logout,
    getToken,
  };
}
