const db = require('./db');
const logger = require('./logger');
const { normalizeSkillName, getCanonicalSkillInfo, suggestSkillProposal } = require('./utils/normalizeSkill');
const taxonomy = require('./data/skill-taxonomy');

/**
 * Idempotent schema migrations — safe to run on every startup.
 * Each statement uses IF NOT EXISTS / IF EXISTS guards so re-running is a no-op.
 * Add new migrations at the bottom with a comment noting the PR/date.
 */
async function runMigrations() {
  try {
    // Check if core tables exist (skip if fresh DB — init endpoint handles creation)
    const tablesCheck = await db.query(`
      SELECT COUNT(*) as count FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'users'
    `);

    if (parseInt(tablesCheck.rows[0].count) === 0) {
      logger.info('No tables found — skipping startup migrations (init endpoint will create schema)');
      return;
    }

    await db.query(`
      -- PR #79: Hierarchical skill categories
      -- Guard each table group in case of partially-initialized schemas
      DO $$ BEGIN
        IF to_regclass('public.skill_categories') IS NOT NULL THEN
          ALTER TABLE skill_categories ADD COLUMN IF NOT EXISTS parent_id INTEGER REFERENCES skill_categories(id) ON DELETE CASCADE;
          ALTER TABLE skill_categories ADD COLUMN IF NOT EXISTS level INTEGER NOT NULL DEFAULT 1;
          ALTER TABLE skill_categories ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
          CREATE INDEX IF NOT EXISTS idx_skill_categories_parent ON skill_categories(parent_id);
          CREATE UNIQUE INDEX IF NOT EXISTS idx_skill_categories_root_name
              ON skill_categories(name) WHERE parent_id IS NULL;
          CREATE UNIQUE INDEX IF NOT EXISTS idx_skill_categories_parent_name
              ON skill_categories(parent_id, name);
        END IF;
      END $$;

      DO $$ BEGIN
        IF to_regclass('public.skills') IS NOT NULL THEN
          ALTER TABLE skills ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
          ALTER TABLE skills ADD COLUMN IF NOT EXISTS preferred_label VARCHAR(255);
          ALTER TABLE skills ADD COLUMN IF NOT EXISTS concept_type VARCHAR(50);
          ALTER TABLE skills ADD COLUMN IF NOT EXISTS lifecycle_status VARCHAR(20) NOT NULL DEFAULT 'active';
          ALTER TABLE skills ADD COLUMN IF NOT EXISTS vendor_namespace VARCHAR(100);
        END IF;
      END $$;

      DO $$ BEGIN
        IF to_regclass('public.users') IS NOT NULL THEN
          ALTER TABLE users ADD COLUMN IF NOT EXISTS qualifier VARCHAR(100);
          -- PR #84: Entra ID integration — add OID column + index for existing deployments
          ALTER TABLE users ADD COLUMN IF NOT EXISTS entra_oid VARCHAR(36);
          CREATE INDEX IF NOT EXISTS idx_users_entra_oid ON users(entra_oid) WHERE entra_oid IS NOT NULL;
        END IF;
      END $$;

      CREATE TABLE IF NOT EXISTS skill_proposals (
        id SERIAL PRIMARY KEY,
        proposed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        name VARCHAR(255) NOT NULL,
        category_id INTEGER REFERENCES skill_categories(id) ON DELETE SET NULL,
        description TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
        reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        reviewed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_skill_proposals_status ON skill_proposals(status);

      DO $$ BEGIN
        IF to_regclass('public.skill_proposals') IS NOT NULL THEN
          ALTER TABLE skill_proposals ADD COLUMN IF NOT EXISTS canonical_skill_id INTEGER REFERENCES skills(id) ON DELETE SET NULL;
          ALTER TABLE skill_proposals ADD COLUMN IF NOT EXISTS suggested_action VARCHAR(20);
          ALTER TABLE skill_proposals ADD COLUMN IF NOT EXISTS confidence NUMERIC(4,3);
          ALTER TABLE skill_proposals ADD COLUMN IF NOT EXISTS review_notes TEXT;
          CREATE INDEX IF NOT EXISTS idx_skill_proposals_canonical_skill ON skill_proposals(canonical_skill_id);
        END IF;
      END $$;

      CREATE TABLE IF NOT EXISTS skill_aliases (
        id SERIAL PRIMARY KEY,
        skill_id INTEGER NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
        alias VARCHAR(255) NOT NULL,
        source VARCHAR(50) DEFAULT 'manual',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(skill_id, alias)
      );
      CREATE INDEX IF NOT EXISTS idx_skill_aliases_skill ON skill_aliases(skill_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_skill_aliases_alias_lower ON skill_aliases (LOWER(alias));

      -- Admin audit log (used by /api/admin endpoints)
      CREATE TABLE IF NOT EXISTS admin_audit_log (
        id SERIAL PRIMARY KEY,
        action VARCHAR(50) NOT NULL,
        performed_by VARCHAR(255),
        details JSONB,
        ip_address VARCHAR(45),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // PR #82: Skill categorization cleanup — dedup + assign categories
    // Guard: only run if all skill-related tables exist (partial schemas skip)
    const skillTablesCheck = await db.query(`
      SELECT
        to_regclass('public.skills') AS skills,
        to_regclass('public.user_skills') AS user_skills,
        to_regclass('public.skill_categories') AS skill_categories
    `);
    const st = skillTablesCheck.rows[0] || {};
    if (!st.skills || !st.user_skills || !st.skill_categories) {
      logger.info('One or more skill-related tables are missing — skipping skill categorization cleanup');
    } else {
      const pathToId = await ensureCategoryHierarchy();
      await cleanupSkillCategories(pathToId);
    }

    logger.info('Startup migrations applied successfully');
  } catch (err) {
    // Log but don't crash — the server can still serve cached/demo data
    // and the health check will report schema issues
    logger.error({ err }, 'Startup migrations failed');
  }
}

/**
 * Check if a table exists in the public schema.
 */
async function tableExists(tableName) {
  const result = await db.query(
    `SELECT to_regclass('public.' || $1) AS t`, [tableName]
  );
  return !!result.rows[0]?.t;
}

/**
 * Ensure the full hierarchical category tree exists.
 * Uses the tree structure from skill-taxonomy.js.
 * Resolves categories by (name, parent_id) — never by fixed IDs.
 * Returns a pathToId map for use by assignUncategorizedSkills.
 */
async function ensureCategoryHierarchy() {
  const { categoryTree, topLevelAliases } = taxonomy;
  const pathToId = new Map();
  let created = 0;

  // Helper: find-or-create a category by name + parent_id
  async function findOrCreate(name, parentId, level, sortOrder) {
    // For top-level, also check aliases (e.g., "Infra" matches "Infrastructure")
    let existing;
    if (level === 1) {
      const alias = topLevelAliases[name];
      const reverseAliases = Object.entries(topLevelAliases)
        .filter(([, canonical]) => canonical === name)
        .map(([alt]) => alt);
      const allNames = [name, ...(alias ? [alias] : []), ...reverseAliases];
      const placeholders = allNames.map((_, i) => `$${i + 1}`).join(', ');
      existing = await db.query(
        `SELECT id, name FROM skill_categories WHERE parent_id IS NULL AND name IN (${placeholders})
         ORDER BY CASE WHEN name = $1 THEN 0 ELSE 1 END`,
        allNames
      );
    } else {
      existing = await db.query(
        'SELECT id, name FROM skill_categories WHERE parent_id = $1 AND name = $2',
        [parentId, name]
      );
    }

    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      // Update level and sort_order only when they differ (avoid unnecessary writes on every startup)
      await db.query(
        'UPDATE skill_categories SET level = $1, sort_order = $2 WHERE id = $3 AND (level IS DISTINCT FROM $1 OR sort_order IS DISTINCT FROM $2)',
        [level, sortOrder, row.id]
      );
      return row.id;
    }

    // Insert new category — let PG assign the ID
    const result = await db.query(
      'INSERT INTO skill_categories (name, parent_id, level, sort_order) VALUES ($1, $2, $3, $4) RETURNING id',
      [name, parentId, level, sortOrder]
    );
    created++;
    return result.rows[0].id;
  }

  // Walk the tree: L1 → L2 → L3
  let l1Sort = 0;
  for (const [l1Name, l2Map] of Object.entries(categoryTree)) {
    l1Sort++;
    const l1Id = await findOrCreate(l1Name, null, 1, l1Sort);
    pathToId.set(l1Name, l1Id);

    let l2Sort = 0;
    for (const [l2Name, l3List] of Object.entries(l2Map)) {
      l2Sort++;
      const l2Id = await findOrCreate(l2Name, l1Id, 2, l2Sort);
      pathToId.set(`${l1Name}/${l2Name}`, l2Id);

      const l3Names = Array.isArray(l3List) ? l3List : [];
      let l3Sort = 0;
      for (const l3Name of l3Names) {
        l3Sort++;
        const l3Id = await findOrCreate(l3Name, l2Id, 3, l3Sort);
        pathToId.set(`${l1Name}/${l2Name}/${l3Name}`, l3Id);
      }
    }
  }

  if (created > 0) {
    logger.info(`Category hierarchy: created ${created} new categories (${pathToId.size} total)`);
  }

  return pathToId;
}

/**
 * Set-based merge of user_skills from one skill ID to another.
 * Uses INSERT...ON CONFLICT with GREATEST to keep the higher proficiency level.
 * Also migrates user_skills_history if the table exists.
 */
async function mergeUserSkills(keepId, removeId, hasHistory) {
  await db.query(`
    INSERT INTO user_skills (user_id, skill_id, proficiency_level)
    SELECT user_id, $1 AS skill_id, proficiency_level
    FROM user_skills
    WHERE skill_id = $2
    ON CONFLICT (user_id, skill_id)
    DO UPDATE SET proficiency_level = CASE
      WHEN regexp_replace(EXCLUDED.proficiency_level, '^L', '')::int >
           regexp_replace(user_skills.proficiency_level, '^L', '')::int
      THEN EXCLUDED.proficiency_level
      ELSE user_skills.proficiency_level
    END
  `, [keepId, removeId]);

  await db.query('DELETE FROM user_skills WHERE skill_id = $1', [removeId]);

  if (hasHistory) {
    await db.query('UPDATE user_skills_history SET skill_id = $1 WHERE skill_id = $2', [keepId, removeId]);
  }
}

/**
 * Re-point skill_relationships from one skill ID to another, then clean up leftovers.
 * Avoids creating duplicate or self-referential relationship rows.
 */
async function repointRelationships(keepId, removeId) {
  // Remove any direct relationship between the two skills (would become self-referential)
  await db.query(
    'DELETE FROM skill_relationships WHERE (parent_skill_id = $1 AND child_skill_id = $2) OR (parent_skill_id = $2 AND child_skill_id = $1)',
    [keepId, removeId]
  );

  // Re-point parent_skill_id, skipping rows that would create duplicates
  await db.query(`
    UPDATE skill_relationships sr
    SET parent_skill_id = $1
    WHERE sr.parent_skill_id = $2
      AND NOT EXISTS (
        SELECT 1 FROM skill_relationships s2
        WHERE s2.parent_skill_id = $1 AND s2.child_skill_id = sr.child_skill_id
      )
  `, [keepId, removeId]);

  // Re-point child_skill_id, skipping rows that would create duplicates
  await db.query(`
    UPDATE skill_relationships sr
    SET child_skill_id = $1
    WHERE sr.child_skill_id = $2
      AND NOT EXISTS (
        SELECT 1 FROM skill_relationships s2
        WHERE s2.parent_skill_id = sr.parent_skill_id AND s2.child_skill_id = $1
      )
  `, [keepId, removeId]);

  // Delete any remaining references (now-redundant duplicates)
  await db.query(
    'DELETE FROM skill_relationships WHERE parent_skill_id = $1 OR child_skill_id = $1',
    [removeId]
  );
}

/**
 * Idempotent skill cleanup migration:
 * 1. Ensure "Soft Skills" top-level category exists with its 8 skills
 * 2. Merge duplicate skills (dedup suffix variants → canonical name)
 * 3. Assign categories to any remaining uncategorized skills
 * 4. Sync canonical labels/metadata and alias records
 * 5. Surface review-required labels through the existing proposal queue
 * 6. Add unique index on skills.name to prevent future duplicates
 */
async function cleanupSkillCategories(pathToId) {
  // Cache table existence for optional tables (may not exist on older schemas)
  const hasHistory = await tableExists('user_skills_history');
  const hasRelationships = await tableExists('skill_relationships');

  // Step 1: Ensure "Soft Skills" category and skills exist
  await ensureSoftSkills();

  // Step 2: Merge duplicate skills created by Excel pivot dedup suffixes
  await mergeDuplicateSkills(hasHistory, hasRelationships);

  // Step 2b: Merge exact-name duplicates (same literal name, different IDs)
  await mergeExactNameDuplicates(hasHistory, hasRelationships);

  // Step 3: Assign categories to uncategorized skills by name-matching
  await assignUncategorizedSkills(pathToId);

  // Step 4: Sync display/governance metadata and alias registry
  await syncCanonicalSkillMetadata();
  await syncSkillAliases();

  // Step 5: Surface ambiguous terms for explicit approval
  await flagReviewRequiredSkills();

  // Step 6: Add unique index (only works after duplicates are resolved)
  await addSkillNameUniqueIndex();
}

/**
 * Ensure the "Soft Skills" top-level category and its 8 skills exist.
 */
async function ensureSoftSkills() {
  const softSkills = taxonomy.softSkills || [];
  if (softSkills.length === 0) return;

  // Upsert the top-level category
  let catResult = await db.query(
    'SELECT id FROM skill_categories WHERE name = $1 AND parent_id IS NULL',
    ['Soft Skills']
  );

  let catId;
  if (catResult.rows.length > 0) {
    catId = catResult.rows[0].id;
  } else {
    const maxSort = await db.query(
      'SELECT COALESCE(MAX(sort_order), 0) + 1 as next FROM skill_categories WHERE parent_id IS NULL'
    );
    catResult = await db.query(
      `INSERT INTO skill_categories (name, parent_id, level, sort_order, description)
       VALUES ($1, NULL, 1, $2, 'Communication, presentation, and interpersonal skills')
       RETURNING id`,
      ['Soft Skills', maxSort.rows[0].next]
    );
    catId = catResult.rows[0].id;
    logger.info('Created "Soft Skills" top-level category');
  }

  // Upsert each soft skill — force category to Soft Skills regardless of current assignment
  for (let i = 0; i < softSkills.length; i++) {
    const name = softSkills[i];
    const existing = await db.query('SELECT id, category_id FROM skills WHERE name = $1', [name]);
    if (existing.rows.length === 0) {
      await db.query(
        'INSERT INTO skills (name, category_id, sort_order) VALUES ($1, $2, $3)',
        [name, catId, i + 1]
      );
    } else if (existing.rows[0].category_id !== catId) {
      await db.query(
        'UPDATE skills SET category_id = $1, sort_order = $2 WHERE id = $3',
        [catId, i + 1, existing.rows[0].id]
      );
    }
  }
}

/**
 * Merge duplicate skills created by Excel pivot dedup suffixes.
 * For each known alias, move user_skills to the canonical skill and delete the duplicate.
 */
async function mergeDuplicateSkills(hasHistory, hasRelationships) {
  const combinedAliases = taxonomy.aliases || {};

  for (const [aliasName, canonicalName] of Object.entries(combinedAliases)) {
    const aliasResult = await db.query('SELECT id FROM skills WHERE name = $1', [aliasName]);
    if (aliasResult.rows.length === 0) continue;

    const canonicalResult = await db.query('SELECT id FROM skills WHERE name = $1', [canonicalName]);
    if (canonicalResult.rows.length === 0) continue;

    const aliasId = aliasResult.rows[0].id;
    const canonicalId = canonicalResult.rows[0].id;
    if (aliasId === canonicalId) continue;

    // Set-based merge of user_skills (MAX proficiency wins)
    await mergeUserSkills(canonicalId, aliasId, hasHistory);

    // Re-point relationships to canonical skill before deleting
    if (hasRelationships) {
      await repointRelationships(canonicalId, aliasId);
    }
    await db.query('DELETE FROM skills WHERE id = $1', [aliasId]);

    logger.info(`Merged duplicate skill "${aliasName}" → "${canonicalName}"`);
  }

  // Also find any remaining skills with trailing digits that match a canonical skill
  const allSkills = await db.query('SELECT id, name FROM skills ORDER BY id');
  for (const skill of allSkills.rows) {
    const normalized = normalizeSkillName(skill.name);
    if (normalized === skill.name) continue;

    const canonical = await db.query('SELECT id FROM skills WHERE name = $1 AND id != $2', [normalized, skill.id]);
    if (canonical.rows.length === 0) continue;

    const canonicalId = canonical.rows[0].id;

    // Set-based merge of user_skills (MAX proficiency wins)
    await mergeUserSkills(canonicalId, skill.id, hasHistory);

    // Re-point relationships to canonical skill before deleting
    if (hasRelationships) {
      await repointRelationships(canonicalId, skill.id);
    }
    await db.query('DELETE FROM skills WHERE id = $1', [skill.id]);

    logger.info(`Merged duplicate skill "${skill.name}" (id=${skill.id}) → "${normalized}" (id=${canonicalId})`);
  }
}

/**
 * Merge skills with the exact same name but different IDs.
 * Keeps the lowest ID (oldest), merges user_skills with MAX proficiency, deletes others.
 */
async function mergeExactNameDuplicates(hasHistory, hasRelationships) {
  const dupes = await db.query(`
    SELECT name, array_agg(id ORDER BY id) as ids
    FROM skills GROUP BY name HAVING COUNT(*) > 1
  `);

  for (const row of dupes.rows) {
    const [keepId, ...removeIds] = row.ids;

    for (const removeId of removeIds) {
      // If the kept skill is uncategorized but the duplicate has a category, take it
      const keepSkill = await db.query('SELECT category_id FROM skills WHERE id = $1', [keepId]);
      const removeSkill = await db.query('SELECT category_id FROM skills WHERE id = $1', [removeId]);
      if (!keepSkill.rows[0].category_id && removeSkill.rows[0]?.category_id) {
        await db.query('UPDATE skills SET category_id = $1 WHERE id = $2', [removeSkill.rows[0].category_id, keepId]);
      }

      // Set-based merge of user_skills (MAX proficiency wins)
      await mergeUserSkills(keepId, removeId, hasHistory);

      // Re-point relationships to kept skill before deleting
      if (hasRelationships) {
        await repointRelationships(keepId, removeId);
      }
      await db.query('DELETE FROM skills WHERE id = $1', [removeId]);

      logger.info(`Merged exact-name duplicate "${row.name}" (id=${removeId}) → (id=${keepId})`);
    }
  }
}

/**
 * Backfill canonical metadata onto existing skills so the UI can prefer
 * official Microsoft product naming without renaming the DB identity.
 */
async function syncCanonicalSkillMetadata() {
  const knownNames = new Set([
    ...Object.keys(taxonomy.skillCategoryMap || {}),
    ...Object.keys(taxonomy.skillMetadata || {}),
  ]);

  // Build reverse alias map: canonical name → [import names that alias to it]
  const reverseAliases = {};
  for (const [alias, canonical] of Object.entries(taxonomy.aliases || {})) {
    if (!reverseAliases[canonical]) reverseAliases[canonical] = [];
    reverseAliases[canonical].push(alias);
  }

  for (const skillName of knownNames) {
    const info = getCanonicalSkillInfo(skillName);
    // Try the canonical name first, then any import aliases that resolve to it
    const namesToTry = [skillName, ...(reverseAliases[skillName] || [])];

    for (const dbName of namesToTry) {
      await db.query(
        `UPDATE skills
         SET preferred_label = $1,
             concept_type = COALESCE($2, concept_type),
             lifecycle_status = COALESCE($3, lifecycle_status),
             vendor_namespace = COALESCE($4, vendor_namespace)
         WHERE name = $5
           AND (
             preferred_label IS DISTINCT FROM $1 OR
             concept_type IS DISTINCT FROM COALESCE($2, concept_type) OR
             lifecycle_status IS DISTINCT FROM COALESCE($3, lifecycle_status) OR
             vendor_namespace IS DISTINCT FROM COALESCE($4, vendor_namespace)
           )`,
        [
          info.preferredLabel,
          info.conceptType,
          info.lifecycleStatus,
          info.vendorNamespace,
          dbName,
        ]
      );
    }
  }

  // Every skill should have a display label, even when no explicit metadata exists yet.
  await db.query(
    'UPDATE skills SET preferred_label = name WHERE preferred_label IS NULL'
  );
}

/**
 * Persist the approved alias registry so future proposal review can show
 * canonical suggestions and external systems can inspect the mapping.
 */
async function syncSkillAliases() {
  for (const [alias, canonicalName] of Object.entries(taxonomy.aliases || {})) {
    const canonical = await db.query('SELECT id FROM skills WHERE name = $1', [canonicalName]);
    if (canonical.rows.length === 0) continue;

    await db.query(
      `INSERT INTO skill_aliases (skill_id, alias, source)
       SELECT $1::int, $2::varchar, $3::varchar
       WHERE NOT EXISTS (
         SELECT 1 FROM skill_aliases WHERE LOWER(alias) = LOWER($2::varchar)
       )`,
      [canonical.rows[0].id, alias, 'taxonomy']
    );
  }

  for (const [skillName, meta] of Object.entries(taxonomy.skillMetadata || {})) {
    if (!meta.preferredLabel || meta.preferredLabel === skillName) continue;

    const canonical = await db.query('SELECT id FROM skills WHERE name = $1', [skillName]);
    if (canonical.rows.length === 0) continue;

    await db.query(
      `INSERT INTO skill_aliases (skill_id, alias, source)
       SELECT $1::int, $2::varchar, $3::varchar
       WHERE NOT EXISTS (
         SELECT 1 FROM skill_aliases WHERE LOWER(alias) = LOWER($2::varchar)
       )`,
      [canonical.rows[0].id, meta.preferredLabel, 'preferred-label']
    );
  }
}

/**
 * Seed pending proposals for labels we explicitly do not want to auto-merge.
 */
async function flagReviewRequiredSkills() {
  for (const [skillName, reviewHint] of Object.entries(taxonomy.reviewRequired || {})) {
    const existingSkill = await db.query(
      'SELECT id, category_id FROM skills WHERE name = $1 LIMIT 1',
      [skillName]
    );
    if (existingSkill.rows.length === 0) continue;

    const suggestion = suggestSkillProposal(skillName);
    let canonicalSkillId = null;
    if (suggestion.canonicalName && suggestion.canonicalName !== skillName) {
      const canonical = await db.query(
        'SELECT id FROM skills WHERE name = $1 LIMIT 1',
        [suggestion.canonicalName]
      );
      canonicalSkillId = canonical.rows[0]?.id || null;
    }

    await db.query(
      `INSERT INTO skill_proposals (
         proposed_by,
         name,
         category_id,
         description,
         canonical_skill_id,
         suggested_action,
         confidence,
         review_notes
       )
       SELECT NULL, $1::varchar, $2::int, $3::text, $4::int, $5::varchar, $6::numeric, $7::text
       WHERE NOT EXISTS (
         SELECT 1 FROM skill_proposals
         WHERE LOWER(name) = LOWER($1::varchar)
       )`,
      [
        skillName,
        existingSkill.rows[0].category_id || null,
        'Imported label requires taxonomy review before consolidation.',
        canonicalSkillId,
        reviewHint.suggestedAction || suggestion.suggestedAction || 'review',
        reviewHint.confidence ?? suggestion.confidence ?? null,
        reviewHint.reviewNotes || suggestion.reviewNotes || null,
      ]
    );
  }
}

/**
 * Assign categories to uncategorized skills using:
 *  1. Taxonomy path lookup (primary — skill name → category path → DB id)
 *  2. Alias resolution (SharePoint ↔ seed name variants)
 *  3. Copy from same-name skill that already has a category
 *  4. Partial match heuristic (fallback — SQL ILIKE against category names)
 */
async function assignUncategorizedSkills(pathToId) {
  const uncategorized = await db.query(
    'SELECT id, name FROM skills WHERE category_id IS NULL'
  );

  if (uncategorized.rows.length === 0) return;

  logger.info(`Found ${uncategorized.rows.length} uncategorized skills to fix`);

  const { skillCategoryMap, aliases, topLevelAliases } = taxonomy;

  // Build a combined skill name (lowercase) → category path lookup
  const mapLookup = new Map();
  for (const [skillName, catPath] of Object.entries(skillCategoryMap)) {
    mapLookup.set(skillName.toLowerCase(), catPath);
  }
  // Add aliases so both directions work
  for (const [alt, canonical] of Object.entries(aliases)) {
    const catPath = skillCategoryMap[canonical] || skillCategoryMap[alt];
    if (catPath) {
      mapLookup.set(alt.toLowerCase(), catPath);
      mapLookup.set(canonical.toLowerCase(), catPath);
    }
  }

  // Resolve a category path to a DB id, handling top-level aliases
  function resolvePathToId(catPath) {
    // Direct lookup
    let id = pathToId.get(catPath);
    if (id) return id;

    // Try with top-level alias (e.g., "Infra/..." when prod has "Infrastructure/...")
    const parts = catPath.split('/');
    const l1 = parts[0];
    for (const [prodName, canonical] of Object.entries(topLevelAliases)) {
      if (canonical === l1) {
        const altPath = [prodName, ...parts.slice(1)].join('/');
        id = pathToId.get(altPath);
        if (id) return id;
      }
    }
    if (topLevelAliases[l1]) {
      const altPath = [topLevelAliases[l1], ...parts.slice(1)].join('/');
      id = pathToId.get(altPath);
      if (id) return id;
    }
    return null;
  }

  let mapFixed = 0;
  let heuristicFixed = 0;

  for (const skill of uncategorized.rows) {
    // Strategy 1: Taxonomy path lookup
    const catPath = mapLookup.get(skill.name.toLowerCase());
    if (catPath) {
      const catId = resolvePathToId(catPath);
      if (catId) {
        await db.query('UPDATE skills SET category_id = $1 WHERE id = $2', [catId, skill.id]);
        mapFixed++;
        continue;
      }
    }

    // Strategy 2: Alias resolution — normalize name and try again
    const normalized = normalizeSkillName(skill.name);
    if (normalized !== skill.name) {
      const aliasedPath = mapLookup.get(normalized.toLowerCase());
      if (aliasedPath) {
        const catId = resolvePathToId(aliasedPath);
        if (catId) {
          await db.query('UPDATE skills SET category_id = $1 WHERE id = $2', [catId, skill.id]);
          mapFixed++;
          continue;
        }
      }
    }

    // Strategy 3: Copy category from another skill with the same normalized name
    const nameMatch = await db.query(
      'SELECT category_id FROM skills WHERE name = $1 AND category_id IS NOT NULL AND id != $2 LIMIT 1',
      [normalized, skill.id]
    );
    if (nameMatch.rows.length > 0) {
      await db.query('UPDATE skills SET category_id = $1 WHERE id = $2', [nameMatch.rows[0].category_id, skill.id]);
      heuristicFixed++;
      continue;
    }

    // Strategy 4: Partial match against category names
    const partialMatch = await db.query(`
      SELECT sc.id as category_id, sc.name, sc.level
      FROM skill_categories sc
      WHERE $1 ILIKE '%' || sc.name || '%' AND sc.level >= 2
        AND NOT EXISTS (
          SELECT 1 FROM skill_categories sc2
          WHERE sc2.name = sc.name AND sc2.id <> sc.id
        )
      ORDER BY sc.level DESC, length(sc.name) DESC
      LIMIT 1
    `, [skill.name]);

    if (partialMatch.rows.length > 0) {
      await db.query('UPDATE skills SET category_id = $1 WHERE id = $2', [partialMatch.rows[0].category_id, skill.id]);
      heuristicFixed++;
    }
  }

  if (mapFixed > 0 || heuristicFixed > 0) {
    logger.info(`Categorized skills: ${mapFixed} by taxonomy map, ${heuristicFixed} by heuristic`);
  }

  // Log remaining uncategorized (cap sample to avoid oversized log lines)
  const remaining = await db.query('SELECT name FROM skills WHERE category_id IS NULL');
  if (remaining.rows.length > 0) {
    const sampleLimit = 20;
    const sample = remaining.rows.slice(0, sampleLimit).map(r => r.name);
    logger.warn(`${remaining.rows.length} skills still uncategorized (showing up to ${sampleLimit}): ${sample.join(', ')}`);
  }
}

/**
 * Add unique index on skills.name — prevents future duplicates.
 * Only succeeds if no duplicates remain (safe guard).
 */
async function addSkillNameUniqueIndex() {
  try {
    await db.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_skills_name ON skills(name)');
  } catch (err) {
    // Duplicates still exist — log but don't crash
    if (err.code === '23505') {
      logger.warn('Cannot add unique index on skills.name — duplicates still exist');
    } else {
      throw err;
    }
  }
}

module.exports = { runMigrations };
