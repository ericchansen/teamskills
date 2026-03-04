/**
 * Power Automate HTTP Trigger Proxy for SharePoint Sync
 * 
 * WORKAROUND: This module exists because the Microsoft corp tenant blocks
 * OAuth consent for unverified publisher apps. The OBO flow (oboClient.js)
 * is the correct solution — this is a bypass using Power Automate flows
 * that run under the flow creator's identity.
 * 
 * When admin consent is granted in the Microsoft tenant, switch
 * SHAREPOINT_SYNC_METHOD=obo to use the proper OBO flow instead.
 * 
 * Requires:
 *   - SHAREPOINT_PULL_FLOW_URL (HTTP trigger URL with SAS key)
 *   - SHAREPOINT_PUSH_FLOW_URL (HTTP trigger URL with SAS key)
 * 
 * These URLs are secrets — they contain embedded SAS signatures that
 * grant access to the flow. Never commit them to source control.
 */

const PULL_FLOW_URL = () => process.env.SHAREPOINT_PULL_FLOW_URL;
const PUSH_FLOW_URL = () => process.env.SHAREPOINT_PUSH_FLOW_URL;

// Power Automate flows can be slow (cold start + SharePoint query)
const FLOW_TIMEOUT_MS = 30000;

/**
 * Check if Power Automate sync is configured.
 * At minimum, the pull flow URL must be set.
 */
function isPowerAutomateConfigured() {
  return !!PULL_FLOW_URL();
}

/**
 * Pull all skill data from SharePoint via Power Automate flow.
 * The flow should return a JSON array of SharePoint list items.
 * 
 * @returns {Promise<object[]>} Raw SharePoint list items from the flow
 */
async function pullFromSharePoint() {
  const url = PULL_FLOW_URL();
  if (!url) {
    throw new Error('SHAREPOINT_PULL_FLOW_URL is not configured');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FLOW_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Power Automate pull flow returned ${response.status}: ${body}`);
    }

    const data = await response.json();

    // Flow may return items directly as array, or wrapped in { value: [...] }
    const items = Array.isArray(data) ? data : (data.value || data.items || []);

    if (!Array.isArray(items)) {
      throw new Error('Power Automate flow returned unexpected format — expected array of items');
    }

    return items;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Power Automate pull flow timed out after ${FLOW_TIMEOUT_MS}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Transform Power Automate flow response items into the pivot format
 * expected by syncPivotToDatabase().
 * 
 * Power Automate's SharePoint "Get items" action returns items with
 * field values at the top level (not nested under .fields like Graph API).
 * 
 * Expected item shape from flow:
 *   { Title: "Jane Doe", Qualifier: "Apps & AI", "GitHub Copilot": 400, ... }
 * 
 * Metadata fields to skip (SharePoint internal fields):
 *   ID, Title, Qualifier, Alias, Modified, Created, Author, Editor,
 *   _ModerationStatus, ContentType, FileSystemObjectType, etc.
 * 
 * @param {object[]} items - Raw items from the Power Automate flow
 * @returns {{ skillNames: string[], rows: Array<{ name: string, team: string, skills: object }> }}
 */
function transformFlowItemsToPivotFormat(items) {
  // SharePoint/Power Automate metadata fields to exclude from skill columns
  const METADATA_FIELDS = new Set([
    'ID', 'Id', 'id',
    'Title', 'Alias',
    'Qualifier',
    'Modified', 'Created',
    'Author', 'Editor',
    'AuthorId', 'EditorId',
    '_ModerationStatus', '_ModerationComments',
    'ContentType', 'ContentTypeId',
    'FileSystemObjectType',
    'ServerRedirectedEmbedUri', 'ServerRedirectedEmbedUrl',
    'OData__ColorTag', 'OData__UIVersionString',
    'ComplianceAssetId',
    'GUID',
    'Attachments',
    // odata metadata
    '@odata.type', '@odata.id', '@odata.etag', '@odata.editLink',
    'odata.type', 'odata.id', 'odata.etag', 'odata.editLink',
    '__metadata'
  ]);

  // Discover skill columns from the first item that has data
  const skillNamesSet = new Set();
  for (const item of items) {
    for (const key of Object.keys(item)) {
      if (!METADATA_FIELDS.has(key) && !key.startsWith('@odata') && !key.startsWith('OData__')) {
        skillNamesSet.add(key);
      }
    }
  }
  const skillNames = Array.from(skillNamesSet);

  const rows = [];
  for (const item of items) {
    const name = (item.Title || '').trim();
    if (!name) continue;

    const team = (item.Qualifier || '').trim();
    const skills = {};

    for (const skillName of skillNames) {
      const raw = item[skillName];
      if (raw == null || raw === '') continue;
      const numVal = parseInt(String(raw), 10);
      if (!numVal || numVal < 100) continue;
      const level = `L${numVal}`;
      if (['L100', 'L200', 'L300', 'L400'].includes(level)) {
        skills[skillName] = level;
      }
    }

    rows.push({ name, team, skills });
  }

  return { skillNames, rows };
}

/**
 * Push a user's skill updates to SharePoint via Power Automate flow.
 * The flow should accept a JSON body with the user's name and field updates.
 * 
 * @param {string} userName - Display name to identify the SharePoint row
 * @param {object} fieldUpdates - { "Skill Name": numericValue, ... }
 * @returns {Promise<object>} Flow response
 */
async function pushToSharePoint(userName, fieldUpdates) {
  const url = PUSH_FLOW_URL();
  if (!url) {
    throw new Error('SHAREPOINT_PUSH_FLOW_URL is not configured');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FLOW_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ userName, fields: fieldUpdates }),
      signal: controller.signal
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Power Automate push flow returned ${response.status}: ${body}`);
    }

    // Some flows return 202 Accepted with no body
    const text = await response.text();
    return text ? JSON.parse(text) : { status: 'accepted' };
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Power Automate push flow timed out after ${FLOW_TIMEOUT_MS}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  isPowerAutomateConfigured,
  pullFromSharePoint,
  transformFlowItemsToPivotFormat,
  pushToSharePoint,
  FLOW_TIMEOUT_MS
};
