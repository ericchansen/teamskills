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
  skillNameToId: {},
  categoryTree: [],
  skillAncestorIds: {},
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
 * Collect all skill names from the category tree in hierarchy order.
 */
function collectSkillsFromTree(categoryTree, skills) {
  const catSkills = new Map();
  for (const skill of skills) {
    if (!skill.category_id) continue;
    if (!catSkills.has(skill.category_id)) catSkills.set(skill.category_id, []);
    catSkills.get(skill.category_id).push(skill.name);
  }

  const result = [];
  function walk(node) {
    // Push any skills directly assigned to this node first
    const names = catSkills.get(node.id) || [];
    if (names.length > 0) result.push(...names);
    // Then recurse into children
    if (node.children && node.children.length > 0) {
      for (const child of node.children) walk(child);
    }
  }
  for (const role of categoryTree) walk(role);

  // Append any uncategorized skills
  const inTree = new Set(result);
  for (const skill of skills) {
    if (!inTree.has(skill.name)) result.push(skill.name);
  }
  return result;
}

/**
 * Build skill -> top-level role mapping for backward compat.
 */
function buildSkillToCategory(categoryTree, skills) {
  const catToRoot = new Map();
  function mapToRoot(node, rootName) {
    catToRoot.set(node.id, rootName);
    if (node.children) {
      for (const child of node.children) mapToRoot(child, rootName);
    }
  }
  for (const role of categoryTree) mapToRoot(role, role.name);

  const result = {};
  for (const skill of skills) {
    result[skill.name] = catToRoot.get(skill.category_id) || 'Uncategorized';
  }
  return result;
}

/**
 * Transform API response → internal format matching data.js exports.
 */
function transformApiData(apiData) {
  const { users, skills, userSkills, categories: categoryTree = [] } = apiData;

  // Backward-compat flat skillCategories: top-level role -> flat list of skills
  const skillToCat = buildSkillToCategory(categoryTree, skills);
  const flatCategories = new Map();
  for (const skill of skills) {
    const cat = skillToCat[skill.name] || 'Uncategorized';
    if (!flatCategories.has(cat)) flatCategories.set(cat, []);
    flatCategories.get(cat).push(skill.name);
  }

  const skillCategories = Object.fromEntries(flatCategories);
  const categoryNames = [...flatCategories.keys()];

  // Use tree-ordered skill list for consistent column ordering
  const allSkills = collectSkillsFromTree(categoryTree, skills);

  const skillToCategory = skillToCat;

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
      qualifier: u.qualifier || u.team || u.role || 'Unknown',
      skills: skillsArr,
    };
  });

  // Build skill name → backend ID map for save operations
  const skillNameToId = {};
  for (const skill of skills) {
    skillNameToId[skill.name] = skill.id;
  }

  // Build skillAncestorIds: skill name -> array of all ancestor category IDs
  // (includes the skill's own category and all parents up to the root)
  const flatCatMap = new Map();
  function flattenCatTree(nodes) {
    for (const n of nodes) {
      flatCatMap.set(n.id, n);
      if (n.children) flattenCatTree(n.children);
    }
  }
  flattenCatTree(categoryTree);

  const skillAncestorIds = {};
  for (const skill of skills) {
    const ancestors = [];
    let cur = skill.category_id ? flatCatMap.get(skill.category_id) : null;
    while (cur) {
      ancestors.push(cur.id);
      cur = cur.parent_id ? flatCatMap.get(cur.parent_id) : null;
    }
    skillAncestorIds[skill.name] = ancestors;
  }

  return {
    people,
    allSkills,
    skillCategories,
    categoryNames,
    skillToCategory,
    skillIndex,
    skillNameToId,
    categoryTree,
    skillAncestorIds,
  };
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
      // Only fall back to mock data for network errors (offline/dev).
      // Auth (401/403) and server (5xx) errors should surface to the user.
      const isNetworkError = !err.message?.includes('(4') && !err.message?.includes('(5');
      if (isNetworkError) {
        console.warn('API unavailable (network), using mock data:', err.message);
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
      } else {
        console.error('API error:', err.message);
        state.error = err.message;
        state.isLive = false;
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
