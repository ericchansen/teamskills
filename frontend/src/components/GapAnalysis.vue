<template>
  <div class="gap-view">
    <div class="controls">
      <div class="control-group">
        <label for="mode-select" class="control-label">Mode:</label>
        <select id="mode-select" v-model="mode" class="mode-select">
          <option v-for="option in modeOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </div>

      <div v-if="showLevelSelector" class="control-group">
        <label for="level-select" class="control-label">{{ levelControlLabel }}</label>
        <select id="level-select" v-model.number="activeTargetLevel" class="mode-select">
          <option v-for="level in levelOptions" :key="level" :value="level">
            L{{ level }} · {{ levels[level] }}
          </option>
        </select>
      </div>

      <div class="control-group">
        <label for="category-select" class="control-label">Category:</label>
        <select id="category-select" v-model="selectedCategory" class="mode-select">
          <option value="__all__">All Categories</option>
          <option v-for="cat in categoryNames" :key="cat" :value="cat">
            {{ cat }}
          </option>
        </select>
      </div>

      <div v-if="showThresholdControls" class="control-group threshold-group">
        <label class="control-label">Thresholds:</label>
        <span class="threshold-label good">Good ≥</span>
        <input
          type="number"
          v-model.number="goodThreshold"
          class="threshold-input"
          :step="modeStep"
        />
        <span class="threshold-label warn">Warn ≥</span>
        <input
          type="number"
          v-model.number="warnThreshold"
          class="threshold-input"
          :step="modeStep"
        />
      </div>
    </div>

    <p class="mode-description">{{ modeDescription }}</p>

    <div
      v-if="showStackedLevelToggles"
      class="level-toggles"
      role="group"
      aria-label="Visible proficiency levels"
    >
      <label
        v-for="level in levelOptions"
        :key="level"
        class="level-toggle"
        :class="{
          active: isStackedLevelVisible(level),
          disabled: isStackedLevelLocked(level),
        }"
        :title="levels[level]"
      >
        <input
          type="checkbox"
          :checked="isStackedLevelVisible(level)"
          :disabled="isStackedLevelLocked(level)"
          :aria-label="`L${level}`"
          @change="toggleStackedLevel(level)"
        />
        <span class="level-toggle-swatch" :style="{ backgroundColor: levelColors[level] }"></span>
        <span class="level-toggle-text">L{{ level }}</span>
      </label>
    </div>

    <v-chart
      :style="{ ...chartContainerStyle, minHeight: '600px' }"
      :option="chartOption"
      autoresize
    />

    <pre
      v-if="showTestSummary"
      class="chart-test-summary"
      data-testid="gap-metric-summary"
      aria-hidden="true"
    >{{ metricSummary }}</pre>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useSkillsData } from '../composables/useSkillsData';
import { escapeHtml, baseChartOption, chartContainerStyle } from '../composables/useChartDefaults';
import { isE2ETestMode } from '../utils/testMode';

const { people, skillCategories, categoryNames, getSkillLevel, levels } = useSkillsData();
const showTestSummary = isE2ETestMode();
const levelOptions = Object.keys(levels).map(Number).sort((a, b) => a - b);
const scalarStatusColors = {
  good: '#61bd84',
  warn: '#c29b5c',
  below: '#c27575',
};
const levelColors = {
  100: '#2a2e3e',
  200: '#1e3a5f',
  300: '#2563a8',
  400: '#4f8ff7',
};

const modeDefaults = {
  expert: { good: 2, warn: 1, step: 1 },
  coverage: { good: 50, warn: 25, step: 5 },
  average: { good: 250, warn: 175, step: 25 },
};

const mode = ref('stacked');
const expertLevel = ref(300);
const coverageLevel = ref(200);
const visibleStackedLevels = ref([300, 400]);
const selectedCategory = ref('__all__');
const goodThreshold = ref(modeDefaults.expert.good);
const warnThreshold = ref(modeDefaults.expert.warn);

watch(mode, (m) => {
  const d = modeDefaults[m];
  if (!d) return;
  goodThreshold.value = d.good;
  warnThreshold.value = d.warn;
});

const modeOptions = computed(() => [
  { value: 'average', label: 'Average Level' },
  { value: 'coverage', label: 'Coverage' },
  { value: 'expert', label: 'Expert Count' },
  { value: 'stacked', label: 'Proficiency Breakdown' },
]);

const showLevelSelector = computed(() => mode.value === 'expert' || mode.value === 'coverage');
const showThresholdControls = computed(() => mode.value !== 'stacked');
const showStackedLevelToggles = computed(() => mode.value === 'stacked');

const activeTargetLevel = computed({
  get() {
    return mode.value === 'coverage' ? coverageLevel.value : expertLevel.value;
  },
  set(value) {
    const numericLevel = Number(value);
    if (mode.value === 'coverage') {
      coverageLevel.value = numericLevel;
      return;
    }
    expertLevel.value = numericLevel;
  },
});

const levelControlLabel = computed(() => (
  mode.value === 'coverage' ? 'Coverage level:' : 'Expert level:'
));

const modeDescription = computed(() => {
  if (mode.value === 'average') {
    return 'Average proficiency level across the team for each skill.';
  }
  if (mode.value === 'coverage') {
    return `Percentage of the team at or above L${coverageLevel.value} for each skill.`;
  }
  if (mode.value === 'stacked') {
    return 'Stacked counts by proficiency level. Toggle the levels you want included in the chart.';
  }
  return `Count of people at or above L${expertLevel.value} for each skill.`;
});

const modeStep = computed(() => modeDefaults[mode.value]?.step || 1);

const filteredSkills = computed(() => {
  if (selectedCategory.value === '__all__') {
    return Object.values(skillCategories.value).flat();
  }
  return skillCategories.value[selectedCategory.value] || [];
});

function countPeopleAtOrAbove(skill, targetLevel) {
  return people.value.filter((person) => getSkillLevel(person, skill) >= targetLevel).length;
}

function buildLevelBreakdown(skill) {
  return Object.fromEntries(
    levelOptions.map((level) => [
      `L${level}`,
      people.value.filter((person) => getSkillLevel(person, skill) === level).length,
    ])
  );
}

function isStackedLevelVisible(level) {
  return visibleStackedLevels.value.includes(level);
}

function isStackedLevelLocked(level) {
  return visibleStackedLevels.value.length === 1 && isStackedLevelVisible(level);
}

function toggleStackedLevel(level) {
  if (isStackedLevelVisible(level)) {
    if (isStackedLevelLocked(level)) return;
    visibleStackedLevels.value = visibleStackedLevels.value.filter((value) => value !== level);
    return;
  }
  visibleStackedLevels.value = [...visibleStackedLevels.value, level].sort((a, b) => a - b);
}

const chartMetrics = computed(() => {
  const skills = filteredSkills.value;
  if (mode.value === 'stacked') {
    const breakdowns = Object.fromEntries(
      skills.map((skillName) => [skillName, buildLevelBreakdown(skillName)])
    );
    const series = visibleStackedLevels.value.map((level) => ({
      key: `L${level}`,
      label: `L${level}`,
      color: levelColors[level],
      values: skills.map((skillName) => breakdowns[skillName][`L${level}`] || 0),
    }));

    return {
      skills,
      breakdowns,
      series,
    };
  }

  const values = skills.map((skillName) => calcMetric(skillName));
  const colors = values.map((value) => barColor(value));

  return {
    skills,
    values,
    colors,
  };
});

function calcMetric(skill) {
  if (people.value.length === 0) {
    return 0;
  }
  if (mode.value === 'average') {
    const total = people.value.reduce((sum, p) => sum + getSkillLevel(p, skill), 0);
    return Math.round(total / people.value.length);
  }
  if (mode.value === 'expert') {
    return countPeopleAtOrAbove(skill, expertLevel.value);
  }
  const count = countPeopleAtOrAbove(skill, coverageLevel.value);
  return Math.round((count / people.value.length) * 100);
}

function barColor(val) {
  if (val >= goodThreshold.value) return scalarStatusColors.good;
  if (val >= warnThreshold.value) return scalarStatusColors.warn;
  return scalarStatusColors.below;
}

const chartOption = computed(() => {
  if (mode.value === 'stacked') {
    const { skills, series } = chartMetrics.value;
    return {
      ...baseChartOption(),
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter(params) {
          const total = params.reduce((sum, entry) => sum + Number(entry.value || 0), 0);
          const detailLines = params
            .filter((entry) => Number(entry.value || 0) > 0)
            .map((entry) => `${escapeHtml(entry.seriesName)}: ${entry.value}`);

          if (detailLines.length === 0) {
            detailLines.push('No matching people');
          }

          detailLines.push(`<b>Total:</b> ${total} people`);
          return `<b>${escapeHtml(params[0]?.name || '')}</b><br/>${detailLines.join('<br/>')}`;
        },
      },
      grid: {
        top: 30,
        bottom: 30,
        left: 220,
        right: 40,
      },
      xAxis: {
        type: 'value',
        axisLabel: { color: '#9ca0b0', fontSize: 11 },
        splitLine: { lineStyle: { color: '#1e2130' } },
        axisLine: { lineStyle: { color: '#2a2e3e' } },
      },
      yAxis: {
        type: 'category',
        data: [...skills].reverse(),
        axisLabel: {
          color: '#e4e6ed',
          fontSize: 11,
          width: 190,
          overflow: 'truncate',
        },
        axisLine: { lineStyle: { color: '#2a2e3e' } },
        axisTick: { show: false },
      },
      series: series.map((seriesConfig) => ({
        name: seriesConfig.label,
        type: 'bar',
        stack: 'proficiency',
        emphasis: { focus: 'series' },
        data: [...seriesConfig.values].reverse().map((value) => ({
          value,
          itemStyle: { color: seriesConfig.color },
        })),
        barMaxWidth: 18,
        label: {
          show: true,
          position: 'insideRight',
          color: '#f8fafc',
          fontSize: 10,
          formatter: (entry) => (entry.value ? `${entry.value}` : ''),
        },
      })),
    };
  }

  const { skills, values, colors } = chartMetrics.value;

  const suffix =
    mode.value === 'average'
      ? ''
      : mode.value === 'expert'
        ? ' people'
        : '%';
  const tooltipValueLabel = (value) => {
    if (mode.value === 'average') {
      return `${value}`;
    }
    if (mode.value === 'expert') {
      return `${value} people ≥L${expertLevel.value}`;
    }
    return `${value}% at/above L${coverageLevel.value}`;
  };

  return {
    ...baseChartOption(),
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter(params) {
        const p = params[0];
        return `<b>${escapeHtml(p.name)}</b><br/>${tooltipValueLabel(p.value)}`;
      },
    },
    grid: {
      top: 30,
      bottom: 30,
      left: 220,
      right: 40,
    },
    xAxis: {
      type: 'value',
      axisLabel: { color: '#9ca0b0', fontSize: 11 },
      splitLine: { lineStyle: { color: '#1e2130' } },
      axisLine: { lineStyle: { color: '#2a2e3e' } },
    },
    yAxis: {
      type: 'category',
      data: [...skills].reverse(),
      axisLabel: {
        color: '#e4e6ed',
        fontSize: 11,
        width: 190,
        overflow: 'truncate',
      },
      axisLine: { lineStyle: { color: '#2a2e3e' } },
      axisTick: { show: false },
    },
    series: [
      {
        type: 'bar',
        data: (() => {
          const revValues = [...values].reverse();
          const revColors = [...colors].reverse();
          return revValues.map((v, i) => ({
            value: v,
            itemStyle: { color: revColors[i], borderRadius: [0, 4, 4, 0] },
          }));
        })(),
        barMaxWidth: 18,
        label: {
          show: true,
          position: 'right',
          color: '#9ca0b0',
          fontSize: 10,
          formatter: (p) => `${p.value}${suffix}`,
        },
      },
    ],
  };
});

const metricSummary = computed(() => {
  if (mode.value === 'stacked') {
    return JSON.stringify(
      Object.fromEntries(
        chartMetrics.value.skills.map((skillName, index) => [
          skillName,
          Object.fromEntries(
            chartMetrics.value.series.map((series) => [series.key, series.values[index]])
          ),
        ])
      )
    );
  }

  return JSON.stringify(
    Object.fromEntries(
      chartMetrics.value.skills.map((skillName, index) => [skillName, chartMetrics.value.values[index]])
    )
  );
});
</script>

<style scoped>
.gap-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
  position: relative;
}

.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  align-items: center;
}

.mode-description {
  margin: 0;
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.control-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.control-label {
  font-size: 0.8rem;
  color: var(--text-secondary);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.mode-select {
  padding: 6px 12px;
  font-size: 0.85rem;
}

.threshold-group {
  margin-left: auto;
}

.level-toggles {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.level-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border: 1px solid var(--border, #2a2a4a);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.02);
  color: var(--text-secondary, #a0a0b0);
  cursor: pointer;
  transition: border-color 0.15s ease, background-color 0.15s ease, color 0.15s ease;
}

.level-toggle.active {
  border-color: var(--text-primary, #e4e6ed);
  color: var(--text-primary, #e4e6ed);
  background: rgba(255, 255, 255, 0.05);
}

.level-toggle.disabled {
  opacity: 0.7;
}

.level-toggle input {
  margin: 0;
  accent-color: var(--accent, #4f8ff7);
}

.level-toggle-swatch {
  width: 10px;
  height: 10px;
  border-radius: 999px;
}

.level-toggle-text {
  font-size: 0.8rem;
  font-weight: 600;
}

.threshold-label {
  font-size: 0.78rem;
  font-weight: 600;
}

.threshold-label.good {
  color: #84cfa1;
}

.threshold-label.warn {
  color: #d6b175;
}

.threshold-input {
  width: 64px;
  text-align: center;
  font-size: 0.85rem;
  padding: 4px 6px;
}

.chart-test-summary {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}


</style>
