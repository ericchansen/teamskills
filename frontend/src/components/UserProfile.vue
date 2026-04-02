<template>
  <div class="profile-page">
    <!-- User info card -->
    <UserProfileCard
      :user="user"
      :initials="initials"
      :total-skills="totalSkills"
      :avg-level="avgLevel"
      :expert-count="expertCount"
    />

    <!-- Skills editor -->
    <div v-if="!myPerson && !isLive" class="no-profile-msg">
      <p>Profile editing is not available in demo mode. Sign in to manage your skills.</p>
    </div>
    <div v-else class="skills-editor">
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
          <SkillLevelRow
            v-for="skill in skillCategories[cat]"
            :key="skill"
            :skill-name="skill"
            :current-level="getMyLevel(skill)"
            :levels="levels"
            :can-edit="canEdit"
            @update:level="setLevel"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted } from 'vue';
import { useAuth } from '../composables/useAuth';
import { useSkillsData } from '../composables/useSkillsData';
import { useApi } from '../composables/useApi';
import { useProfileSkills } from '../composables/useProfileSkills';
import UserProfileCard from './v2/UserProfileCard.vue';
import SkillLevelRow from './v2/SkillLevelRow.vue';

const { user, isAuthenticated } = useAuth();
const { people, allSkills, skillCategories, categoryNames, skillIndex, skillNameToId, isLive, levels, load } =
  useSkillsData();
const api = useApi();

const {
  collapsedCats,
  saveStatus,
  canEdit,
  myPerson,
  initials,
  totalSkills,
  avgLevel,
  expertCount,
  syncMySkills,
  toggleCategory,
  getMyLevel,
  setLevel,
} = useProfileSkills({
  user,
  isAuthenticated,
  people,
  allSkills,
  skillIndex,
  skillNameToId,
  isLive,
  api,
});

onMounted(async () => {
  await load();
  syncMySkills();
});
</script>

<style scoped>
.profile-page {
  padding: 1.5rem;
  max-width: 1000px;
  margin: 0 auto;
  height: calc(100vh - 60px);
  overflow-y: auto;
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

.no-profile-msg {
  text-align: center;
  padding: 2rem;
  color: var(--text-secondary);
  font-size: 0.95rem;
}
</style>
