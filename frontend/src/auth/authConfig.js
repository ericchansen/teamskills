/**
 * MSAL auth configuration.
 * Values are fetched at runtime from /api/auth/config so nothing
 * is hard-coded in the frontend bundle.
 */

let _cachedConfig = null;

/**
 * Fetch auth configuration from the backend.
 * Returns { enabled, clientId, tenantId, authority, redirectUri, scopes }
 * or { enabled: false } when auth is not configured.
 */
export async function fetchAuthConfig() {
  if (_cachedConfig) return _cachedConfig;

  try {
    const res = await fetch('/api/auth/config');
    if (!res.ok) throw new Error(`Auth config fetch failed: ${res.status}`);
    _cachedConfig = await res.json();
  } catch {
    _cachedConfig = { enabled: false };
  }

  return _cachedConfig;
}

/**
 * Build MSAL configuration object from backend config.
 */
export function buildMsalConfig(cfg) {
  return {
    auth: {
      clientId: cfg.clientId,
      authority: cfg.authority,
      redirectUri: cfg.redirectUri || window.location.origin,
      navigateToLoginRequestUrl: true,
    },
    cache: {
      cacheLocation: 'localStorage',
      storeAuthStateInCookie: false,
    },
  };
}

/**
 * Login request scopes.
 */
export function buildLoginRequest(cfg) {
  return {
    scopes: cfg.scopes || [`api://${cfg.clientId}/access_as_user`],
  };
}
