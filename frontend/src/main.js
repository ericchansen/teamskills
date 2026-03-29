import { createApp } from 'vue';
import VChart from 'vue-echarts';
import { use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { HeatmapChart, GraphChart, BarChart } from 'echarts/charts';
import {
  TooltipComponent,
  GridComponent,
  VisualMapComponent,
  LegendComponent,
  DataZoomComponent,
} from 'echarts/components';
import App from './App.vue';
import './style.css';

use([
  CanvasRenderer,
  HeatmapChart,
  GraphChart,
  BarChart,
  TooltipComponent,
  GridComponent,
  VisualMapComponent,
  LegendComponent,
  DataZoomComponent,
]);

const app = createApp(App);
app.component('v-chart', VChart);
app.mount('#app');
