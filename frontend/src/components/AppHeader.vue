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
  router.getRoutes()
    .filter((route) => route.meta.primaryNav)
    .filter((route) => {
      if (route.meta.requiresAuth && !isAuthenticated.value) return false;
      if (route.meta.requiresAdmin && !user.value?.is_admin) return false;
      return route.meta.label;
    })
    .sort((a, b) => (a.meta.navOrder || 0) - (b.meta.navOrder || 0))
);
</script>

<style scoped>
.app-header {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  padding: 0.5rem 1.5rem;
  background-color: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
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
  color: var(--text-primary);
}

.live-badge {
  font-size: 0.7rem;
  color: var(--success);
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.demo-badge {
  font-size: 0.7rem;
  color: var(--warning);
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
  border-radius: var(--radius);
  color: var(--text-secondary);
  text-decoration: none;
  font-size: 0.85rem;
  font-weight: 500;
  transition: all 0.15s;
}

.nav-link:hover {
  color: var(--text-primary);
  background-color: rgba(255, 255, 255, 0.06);
}

.nav-link.active {
  color: var(--accent);
  background-color: rgba(129, 140, 248, 0.12);
}

.header-user {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-shrink: 0;
}

.user-name {
  font-size: 0.85rem;
  color: var(--text-primary);
  text-decoration: none;
}

.user-name:hover {
  color: var(--accent);
}

.user-name.muted {
  color: var(--text-secondary);
  font-style: italic;
  font-size: 0.75rem;
}

.btn-login,
.btn-logout {
  padding: 0.3rem 0.7rem;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background-color: transparent;
  color: var(--text-secondary);
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-login:hover {
  background-color: var(--accent);
  color: #fff;
  border-color: var(--accent);
}

.btn-logout:hover {
  background-color: rgba(248, 113, 113, 0.15);
  color: var(--danger);
  border-color: var(--danger);
}

.loading-dot {
  color: var(--text-secondary);
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
