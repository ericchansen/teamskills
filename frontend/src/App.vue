<template>
  <div class="app-shell">
    <!-- 1. Auth initializing -->
    <div v-if="authLoading" class="auth-gate">
      <h1>Team Skills Dashboard</h1>
      <p>Authenticating…</p>
    </div>

    <!-- 2. Auth enabled but user not signed in — block the whole app -->
    <div v-else-if="authEnabled && !isAuthenticated" class="auth-gate">
      <h1>Team Skills Dashboard</h1>
      <p>Sign in to view and manage team skills.</p>
      <p v-if="authError" class="auth-error-msg">{{ authError }}</p>
      <button class="login-btn" @click="login">
        <span class="btn-icon">🔑</span> Sign in with Microsoft
      </button>
    </div>

    <!-- 3. Authenticated (or auth not enabled) — show the app -->
    <template v-else>
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
    </template>
  </div>
</template>

<script setup>
import { onMounted, watch } from 'vue';
import AppHeader from './components/AppHeader.vue';
import { useAuth } from './composables/useAuth';
import { useSkillsData } from './composables/useSkillsData';

const {
  initialize: initAuth,
  isAuthenticated,
  isLoading: authLoading,
  authEnabled,
  error: authError,
  login,
} = useAuth();
const { isLoading, error, refresh, load: loadData } = useSkillsData();

onMounted(async () => {
  await initAuth();
  // Load data immediately if auth is not required or user has an existing session
  if (!authEnabled.value || isAuthenticated.value) {
    await loadData();
  }
});

// After interactive login completes, load data (uses refresh() to bypass idempotency guard)
watch(isAuthenticated, (signedIn) => {
  if (signedIn) {
    refresh();
  }
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

.auth-gate {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  gap: 1rem;
  color: var(--text-primary);
}

.auth-gate h1 {
  font-size: 1.8rem;
  margin: 0;
}

.auth-gate p {
  color: var(--text-secondary);
  margin: 0;
}

.auth-error-msg {
  color: #ef4444 !important;
  font-size: 0.9rem;
}

.login-btn {
  margin-top: 0.5rem;
  padding: 0.75rem 1.5rem;
  background: var(--accent, #3b82f6);
  color: #fff;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 1rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.login-btn:hover {
  opacity: 0.9;
}

.btn-icon {
  font-size: 1.2rem;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
