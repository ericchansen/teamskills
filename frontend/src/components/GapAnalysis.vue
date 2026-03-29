<template>
  <div class="gap-view">
    <div class="controls">
      <div class="control-group">
        <label class="control-label">Mode:</label>
        <select v-model="mode" class="mode-select">
          <option value="expert">Expert Count (L400)</option>
          <option value="average">Average Level</option>
          <option value="coverage">Coverage (≥L200)</option>
        </select>
      </div>

      <div class="control-group">
        <label class="control-label">Category:</label>
        <select v-model="selectedCategory" class="mode-select">
          <option value="__all__">All Categories</option>
          <option v-for="cat in categoryNames" :key="cat" :value="cat">
            {{ cat }}
          </option>
        </select>
      </div>

      <div class="control-group threshold-group">
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

    <v-chart
      class="bar-chart"
      :option="chartOption"
      autoresize
    />
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useSkillsData } from '../composables/useSkillsData';

const { people, skillCategories, categoryNames, getSkillLevel } = useSkillsData();

const modeDefaults = {
  expert:   { good: 2,   warn: 1,   step: 1  },
  coverage: { good: 50,  warn: 25,  step: 5  },
  average:  { good: 250, warn: 175, step: 25 },
};

const mode = ref('expert');
const selectedCategory = ref('__all__');
const goodThreshold = ref(modeDefaults.expert.good);
const warnThreshold = ref(modeDefaults.expert.warn);

watch(mode, (m) => {
  const d = modeDefaults[m];
  goodThreshold.value = d.good;
  warnThreshold.value = d.warn;
});

const modeStep = computed(() => modeDefaults[mode.value].step);

const filteredSkills = computed(() => {
  if (selectedCategory.value === '__all__') {
    return Object.values(skillCategories.value).flat();
  }
  return skillCategories.value[selectedCategory.value] || [];
});

function calcMetric(skill) {
  if (mode.value === 'average') {
    const total = people.value.reduce((sum, p) => sum + getSkillLevel(p, skill), 0);
    return Math.round(total / people.value.length);
  }
  if (mode.value === 'expert') {
    return people.value.filter((p) => getSkillLevel(p, skill) >= 400).length;
  }
  // coverage: percentage with ≥ L200
  const count = people.value.filter((p) => getSkillLevel(p, skill) >= 200).length;
  return Math.round((count / people.value.length) * 100);
}

function barColor(val) {
  if (val >= goodThreshold.value) return '#3ddc84';
  if (val >= warnThreshold.value) return '#f7c948';
  return '#f74f4f';
}

const chartOption = computed(() => {
  const skills = filteredSkills.value;
  const values = skills.map((s) => calcMetric(s));
  const colors = values.map((v) => barColor(v));

  const suffix =
    mode.value === 'average'
      ? ''
      : mode.value === 'expert'
        ? ' people'
        : '%';

  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter(params) {
        const p = params[0];
        return `<b>${p.name}</b><br/>${p.value}${suffix}`;
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
        data: [...values].reverse().map((v, i) => ({
          value: v,
          itemStyle: { color: [...colors].reverse()[i], borderRadius: [0, 4, 4, 0] },
        })),
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
</script>

<style scoped>
.gap-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  align-items: center;
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

.threshold-label {
  font-size: 0.78rem;
  font-weight: 600;
}

.threshold-label.good {
  color: var(--green);
}

.threshold-label.warn {
  color: var(--yellow);
}

.threshold-input {
  width: 64px;
  text-align: center;
  font-size: 0.85rem;
  padding: 4px 6px;
}

.bar-chart {
  width: 100%;
  height: calc(100vh - 200px);
  min-height: 600px;
}
</style>
