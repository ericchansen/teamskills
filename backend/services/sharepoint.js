/**
 * SharePoint / CSV Skill Sync Service
 * 
 * Syncs skill data from either:
 * 1. Local CSV file (cloud-solutions-engineer-skills.csv)
 * 2. SharePoint list via Microsoft Graph API (when credentials are configured)
 * 
 * SharePoint list: https://microsoft.sharepoint.com/teams/SDPAccountsShared/Lists/Skills%20Matrix%20MVP/AllItems.aspx
 * 
 * Column mapping (CSV/SharePoint → DB):
 *   Role           → skill_categories.name (top-level grouping, e.g. "Apps & AI")
 *   Category       → skills.subcategory (e.g. "Agentic AI")  
 *   Product/Skill  → skills.name
 *   Short Description → skills.description
 *   Core (Yes/No)  → skills.is_core
 *   Docs Link      → skills.docs_link
 */

const fs = require('fs');
const path = require('path');
const db = require('../db');

// SharePoint site and list identifiers
const SHAREPOINT_SITE = 'microsoft.sharepoint.com:/teams/SDPAccountsShared';
const SHAREPOINT_LIST_NAME = 'Skills Matrix MVP';

/**
 * Parse raw CSV content string into normalized skill records
 */
function parseCSVContent(content) {
  const lines = content.split('\n').filter(line => line.trim());
  
  const headers = parseCSVLine(lines[0]);
  
  const records = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length < headers.length) continue;
    
    const record = {};
    headers.forEach((h, idx) => { record[h.trim()] = (values[idx] || '').trim(); });
    records.push(record);
  }
  
  return records;
}

/**
 * Parse the local CSV file into normalized skill records
 */
function parseCSV(csvPath) {
  const content = fs.readFileSync(csvPath, 'utf-8');
  return parseCSVContent(content);
}

/**
 * Parse a single CSV line handling quoted fields with commas
 */
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

/**
 * Fetch skills from SharePoint list via Microsoft Graph API.
 * Requires a Graph client with Sites.Read.All delegated permission.
 */
async function fetchFromSharePoint(graphClient) {
  const site = await graphClient.api(`/sites/${SHAREPOINT_SITE}`).get();
  
  const lists = await graphClient.api(`/sites/${site.id}/lists`)
    .filter(`displayName eq '${SHAREPOINT_LIST_NAME}'`)
    .get();
  
  if (!lists.value || lists.value.length === 0) {
    throw new Error(`SharePoint list "${SHAREPOINT_LIST_NAME}" not found`);
  }
  
  const listId = lists.value[0].id;
  
  let items = [];
  let nextLink = `/sites/${site.id}/lists/${listId}/items?$expand=fields&$top=200`;
  
  while (nextLink) {
    const response = await graphClient.api(nextLink).get();
    items = items.concat(response.value);
    nextLink = response['@odata.nextLink'] || null;
  }
  
  return items.map(item => ({
    'Role': item.fields.Role || item.fields.Title || '',
    'Category': item.fields.Category || '',
    'Subcategory': item.fields.Subcategory || '',
    'Product/Skill': item.fields['Product_x002f_Skill'] || item.fields.ProductSkill || '',
    'Short Description': item.fields['Short_x0020_Description'] || item.fields.ShortDescription || '',
    'Long Description': item.fields['Long_x0020_Description'] || item.fields.LongDescription || '',
    'Core': item.fields.Core || 'No',
    'Docs Link': item.fields['Docs_x0020_Link'] || item.fields.DocsLink || ''
  }));
}

/**
 * Sync skill records into PostgreSQL.
 * Returns counts of categories and skills created/updated.
 */
async function syncToDatabase(records) {
  const stats = { 
    categories: { created: 0, existing: 0 },
    skills: { created: 0, updated: 0, unchanged: 0 },
    total: records.length
  };

  await ensureSchemaExtensions();

  // Phase 1: Upsert categories (from Role column)
  const categoryMap = new Map();
  const uniqueCategories = [...new Set(records.map(r => r['Role']).filter(Boolean))];
  
  for (const catName of uniqueCategories) {
    let result = await db.query(
      'SELECT id FROM skill_categories WHERE name = $1',
      [catName]
    );
    
    if (result.rows.length > 0) {
      categoryMap.set(catName, result.rows[0].id);
      stats.categories.existing++;
    } else {
      result = await db.query(
        'INSERT INTO skill_categories (name, description) VALUES ($1, $2) RETURNING id',
        [catName, `Skills in the ${catName} domain`]
      );
      categoryMap.set(catName, result.rows[0].id);
      stats.categories.created++;
    }
  }

  // Phase 2: Upsert skills
  for (const record of records) {
    const skillName = record['Product/Skill'];
    if (!skillName) continue;

    const categoryId = categoryMap.get(record['Role']);
    const description = record['Short Description'] || '';
    const isCore = (record['Core'] || '').toLowerCase() === 'yes';
    const docsLink = record['Docs Link'] || null;
    const subcategory = record['Category'] || null;

    const existing = await db.query(
      'SELECT id, description, is_core, docs_link, subcategory FROM skills WHERE name = $1',
      [skillName]
    );

    if (existing.rows.length > 0) {
      const skill = existing.rows[0];
      const changed = skill.description !== description ||
                      skill.is_core !== isCore ||
                      skill.docs_link !== docsLink ||
                      skill.subcategory !== subcategory;

      if (changed) {
        await db.query(
          `UPDATE skills SET description = $1, is_core = $2, docs_link = $3, 
           subcategory = $4, category_id = $5 WHERE id = $6`,
          [description, isCore, docsLink, subcategory, categoryId, skill.id]
        );
        stats.skills.updated++;
      } else {
        stats.skills.unchanged++;
      }
    } else {
      await db.query(
        `INSERT INTO skills (name, category_id, description, is_core, docs_link, subcategory, target_level) 
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [skillName, categoryId, description, isCore, docsLink, subcategory, 'L200']
      );
      stats.skills.created++;
    }
  }

  return stats;
}

/**
 * Add docs_link and subcategory columns if they don't exist
 */
async function ensureSchemaExtensions() {
  const columns = await db.query(`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name = 'skills' AND column_name IN ('docs_link', 'subcategory')
  `);
  
  const existingCols = columns.rows.map(r => r.column_name);
  
  if (!existingCols.includes('docs_link')) {
    await db.query('ALTER TABLE skills ADD COLUMN docs_link TEXT');
  }
  if (!existingCols.includes('subcategory')) {
    await db.query('ALTER TABLE skills ADD COLUMN subcategory VARCHAR(255)');
  }
}

/**
 * Parse a pivot-table CSV (SharePoint skills matrix export).
 * Header: Title, Alias, Qualifier, Skill1, Skill2, ...
 * Rows: Name, Alias, Team, 100, 200, 300, 400, "", ...
 * Returns { skillNames: string[], rows: { name, team, skills: { skillName: 'L100'|... }[] } }
 */
function parsePivotCSV(content) {
  const lines = content.split('\n').filter(line => line.trim());
  const headers = parseCSVLine(lines[0]).map(h => h.trim());

  // Columns 0=Title, 1=Alias, 2=Qualifier, 3+=skill names
  const skillNames = headers.slice(3);

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const name = (values[0] || '').trim();
    if (!name) continue;

    const team = (values[2] || '').trim();
    const skills = {};

    for (let s = 0; s < skillNames.length; s++) {
      const raw = (values[s + 3] || '').trim();
      if (!raw) continue;
      const numVal = parseInt(raw, 10);
      if (!numVal || numVal < 100) continue;
      // Map 100→L100, 200→L200, etc.
      const level = `L${numVal}`;
      if (['L100', 'L200', 'L300', 'L400'].includes(level)) {
        skills[skillNames[s]] = level;
      }
    }

    rows.push({ name, team, skills });
  }

  return { skillNames, rows };
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

  // Phase 1: Upsert all skills from column headers
  const skillIdMap = new Map();
  for (const skillName of skillNames) {
    const existing = await db.query('SELECT id FROM skills WHERE name = $1', [skillName]);
    if (existing.rows.length > 0) {
      skillIdMap.set(skillName, existing.rows[0].id);
      stats.skills.existing++;
    } else {
      const result = await db.query(
        'INSERT INTO skills (name, target_level) VALUES ($1, $2) RETURNING id',
        [skillName, 'L200']
      );
      skillIdMap.set(skillName, result.rows[0].id);
      stats.skills.created++;
    }
  }

  // Phase 2: Upsert users and their skills
  for (const row of rows) {
    // Generate a placeholder email from the display name
    const emailSlug = row.name.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '');
    const email = `${emailSlug}@placeholder.local`;

    // Upsert user by email
    let userResult = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (userResult.rows.length > 0) {
      await db.query(
        'UPDATE users SET name = $1, team = $2 WHERE email = $3',
        [row.name, row.team, email]
      );
      stats.users.updated++;
    } else {
      userResult = await db.query(
        'INSERT INTO users (name, email, team) VALUES ($1, $2, $3) RETURNING id',
        [row.name, email, row.team]
      );
      stats.users.created++;
    }
    const userId = userResult.rows[0].id;

    // Phase 3: Upsert user_skills
    for (const [skillName, level] of Object.entries(row.skills)) {
      const skillId = skillIdMap.get(skillName);
      if (!skillId) { stats.userSkills.skipped++; continue; }

      const existing = await db.query(
        'SELECT proficiency_level FROM user_skills WHERE user_id = $1 AND skill_id = $2',
        [userId, skillId]
      );

      if (existing.rows.length > 0) {
        if (existing.rows[0].proficiency_level !== level) {
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

module.exports = { sync, parseCSV, parseCSVContent, parsePivotCSV, syncPivotToDatabase, fetchFromSharePoint, syncToDatabase, ensureSchemaExtensions };
