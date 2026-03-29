<template>
  <div class="app-shell">
    <header class="app-header">
      <h1 class="app-title">
        <span class="title-icon">◈</span> Team Skills Dashboard
      </h1>
      <nav class="tab-bar">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          :class="['tab-btn', { active: activeTab === tab.id }]"
          @click="activeTab = tab.id"
        >
          {{ tab.label }}
        </button>
      </nav>
    </header>

    <main class="app-content">
      <SkillsMatrix v-if="activeTab === 'matrix'" />
      <SkillsGraph v-if="activeTab === 'graph'" />
      <GapAnalysis v-if="activeTab === 'gap'" />
    </main>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import SkillsMatrix from './components/SkillsMatrix.vue';
import SkillsGraph from './components/SkillsGraph.vue';
import GapAnalysis from './components/GapAnalysis.vue';

const tabs = [
  { id: 'matrix', label: 'Skills Matrix' },
  { id: 'graph', label: 'Skills Graph' },
  { id: 'gap', label: 'Gap Analysis' },
];

const activeTab = ref('matrix');
</script>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.app-header {
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
  padding: 16px 32px 0;
  position: sticky;
  top: 0;
  z-index: 100;
}

.app-title {
  font-size: 1.25rem;
  font-weight: 700;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.title-icon {
  color: var(--accent);
  font-size: 1.4rem;
}

.tab-bar {
  display: flex;
  gap: 4px;
}

.tab-btn {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-size: 0.875rem;
  font-weight: 500;
  padding: 10px 20px;
  border-bottom: 2px solid transparent;
  transition: all 0.2s;
}

.tab-btn:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.tab-btn.active {
  color: var(--accent);
  border-bottom-color: var(--accent);
}

.app-content {
  flex: 1;
  padding: 24px 32px;
  overflow: auto;
}
</style>
