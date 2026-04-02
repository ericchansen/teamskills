<template>
  <header class="app-header">
    <div class="header-brand">
      <h1>Team Skills</h1>
      <span v-if="isLive" class="live-badge" title="Connected to database">● Live</span>
      <span v-else class="demo-badge" title="Using mock data">◌ Demo</span>
    </div>

    <nav class="header-nav">
      <router-link
        v-for="route in navRoutes"
        :key="route.name"
        :to="route.path"
        class="nav-link"
        :class="{ active: $route.name === route.name }"
      >
        {{ route.meta.label }}
      </router-link>
    </nav>

    <div class="header-user">
      <template v-if="isLoading">
        <span class="loading-dot">⋯</span>
      </template>
      <template v-else-if="isAuthenticated">
        <router-link to="/profile" class="user-name">{{ user.name }}</router-link>
        <button class="btn-logout" @click="logout">Sign out</button>
      </template>
      <template v-else-if="authEnabled">
        <button class="btn-login" @click="login">Sign in</button>
      </template>
      <template v-else>
        <span class="user-name muted">No auth configured</span>
      </template>
    </div>
  </header>
</template>

<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAuth } from '../composables/useAuth';
import { useSkillsData } from '../composables/useSkillsData';

const router = useRouter();
const { user, isAuthenticated, isLoading, authEnabled, login, logout } = useAuth();
const { isLive } = useSkillsData();

const navRoutes = computed(() =>
  router.getRoutes().filter((r) => {
    if (r.meta.requiresAuth && !isAuthenticated.value) return false;
    if (r.meta.requiresAdmin && !user.value?.is_admin) return false;
    return r.meta.label;
  })
);
</script>

<style scoped>
.app-header {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  padding: 0.5rem 1.5rem;
  background: var(--bg-secondary, #1a1a2e);
  border-bottom: 1px solid var(--border, #2a2a4a);
  min-height: 48px;
}

.header-brand {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}

.header-brand h1 {
  font-size: 1.1rem;
  font-weight: 600;
  margin: 0;
  color: var(--text-primary, #e0e0e0);
}

.live-badge {
  font-size: 0.7rem;
  color: #4ade80;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.demo-badge {
  font-size: 0.7rem;
  color: #fbbf24;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.header-nav {
  display: flex;
  gap: 0.25rem;
  flex: 1;
  justify-content: center;
}

.nav-link {
  padding: 0.4rem 0.8rem;
  border-radius: 6px;
  color: var(--text-secondary, #a0a0b0);
  text-decoration: none;
  font-size: 0.85rem;
  font-weight: 500;
  transition: all 0.15s;
}

.nav-link:hover {
  color: var(--text-primary, #e0e0e0);
  background: rgba(255, 255, 255, 0.06);
}

.nav-link.active {
  color: var(--accent, #818cf8);
  background: rgba(129, 140, 248, 0.12);
}

.header-user {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-shrink: 0;
}

.user-name {
  font-size: 0.85rem;
  color: var(--text-primary, #e0e0e0);
  text-decoration: none;
}

.user-name:hover {
  color: var(--accent, #818cf8);
}

.user-name.muted {
  color: var(--text-secondary, #a0a0b0);
  font-style: italic;
  font-size: 0.75rem;
}

.btn-login,
.btn-logout {
  padding: 0.3rem 0.7rem;
  border-radius: 6px;
  border: 1px solid var(--border, #2a2a4a);
  background: transparent;
  color: var(--text-secondary, #a0a0b0);
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-login:hover {
  background: var(--accent, #818cf8);
  color: #fff;
  border-color: var(--accent, #818cf8);
}

.btn-logout:hover {
  background: rgba(248, 113, 113, 0.15);
  color: #f87171;
  border-color: #f87171;
}

.loading-dot {
  color: var(--text-secondary, #a0a0b0);
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 0.4;
  }
  50% {
    opacity: 1;
  }
}
</style>
