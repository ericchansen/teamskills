<template>
  <div class="user-card">
    <div class="user-avatar">{{ initials }}</div>
    <div class="user-info">
      <h2>{{ user?.name || 'Unknown User' }}</h2>
      <p class="user-meta">
        <span v-if="user?.email">{{ user.email }}</span>
        <span v-if="user?.role" class="chip">{{ user.role }}</span>
        <span v-if="user?.team" class="chip accent">{{ user.team }}</span>
      </p>
    </div>
    <div class="user-stats">
      <div class="stat">
        <span class="stat-value">{{ totalSkills }}</span>
        <span class="stat-label">Skills Rated</span>
      </div>
      <div class="stat">
        <span class="stat-value">{{ avgLevel }}</span>
        <span class="stat-label">Avg Level</span>
      </div>
      <div class="stat">
        <span class="stat-value">{{ expertCount }}</span>
        <span class="stat-label">Expert (L400)</span>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  user: { type: Object, default: null },
  initials: { type: String, required: true },
  totalSkills: { type: Number, required: true },
  avgLevel: { type: Number, required: true },
  expertCount: { type: Number, required: true },
});
</script>

<style scoped>
.user-card {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  padding: 1.5rem;
  background: var(--bg-secondary, #1a1a2e);
  border-radius: 12px;
  border: 1px solid var(--border, #2a2a4a);
  margin-bottom: 1.5rem;
}

.user-avatar {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: linear-gradient(135deg, #818cf8, #6366f1);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.2rem;
  font-weight: 700;
  color: #fff;
  flex-shrink: 0;
}

.user-info {
  flex: 1;
}

.user-info h2 {
  margin: 0 0 0.25rem 0;
  font-size: 1.2rem;
  color: var(--text-primary, #e0e0e0);
}

.user-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0;
  color: var(--text-secondary, #a0a0b0);
  font-size: 0.85rem;
}

.chip {
  padding: 0.15rem 0.5rem;
  border-radius: 100px;
  font-size: 0.75rem;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid var(--border, #2a2a4a);
}

.chip.accent {
  background: rgba(129, 140, 248, 0.12);
  border-color: rgba(129, 140, 248, 0.3);
  color: #818cf8;
}

.user-stats {
  display: flex;
  gap: 1.5rem;
}

.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.stat-value {
  font-size: 1.4rem;
  font-weight: 700;
  color: var(--text-primary, #e0e0e0);
}

.stat-label {
  font-size: 0.7rem;
  color: var(--text-secondary, #a0a0b0);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
</style>
