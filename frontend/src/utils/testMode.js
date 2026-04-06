export function isE2ETestMode() {
  return typeof window !== 'undefined' && window.__E2E_TEST__ === true;
}
