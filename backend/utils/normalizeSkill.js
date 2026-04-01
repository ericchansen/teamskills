/**
 * Skill name normalization utilities.
 *
 * Handles dedup suffixes from Excel pivot exports (e.g., "Azure Functions3"),
 * URL-encoded characters (e.g., "C%23 / .NET"), Fabric prefixes, and
 * known aliases from the canonical Inventory.csv.
 */

const nameMap = require('../data/skill-name-map.json');

const aliases = nameMap.aliases || {};

/**
 * Normalize a skill name: apply aliases, URL-decode, strip Fabric prefix,
 * and strip trailing dedup digits.
 * "Azure Container Apps2" → "Azure Container Apps"
 * "C%23 / .NET" → "C# / .NET"
 * "Fabric OneLake" → "OneLake"
 */
function normalizeSkillName(name) {
  if (!name) return name;
  const trimmed = name.trim();

  // Check explicit alias map first (catches all known variants)
  if (aliases[trimmed]) return aliases[trimmed];

  // URL-decode percent-encoded characters (e.g., %23 → #)
  let result = trimmed;
  if (result.includes('%')) {
    try { result = decodeURIComponent(result); } catch { /* keep original */ }
    if (aliases[result]) return aliases[result];
  }

  // Strip trailing digits that look like Excel dedup suffixes (e.g., "Foo3")
  // Only strip if the base name (without digits) is different and the suffix
  // is 1-2 digits — real names like "L200" or "SQL DB" should be preserved.
  const match = result.match(/^(.+?)\d{1,2}$/);
  if (match) {
    const base = match[1];
    // Only strip if the base ends with a letter or closing paren (not a digit)
    if (base && /[a-zA-Z)\]]$/.test(base)) {
      return base;
    }
  }

  return result;
}

module.exports = { normalizeSkillName, aliases };
