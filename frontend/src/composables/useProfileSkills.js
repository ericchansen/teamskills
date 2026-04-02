/**
 * Composable — profile skills editing logic.
 * Manages local skill state, optimistic saves, and computed stats.
 */
import { ref, computed, reactive } from 'vue';

export function useProfileSkills({
  user,
  isAuthenticated,
  people,
  allSkills,
  skillIndex,
  skillNameToId,
  isLive,
  api,
}) {
  // ── Local state ────────────────────────────────
  const collapsedCats = reactive(new Set());
  const saveStatus = ref('');

  const canEdit = computed(() => isAuthenticated.value && isLive.value);

  // ── Find this user in the people array ─────────
  const myPerson = computed(() => {
    if (!user.value) return null;
    // Strict ID match only — avoids binding to the wrong person in demo mode
    return people.value.find((p) => p.id === user.value.id) || null;
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

    saveTimeouts.set(skillName, setTimeout(async () => {
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
    }, 500));
  }

  return {
    collapsedCats,
    mySkills,
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
  };
}
