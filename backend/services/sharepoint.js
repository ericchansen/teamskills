/**
 * SharePoint / CSV Skill Sync Service
 *
 * Core sync functions for reading skills from CSV files or SharePoint
 * and writing them to the database.
 *
 * For Graph API operations, see sharepointGraph.js.
 * For pivot-format sync, see pivotSync.js.
 * For CSV parsing, see csvParser.js.
 *
 * Column mapping (CSV/SharePoint → DB):
 *   Role           → skill_categories.name (top-level grouping, e.g. "Apps & AI")
 *   Category       → skills.subcategory (e.g. "Agentic AI")
 *   Product/Skill  → skills.name
 *   Short Description → skills.description
 *   Core (Yes/No)  → skills.is_core
 *   Docs Link      → skills.docs_link
 */

const db = require('../db');
const { getSkillColumnMap, findUserItem, updateSharePointItem } = require('./sharepointGraph');

// SharePoint site and list identifiers
const SHAREPOINT_SITE = 'microsoft.sharepoint.com:/teams/SDPAccountsShared';
const SHAREPOINT_LIST_NAME = 'Skills Matrix MVP';

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
      'SELECT id, description, is_core, docs_link, subcategory, category_id FROM skills WHERE name = $1',
      [skillName]
    );

    if (existing.rows.length > 0) {
      const skill = existing.rows[0];
      const changed = skill.description !== description ||
                      skill.is_core !== isCore ||
                      skill.docs_link !== docsLink ||
                      skill.subcategory !== subcategory ||
                      skill.category_id !== categoryId;

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
 * Push a user's skill levels from the database to SharePoint.
 * Finds the user's row, maps skill names to SharePoint internal column names,
 * and PATCHes the item.
 *
 * @param {object} graphClient - Microsoft Graph client (OBO-authenticated)
 * @param {object} user - User object with { name, id }
 * @returns {object} Stats about the push operation
 */
async function pushUserSkillsToSharePoint(graphClient, user) {
  const columnMap = await getSkillColumnMap(graphClient);
  const item = await findUserItem(graphClient, user.name);

  if (!item) {
    return { status: 'skipped', reason: `User "${user.name}" not found in SharePoint list` };
  }

  // Get user's current skills from DB
  const userSkills = await db.query(`
    SELECT s.name as skill_name, us.proficiency_level
    FROM user_skills us
    JOIN skills s ON us.skill_id = s.id
    WHERE us.user_id = $1
  `, [user.id]);

  const fieldUpdates = {};
  let updatedCount = 0;

  for (const row of userSkills.rows) {
    const internalName = columnMap[row.skill_name];
    if (!internalName) continue;

    // Convert L100 → 100, L200 → 200, etc.
    const numericValue = parseInt(row.proficiency_level.replace('L', ''), 10);
    fieldUpdates[internalName] = numericValue;
    updatedCount++;
  }

  if (updatedCount === 0) {
    return { status: 'skipped', reason: 'No matching skill columns found' };
  }

  await updateSharePointItem(graphClient, item.id, fieldUpdates);

  return { status: 'success', fieldsUpdated: updatedCount };
}

module.exports = {
  fetchFromSharePoint,
  syncToDatabase,
  ensureSchemaExtensions,
  pushUserSkillsToSharePoint
};
