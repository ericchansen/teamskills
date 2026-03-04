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
 * The flow returns { items: [...], schema: { schema: { items: { properties: {...} } } } }.
 * The schema contains column metadata with internal→display name mapping.
 * 
 * @returns {Promise<{ items: object[], columnMap: object|null }>} Items and optional column mapping
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
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
      signal: controller.signal
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Power Automate pull flow returned ${response.status}: ${body}`);
    }

    const data = await response.json();

    // New format: { items: [...], schema: { schema: { items: { properties: {...} } } } }
    if (data.items && Array.isArray(data.items)) {
      const columnMap = buildColumnMap(data.schema);
      return { items: data.items, columnMap };
    }

    // Legacy format: array or { value: [...] }
    const items = Array.isArray(data) ? data : (data.value || []);
    if (!Array.isArray(items)) {
      throw new Error('Power Automate flow returned unexpected format — expected array of items');
    }
    return { items, columnMap: null };
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
 * Build a mapping of internal field names to display names from GetTable schema.
 * @param {object} schema - GetTable response (schema.schema.items.properties)
 * @returns {object|null} Map of { internalName: displayTitle } or null
 */
function buildColumnMap(schema) {
  try {
    const properties = schema?.schema?.items?.properties;
    if (!properties) return null;
    const map = {};
    for (const [key, def] of Object.entries(properties)) {
      if (def.title && def.title !== key) {
        map[key] = def.title;
      }
    }
    return Object.keys(map).length > 0 ? map : null;
  } catch {
    return null;
  }
}

/**
 * Transform Power Automate flow response items into the pivot format
 * expected by syncPivotToDatabase().
 * 
 * PA's SharePoint "Get items" returns items with internal field names (field_1, field_2...)
 * and Choice values as objects ({ Value: "200" }). The columnMap from GetTable provides
 * the internal→display name mapping (field_1 → "GitHub Copilot").
 * 
 * @param {object[]} items - Raw items from the Power Automate flow
 * @param {object|null} columnMap - Optional { internalName: displayTitle } mapping
 * @returns {{ skillNames: string[], rows: Array<{ name: string, team: string, skills: object }> }}
 */
function transformFlowItemsToPivotFormat(items, columnMap) {
  // SharePoint/Power Automate metadata fields to exclude from skill columns
  const METADATA_FIELDS = new Set([
    'ID', 'Id', 'id', 'ItemInternalId',
    'Title', 'Alias',
    'Qualifier',
    'Your_x0020_Name', 'Your_x0020_Qualifier',
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

  // Discover skill columns from items, mapping internal names to display names
  const skillColumnsMap = new Map(); // internalName → displayName
  for (const item of items) {
    for (const key of Object.keys(item)) {
      if (METADATA_FIELDS.has(key)) continue;
      if (key.startsWith('@odata') || key.startsWith('OData__')) continue;
      // Skip #Id companion fields (e.g., field_1#Id)
      if (key.includes('#')) continue;
      const displayName = columnMap?.[key] || key;
      skillColumnsMap.set(key, displayName);
    }
  }

  const skillNames = Array.from(new Set(skillColumnsMap.values()));

  const rows = [];
  for (const item of items) {
    const name = (item.Title || '').trim();
    if (!name) continue;

    // Qualifier may be a flat string or a Choice object { Value: "Apps & AI" }
    const qualRaw = item.Your_x0020_Qualifier || item.Qualifier;
    const team = extractStringValue(qualRaw);
    const skills = {};

    for (const [internalName, displayName] of skillColumnsMap) {
      const raw = item[internalName];
      if (raw == null || raw === '') continue;
      const strVal = extractStringValue(raw);
      if (!strVal) continue;
      const numVal = parseInt(strVal, 10);
      if (!numVal || numVal < 100) continue;
      const level = `L${numVal}`;
      if (['L100', 'L200', 'L300', 'L400'].includes(level)) {
        skills[displayName] = level;
      }
    }

    rows.push({ name, team, skills });
  }

  return { skillNames, rows };
}

/**
 * Extract a string value from a field that may be a flat value or
 * a SharePoint Choice/Lookup object { Value: "..." }.
 */
function extractStringValue(raw) {
  if (raw == null || raw === '') return '';
  if (typeof raw === 'string') return raw.trim();
  if (typeof raw === 'number') return String(raw);
  if (typeof raw === 'object' && raw.Value !== undefined) return String(raw.Value).trim();
  return '';
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
  buildColumnMap,
  extractStringValue,
  pushToSharePoint,
  FLOW_TIMEOUT_MS
};
