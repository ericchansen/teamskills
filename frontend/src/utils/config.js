/**
 * Runtime configuration helpers.
 * Single source of truth for values injected via /config.js (window.__CONFIG__).
 */

/** Backend API base URL (no trailing slash). */
export function getBaseUrl() {
  return (window.__CONFIG__?.VITE_API_URL || '').replace(/\/+$/, '');
}
