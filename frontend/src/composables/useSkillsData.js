/**
 * Singleton composable — reactive skills matrix data.
 * Tries to load from /api/matrix; falls back to static mock data.
 */
import { reactive, toRefs, readonly } from 'vue';
import { compareText } from '../utils/textSort';
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
  skillCatalog: [],
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

function getSkillDisplayName(skill) {
  return skill?.preferred_label || skill?.name;
}

function comparePathSegments(aParts = [], bParts = []) {
  const maxLength = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < maxLength; i++) {
    const aPart = aParts[i];
    const bPart = bParts[i];
    if (aPart === undefined && bPart === undefined) return 0;
    if (aPart === undefined) return -1;
    if (bPart === undefined) return 1;

    const comparison = compareText(aPart, bPart);
    if (comparison !== 0) return comparison;
  }

  return 0;
}

function cloneAndSortCategoryTree(nodes = []) {
  return [...nodes]
    .map((node) => ({
      ...node,
      children: cloneAndSortCategoryTree(node.children || []),
    }))
    .sort((a, b) => compareText(a.name, b.name));
}

function buildSkillRecord({
  id = null,
  rawName,
  displayName,
  categoryId = null,
  categoryPathNames = [],
  conceptType = null,
  lifecycleStatus = 'active',
  vendorNamespace = null,
}) {
  const normalizedPathNames = categoryPathNames.length > 0 ? categoryPathNames : ['Uncategorized'];
  const [topLevelCategory = 'Uncategorized'] = normalizedPathNames;
  const groupPathNames = normalizedPathNames.slice(1);

  return {
    id,
    name: displayName,
    rawName,
    categoryId,
    categoryPath: normalizedPathNames.join(' > '),
    categoryPathNames: normalizedPathNames,
    topLevelCategory,
    groupPathNames,
    groupLabel: groupPathNames.join(' > '),
    domain: groupPathNames[0] || null,
    subdomain: groupPathNames[1] || null,
    conceptType,
    lifecycleStatus,
    vendorNamespace,
  };
}

function buildSkillCatalog(skills) {
  return skills
    .map((skill) => {
      const categoryPathNames = Array.isArray(skill?.categoryPathNames)
        ? skill.categoryPathNames
        : typeof skill?.categoryPath === 'string'
          ? skill.categoryPath.split(' > ').map((part) => part.trim()).filter(Boolean)
          : typeof skill?.category_path === 'string'
            ? skill.category_path.split(' > ').map((part) => part.trim()).filter(Boolean)
            : [];

      return buildSkillRecord({
        id: skill?.id ?? null,
        rawName: skill?.name ?? getSkillDisplayName(skill),
        displayName: getSkillDisplayName(skill),
        categoryId: skill?.category_id ?? null,
        categoryPathNames,
        conceptType: skill?.concept_type ?? null,
        lifecycleStatus: skill?.lifecycle_status ?? 'active',
        vendorNamespace: skill?.vendor_namespace ?? null,
      })
    })
    .sort((a, b) => {
      const pathComparison = comparePathSegments(a.categoryPathNames, b.categoryPathNames);
      if (pathComparison !== 0) return pathComparison;
      return compareText(a.name, b.name);
    });
}

function buildFlatCategories(skillCatalog) {
  const flatCategories = new Map();

  for (const skill of skillCatalog) {
    const categoryName = skill.topLevelCategory || 'Uncategorized';
    if (!flatCategories.has(categoryName)) flatCategories.set(categoryName, []);
    flatCategories.get(categoryName).push(skill.name);
  }

  const categoryNames = [...flatCategories.keys()].sort(compareText);
  const skillCategories = Object.fromEntries(
    categoryNames.map((categoryName) => [
      categoryName,
      [...flatCategories.get(categoryName)].sort(compareText),
    ])
  );

  return {
    skillCategories,
    categoryNames,
  };
}

/**
 * Transform API response → internal format matching data.js exports.
 */
function transformApiData(apiData) {
  const { users, skills, userSkills, categories: categoryTree = [] } = apiData;
  const sortedCategoryTree = cloneAndSortCategoryTree(categoryTree);
  const skillCatalog = buildSkillCatalog(skills);
  const { skillCategories, categoryNames } = buildFlatCategories(skillCatalog);
  const allSkills = skillCatalog.map((skill) => skill.name);
  const skillToCategory = Object.fromEntries(
    skillCatalog.map((skill) => [skill.name, skill.topLevelCategory || 'Uncategorized'])
  );

  const skillIndex = {};
  allSkills.forEach((name, i) => {
    skillIndex[name] = i;
  });

  // Build skill ID → index map for user skills lookup
  const skillIdToIndex = {};
  for (const skill of skills) {
    const idx = skillIndex[getSkillDisplayName(skill)];
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
    const displayName = getSkillDisplayName(skill);
    skillNameToId[displayName] = skill.id;
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
  flattenCatTree(sortedCategoryTree);

  const skillAncestorIds = {};
  for (const skill of skills) {
    const ancestors = [];
    let cur = skill.category_id ? flatCatMap.get(skill.category_id) : null;
    while (cur) {
      ancestors.push(cur.id);
      cur = cur.parent_id ? flatCatMap.get(cur.parent_id) : null;
    }
    const displayName = getSkillDisplayName(skill);
    skillAncestorIds[displayName] = ancestors;
    skillAncestorIds[skill.name] = ancestors;
  }

  return {
    people,
    allSkills,
    skillCatalog,
    skillCategories,
    categoryNames,
    skillToCategory,
    skillIndex,
    skillNameToId,
    categoryTree: sortedCategoryTree,
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
      // Fall back to mock data when the API is unreachable, and also during
      // local development when the backend proxy returns a 5xx because the API
      // or database is not running. Auth/permission errors should still surface.
      const message = err.message || '';
      const statusMatch = message.match(/\((\d{3})\)/);
      const statusCode = statusMatch ? Number(statusMatch[1]) : null;
      const shouldUseMockData = statusCode === null || (import.meta.env.DEV && statusCode >= 500);

      if (shouldUseMockData) {
        console.warn('API unavailable — no mock fallback. Start the backend to use the app.');
        state.error = 'API unavailable. Please ensure the backend is running.';
        state.isLive = false;
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
   * Update one skill level for one person in shared state.
   * Replaces both the nested skills array and the top-level people array so
   * downstream chart views recompute from a fresh reactive reference.
   */
  function updatePersonSkillLevel(personId, skillName, nextLevel) {
    const skillIdx = state.skillIndex[skillName];
    if (skillIdx === undefined) return false;

    const personIdx = state.people.findIndex((person) => person.id === personId);
    if (personIdx === -1) return false;

    const person = state.people[personIdx];
    if (!Array.isArray(person.skills) || skillIdx >= person.skills.length) return false;

    const updatedSkills = [...person.skills];
    updatedSkills[skillIdx] = parseLevel(nextLevel);

    const updatedPeople = [...state.people];
    updatedPeople[personIdx] = {
      ...person,
      skills: updatedSkills,
    };

    state.people = updatedPeople;
    return true;
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
    updatePersonSkillLevel,
  };
}
