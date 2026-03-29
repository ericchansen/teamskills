/**
 * Singleton composable — reactive skills matrix data.
 * Tries to load from /api/matrix; falls back to static mock data.
 */
import { ref, reactive, toRefs, readonly } from 'vue';
import { useApi } from './useApi';

// Static levels map (same in API and mock)
const LEVELS = {
  100: 'Awareness',
  200: 'Working',
  300: 'Proficient',
  400: 'Expert',
};

// ── Singleton state ──────────────────────────────────
const state = reactive({
  people: [],
  allSkills: [],
  skillCategories: {},
  categoryNames: [],
  skillToCategory: {},
  skillIndex: {},
  isLoading: true,
  error: null,
  isLive: false,
});

let loaded = false;

// ── Helpers ──────────────────────────────────────────

/** Parse backend proficiency string "L300" → number 300 */
function parseLevel(val) {
  if (typeof val === 'number') return val;
  if (typeof val === 'string' && val.startsWith('L')) {
    return parseInt(val.substring(1), 10) || 0;
  }
  return parseInt(val, 10) || 0;
}

/**
 * Transform API response → internal format matching data.js exports.
 */
function transformApiData(apiData) {
  const { users, skills, userSkills } = apiData;

  // Group skills by category, preserve API ordering
  const catMap = new Map();
  for (const skill of skills) {
    const cat = skill.category_name || 'Uncategorized';
    if (!catMap.has(cat)) catMap.set(cat, []);
    catMap.get(cat).push(skill.name);
  }

  const skillCategories = Object.fromEntries(catMap);
  const categoryNames = [...catMap.keys()];
  const allSkills = categoryNames.flatMap((c) => catMap.get(c));

  // Build lookup maps
  const skillToCategory = {};
  for (const [cat, names] of Object.entries(skillCategories)) {
    for (const name of names) {
      skillToCategory[name] = cat;
    }
  }

  const skillIndex = {};
  allSkills.forEach((name, i) => {
    skillIndex[name] = i;
  });

  // Build skill ID → index map for user skills lookup
  const skillIdToIndex = {};
  for (const skill of skills) {
    const idx = skillIndex[skill.name];
    if (idx !== undefined) skillIdToIndex[skill.id] = idx;
  }

  // Transform users
  const people = users.map((u) => {
    const skillsArr = new Array(allSkills.length).fill(0);
    // Fill from userSkills map
    for (const skill of skills) {
      const key = `${u.id}-${skill.id}`;
      const entry = userSkills[key];
      if (entry) {
        const idx = skillIdToIndex[skill.id];
        if (idx !== undefined) {
          skillsArr[idx] = parseLevel(entry.proficiency_level);
        }
      }
    }
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      qualifier: u.team || u.role || 'Unknown',
      skills: skillsArr,
    };
  });

  return { people, allSkills, skillCategories, categoryNames, skillToCategory, skillIndex };
}

// ── Public composable ────────────────────────────────
export function useSkillsData() {
  const api = useApi();

  /**
   * Load skills data (API with mock fallback). Idempotent.
   */
  async function load() {
    if (loaded) return;
    loaded = true;
    state.isLoading = true;
    state.error = null;

    try {
      const data = await api.get('/api/matrix');
      const transformed = transformApiData(data);
      Object.assign(state, transformed);
      state.isLive = true;
    } catch (err) {
      console.warn('API unavailable, using mock data:', err.message);
      try {
        const mock = await import('../data.js');
        state.people = mock.people;
        state.allSkills = mock.allSkills;
        state.skillCategories = mock.skillCategories;
        state.categoryNames = mock.categoryNames;
        state.skillToCategory = mock.skillToCategory;
        state.skillIndex = mock.skillIndex;
        state.isLive = false;
      } catch (mockErr) {
        state.error = 'Failed to load skills data';
        console.error('Mock data also failed:', mockErr);
      }
    } finally {
      state.isLoading = false;
    }
  }

  /**
   * Force re-fetch from API.
   */
  async function refresh() {
    loaded = false;
    await load();
  }

  /**
   * Get a person's level for a given skill.
   */
  function getSkillLevel(person, skillName) {
    const idx = state.skillIndex[skillName];
    return idx !== undefined ? (person.skills[idx] || 0) : 0;
  }

  /**
   * Human-readable level label.
   */
  function levelLabel(val) {
    return LEVELS[val] || 'None';
  }

  return {
    ...toRefs(readonly(state)),
    levels: LEVELS,
    load,
    refresh,
    getSkillLevel,
    levelLabel,
  };
}
