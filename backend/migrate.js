const db = require('./db');
const logger = require('./logger');
const { normalizeSkillName } = require('./utils/normalizeSkill');
const nameMap = require('./data/skill-name-map.json');

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
        END IF;
      END $$;

      DO $$ BEGIN
        IF to_regclass('public.users') IS NOT NULL THEN
          ALTER TABLE users ADD COLUMN IF NOT EXISTS qualifier VARCHAR(100);
        END IF;
      END $$;

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
    await cleanupSkillCategories();

    logger.info('Startup migrations applied successfully');
  } catch (err) {
    // Log but don't crash — the server can still serve cached/demo data
    // and the health check will report schema issues
    logger.error({ err }, 'Startup migrations failed');
  }
}

/**
 * Idempotent skill cleanup migration:
 * 1. Ensure "Soft Skills" top-level category exists with its 8 skills
 * 2. Merge duplicate skills (dedup suffix variants → canonical name)
 * 3. Assign categories to any remaining uncategorized skills
 * 4. Add unique index on skills.name to prevent future duplicates
 */
async function cleanupSkillCategories() {
  // Step 1: Ensure "Soft Skills" category and skills exist
  await ensureSoftSkills();

  // Step 2: Merge duplicate skills created by Excel pivot dedup suffixes
  await mergeDuplicateSkills();

  // Step 2b: Merge exact-name duplicates (same literal name, different IDs)
  await mergeExactNameDuplicates();

  // Step 3: Assign categories to uncategorized skills by name-matching
  await assignUncategorizedSkills();

  // Step 4: Add unique index (only works after duplicates are resolved)
  await addSkillNameUniqueIndex();
}

/**
 * Ensure the "Soft Skills" top-level category and its 8 skills exist.
 */
async function ensureSoftSkills() {
  const softSkills = nameMap.softSkills || [];
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

  // Upsert each soft skill
  for (let i = 0; i < softSkills.length; i++) {
    const name = softSkills[i];
    const existing = await db.query('SELECT id, category_id FROM skills WHERE name = $1', [name]);
    if (existing.rows.length === 0) {
      await db.query(
        'INSERT INTO skills (name, category_id, sort_order) VALUES ($1, $2, $3)',
        [name, catId, i + 1]
      );
    } else if (existing.rows[0].category_id === null) {
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
async function mergeDuplicateSkills() {
  const aliases = nameMap.aliases || {};

  for (const [aliasName, canonicalName] of Object.entries(aliases)) {
    const aliasResult = await db.query('SELECT id FROM skills WHERE name = $1', [aliasName]);
    if (aliasResult.rows.length === 0) continue;

    const canonicalResult = await db.query('SELECT id FROM skills WHERE name = $1', [canonicalName]);
    if (canonicalResult.rows.length === 0) continue;

    const aliasId = aliasResult.rows[0].id;
    const canonicalId = canonicalResult.rows[0].id;
    if (aliasId === canonicalId) continue;

    // Move user_skills: for each user_skill pointing to the alias,
    // keep the MAX proficiency between alias and canonical
    const aliasUserSkills = await db.query(
      'SELECT user_id, proficiency_level FROM user_skills WHERE skill_id = $1',
      [aliasId]
    );

    for (const row of aliasUserSkills.rows) {
      const existing = await db.query(
        'SELECT proficiency_level FROM user_skills WHERE user_id = $1 AND skill_id = $2',
        [row.user_id, canonicalId]
      );

      const aliasNum = parseInt(row.proficiency_level.replace('L', ''), 10);

      if (existing.rows.length > 0) {
        const canonicalNum = parseInt(existing.rows[0].proficiency_level.replace('L', ''), 10);
        if (aliasNum > canonicalNum) {
          await db.query(
            'UPDATE user_skills SET proficiency_level = $1 WHERE user_id = $2 AND skill_id = $3',
            [row.proficiency_level, row.user_id, canonicalId]
          );
        }
      } else {
        await db.query(
          'INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES ($1, $2, $3)',
          [row.user_id, canonicalId, row.proficiency_level]
        );
      }
    }

    // Also move history records
    await db.query(
      'UPDATE user_skills_history SET skill_id = $1 WHERE skill_id = $2',
      [canonicalId, aliasId]
    );

    // Delete the alias user_skills and the alias skill
    await db.query('DELETE FROM user_skills WHERE skill_id = $1', [aliasId]);
    await db.query('DELETE FROM skill_relationships WHERE parent_skill_id = $1 OR child_skill_id = $1', [aliasId]);
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

    // Same merge logic as above
    const dupeSkills = await db.query(
      'SELECT user_id, proficiency_level FROM user_skills WHERE skill_id = $1',
      [skill.id]
    );

    for (const row of dupeSkills.rows) {
      const existing = await db.query(
        'SELECT proficiency_level FROM user_skills WHERE user_id = $1 AND skill_id = $2',
        [row.user_id, canonicalId]
      );

      const dupeNum = parseInt(row.proficiency_level.replace('L', ''), 10);
      if (existing.rows.length > 0) {
        const canonicalNum = parseInt(existing.rows[0].proficiency_level.replace('L', ''), 10);
        if (dupeNum > canonicalNum) {
          await db.query(
            'UPDATE user_skills SET proficiency_level = $1 WHERE user_id = $2 AND skill_id = $3',
            [row.proficiency_level, row.user_id, canonicalId]
          );
        }
      } else {
        await db.query(
          'INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES ($1, $2, $3)',
          [row.user_id, canonicalId, row.proficiency_level]
        );
      }
    }

    await db.query('UPDATE user_skills_history SET skill_id = $1 WHERE skill_id = $2', [canonicalId, skill.id]);
    await db.query('DELETE FROM user_skills WHERE skill_id = $1', [skill.id]);
    await db.query('DELETE FROM skill_relationships WHERE parent_skill_id = $1 OR child_skill_id = $1', [skill.id]);
    await db.query('DELETE FROM skills WHERE id = $1', [skill.id]);

    logger.info(`Merged duplicate skill "${skill.name}" (id=${skill.id}) → "${normalized}" (id=${canonicalId})`);
  }
}

/**
 * Merge skills with the exact same name but different IDs.
 * Keeps the lowest ID (oldest), merges user_skills with MAX proficiency, deletes others.
 */
async function mergeExactNameDuplicates() {
  const dupes = await db.query(`
    SELECT name, array_agg(id ORDER BY id) as ids
    FROM skills GROUP BY name HAVING COUNT(*) > 1
  `);

  for (const row of dupes.rows) {
    const [keepId, ...removeIds] = row.ids;

    for (const removeId of removeIds) {
      const removeSkills = await db.query(
        'SELECT user_id, proficiency_level FROM user_skills WHERE skill_id = $1',
        [removeId]
      );

      for (const us of removeSkills.rows) {
        const existing = await db.query(
          'SELECT proficiency_level FROM user_skills WHERE user_id = $1 AND skill_id = $2',
          [us.user_id, keepId]
        );

        const removeNum = parseInt(us.proficiency_level.replace('L', ''), 10);
        if (existing.rows.length > 0) {
          const keepNum = parseInt(existing.rows[0].proficiency_level.replace('L', ''), 10);
          if (removeNum > keepNum) {
            await db.query(
              'UPDATE user_skills SET proficiency_level = $1 WHERE user_id = $2 AND skill_id = $3',
              [us.proficiency_level, us.user_id, keepId]
            );
          }
        } else {
          await db.query(
            'INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES ($1, $2, $3)',
            [us.user_id, keepId, us.proficiency_level]
          );
        }
      }

      // If the kept skill is uncategorized but the duplicate has a category, take it
      const keepSkill = await db.query('SELECT category_id FROM skills WHERE id = $1', [keepId]);
      const removeSkill = await db.query('SELECT category_id FROM skills WHERE id = $1', [removeId]);
      if (!keepSkill.rows[0].category_id && removeSkill.rows[0]?.category_id) {
        await db.query('UPDATE skills SET category_id = $1 WHERE id = $2', [removeSkill.rows[0].category_id, keepId]);
      }

      await db.query('UPDATE user_skills_history SET skill_id = $1 WHERE skill_id = $2', [keepId, removeId]);
      await db.query('DELETE FROM user_skills WHERE skill_id = $1', [removeId]);
      await db.query('DELETE FROM skill_relationships WHERE parent_skill_id = $1 OR child_skill_id = $1', [removeId]);
      await db.query('DELETE FROM skills WHERE id = $1', [removeId]);

      logger.info(`Merged exact-name duplicate "${row.name}" (id=${removeId}) → (id=${keepId})`);
    }
  }
}

/**
 * Assign categories to uncategorized skills by matching against existing categorized skills.
 * Falls back to name-based heuristics for common patterns.
 */
async function assignUncategorizedSkills() {
  const uncategorized = await db.query(
    'SELECT id, name FROM skills WHERE category_id IS NULL'
  );

  if (uncategorized.rows.length === 0) return;

  logger.info(`Found ${uncategorized.rows.length} uncategorized skills to fix`);

  for (const skill of uncategorized.rows) {
    // Try to find the category of a skill with the same normalized name
    const normalized = normalizeSkillName(skill.name);
    const match = await db.query(
      'SELECT category_id FROM skills WHERE name = $1 AND category_id IS NOT NULL AND id != $2 LIMIT 1',
      [normalized, skill.id]
    );

    if (match.rows.length > 0) {
      await db.query('UPDATE skills SET category_id = $1 WHERE id = $2', [match.rows[0].category_id, skill.id]);
      logger.info(`Categorized "${skill.name}" by name match`);
      continue;
    }

    // Try partial match: look for a category whose name appears in the skill name
    const partialMatch = await db.query(`
      SELECT sc.id as category_id, sc.name, sc.level
      FROM skill_categories sc
      WHERE $1 ILIKE '%' || sc.name || '%' AND sc.level >= 2
      ORDER BY sc.level DESC, length(sc.name) DESC
      LIMIT 1
    `, [skill.name]);

    if (partialMatch.rows.length > 0) {
      await db.query('UPDATE skills SET category_id = $1 WHERE id = $2', [partialMatch.rows[0].category_id, skill.id]);
      logger.info(`Categorized "${skill.name}" by partial match → "${partialMatch.rows[0].name}"`);
    }
  }

  // Log remaining uncategorized
  const remaining = await db.query('SELECT COUNT(*) as count FROM skills WHERE category_id IS NULL');
  const count = parseInt(remaining.rows[0].count);
  if (count > 0) {
    logger.warn(`${count} skills still uncategorized after migration`);
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
