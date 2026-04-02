import { escapeHtml } from '../utils/escapeHtml';

export { escapeHtml };

/**
 * Base ECharts option shared across all chart views.
 * Spread into view-specific chartOption computeds; view props override.
 */
export function baseChartOption() {
  return {
    backgroundColor: 'transparent',
  };
}

/**
 * Common chart container sizing.
 * Override individual properties as needed (e.g. minHeight for taller charts).
 */
export const chartContainerStyle = {
  width: '100%',
  height: 'calc(100vh - 200px)',
  minHeight: '500px',
};
