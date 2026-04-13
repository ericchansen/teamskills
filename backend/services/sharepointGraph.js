/**
 * SharePoint Graph API Client
 *
 * Functions that interact with SharePoint via Microsoft Graph API.
 * Handles site/list resolution, column mapping, item CRUD, and caching.
 *
 * SharePoint list: https://microsoft.sharepoint.com/teams/SDPAccountsShared/Lists/Skills%20Matrix%20MVP/AllItems.aspx
 */

// SharePoint site and list identifiers
const SHAREPOINT_SITE = 'microsoft.sharepoint.com:/teams/SDPAccountsShared';
const SHAREPOINT_LIST_NAME = 'Skills Matrix MVP';

/**
 * Resolve the SharePoint site ID and list ID for the Skills Matrix MVP list.
 * Caches the result for the lifetime of the process.
 */
let _siteAndListCache = null;

async function resolveSiteAndList(graphClient) {
  if (_siteAndListCache) return _siteAndListCache;

  const site = await graphClient.api(`/sites/${SHAREPOINT_SITE}`).get();

  const lists = await graphClient.api(`/sites/${site.id}/lists`)
    .filter(`displayName eq '${SHAREPOINT_LIST_NAME}'`)
    .get();

  if (!lists.value || lists.value.length === 0) {
    throw new Error(`SharePoint list "${SHAREPOINT_LIST_NAME}" not found`);
  }

  _siteAndListCache = { siteId: site.id, listId: lists.value[0].id };
  return _siteAndListCache;
}

/**
 * Get the SharePoint list columns (skill names) and their internal field names.
 * SharePoint encodes spaces as _x0020_, slashes as _x002f_, etc.
 * Returns a map: { displayName → internalName }
 *
 * The first 3 columns (Title, Alias, Qualifier) are metadata; the rest are skill columns.
 */
async function getSkillColumnMap(graphClient) {
  const { siteId, listId } = await resolveSiteAndList(graphClient);

  const columns = await graphClient
    .api(`/sites/${siteId}/lists/${listId}/columns`)
    .get();

  const metaFields = new Set([
    'Title', 'Alias', 'Qualifier',
    // SharePoint system columns to ignore
    'ContentType', 'Modified', 'Created', 'Author', 'Editor',
    'id', '_UIVersionString', 'Attachments', 'Edit', 'LinkTitleNoMenu',
    'LinkTitle', 'ItemChildCount', 'FolderChildCount', '_ComplianceFlags',
    '_ComplianceTag', '_ComplianceTagWrittenTime', '_ComplianceTagUserId',
    'AppAuthor', 'AppEditor'
  ]);

  const map = {};
  for (const col of columns.value) {
    if (!metaFields.has(col.displayName) && !col.readOnly && col.name) {
      map[col.displayName] = col.name;
    }
  }

  return map;
}

/**
 * Fetch all items from the SharePoint list in pivot format.
 * Returns data matching the parsePivotCSV output structure.
 */
async function fetchPivotFromSharePoint(graphClient) {
  const { siteId, listId } = await resolveSiteAndList(graphClient);
  const columnMap = await getSkillColumnMap(graphClient);

  let items = [];
  let nextLink = `/sites/${siteId}/lists/${listId}/items?$expand=fields&$top=200`;

  while (nextLink) {
    const response = await graphClient.api(nextLink).get();
    items = items.concat(response.value);
    nextLink = response['@odata.nextLink'] || null;
  }

  const skillNames = Object.keys(columnMap);
  const rows = [];

  for (const item of items) {
    const fields = item.fields || {};
    const name = fields.Title || '';
    if (!name) continue;

    const team = fields.Qualifier || '';
    const skills = {};

    for (const [displayName, internalName] of Object.entries(columnMap)) {
      const raw = fields[internalName];
      if (!raw) continue;
      const numVal = parseInt(String(raw), 10);
      if (!numVal || numVal < 100) continue;
      const level = `L${numVal}`;
      if (['L100', 'L200', 'L300', 'L400'].includes(level)) {
        skills[displayName] = level;
      }
    }

    rows.push({ name, team, skills, itemId: item.id });
  }

  return { skillNames, rows };
}

/**
 * Find a user's row in the SharePoint list by display name.
 * Returns the item (with id and fields) or null.
 */
async function findUserItem(graphClient, userName) {
  const { siteId, listId } = await resolveSiteAndList(graphClient);

  const response = await graphClient
    .api(`/sites/${siteId}/lists/${listId}/items`)
    .filter(`fields/Title eq '${userName.replace(/'/g, "''")}'`)
    .expand('fields')
    .top(1)
    .get();

  if (!response.value || response.value.length === 0) {
    return null;
  }

  return response.value[0];
}

/**
 * Update a SharePoint list item's fields.
 * Used to push proficiency levels back to SharePoint.
 *
 * @param {object} graphClient - Microsoft Graph client
 * @param {string} itemId - SharePoint list item ID
 * @param {object} fieldUpdates - { internalFieldName: value, ... }
 */
async function updateSharePointItem(graphClient, itemId, fieldUpdates) {
  const { siteId, listId } = await resolveSiteAndList(graphClient);

  await graphClient
    .api(`/sites/${siteId}/lists/${listId}/items/${itemId}/fields`)
    .patch(fieldUpdates);
}

// Clear cached site/list info (useful for testing)
function clearCache() {
  _siteAndListCache = null;
}

module.exports = {
  SHAREPOINT_SITE,
  SHAREPOINT_LIST_NAME,
  resolveSiteAndList,
  getSkillColumnMap,
  fetchPivotFromSharePoint,
  findUserItem,
  updateSharePointItem,
  clearCache
};
