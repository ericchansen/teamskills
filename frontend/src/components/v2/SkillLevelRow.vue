<template>
  <div class="skill-row">
    <span class="skill-name">{{ skillName }}</span>
    <div class="level-selector">
      <button
        v-for="(label, lvl) in levels"
        :key="lvl"
        class="level-btn"
        :class="{
          active: currentLevel === Number(lvl),
          [`l${lvl}`]: true,
        }"
        :disabled="!canEdit"
        :title="label"
        @click="$emit('update:level', skillName, Number(lvl))"
      >
        {{ lvl }}
      </button>
    </div>
  </div>
</template>

<script setup>
defineProps({
  skillName: { type: String, required: true },
  currentLevel: { type: Number, default: 0 },
  levels: { type: Object, required: true },
  canEdit: { type: Boolean, required: true },
});

defineEmits(['update:level']);
</script>

<style scoped>
.skill-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.35rem 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.03);
}

.skill-name {
  font-size: 0.8rem;
  color: var(--text-secondary, #a0a0b0);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.level-selector {
  display: flex;
  gap: 0.25rem;
  flex-shrink: 0;
}

.level-btn {
  width: 38px;
  height: 26px;
  border: 1px solid var(--border, #2a2a4a);
  border-radius: 4px;
  background: transparent;
  color: var(--text-secondary, #a0a0b0);
  font-size: 0.7rem;
  cursor: pointer;
  transition: all 0.15s;
}

.level-btn:hover:not(:disabled) {
  border-color: var(--text-secondary, #a0a0b0);
}

.level-btn:disabled {
  cursor: default;
  opacity: 0.5;
}

.level-btn.active.l100 {
  background: #334155;
  border-color: #475569;
  color: #94a3b8;
}
.level-btn.active.l200 {
  background: #1e3a5f;
  border-color: #2563eb;
  color: #60a5fa;
}
.level-btn.active.l300 {
  background: #14532d;
  border-color: #16a34a;
  color: #4ade80;
}
.level-btn.active.l400 {
  background: #581c87;
  border-color: #9333ea;
  color: #c084fc;
}
</style>
