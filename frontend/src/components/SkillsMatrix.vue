<template>
  <div class="matrix-view">
    <div class="controls">
      <span class="control-label">Categories:</span>
      <button
        v-for="cat in categoryNames"
        :key="cat"
        :class="['cat-btn', { collapsed: collapsedCategories.has(cat) }]"
        @click="toggleCategory(cat)"
      >
        <span class="cat-arrow">{{ collapsedCategories.has(cat) ? '▸' : '▾' }}</span>
        {{ cat }}
        <span class="cat-count">({{ skillCategories[cat].length }})</span>
      </button>
    </div>

    <v-chart
      class="heatmap-chart"
      :option="chartOption"
      autoresize
    />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useSkillsData } from '../composables/useSkillsData';
import { escapeHtml } from '../utils/escapeHtml';

const { people, skillCategories, categoryNames, allSkills, levels, getSkillLevel } = useSkillsData();

const collapsedCategories = ref(new Set());

function toggleCategory(cat) {
  const next = new Set(collapsedCategories.value);
  if (next.has(cat)) {
    next.delete(cat);
  } else {
    next.add(cat);
  }
  collapsedCategories.value = next;
}

const visibleSkills = computed(() => {
  const result = [];
  for (const cat of categoryNames.value) {
    if (!collapsedCategories.value.has(cat)) {
      result.push(...(skillCategories.value[cat] || []));
    }
  }
  return result;
});

const personNames = computed(() => people.value.map((p) => p.name));

const chartOption = computed(() => {
  const skills = visibleSkills.value;
  const names = personNames.value;

  const data = [];
  for (let yi = 0; yi < names.length; yi++) {
    for (let xi = 0; xi < skills.length; xi++) {
      const val = getSkillLevel(people.value[yi], skills[xi]);
      data.push([xi, yi, val]);
    }
  }

  return {
    backgroundColor: 'transparent',
    tooltip: {
      formatter(params) {
        const [xi, yi, val] = params.data;
        const person = escapeHtml(names[yi]);
        const skill = escapeHtml(skills[xi]);
        const label = levels[val] || 'None';
        return `<b>${person}</b><br/>${skill}<br/>Level: <b>${val} – ${label}</b>`;
      },
    },
    grid: {
      top: 10,
      bottom: 80,
      left: 140,
      right: 180,
    },
    xAxis: {
      type: 'category',
      data: skills,
      axisLabel: {
        rotate: 55,
        fontSize: 10,
        color: '#9ca0b0',
        interval: 0,
      },
      splitArea: { show: false },
      axisLine: { lineStyle: { color: '#2a2e3e' } },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'category',
      data: names,
      axisLabel: {
        fontSize: 12,
        color: '#e4e6ed',
      },
      splitArea: { show: false },
      axisLine: { lineStyle: { color: '#2a2e3e' } },
      axisTick: { show: false },
    },
    visualMap: {
      min: 0,
      max: 400,
      calculable: true,
      orient: 'vertical',
      right: 10,
      top: 'center',
      itemHeight: 160,
      itemWidth: 16,
      inRange: {
        color: ['#1a1a2e', '#2a2e3e', '#1e3a5f', '#2563a8', '#4f8ff7'],
      },
      text: ['400 · Expert', '0 · None'],
      textStyle: { color: '#e4e6ed', fontSize: 11 },
      textGap: 12,
    },
    series: [
      {
        type: 'heatmap',
        data,
        label: { show: false },
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowColor: 'rgba(0,0,0,0.5)',
          },
        },
        itemStyle: {
          borderColor: '#0f1117',
          borderWidth: 1,
          borderRadius: 2,
        },
      },
    ],
  };
});
</script>

<style scoped>
.matrix-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.control-label {
  font-size: 0.8rem;
  color: var(--text-secondary);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-right: 4px;
}

.cat-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 12px;
  font-size: 0.78rem;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--bg-card);
  color: var(--text-primary);
  transition: all 0.2s;
}

.cat-btn:hover {
  border-color: var(--accent);
}

.cat-btn.collapsed {
  opacity: 0.5;
  background: transparent;
}

.cat-arrow {
  font-size: 0.7rem;
  color: var(--text-secondary);
}

.cat-count {
  color: var(--text-secondary);
  font-size: 0.7rem;
}

.heatmap-chart {
  width: 100%;
  height: calc(100vh - 200px);
  min-height: 500px;
}
</style>
