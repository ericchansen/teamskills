/**
 * Pivot-Table Sync Service
 *
 * Syncs pivot-format skill data (from CSV or SharePoint) into the database.
 * Handles user creation, skill upsert with name normalization, and
 * proficiency-level assignment using a MAX-wins strategy for dedup columns.
 */

const fs = require('fs');
const path = require('path');
const db = require('../db');
const { normalizeSkillName, getCanonicalSkillInfo, suggestSkillProposal } = require('../utils/normalizeSkill');
const { parsePivotCSV, parseCSVContent, parseCSV } = require('./csvParser');
const { ensureSchemaExtensions, fetchFromSharePoint, syncToDatabase } = require('./sharepoint');
const taxonomy = require('../data/skill-taxonomy');

async function applySkillMetadata(skillId, skillName) {
  const info = getCanonicalSkillInfo(skillName);
  await db.query(
    `UPDATE skills
     SET preferred_label = $1,
         concept_type = COALESCE($2, concept_type),
         lifecycle_status = COALESCE($3, lifecycle_status),
         vendor_namespace = COALESCE($4, vendor_namespace)
     WHERE id = $5
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
      skillId,
    ]
  );
}

async function queueTaxonomyProposal(rawName, categoryId, suggestion, hasProposalTable) {
  if (!hasProposalTable) return;
  if (!suggestion?.needsReview && !['review', 'split', 'keep_distinct'].includes(suggestion?.suggestedAction)) {
    return;
  }

  let canonicalSkillId = null;
  if (suggestion.canonicalName && suggestion.canonicalName !== rawName) {
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
     SELECT NULL, $1, $2, $3, $4, $5, $6, $7
     WHERE NOT EXISTS (
       SELECT 1 FROM skill_proposals WHERE LOWER(name) = LOWER($1) AND status = 'pending'
     )`,
    [
      rawName,
      categoryId,
      'Imported skill label needs taxonomy review.',
      canonicalSkillId,
      suggestion.suggestedAction || 'review',
      suggestion.confidence ?? null,
      suggestion.reviewNotes || null,
    ]
  );
}

/**
 * Sync pivot-table CSV into PostgreSQL (users, skills, user_skills).
 * Generates placeholder emails for users without one.
 */
async function syncPivotToDatabase(pivotData) {
  const { skillNames, rows } = pivotData;
  const stats = {
    users: { created: 0, updated: 0 },
    skills: { created: 0, existing: 0 },
    userSkills: { created: 0, updated: 0, skipped: 0 },
    totalUsers: rows.length,
    totalSkillColumns: skillNames.length
  };

  await ensureSchemaExtensions();
  const proposalTable = await db.query(`SELECT to_regclass('public.skill_proposals') AS t`);
  const hasProposalTable = !!proposalTable.rows[0]?.t;

  // Phase 1: Upsert all skills from column headers (with name normalization)
  // canonicalIdMap prevents redundant DB queries when multiple raw names
  // normalize to the same canonical skill (e.g., "Azure Functions" + "Azure Functions3")
  const skillIdMap = new Map();
  const canonicalIdMap = new Map();
  for (const rawName of skillNames) {
    const skillName = normalizeSkillName(rawName);
    const suggestion = suggestSkillProposal(rawName);

    // If we already resolved this canonical name, reuse the same ID
    if (canonicalIdMap.has(skillName)) {
      skillIdMap.set(rawName, canonicalIdMap.get(skillName));
      stats.skills.existing++;
      await queueTaxonomyProposal(rawName, null, suggestion, hasProposalTable);
      continue;
    }

    const existing = await db.query('SELECT id FROM skills WHERE name = $1', [skillName]);
    if (existing.rows.length > 0) {
      skillIdMap.set(rawName, existing.rows[0].id);
      canonicalIdMap.set(skillName, existing.rows[0].id);
      await applySkillMetadata(existing.rows[0].id, skillName);
      stats.skills.existing++;
      await queueTaxonomyProposal(rawName, null, suggestion, hasProposalTable);
    } else {
      // For truly new skills, use taxonomy map first, then fall back to partial name match
      let categoryId = null;

      // Strategy 1: Taxonomy path-based lookup
      const catPath = taxonomy.skillCategoryMap[skillName];
      if (catPath) {
        // Resolve path by walking the category tree in the DB
        const parts = catPath.split('/');
        // Also try top-level aliases (e.g., "Infra" might be "Infrastructure" in DB)
        const l1Alias = taxonomy.topLevelAliases[parts[0]];
        const l1Variants = l1Alias ? [parts[0], l1Alias] : [parts[0]];
        // Reverse aliases: if canonical is parts[0], find alternatives
        for (const [alt, canonical] of Object.entries(taxonomy.topLevelAliases)) {
          if (canonical === parts[0] && !l1Variants.includes(alt)) l1Variants.push(alt);
        }

        let parentId = null;
        let resolved = true;
        for (let i = 0; i < parts.length; i++) {
          const variants = i === 0 ? l1Variants : [parts[i]];
          const offset = parentId === null ? 1 : 2;
          const placeholders = variants.map((_, j) => `$${j + offset}`).join(', ');
          const q = parentId === null
            ? `SELECT id FROM skill_categories WHERE parent_id IS NULL AND name IN (${placeholders})`
            : `SELECT id FROM skill_categories WHERE parent_id = $1 AND name IN (${placeholders})`;
          const params = parentId === null ? variants : [parentId, ...variants];
          const r = await db.query(q, params);
          if (r.rows.length > 0) {
            parentId = r.rows[0].id;
          } else {
            resolved = false;
            break;
          }
        }
        if (resolved && parentId) categoryId = parentId;
      }

      // Strategy 2: SQL partial match against category names (fallback)
      if (!categoryId) {
        const catResult = await db.query(`
          SELECT sc.id as category_id FROM skill_categories sc
          WHERE $1 ILIKE '%' || sc.name || '%' AND sc.level >= 2
            AND NOT EXISTS (
              SELECT 1 FROM skill_categories sc2
              WHERE sc2.name = sc.name AND sc2.id <> sc.id
            )
          ORDER BY sc.level DESC, length(sc.name) DESC
          LIMIT 1
        `, [skillName]);
        if (catResult.rows.length > 0) categoryId = catResult.rows[0].category_id;
      }

      const info = getCanonicalSkillInfo(skillName);
      const result = await db.query(
        `INSERT INTO skills (name, category_id, preferred_label, concept_type, lifecycle_status, vendor_namespace)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [
          skillName,
          categoryId,
          info.preferredLabel,
          info.conceptType,
          info.lifecycleStatus,
          info.vendorNamespace,
        ]
      );
      skillIdMap.set(rawName, result.rows[0].id);
      canonicalIdMap.set(skillName, result.rows[0].id);
      stats.skills.created++;
      await queueTaxonomyProposal(rawName, categoryId, suggestion, hasProposalTable);
    }
  }

  // Phase 2: Upsert users and their skills
  for (const row of rows) {
    // Match existing user by display name (case-insensitive) to avoid duplicates
    let userResult = await db.query('SELECT id FROM users WHERE LOWER(name) = LOWER($1)', [row.name]);
    if (userResult.rows.length > 0) {
      // Update team but preserve existing email and entra_oid
      await db.query(
        'UPDATE users SET team = $1 WHERE id = $2',
        [row.team, userResult.rows[0].id]
      );
      stats.users.updated++;
    } else {
      // No existing user — create with placeholder email
      const emailSlug = row.name.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '');
      const email = `${emailSlug}@placeholder.local`;
      userResult = await db.query(
        'INSERT INTO users (name, email, team) VALUES ($1, $2, $3) RETURNING id',
        [row.name, email, row.team]
      );
      stats.users.created++;
    }
    const userId = userResult.rows[0].id;

    // Phase 3: Upsert user_skills (take MAX when dedup columns map to the same skill)
    for (const [skillName, level] of Object.entries(row.skills)) {
      const skillId = skillIdMap.get(skillName);
      if (!skillId) { stats.userSkills.skipped++; continue; }

      const existing = await db.query(
        'SELECT proficiency_level FROM user_skills WHERE user_id = $1 AND skill_id = $2',
        [userId, skillId]
      );

      if (existing.rows.length > 0) {
        const existingNum = parseInt(existing.rows[0].proficiency_level.replace('L', ''), 10);
        const newNum = parseInt(level.replace('L', ''), 10);
        // Only update if the new level is higher (MAX wins for dedup columns)
        if (newNum > existingNum) {
          await db.query(
            'UPDATE user_skills SET proficiency_level = $1 WHERE user_id = $2 AND skill_id = $3',
            [level, userId, skillId]
          );
          stats.userSkills.updated++;
        } else {
          stats.userSkills.skipped++;
        }
      } else {
        await db.query(
          'INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES ($1, $2, $3)',
          [userId, skillId, level]
        );
        stats.userSkills.created++;
      }
    }
  }

  return stats;
}

/**
 * Full sync: read from source and write to DB
 * @param {string} source - 'csv', 'pivot-csv', or 'sharepoint'
 * @param {object} options - { csvPath, csvContent, filePath, graphClient }
 */
async function sync(source = 'csv', options = {}) {
  if (source === 'pivot-csv') {
    let content;
    if (options.csvContent) {
      content = options.csvContent;
    } else {
      const filePath = options.filePath || path.join(__dirname, '..', '..', '.data', 'skills-matrix.csv');
      if (!fs.existsSync(filePath)) {
        throw new Error(`Pivot CSV file not found: ${filePath}`);
      }
      content = fs.readFileSync(filePath, 'utf-8');
    }
    const pivotData = parsePivotCSV(content);
    const stats = await syncPivotToDatabase(pivotData);
    return { source, ...stats };
  }

  let records;
  
  if (source === 'sharepoint') {
    if (!options.graphClient) {
      throw new Error('Graph client required for SharePoint sync. Configure SHAREPOINT_CLIENT_ID and SHAREPOINT_CLIENT_SECRET env vars.');
    }
    records = await fetchFromSharePoint(options.graphClient);
  } else if (options.csvContent) {
    records = parseCSVContent(options.csvContent);
  } else {
    const csvPath = options.csvPath || path.join(__dirname, '..', '..', 'cloud-solutions-engineer-skills.csv');
    if (!fs.existsSync(csvPath)) {
      throw new Error(`CSV file not found: ${csvPath}`);
    }
    records = parseCSV(csvPath);
  }

  const stats = await syncToDatabase(records);
  return { source, ...stats };
}

module.exports = { syncPivotToDatabase, sync };
