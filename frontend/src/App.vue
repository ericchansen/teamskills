<template>
  <div class="app-shell">
    <AppHeader />
    <main class="app-content">
      <div v-if="isLoading" class="loading-screen">
        <span class="loading-spinner">◌</span>
        <span>Loading skills data…</span>
      </div>
      <router-view v-else />
    </main>
  </div>
</template>

<script setup>
import { onMounted } from 'vue';
import AppHeader from './components/AppHeader.vue';
import { useAuth } from './composables/useAuth';
import { useSkillsData } from './composables/useSkillsData';

const { initialize: initAuth } = useAuth();
const { isLoading, load: loadData } = useSkillsData();

onMounted(async () => {
  await initAuth();
  await loadData();
});
</script>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.app-content {
  flex: 1;
  padding: 24px 32px;
  overflow: auto;
}

.loading-screen {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  height: 60vh;
  color: var(--text-secondary);
  font-size: 1rem;
}

.loading-spinner {
  font-size: 1.5rem;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
