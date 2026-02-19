/**
 * Runtime configuration reader.
 * Reads from window.__CONFIG__ (injected at container startup) with
 * fallback to import.meta.env (Vite build-time env vars) for local dev.
 */
export function getConfig(key) {
  // Runtime config takes priority (set by Docker entrypoint)
  const runtime = window.__CONFIG__?.[key];
  if (runtime) return runtime;

  // Fallback to Vite build-time env vars (local dev)
  return import.meta.env[key] || '';
}
