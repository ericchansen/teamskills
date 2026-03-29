<template>
  <div class="graph-view">
    <div class="controls">
      <label class="control-label">Min Level Threshold:</label>
      <input
        type="range"
        min="100"
        max="400"
        step="100"
        v-model.number="threshold"
        class="slider"
      />
      <span class="threshold-badge">
        ≥ {{ threshold }} ({{ levels[threshold] }})
      </span>
      <span class="edge-count">{{ edgeCount }} connections</span>
    </div>

    <v-chart
      class="graph-chart"
      :option="chartOption"
      autoresize
    />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useSkillsData } from '../composables/useSkillsData';

const { people, allSkills, levels, getSkillLevel, skillToCategory } = useSkillsData();

const threshold = ref(400);

const edgeCount = computed(() => {
  let count = 0;
  for (const person of people.value) {
    for (const skill of allSkills.value) {
      if (getSkillLevel(person, skill) >= threshold.value) count++;
    }
  }
  return count;
});

const chartOption = computed(() => {
  const nodes = [];
  const links = [];

  // People nodes
  for (const person of people.value) {
    nodes.push({
      id: `p:${person.name}`,
      name: person.name,
      symbolSize: 40,
      category: 0,
      itemStyle: { color: '#4f8ff7' },
      label: { show: true, color: '#e4e6ed', fontSize: 11, fontWeight: 600 },
    });
  }

  // Collect which skills are actually connected
  const usedSkills = new Set();
  for (const person of people.value) {
    for (const skill of allSkills.value) {
      const lvl = getSkillLevel(person, skill);
      if (lvl >= threshold.value) {
        usedSkills.add(skill);
        links.push({
          source: `p:${person.name}`,
          target: `s:${skill}`,
          value: lvl,
          lineStyle: {
            width: lvl / 200,
            opacity: 0.4,
            color: '#4f8ff7',
          },
        });
      }
    }
  }

  // Skill nodes (only those with connections)
  for (const skill of usedSkills) {
    nodes.push({
      id: `s:${skill}`,
      name: skill,
      symbolSize: 18,
      category: 1,
      itemStyle: { color: '#3ddc84' },
      label: { show: true, color: '#9ca0b0', fontSize: 9 },
    });
  }

  return {
    backgroundColor: 'transparent',
    tooltip: {
      formatter(params) {
        if (params.dataType === 'node') {
          const prefix = params.data.id.startsWith('p:') ? '👤 ' : '🛠 ';
          const cat = params.data.id.startsWith('s:')
            ? `<br/>Category: ${skillToCategory[params.data.name] || '—'}`
            : '';
          return `${prefix}<b>${params.data.name}</b>${cat}`;
        }
        if (params.dataType === 'edge') {
          return `${params.data.source.replace('p:', '')} → ${params.data.target.replace('s:', '')}<br/>Level: ${params.data.value} – ${levels[params.data.value]}`;
        }
        return '';
      },
    },
    legend: {
      data: ['People', 'Skills'],
      textStyle: { color: '#9ca0b0' },
      top: 0,
      right: 10,
    },
    series: [
      {
        type: 'graph',
        layout: 'force',
        roam: true,
        draggable: true,
        categories: [
          { name: 'People' },
          { name: 'Skills' },
        ],
        nodes,
        links,
        force: {
          repulsion: 300,
          gravity: 0.1,
          edgeLength: [80, 200],
          friction: 0.6,
        },
        emphasis: {
          focus: 'adjacency',
          lineStyle: { width: 4 },
        },
        label: { position: 'right' },
      },
    ],
  };
});
</script>

<style scoped>
.graph-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

.control-label {
  font-size: 0.8rem;
  color: var(--text-secondary);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.slider {
  width: 200px;
  accent-color: var(--accent);
}

.threshold-badge {
  background: var(--bg-card);
  border: 1px solid var(--border);
  padding: 4px 14px;
  border-radius: 16px;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--accent);
}

.edge-count {
  font-size: 0.78rem;
  color: var(--text-secondary);
  margin-left: auto;
}

.graph-chart {
  width: 100%;
  height: calc(100vh - 200px);
  min-height: 500px;
}
</style>
