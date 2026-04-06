/**
 * Skill name normalization utilities.
 *
 * Handles dedup suffixes from Excel pivot exports (e.g., "Azure Functions3"),
 * URL-encoded characters (e.g., "C%23 / .NET"), Fabric prefixes, and
 * known aliases from the canonical Inventory.csv.
 */

const taxonomy = require('../data/skill-taxonomy');

const aliases = taxonomy.aliases || {};
const skillMetadata = taxonomy.skillMetadata || {};

/**
 * Normalize a skill name: apply explicit alias map (includes Fabric-prefixed
 * names, URL-encoded variants, and known dedup suffixes), URL-decode, and
 * strip trailing dedup digits.
 * "Azure Container Apps2" → "Azure Container Apps"
 * "C%23 / .NET" → "C# / .NET"
 * "Fabric OneLake" → "OneLake"
 */
function normalizeSkillName(name) {
  if (!name) return name;
  const trimmed = name.trim();
  if (!trimmed) return trimmed;

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
      return aliases[base] || base;
    }
  }

  return aliases[result] || result;
}

function getCanonicalSkillInfo(name) {
  const canonicalName = normalizeSkillName(name);
  const metadata = skillMetadata[canonicalName] || {};

  return {
    canonicalName,
    preferredLabel: metadata.preferredLabel || canonicalName,
    conceptType: metadata.conceptType || null,
    lifecycleStatus: metadata.lifecycleStatus || 'active',
    vendorNamespace: metadata.vendorNamespace || null,
  };
}

module.exports = {
  normalizeSkillName,
  aliases,
  getCanonicalSkillInfo,
};
