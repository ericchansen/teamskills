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

      <div class="filter-toolbar">
        <label class="filter-field search-field">
          <span>Search</span>
          <input
            v-model.trim="searchQuery"
            type="search"
            class="filter-input"
            placeholder="Search skills or categories"
          />
        </label>

        <label class="filter-field">
          <span>Level</span>
          <select v-model="levelFilter" class="filter-input">
            <option value="any">Any level</option>
            <option value="unrated">Unrated only</option>
            <option value="l100plus">L100+</option>
            <option value="l200plus">L200+</option>
            <option value="l300plus">L300+</option>
            <option value="l400plus">L400</option>
          </select>
        </label>

        <label class="filter-toggle">
          <input v-model="ratedOnly" type="checkbox" />
          <span>Rated only</span>
        </label>

        <button
          v-if="hasActiveFilters"
          type="button"
          class="clear-filters-btn"
          @click="clearFilters"
        >
          Clear filters
        </button>
      </div>

      <div v-if="canEdit || user?.is_admin" class="profile-help-grid">
        <section v-if="canEdit" class="profile-help-card profile-sync-help">
          <div class="profile-help-copy">
            <h4>Profile updates</h4>
            <p>
              In this environment, updating a level changes only <strong>your</strong> profile in this app. It does not
              update SharePoint or another external system.
            </p>
          </div>
        </section>

        <section v-if="user?.is_admin" class="profile-help-card catalog-help">
          <div class="profile-help-copy">
            <h4>Shared skill catalog</h4>
            <p>
              Editing the shared skill catalog is a separate admin task. Use the admin editor to add, rename, merge,
              move, retire, or remove approved skills.
            </p>
          </div>
          <div class="catalog-actions">
            <router-link to="/skill-catalog" class="catalog-link">
              Open skill catalog editor
            </router-link>
          </div>
        </section>
      </div>

      <p v-if="!isLoading" class="results-summary">
        Showing {{ visibleSkillCount }} of {{ totalSkillCount }} skills
      </p>

      <div v-if="isLoading" class="no-results-msg">
        Loading skills...
      </div>

      <div v-else-if="filteredCategories.length === 0" class="no-results-msg">
        No skills match the current filters.
      </div>

      <div v-for="cat in filteredCategories" :key="cat.name" class="skill-category">
        <h4 class="cat-header" @click="toggleCategory(cat.name)">
          <span class="cat-chevron" :class="{ collapsed: collapsedCats.has(cat.name) }">▸</span>
          {{ cat.name }}
          <span class="cat-count">
            {{ cat.visibleCount }}<template v-if="cat.visibleCount !== cat.totalCount"> / {{ cat.totalCount }}</template>
          </span>
        </h4>

        <div v-show="!collapsedCats.has(cat.name)" class="cat-skills">
          <div v-for="group in cat.groups" :key="group.key" class="skill-group">
            <h5 v-if="group.label" class="group-header">{{ group.label }}</h5>
            <SkillLevelRow
              v-for="skill in group.skills"
              :key="skill.name"
              :skill-name="skill.name"
              :current-level="getMyLevel(skill.name)"
              :levels="levels"
              :can-edit="canEdit"
              @update:level="setLevel"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useAuth } from '../composables/useAuth';
import { useSkillsData } from '../composables/useSkillsData';
import { useApi } from '../composables/useApi';
import { useProfileSkills } from '../composables/useProfileSkills';
import { compareText } from '../utils/textSort';
import UserProfileCard from './v2/UserProfileCard.vue';
import SkillLevelRow from './v2/SkillLevelRow.vue';

const { user, isAuthenticated } = useAuth();
const { people, allSkills, skillCatalog, skillIndex, skillNameToId, isLive, isLoading, levels, load, updatePersonSkillLevel } =
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
  updatePersonSkillLevel,
});

const searchQuery = ref('');
const levelFilter = ref('any');
const ratedOnly = ref(false);

const categoryTotals = computed(() => {
  const totals = {};
  for (const skill of skillCatalog.value || []) {
    const categoryName = skill.topLevelCategory || 'Uncategorized';
    totals[categoryName] = (totals[categoryName] || 0) + 1;
  }
  return totals;
});

function matchesLevel(level) {
  switch (levelFilter.value) {
    case 'unrated':
      return level === 0;
    case 'l100plus':
      return level >= 100;
    case 'l200plus':
      return level >= 200;
    case 'l300plus':
      return level >= 300;
    case 'l400plus':
      return level >= 400;
    default:
      return true;
  }
}

function matchesSearch(skill) {
  const query = searchQuery.value.trim().toLowerCase();
  if (!query) return true;

  return [
    skill.name,
    skill.topLevelCategory,
    skill.groupLabel,
    skill.categoryPath,
  ]
    .filter(Boolean)
    .some((value) => value.toLowerCase().includes(query));
}

const filteredCategories = computed(() => {
  const categories = new Map();

  for (const skill of skillCatalog.value || []) {
    const level = getMyLevel(skill.name);
    if (ratedOnly.value && level === 0) continue;
    if (!matchesLevel(level)) continue;
    if (!matchesSearch(skill)) continue;

    const categoryName = skill.topLevelCategory || 'Uncategorized';
    if (!categories.has(categoryName)) {
      categories.set(categoryName, {
        name: categoryName,
        totalCount: categoryTotals.value[categoryName] || 0,
        visibleCount: 0,
        groups: new Map(),
      });
    }

    const category = categories.get(categoryName);
    const groupKey = skill.groupLabel || '__ungrouped__';
    if (!category.groups.has(groupKey)) {
      category.groups.set(groupKey, {
        key: groupKey,
        label: skill.groupLabel || '',
        skills: [],
      });
    }

    category.groups.get(groupKey).skills.push(skill);
    category.visibleCount += 1;
  }

  return [...categories.values()]
    .sort((a, b) => compareText(a.name, b.name))
    .map((category) => ({
      ...category,
      groups: [...category.groups.values()]
        .sort((a, b) => compareText(a.label, b.label))
        .map((group) => ({
          ...group,
          skills: [...group.skills].sort((a, b) => compareText(a.name, b.name)),
        })),
    }));
});

const totalSkillCount = computed(() => (skillCatalog.value || []).length);
const visibleSkillCount = computed(() =>
  filteredCategories.value.reduce((sum, category) => sum + category.visibleCount, 0)
);
const hasActiveFilters = computed(() =>
  searchQuery.value.trim().length > 0 || levelFilter.value !== 'any' || ratedOnly.value
);

function clearFilters() {
  searchQuery.value = '';
  levelFilter.value = 'any';
  ratedOnly.value = false;
}

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

.filter-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.9rem;
  align-items: end;
  margin-bottom: 1rem;
}

.filter-field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  min-width: 140px;
  font-size: 0.75rem;
  color: var(--text-secondary, #a0a0b0);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.search-field {
  flex: 1 1 260px;
}

.filter-input {
  border-radius: 8px;
  border: 1px solid var(--border, #2a2a4a);
  background-color: var(--bg-primary, #12121f);
  color: var(--text-primary, #e0e0e0);
  padding: 0.6rem 0.75rem;
  font-size: 0.9rem;
}

select.filter-input {
  padding-right: 2.25rem;
}

.filter-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--text-secondary, #a0a0b0);
  font-size: 0.85rem;
  padding-bottom: 0.55rem;
}

.clear-filters-btn,
.catalog-link {
  border-radius: 8px;
  border: 1px solid var(--border, #2a2a4a);
  background: transparent;
  color: var(--text-primary, #e0e0e0);
  padding: 0.6rem 0.85rem;
  font-size: 0.85rem;
  text-decoration: none;
}

.clear-filters-btn {
  cursor: pointer;
}

.profile-help-grid {
  display: grid;
  gap: 0.75rem;
  margin-bottom: 0.85rem;
}

.profile-help-card {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: center;
  padding: 0.85rem 1rem;
  border-radius: 10px;
}

.profile-sync-help {
  background: rgba(148, 163, 184, 0.08);
  border: 1px solid rgba(148, 163, 184, 0.18);
}

.catalog-help {
  background: rgba(129, 140, 248, 0.08);
  border: 1px solid rgba(129, 140, 248, 0.18);
}

.profile-help-copy {
  flex: 1 1 460px;
}

.profile-help-copy h4 {
  margin: 0 0 0.25rem;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-primary, #e0e0e0);
}

.profile-help-copy p {
  margin: 0;
  color: var(--text-secondary, #a0a0b0);
  font-size: 0.85rem;
  line-height: 1.5;
}

.catalog-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.catalog-link.secondary {
  border-style: dashed;
}

.catalog-link:hover,
.clear-filters-btn:hover {
  background: rgba(129, 140, 248, 0.12);
}

.results-summary,
.no-results-msg {
  margin: 0 0 0.85rem;
  color: var(--text-secondary, #a0a0b0);
  font-size: 0.85rem;
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

.skill-group + .skill-group {
  margin-top: 1rem;
}

.group-header {
  margin: 0 0 0.35rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-secondary, #a0a0b0);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.no-profile-msg {
  text-align: center;
  padding: 2rem;
  color: var(--text-secondary);
  font-size: 0.95rem;
}
</style>
