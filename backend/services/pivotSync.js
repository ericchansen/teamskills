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
const logger = require('../logger');
const { normalizeSkillName, getCanonicalSkillInfo } = require('../utils/normalizeSkill');
const { parsePivotCSV, parseCSVContent, parseCSV } = require('./csvParser');
const { ensureSchemaExtensions, fetchFromSharePoint, syncToDatabase } = require('./sharepoint');
const taxonomy = require('../data/skill-taxonomy');
const { getPathToIdMap } = require('../migrate');

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

/**
 * Sync pivot-table CSV into PostgreSQL (users, skills, user_skills).
 * Requires each CSV row to include an email address; rows without one are skipped.
 * Uses batch SQL operations (UNNEST + ON CONFLICT) to minimize round-trips.
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

  // --- Phase 1: Resolve all skills (normalize, deduplicate, batch-upsert new ones) ---
  const skillIdMap = new Map();     // rawName → DB id
  const canonicalIdMap = new Map(); // normalizedName → DB id

  // Build the unique set of canonical skill names
  const canonicalNames = [];
  const rawToCanonical = new Map();
  for (const rawName of skillNames) {
    const canonical = normalizeSkillName(rawName);
    rawToCanonical.set(rawName, canonical);
    if (!canonicalNames.includes(canonical)) {
      canonicalNames.push(canonical);
    }
  }

  // Batch-fetch existing skills
  if (canonicalNames.length > 0) {
    const existingSkills = await db.query(
      'SELECT id, name FROM skills WHERE name = ANY($1)',
      [canonicalNames]
    );
    for (const row of existingSkills.rows) {
      canonicalIdMap.set(row.name, row.id);
    }
  }

  // Batch-insert new skills (those not already in DB)
  const newSkills = canonicalNames.filter(n => !canonicalIdMap.has(n));
  if (newSkills.length > 0) {
    const pathToId = getPathToIdMap();
    const names = [], categoryIds = [], preferredLabels = [], conceptTypes = [],
      lifecycleStatuses = [], vendorNamespaces = [];

    for (const skillName of newSkills) {
      const catPath = taxonomy.skillCategoryMap[skillName];
      const categoryId = catPath ? (pathToId.get(catPath) || null) : null;
      const info = getCanonicalSkillInfo(skillName);

      names.push(skillName);
      categoryIds.push(categoryId);
      preferredLabels.push(info.preferredLabel);
      conceptTypes.push(info.conceptType || null);
      lifecycleStatuses.push(info.lifecycleStatus || 'active');
      vendorNamespaces.push(info.vendorNamespace || null);
    }

    const inserted = await db.query(
      `INSERT INTO skills (name, category_id, preferred_label, concept_type, lifecycle_status, vendor_namespace)
       SELECT * FROM UNNEST($1::text[], $2::int[], $3::text[], $4::text[], $5::text[], $6::text[])
       ON CONFLICT (name) DO NOTHING
       RETURNING id, name`,
      [names, categoryIds, preferredLabels, conceptTypes, lifecycleStatuses, vendorNamespaces]
    );
    for (const row of inserted.rows) {
      canonicalIdMap.set(row.name, row.id);
    }
    stats.skills.created = inserted.rows.length;
  }

  // Any skills that existed via ON CONFLICT but weren't returned — re-fetch
  const missing = canonicalNames.filter(n => !canonicalIdMap.has(n));
  if (missing.length > 0) {
    const refetch = await db.query('SELECT id, name FROM skills WHERE name = ANY($1)', [missing]);
    for (const row of refetch.rows) {
      canonicalIdMap.set(row.name, row.id);
    }
  }

  stats.skills.existing = canonicalNames.length - stats.skills.created;

  // Build rawName → id map
  for (const rawName of skillNames) {
    const canonical = rawToCanonical.get(rawName);
    const id = canonicalIdMap.get(canonical);
    if (id) skillIdMap.set(rawName, id);
  }

  // Batch-update metadata for existing skills
  for (const [name, id] of canonicalIdMap) {
    await applySkillMetadata(id, name);
  }

  // --- Phase 2: Upsert users ---
  const userIdMap = new Map(); // userName (lowercase) → DB id
  for (const row of rows) {
    if (!row.email) {
      logger.warn({ name: row.name }, 'Skipping user without email in CSV');
      continue;
    }

    const userResult = await db.query('SELECT id FROM users WHERE LOWER(name) = LOWER($1)', [row.name]);
    if (userResult.rows.length > 0) {
      await db.query('UPDATE users SET team = $1 WHERE id = $2', [row.team, userResult.rows[0].id]);
      userIdMap.set(row.name.toLowerCase(), userResult.rows[0].id);
      stats.users.updated++;
    } else {
      const inserted = await db.query(
        'INSERT INTO users (name, email, team) VALUES ($1, $2, $3) RETURNING id',
        [row.name, row.email, row.team]
      );
      userIdMap.set(row.name.toLowerCase(), inserted.rows[0].id);
      stats.users.created++;
    }
  }

  // --- Phase 3: Batch-upsert user_skills with MAX-wins ---
  const usUserIds = [], usSkillIds = [], usLevels = [];
  for (const row of rows) {
    if (!row.email) continue;
    const userId = userIdMap.get(row.name.toLowerCase());
    if (!userId) continue;

    for (const [rawSkillName, level] of Object.entries(row.skills)) {
      const skillId = skillIdMap.get(rawSkillName);
      if (!skillId) { stats.userSkills.skipped++; continue; }
      usUserIds.push(userId);
      usSkillIds.push(skillId);
      usLevels.push(level);
    }
  }

  if (usUserIds.length > 0) {
    const result = await db.query(
      `WITH input AS (
         SELECT * FROM UNNEST($1::int[], $2::int[], $3::text[])
           AS t(user_id, skill_id, proficiency_level)
       ),
       upserted AS (
         INSERT INTO user_skills (user_id, skill_id, proficiency_level)
         SELECT user_id, skill_id, proficiency_level FROM input
         ON CONFLICT (user_id, skill_id) DO UPDATE SET
           proficiency_level = CASE
             WHEN regexp_replace(EXCLUDED.proficiency_level, '^L', '')::int >
                  regexp_replace(user_skills.proficiency_level, '^L', '')::int
             THEN EXCLUDED.proficiency_level
             ELSE user_skills.proficiency_level
           END
         RETURNING
           (xmax = 0) AS was_insert,
           proficiency_level = (
             SELECT proficiency_level FROM input i
             WHERE i.user_id = user_skills.user_id AND i.skill_id = user_skills.skill_id
             LIMIT 1
           ) AS level_changed
       )
       SELECT
         COUNT(*) FILTER (WHERE was_insert) AS created,
         COUNT(*) FILTER (WHERE NOT was_insert AND level_changed) AS updated,
         COUNT(*) FILTER (WHERE NOT was_insert AND NOT level_changed) AS skipped
       FROM upserted`,
      [usUserIds, usSkillIds, usLevels]
    );

    const r = result.rows[0];
    stats.userSkills.created = parseInt(r.created, 10);
    stats.userSkills.updated = parseInt(r.updated, 10);
    stats.userSkills.skipped += parseInt(r.skipped, 10);
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
