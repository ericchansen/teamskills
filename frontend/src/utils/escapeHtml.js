/**
 * HTML-escape a string to prevent XSS in ECharts tooltip HTML formatters.
 */
const ESC_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/[&<>"']/g, (ch) => ESC_MAP[ch]);
}
