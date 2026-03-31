<template>
  <div class="app-shell">
    <AppHeader />
    <main class="app-content">
      <div v-if="isLoading" class="loading-screen">
        <span class="loading-spinner">◌</span>
        <span>Loading skills data…</span>
      </div>
      <div v-else-if="error" class="error-screen">
        <span class="error-icon">⚠</span>
        <p>{{ error }}</p>
        <button class="retry-btn" @click="refresh">Retry</button>
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
const { isLoading, error, refresh, load: loadData } = useSkillsData();

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

.error-screen {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  height: 60vh;
  color: var(--text-secondary);
}

.error-icon {
  font-size: 2rem;
  color: #ef4444;
}

.error-screen p {
  color: #ef4444;
  font-size: 1rem;
  margin: 0;
}

.retry-btn {
  margin-top: 0.5rem;
  padding: 0.5rem 1.25rem;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
}

.retry-btn:hover {
  opacity: 0.85;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
