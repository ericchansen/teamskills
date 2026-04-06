<template>
  <div class="matrix-view">
    <div class="controls">
      <span class="control-label">Roles:</span>
      <button
        v-for="role in topLevelCategories"
        :key="role.id"
        :class="['cat-btn', { collapsed: collapsedNodes.has(role.id) }]"
        @click="toggleNode(role.id)"
      >
        <span class="cat-arrow">{{ collapsedNodes.has(role.id) ? '▸' : '▾' }}</span>
        {{ role.name }}
        <span class="cat-count">({{ countSkills(role) }})</span>
      </button>

      <template v-if="expandedDomains.length > 0">
        <span class="control-label domain-label">Domains:</span>
        <button
          v-for="domain in expandedDomains"
          :key="domain.id"
          :class="['cat-btn', 'domain-btn', { collapsed: collapsedNodes.has(domain.id) }]"
          @click="toggleNode(domain.id)"
        >
          <span class="cat-arrow">{{ collapsedNodes.has(domain.id) ? '▸' : '▾' }}</span>
          {{ domain.name }}
          <span class="cat-count">({{ countSkills(domain) }})</span>
        </button>
      </template>
    </div>

    <v-chart
      :style="chartContainerStyle"
      :option="chartOption"
      autoresize
    />

    <pre
      v-if="showTestSummary"
      class="chart-test-summary"
      data-testid="matrix-current-user-levels"
      aria-hidden="true"
    >{{ currentUserSkillLevelsSummary }}</pre>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useAuth } from '../composables/useAuth';
import { useSkillsData } from '../composables/useSkillsData';
import { escapeHtml, baseChartOption, chartContainerStyle } from '../composables/useChartDefaults';
import { isE2ETestMode } from '../utils/testMode';

const { user } = useAuth();
const {
  people,
  allSkills,
  categoryTree,
  skillAncestorIds,
  levels,
  getSkillLevel,
} = useSkillsData();

const showTestSummary = isE2ETestMode();
const collapsedNodes = ref(new Set());

function toggleNode(nodeId) {
  const next = new Set(collapsedNodes.value);
  if (next.has(nodeId)) {
    next.delete(nodeId);
  } else {
    next.add(nodeId);
  }
  collapsedNodes.value = next;
}

const topLevelCategories = computed(() => categoryTree.value || []);

// Domains whose parent role is expanded
const expandedDomains = computed(() => {
  const tree = categoryTree.value || [];
  const domains = [];
  for (const role of tree) {
    if (!collapsedNodes.value.has(role.id) && role.children) {
      domains.push(...role.children);
    }
  }
  return domains;
});

// Count skills under a category node using ancestor mapping
function countSkillsUnder(node) {
  if (!node) return 0;
  const ancestors = skillAncestorIds.value || {};
  let count = 0;
  for (const name of (allSkills.value || [])) {
    if ((ancestors[name] || []).includes(node.id)) count++;
  }
  return count;
}

function countSkills(node) {
  return countSkillsUnder(node);
}

// Filter visible skills based on collapsed nodes
const visibleSkills = computed(() => {
  const skills = allSkills.value || [];
  const collapsed = collapsedNodes.value;
  if (collapsed.size === 0) return skills;

  const ancestors = skillAncestorIds.value || {};
  return skills.filter((name) => {
    const chain = ancestors[name] || [];
    // Hide skill if any of its ancestor categories is collapsed
    return !chain.some((catId) => collapsed.has(catId));
  });
});

const personNames = computed(() => (people.value || []).map((p) => p.name));

const currentUserSkillLevelsSummary = computed(() => {
  const currentUserId = user.value?.id;
  if (!currentUserId) return '{}';

  const currentPerson = people.value.find((person) => person.id === currentUserId);
  if (!currentPerson) return '{}';

  return JSON.stringify(
    Object.fromEntries(
      visibleSkills.value.map((skillName) => [skillName, getSkillLevel(currentPerson, skillName)])
    )
  );
});

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
    ...baseChartOption(),
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
  position: relative;
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

.domain-label {
  margin-left: 12px;
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

.domain-btn {
  font-size: 0.72rem;
  padding: 3px 10px;
  border-style: dashed;
}

.cat-arrow {
  font-size: 0.7rem;
  color: var(--text-secondary);
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

.cat-count {
  color: var(--text-secondary);
  font-size: 0.7rem;
}


</style>
