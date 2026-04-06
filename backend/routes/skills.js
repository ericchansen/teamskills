const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth, requireAdmin } = require('../auth');
const { getCanonicalSkillInfo } = require('../utils/normalizeSkill');

const ALLOWED_LIFECYCLE_STATUSES = new Set(['active', 'legacy', 'retired']);
const PROFICIENCY_ORDER_SQL = `
  CASE
    WHEN %s = 'L100' THEN 1
    WHEN %s = 'L200' THEN 2
    WHEN %s = 'L300' THEN 3
    WHEN %s = 'L400' THEN 4
    ELSE 0
  END
`;

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parsePositiveInt(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function createRouteError(status, message, details = {}) {
  const error = new Error(message);
  error.status = status;
  error.details = details;
  error.expose = true;
  return error;
}

function deriveSkillMetadata(name, existingSkill = null, applyNameMetadata = true) {
  const info = getCanonicalSkillInfo(name);

  if (!existingSkill) {
    return {
      preferredLabel: info.preferredLabel,
      conceptType: info.conceptType,
      lifecycleStatus: info.lifecycleStatus,
      vendorNamespace: info.vendorNamespace,
    };
  }

  if (!applyNameMetadata) {
    return {
      preferredLabel: existingSkill.preferred_label || existingSkill.name,
      conceptType: existingSkill.concept_type ?? null,
      lifecycleStatus: existingSkill.lifecycle_status ?? 'active',
      vendorNamespace: existingSkill.vendor_namespace ?? null,
    };
  }

  return {
    preferredLabel: info.preferredLabel,
    conceptType: info.hasMetadata ? info.conceptType : existingSkill.concept_type ?? null,
    lifecycleStatus: info.hasMetadata ? info.lifecycleStatus : existingSkill.lifecycle_status ?? 'active',
    vendorNamespace: info.hasMetadata ? info.vendorNamespace : existingSkill.vendor_namespace ?? null,
  };
}

async function ensureCategoryExists(categoryId, queryable = db) {
  if (categoryId === null) {
    return;
  }

  const category = await queryable.query(
    'SELECT id FROM skill_categories WHERE id = $1',
    [categoryId]
  );

  if (category.rows.length === 0) {
    throw createRouteError(400, 'Category not found');
  }
}

async function findSkillNameConflict(name, excludedSkillIds = [], queryable = db) {
  const result = await queryable.query(
    `SELECT DISTINCT s.id, s.name, s.preferred_label
     FROM skills s
     LEFT JOIN skill_aliases sa ON sa.skill_id = s.id
     WHERE (
       LOWER(s.name) = LOWER($1)
       OR LOWER(COALESCE(s.preferred_label, s.name)) = LOWER($1)
       OR LOWER(sa.alias) = LOWER($1)
     )
     AND NOT (s.id = ANY($2::int[]))
     ORDER BY s.id
     LIMIT 1`,
    [name, excludedSkillIds]
  );

  return result.rows[0] || null;
}

async function assertSkillNameAvailable(name, excludedSkillIds = [], queryable = db) {
  const conflict = await findSkillNameConflict(name, excludedSkillIds, queryable);
  if (conflict) {
    throw createRouteError(409, 'A skill with this name already exists', { canonicalSkill: conflict });
  }
}

async function fetchSkillById(id, queryable = db) {
  const result = await queryable.query(
    `SELECT s.*, sc.name AS category_name
     FROM skills s
     LEFT JOIN skill_categories sc ON s.category_id = sc.id
     WHERE s.id = $1`,
    [id]
  );

  return result.rows[0] || null;
}

function validateLifecycleStatus(status) {
  if (!ALLOWED_LIFECYCLE_STATUSES.has(status)) {
    throw createRouteError(400, 'Unsupported lifecycle status');
  }
}

function buildNextSkillState(existingSkill, changes) {
  const hasName = Object.prototype.hasOwnProperty.call(changes, 'name');
  const hasDescription = Object.prototype.hasOwnProperty.call(changes, 'description');
  const hasCategory = Object.prototype.hasOwnProperty.call(changes, 'category_id');
  const hasLifecycleStatus = Object.prototype.hasOwnProperty.call(changes, 'lifecycle_status');

  const nextName = hasName ? normalizeText(changes.name) : existingSkill.name;
  if (!nextName) {
    throw createRouteError(400, 'Skill name is required');
  }

  const nextDescription = hasDescription ? normalizeText(changes.description) || null : existingSkill.description;
  const nextCategoryId = hasCategory
    ? (changes.category_id === null ? null : parsePositiveInt(changes.category_id))
    : existingSkill.category_id;
  const nextLifecycleStatus = hasLifecycleStatus
    ? normalizeText(changes.lifecycle_status)
    : existingSkill.lifecycle_status;

  validateLifecycleStatus(nextLifecycleStatus);

  if (hasCategory && changes.category_id !== null && nextCategoryId === null) {
    throw createRouteError(400, 'A valid category is required');
  }

  return {
    name: nextName,
    description: nextDescription,
    categoryId: nextCategoryId,
    lifecycleStatus: nextLifecycleStatus,
    hasCategory,
    hasName,
  };
}

router.get('/', async (req, res) => {
  const result = await db.query(`
    SELECT s.*, sc.name as category_name
    FROM skills s
    LEFT JOIN skill_categories sc ON s.category_id = sc.id
    ORDER BY sc.name, s.name
  `);
  res.json(result.rows);
});

router.get('/:id', async (req, res) => {
  const skill = await fetchSkillById(req.params.id);
  if (!skill) {
    return res.status(404).json({ error: 'Skill not found' });
  }

  return res.json(skill);
});

router.get('/:id/related', async (req, res) => {
  const { id } = req.params;
  const result = await db.query(`
    SELECT s.*, sr.relationship_type,
      CASE WHEN sr.parent_skill_id = $1 THEN 'child' ELSE 'parent' END as relationship
    FROM skill_relationships sr
    JOIN skills s ON (sr.child_skill_id = s.id OR sr.parent_skill_id = s.id)
    WHERE (sr.parent_skill_id = $1 OR sr.child_skill_id = $1) AND s.id != $1
  `, [id]);
  res.json(result.rows);
});

router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const name = normalizeText(req.body.name);
  const description = normalizeText(req.body.description) || null;
  const categoryId = req.body.category_id === null || req.body.category_id === undefined
    ? null
    : parsePositiveInt(req.body.category_id);

  if (!name) {
    throw createRouteError(400, 'Skill name is required');
  }

  if (req.body.category_id !== undefined && req.body.category_id !== null && !categoryId) {
    throw createRouteError(400, 'A valid category is required');
  }

  await ensureCategoryExists(categoryId);
  await assertSkillNameAvailable(name);

  const metadata = deriveSkillMetadata(name);
  const result = await db.query(
    `INSERT INTO skills (
       name,
       category_id,
       description,
       preferred_label,
       concept_type,
       lifecycle_status,
       vendor_namespace
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      name,
      categoryId,
      description,
      metadata.preferredLabel,
      metadata.conceptType,
      metadata.lifecycleStatus,
      metadata.vendorNamespace,
    ]
  );

  const skill = await fetchSkillById(result.rows[0].id);
  return res.status(201).json(skill);
});

router.post('/merge', requireAuth, requireAdmin, async (req, res) => {
  const survivingSkillId = parsePositiveInt(req.body.surviving_skill_id);
  const mergedSkillIds = Array.isArray(req.body.merged_skill_ids)
    ? [...new Set(req.body.merged_skill_ids.map(parsePositiveInt).filter(Boolean))]
    : [];
  const desiredName = normalizeText(req.body.desired_name) || null;
  const hasTargetCategory = req.body.target_category_id !== undefined && req.body.target_category_id !== null;
  const targetCategoryId = hasTargetCategory ? parsePositiveInt(req.body.target_category_id) : null;

  if (!survivingSkillId) {
    throw createRouteError(400, 'A surviving skill is required');
  }

  if (mergedSkillIds.length === 0) {
    throw createRouteError(400, 'Select at least one duplicate skill to merge');
  }

  if (mergedSkillIds.includes(survivingSkillId)) {
    throw createRouteError(400, 'The surviving skill cannot also be merged away');
  }

  if (hasTargetCategory && !targetCategoryId) {
    throw createRouteError(400, 'A valid target category is required');
  }

  const allSkillIds = [survivingSkillId, ...mergedSkillIds];
  const skillsResult = await db.query(
    `SELECT id, name, preferred_label, category_id, concept_type, lifecycle_status, vendor_namespace
     FROM skills
     WHERE id = ANY($1::int[])`,
    [allSkillIds]
  );
  const skillMap = new Map(skillsResult.rows.map((row) => [row.id, row]));

  if (skillMap.size !== allSkillIds.length) {
    throw createRouteError(400, 'One or more selected skills no longer exist');
  }

  if (desiredName) {
    await assertSkillNameAvailable(desiredName, allSkillIds);
  }

  await ensureCategoryExists(hasTargetCategory ? targetCategoryId : null);

  const survivingSkill = skillMap.get(survivingSkillId);
  const finalName = desiredName || survivingSkill.name;
  const finalCategoryId = hasTargetCategory ? targetCategoryId : survivingSkill.category_id;
  const metadata = deriveSkillMetadata(finalName, survivingSkill, Boolean(desiredName));
  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');
    await client.query('SELECT id FROM skills WHERE id = ANY($1::int[]) FOR UPDATE', [allSkillIds]);

    const aliasRows = await client.query(
      'SELECT alias FROM skill_aliases WHERE skill_id = ANY($1::int[])',
      [mergedSkillIds]
    );
    const aliases = new Set(
      mergedSkillIds
        .map((skillId) => skillMap.get(skillId)?.name)
        .concat(aliasRows.rows.map((row) => row.alias))
        .map(normalizeText)
        .filter(Boolean)
    );

    for (const alias of aliases) {
      if (alias.toLowerCase() === finalName.toLowerCase()) {
        continue;
      }

      await client.query(
        `INSERT INTO skill_aliases (skill_id, alias, source)
         VALUES ($1, $2, 'skill-merge')
         ON CONFLICT DO NOTHING`,
        [survivingSkillId, alias]
      );
    }

    const mergedUserSkills = await client.query(
      `SELECT user_id, proficiency_level, notes
       FROM user_skills
       WHERE skill_id = ANY($1::int[])`,
      [mergedSkillIds]
    );

    for (const row of mergedUserSkills.rows) {
      await client.query(
        `INSERT INTO user_skills (user_id, skill_id, proficiency_level, notes)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, skill_id) DO UPDATE SET
           proficiency_level = CASE
             WHEN ${PROFICIENCY_ORDER_SQL.replace(/%s/g, 'EXCLUDED.proficiency_level')}
               > ${PROFICIENCY_ORDER_SQL.replace(/%s/g, 'user_skills.proficiency_level')}
             THEN EXCLUDED.proficiency_level
             ELSE user_skills.proficiency_level
           END,
           notes = COALESCE(user_skills.notes, EXCLUDED.notes),
           last_updated = CURRENT_TIMESTAMP`,
        [row.user_id, survivingSkillId, row.proficiency_level, row.notes || null]
      );
    }

    await client.query('DELETE FROM user_skills WHERE skill_id = ANY($1::int[])', [mergedSkillIds]);

    const relationshipRows = await client.query(
      `SELECT parent_skill_id, child_skill_id, relationship_type
       FROM skill_relationships
       WHERE parent_skill_id = ANY($1::int[])
          OR child_skill_id = ANY($1::int[])`,
      [allSkillIds]
    );

    const remappedRelationships = new Map();
    for (const row of relationshipRows.rows) {
      const parentSkillId = mergedSkillIds.includes(row.parent_skill_id)
        ? survivingSkillId
        : row.parent_skill_id;
      const childSkillId = mergedSkillIds.includes(row.child_skill_id)
        ? survivingSkillId
        : row.child_skill_id;

      if (parentSkillId === childSkillId) {
        continue;
      }

      const key = `${parentSkillId}:${childSkillId}:${row.relationship_type}`;
      remappedRelationships.set(key, {
        parentSkillId,
        childSkillId,
        relationshipType: row.relationship_type,
      });
    }

    await client.query(
      `DELETE FROM skill_relationships
       WHERE parent_skill_id = ANY($1::int[])
          OR child_skill_id = ANY($1::int[])`,
      [allSkillIds]
    );

    for (const relationship of remappedRelationships.values()) {
      await client.query(
        `INSERT INTO skill_relationships (parent_skill_id, child_skill_id, relationship_type)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [relationship.parentSkillId, relationship.childSkillId, relationship.relationshipType]
      );
    }

    await client.query(
      `UPDATE skills
       SET name = $1,
           preferred_label = $2,
           concept_type = $3,
           lifecycle_status = $4,
           vendor_namespace = $5,
           category_id = $6
       WHERE id = $7`,
      [
        finalName,
        metadata.preferredLabel,
        metadata.conceptType,
        metadata.lifecycleStatus,
        metadata.vendorNamespace,
        finalCategoryId,
        survivingSkillId,
      ]
    );

    await client.query('DELETE FROM skills WHERE id = ANY($1::int[])', [mergedSkillIds]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  const skill = await fetchSkillById(survivingSkillId);
  return res.json({
    message: 'Skills merged successfully',
    skill,
  });
});

router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  const existingSkill = await fetchSkillById(req.params.id);
  if (!existingSkill) {
    return res.status(404).json({ error: 'Skill not found' });
  }

  const nextState = buildNextSkillState(existingSkill, req.body);
  if (nextState.hasCategory) {
    await ensureCategoryExists(nextState.categoryId);
  }

  if (nextState.hasName) {
    await assertSkillNameAvailable(nextState.name, [existingSkill.id]);
  }

  const metadata = deriveSkillMetadata(nextState.name, existingSkill, nextState.hasName);
  await db.query(
    `UPDATE skills
     SET name = $1,
         category_id = $2,
         description = $3,
         preferred_label = $4,
         concept_type = $5,
         lifecycle_status = $6,
         vendor_namespace = $7
     WHERE id = $8`,
    [
      nextState.name,
      nextState.categoryId,
      nextState.description,
      metadata.preferredLabel,
      metadata.conceptType,
      nextState.lifecycleStatus,
      metadata.vendorNamespace,
      existingSkill.id,
    ]
  );

  const updatedSkill = await fetchSkillById(existingSkill.id);
  return res.json(updatedSkill);
});

router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  const result = await db.query('DELETE FROM skills WHERE id = $1 RETURNING *', [req.params.id]);
  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Skill not found' });
  }

  return res.json({ message: 'Skill deleted successfully' });
});

module.exports = router;
