<template>
  <div class="profile-page">
    <!-- User info card -->
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

    <!-- Skills editor -->
    <div class="skills-editor">
      <div class="editor-header">
        <h3>My Skills</h3>
        <div class="editor-actions">
          <span v-if="saveStatus === 'saving'" class="save-status">Saving…</span>
          <span v-else-if="saveStatus === 'saved'" class="save-status saved">✓ Saved</span>
          <span v-else-if="saveStatus === 'error'" class="save-status error">✗ Error</span>
          <span v-if="!isLive" class="save-status muted">Read-only (demo mode)</span>
        </div>
      </div>

      <div v-for="cat in categoryNames" :key="cat" class="skill-category">
        <h4 class="cat-header" @click="toggleCategory(cat)">
          <span class="cat-chevron" :class="{ collapsed: collapsedCats.has(cat) }">▸</span>
          {{ cat }}
          <span class="cat-count">{{ skillCategories[cat]?.length || 0 }}</span>
        </h4>

        <div v-show="!collapsedCats.has(cat)" class="cat-skills">
          <div
            v-for="skill in skillCategories[cat]"
            :key="skill"
            class="skill-row"
          >
            <span class="skill-name">{{ skill }}</span>
            <div class="level-selector">
              <button
                v-for="(label, lvl) in levels"
                :key="lvl"
                class="level-btn"
                :class="{
                  active: getMyLevel(skill) === Number(lvl),
                  [`l${lvl}`]: true,
                }"
                :disabled="!canEdit"
                :title="label"
                @click="setLevel(skill, Number(lvl))"
              >
                {{ lvl }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, reactive, onMounted } from 'vue';
import { useAuth } from '../composables/useAuth';
import { useSkillsData } from '../composables/useSkillsData';
import { useApi } from '../composables/useApi';

const { user, isAuthenticated } = useAuth();
const { people, allSkills, skillCategories, categoryNames, skillIndex, skillNameToId, isLive, levels, load } =
  useSkillsData();
const api = useApi();

// ── Local state ────────────────────────────────
const collapsedCats = reactive(new Set());
const saveStatus = ref('');
const pendingChanges = reactive(new Map());

const canEdit = computed(() => isAuthenticated.value && isLive.value);

// ── Find this user in the people array ─────────
const myPerson = computed(() => {
  if (!user.value) return null;
  return people.value.find(
    (p) => p.id === user.value.id || p.name === user.value.name || p.email === user.value.email,
  );
});

// Local copy of my skill levels (for optimistic updates)
const mySkills = reactive(new Map());

function syncMySkills() {
  mySkills.clear();
  if (!myPerson.value) return;
  for (const skillName of allSkills.value) {
    const idx = skillIndex.value[skillName];
    const level = idx !== undefined ? myPerson.value.skills[idx] || 0 : 0;
    mySkills.set(skillName, level);
  }
}

onMounted(async () => {
  await load();
  syncMySkills();
});

// ── Computed stats ─────────────────────────────
const initials = computed(() => {
  const name = user.value?.name || '?';
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .substring(0, 2);
});

const totalSkills = computed(() => {
  let count = 0;
  for (const lvl of mySkills.values()) {
    if (lvl > 0) count++;
  }
  return count;
});

const avgLevel = computed(() => {
  let sum = 0;
  let count = 0;
  for (const lvl of mySkills.values()) {
    if (lvl > 0) {
      sum += lvl;
      count++;
    }
  }
  return count > 0 ? Math.round(sum / count) : 0;
});

const expertCount = computed(() => {
  let count = 0;
  for (const lvl of mySkills.values()) {
    if (lvl >= 400) count++;
  }
  return count;
});

// ── Actions ────────────────────────────────────
function toggleCategory(cat) {
  if (collapsedCats.has(cat)) {
    collapsedCats.delete(cat);
  } else {
    collapsedCats.add(cat);
  }
}

function getMyLevel(skillName) {
  return mySkills.get(skillName) || 0;
}

const saveTimeouts = new Map();

async function setLevel(skillName, level) {
  if (!canEdit.value || !user.value) return;

  // Optimistic update
  const oldLevel = mySkills.get(skillName);
  const newLevel = oldLevel === level ? 0 : level; // toggle off if same
  mySkills.set(skillName, newLevel);

  // Find skill ID from the people data
  const idx = skillIndex.value[skillName];
  if (idx === undefined) return;

  // Also update the person's skills array for chart reactivity
  if (myPerson.value) {
    myPerson.value.skills[idx] = newLevel;
  }

  // Per-skill debounced save to API
  if (saveTimeouts.has(skillName)) {
    clearTimeout(saveTimeouts.get(skillName));
  }
  saveStatus.value = 'saving';

  const timeout = setTimeout(async () => {
    saveTimeouts.delete(skillName);
    try {
      // Look up the real backend skill ID from the name → ID map
      const skillId = skillNameToId.value[skillName];
      if (!skillId) {
        console.warn('No backend skill ID for', skillName);
        saveStatus.value = '';
        return;
      }

      if (newLevel === 0) {
        // Delete the skill rating via backend DELETE endpoint
        await api.del('/api/user-skills', {
          user_id: user.value.id,
          skill_id: skillId,
        });
      } else {
        await api.put('/api/user-skills', {
          user_id: user.value.id,
          skill_id: skillId,
          proficiency_level: `L${newLevel}`,
          notes: '',
        });
      }
      saveStatus.value = 'saved';
      setTimeout(() => {
        saveStatus.value = '';
      }, 2000);
    } catch (err) {
      console.error('Failed to save skill:', err);
      // Revert optimistic update
      mySkills.set(skillName, oldLevel);
      if (myPerson.value) {
        myPerson.value.skills[idx] = oldLevel;
      }
      saveStatus.value = 'error';
      setTimeout(() => {
        saveStatus.value = '';
      }, 3000);
    }
  }, 500);
}
</script>

<style scoped>
.profile-page {
  padding: 1.5rem;
  max-width: 1000px;
  margin: 0 auto;
  height: calc(100vh - 60px);
  overflow-y: auto;
}

/* ── User card ──────────────────── */
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

/* ── Skills editor ──────────────── */
.skills-editor {
  background: var(--bg-secondary, #1a1a2e);
  border-radius: 12px;
  border: 1px solid var(--border, #2a2a4a);
  padding: 1rem 1.5rem;
}

.editor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.editor-header h3 {
  margin: 0;
  font-size: 1rem;
  color: var(--text-primary, #e0e0e0);
}

.save-status {
  font-size: 0.8rem;
  color: var(--text-secondary, #a0a0b0);
}
.save-status.saved {
  color: #4ade80;
}
.save-status.error {
  color: #f87171;
}
.save-status.muted {
  font-style: italic;
}

.skill-category {
  margin-bottom: 0.5rem;
}

.cat-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0;
  padding: 0.5rem 0;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-primary, #e0e0e0);
  cursor: pointer;
  user-select: none;
  border-bottom: 1px solid var(--border, #2a2a4a);
}

.cat-header:hover {
  color: var(--accent, #818cf8);
}

.cat-chevron {
  display: inline-block;
  transition: transform 0.15s;
  font-size: 0.7rem;
}

.cat-chevron:not(.collapsed) {
  transform: rotate(90deg);
}

.cat-count {
  font-size: 0.7rem;
  color: var(--text-secondary, #a0a0b0);
  font-weight: 400;
}

.cat-skills {
  padding: 0.25rem 0 0.25rem 1rem;
}

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
