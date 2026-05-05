<template>
  <section class="skill-catalog-admin">
    <header class="page-header">
      <div>
        <h2>Skill Catalog</h2>
        <p>Admins can directly create, rename, merge, move, retire, or remove approved skills.</p>
      </div>
      <div class="toolbar">
        <button class="secondary-btn" @click="refreshPage">Refresh</button>
      </div>
    </header>

    <article v-if="isAdmin" class="panel-card">
      <header class="section-header">
        <div>
          <h3>Edit the shared catalog</h3>
          <p>Use this page to directly add, rename, merge, move, retire, or remove approved skills.</p>
        </div>
      </header>

      <div class="info-card subtle">
        Changes here update the shared catalog immediately. Use retire and remove only when you are sure the skill
        should no longer appear in the approved list.
      </div>

      <form class="editor-form" @submit.prevent="applyDirectEdit">
        <label class="field">
          <span>What do you want to change?</span>
          <select v-model="directEdit.mode">
            <option v-for="option in directEditModes" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </label>

        <template v-if="directEdit.mode === 'create'">
          <label class="field">
            <span>New skill name</span>
            <input
              v-model.trim="directEdit.name"
              type="text"
              maxlength="120"
              placeholder="Example: Azure AI Agent Service"
            />
          </label>
          <p class="field-hint">Type the approved name that should appear in the shared catalog.</p>

          <label class="field">
            <span>Category for the new skill</span>
            <select v-model="directEdit.categoryId">
              <option value="">Select a category</option>
              <option v-for="option in categoryOptions" :key="option.id" :value="String(option.id)">
                {{ option.label }}
              </option>
            </select>
          </label>

          <label class="field">
            <span>Catalog note (optional)</span>
            <textarea
              v-model.trim="directEdit.description"
              rows="4"
              maxlength="600"
              placeholder="Optional context for future catalog maintainers."
            />
          </label>
        </template>

        <template v-else-if="directEdit.mode === 'rename'">
          <label class="field">
            <span>Skill to rename</span>
            <select v-model="directEdit.skillId">
              <option value="">Select the current skill</option>
              <option v-for="option in skillOptions" :key="option.id" :value="String(option.id)">
                {{ option.label }}
              </option>
            </select>
          </label>
          <p class="field-hint">
            Pick the current catalog entry. Category details are shown only to help you choose the right skill.
          </p>
          <p class="field-hint">
            <strong>Current category:</strong>
            {{ selectedSkillCategoryLabel(directEdit.skillId) || 'Select a skill to see its current category.' }}
          </p>

          <label class="field">
            <span>New approved skill name</span>
            <input
              v-model.trim="directEdit.desiredName"
              type="text"
              maxlength="120"
              placeholder="Example: Azure AI Foundry"
            />
          </label>
          <p class="field-hint">Type only the new skill name. Do not include category or path text here.</p>
        </template>

        <template v-else-if="directEdit.mode === 'merge'">
          <label class="field">
            <span>Skill to keep</span>
            <select v-model="directEdit.survivingSkillId">
              <option value="">Select the skill to keep</option>
              <option v-for="option in skillOptions" :key="option.id" :value="String(option.id)">
                {{ option.label }}
              </option>
            </select>
          </label>
          <p class="field-hint">Keep this catalog entry and fold the selected duplicates into it.</p>

          <label class="field">
            <span>Skills to merge into it</span>
            <select v-model="directEdit.mergedSkillIds" multiple size="4">
              <option
                v-for="option in mergeCandidateOptions(directEdit.survivingSkillId)"
                :key="option.id"
                :value="String(option.id)"
              >
                {{ option.label }}
              </option>
            </select>
          </label>
          <p class="field-hint">Choose one or more duplicate entries to fold into the kept skill.</p>

          <label class="field">
            <span>Approved name after merge (optional)</span>
            <input
              v-model.trim="directEdit.desiredName"
              type="text"
              maxlength="120"
              placeholder="Leave blank to keep the selected skill name"
            />
          </label>

          <label class="field">
            <span>Category after merge (optional)</span>
            <select v-model="directEdit.targetCategoryId">
              <option value="">Keep current category</option>
              <option v-for="option in categoryOptions" :key="option.id" :value="String(option.id)">
                {{ option.label }}
              </option>
            </select>
          </label>
        </template>

        <template v-else-if="directEdit.mode === 'move'">
          <label class="field">
            <span>Skill to move</span>
            <select v-model="directEdit.skillId">
              <option value="">Select the current skill</option>
              <option v-for="option in skillOptions" :key="option.id" :value="String(option.id)">
                {{ option.label }}
              </option>
            </select>
          </label>
          <p class="field-hint">
            Pick the current catalog entry. Its current category is shown below for reference.
          </p>

          <p class="field-hint">
            <strong>Current category:</strong>
            {{ selectedSkillCategoryLabel(directEdit.skillId) || 'Select a skill to see its current category.' }}
          </p>

          <label class="field">
            <span>New category</span>
            <select v-model="directEdit.targetCategoryId">
              <option value="">Select a category</option>
              <option v-for="option in categoryOptions" :key="option.id" :value="String(option.id)">
                {{ option.label }}
              </option>
            </select>
          </label>
        </template>

        <template v-else-if="directEdit.mode === 'retire'">
          <label class="field">
            <span>Skill to retire</span>
            <select v-model="directEdit.skillId">
              <option value="">Select a skill</option>
              <option v-for="option in skillOptions" :key="option.id" :value="String(option.id)">
                {{ option.label }}
              </option>
            </select>
          </label>
          <div class="info-card subtle">
            Retiring a skill keeps the record but marks it inactive so it should no longer be used for new catalog work.
          </div>
        </template>

        <template v-else-if="directEdit.mode === 'remove'">
          <label class="field">
            <span>Skill to remove</span>
            <select v-model="directEdit.skillId">
              <option value="">Select a skill</option>
              <option v-for="option in skillOptions" :key="option.id" :value="String(option.id)">
                {{ option.label }}
              </option>
            </select>
          </label>
          <div class="info-card warning">
            Removing a skill permanently deletes it from the catalog and should be reserved for cleanup mistakes, not
            routine changes.
          </div>
        </template>

        <div class="form-footer">
          <button class="primary-btn" type="submit" :disabled="editingDirectly">
            {{ editingDirectly ? 'Applying…' : directEditSubmitLabel }}
          </button>
          <p v-if="directEditSuccess" class="form-message success">{{ directEditSuccess }}</p>
          <p v-if="directEditError" class="form-message error">{{ directEditError }}</p>
        </div>
      </form>
    </article>

    <article v-else class="panel-card">
      <header class="section-header">
        <div>
          <h3>Admin access required</h3>
          <p>Only admins can edit the shared skill catalog directly.</p>
        </div>
      </header>
    </article>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useApi } from '../composables/useApi';
import { useAuth } from '../composables/useAuth';
import { useSkillsData } from '../composables/useSkillsData';

const directEditModes = [
  { value: 'create', label: 'Add a skill' },
  { value: 'rename', label: 'Rename a skill' },
  { value: 'merge', label: 'Merge skills' },
  { value: 'move', label: 'Move a skill' },
  { value: 'retire', label: 'Retire a skill' },
  { value: 'remove', label: 'Remove a skill' },
];

const api = useApi();
const { user } = useAuth();
const { categoryTree, skillCatalog, load, refresh } = useSkillsData();

const editingDirectly = ref(false);
const directEditSuccess = ref('');
const directEditError = ref('');
const directEdit = reactive(createDirectEditState());

const isAdmin = computed(() => !!user.value?.is_admin);
const categoryOptions = computed(() => flattenCategoryTree(categoryTree.value || []));
const skillNameCounts = computed(() => {
  const counts = new Map();
  for (const skill of skillCatalog.value || []) {
    counts.set(skill.name, (counts.get(skill.name) || 0) + 1);
  }
  return counts;
});
const skillOptions = computed(() => (
  skillCatalog.value || []
).map((skill) => ({
  id: skill.id,
  label: buildSkillOptionLabel(skill, (skillNameCounts.value.get(skill.name) || 0) > 1),
  categoryLabel: formatCategoryLabel(skill.categoryPathNames),
  name: skill.name,
})));
const skillOptionMap = computed(() => new Map(skillOptions.value.map((option) => [String(option.id), option])));
const directEditSubmitLabel = computed(() => {
  switch (directEdit.mode) {
    case 'create':
      return 'Create skill';
    case 'rename':
      return 'Rename skill';
    case 'merge':
      return 'Merge skills';
    case 'move':
      return 'Move skill';
    case 'retire':
      return 'Retire skill';
    case 'remove':
      return 'Remove skill';
    default:
      return 'Save';
  }
});

function createDirectEditState() {
  return {
    mode: 'create',
    skillId: '',
    name: '',
    categoryId: '',
    description: '',
    desiredName: '',
    targetCategoryId: '',
    survivingSkillId: '',
    mergedSkillIds: [],
  };
}

function flattenCategoryTree(nodes, path = []) {
  return nodes.flatMap((node) => {
    const nextPath = [...path, node.name];
    const option = { id: node.id, label: nextPath.join(' > ') };
    return [option, ...flattenCategoryTree(node.children || [], nextPath)];
  });
}

function formatCategoryLabel(parts = []) {
  return (parts || []).filter(Boolean).join(' / ');
}

function buildSkillOptionLabel(skill, includeCategory) {
  if (!includeCategory) return skill.name;
  return `${skill.name} (${formatCategoryLabel(skill.categoryPathNames)})`;
}

function selectedSkillCategoryLabel(skillId) {
  return skillOptionMap.value.get(String(skillId))?.categoryLabel || '';
}

function mergeCandidateOptions(survivingSkillId) {
  return skillOptions.value.filter((option) => String(option.id) !== String(survivingSkillId));
}

function extractApiErrorMessage(err) {
  const fallback = err?.message || 'Something went wrong while saving.';
  const payloadMatch = fallback.match(/failed \(\d+\):\s*(.+)$/);
  if (!payloadMatch) return fallback;

  try {
    const payload = JSON.parse(payloadMatch[1]);
    if (payload.canonicalSkill) {
      const canonicalName = payload.canonicalSkill.preferred_label || payload.canonicalSkill.name;
      return `${payload.error}. Existing skill: ${canonicalName}.`;
    }
    return payload.error || fallback;
  } catch {
    return fallback;
  }
}

function resetDirectEditForm() {
  Object.assign(directEdit, createDirectEditState(), { mode: directEdit.mode });
}

async function refreshPage() {
  await refresh();
}

async function applyDirectEdit() {
  editingDirectly.value = true;
  directEditSuccess.value = '';
  directEditError.value = '';

  try {
    if (directEdit.mode === 'create') {
      if (!directEdit.name) {
        throw new Error('Enter the new skill name.');
      }
      if (!directEdit.categoryId) {
        throw new Error('Select a category for the new skill.');
      }
      await api.post('/api/skills', {
        name: directEdit.name,
        category_id: Number(directEdit.categoryId),
        description: directEdit.description || null,
      });
      directEditSuccess.value = 'Skill created.';
    } else if (directEdit.mode === 'rename') {
      if (!directEdit.skillId) {
        throw new Error('Select the skill to rename.');
      }
      if (!directEdit.desiredName) {
        throw new Error('Enter the new skill name.');
      }
      await api.put(`/api/skills/${directEdit.skillId}`, {
        name: directEdit.desiredName,
      });
      directEditSuccess.value = 'Skill renamed.';
    } else if (directEdit.mode === 'merge') {
      if (!directEdit.survivingSkillId) {
        throw new Error('Select the surviving skill.');
      }
      if (!directEdit.mergedSkillIds.length) {
        throw new Error('Select at least one duplicate skill to merge.');
      }
      await api.post('/api/skills/merge', {
        surviving_skill_id: Number(directEdit.survivingSkillId),
        merged_skill_ids: directEdit.mergedSkillIds.map((skillId) => Number(skillId)),
        desired_name: directEdit.desiredName || null,
        target_category_id: directEdit.targetCategoryId ? Number(directEdit.targetCategoryId) : null,
      });
      directEditSuccess.value = 'Skills merged.';
    } else if (directEdit.mode === 'move') {
      if (!directEdit.skillId) {
        throw new Error('Select the skill to move.');
      }
      if (!directEdit.targetCategoryId) {
        throw new Error('Select the destination category.');
      }
      await api.put(`/api/skills/${directEdit.skillId}`, {
        category_id: Number(directEdit.targetCategoryId),
      });
      directEditSuccess.value = 'Skill moved.';
    } else if (directEdit.mode === 'retire') {
      if (!directEdit.skillId) {
        throw new Error('Select the skill to retire.');
      }
      await api.put(`/api/skills/${directEdit.skillId}`, {
        lifecycle_status: 'retired',
      });
      directEditSuccess.value = 'Skill retired.';
    } else if (directEdit.mode === 'remove') {
      if (!directEdit.skillId) {
        throw new Error('Select the skill to remove.');
      }
      await api.del(`/api/skills/${directEdit.skillId}`, {});
      directEditSuccess.value = 'Skill removed.';
    }

    await refresh();
    resetDirectEditForm();
  } catch (err) {
    directEditError.value = extractApiErrorMessage(err);
  } finally {
    editingDirectly.value = false;
  }
}

onMounted(async () => {
  await load();
});
</script>

<style scoped>
.skill-catalog-admin {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  max-width: 980px;
  margin: 0 auto;
  padding: 1.75rem 1.5rem;
}

.page-header {
  display: flex;
  justify-content: space-between;
  gap: 1.5rem;
  align-items: flex-start;
}

.page-header h2,
.section-header h3 {
  margin: 0;
}

.page-header p,
.section-header p {
  margin: 0.45rem 0 0;
  color: var(--text-secondary, #a0a0b0);
  line-height: 1.45;
}

.toolbar {
  display: flex;
  gap: 0.75rem;
}

.panel-card,
.info-card {
  background: var(--bg-secondary, #1a1a2e);
  border: 1px solid var(--border, #2a2a4a);
  border-radius: 12px;
}

.panel-card {
  padding: 1.4rem 1.6rem 1.5rem;
}

.section-header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
  margin-bottom: 1.35rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  font-size: 0.9rem;
  color: var(--text-secondary, #a0a0b0);
}

.field input,
.field select,
.field textarea,
.secondary-btn,
.primary-btn {
  border-radius: 10px;
  border: 1px solid var(--border, #2a2a4a);
  background-color: var(--bg-tertiary, #111829);
  color: var(--text-primary, #f4f6fb);
  font: inherit;
}

.field input,
.field select,
.field textarea {
  padding: 0.85rem 1rem;
}

.field select:not([multiple]) {
  padding-right: 2.25rem;
}

.field textarea {
  resize: vertical;
}

.editor-form {
  display: grid;
  gap: 1.4rem;
}

.panel-card > .info-card + .editor-form {
  margin-top: 0.55rem;
}

.field select[multiple] {
  min-height: 8rem;
}

.field-hint {
  margin: 0.1rem 0 0;
  color: var(--text-secondary, #a0a0b0);
  line-height: 1.45;
}

.info-card {
  padding: 1rem 1.15rem;
  line-height: 1.45;
}

.info-card.subtle {
  background: rgba(110, 168, 254, 0.08);
}

.info-card.warning {
  background: rgba(255, 166, 0, 0.1);
}

.secondary-btn,
.primary-btn {
  cursor: pointer;
  padding: 0.65rem 1rem;
}

.primary-btn {
  background: linear-gradient(135deg, #4f74ff, #7b5bff);
  border: none;
  color: #fff;
  font-weight: 600;
}

.form-footer {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
  margin-top: 0.25rem;
}

.form-message {
  margin: 0;
}

.form-message.success {
  color: #7dd3a0;
}

.form-message.error {
  color: #ff8f8f;
}

@media (max-width: 640px) {
  .skill-catalog-admin {
    padding: 1rem;
  }

  .page-header {
    flex-direction: column;
  }
}
</style>
