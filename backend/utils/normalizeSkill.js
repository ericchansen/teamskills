/**
 * Skill name normalization utilities.
 *
 * Handles dedup suffixes from Excel pivot exports (e.g., "Azure Functions3")
 * and known aliases from the canonical Inventory.csv.
 */

const nameMap = require('../data/skill-name-map.json');

const aliases = nameMap.aliases || {};

/**
 * Normalize a skill name: strip trailing dedup digits and apply known aliases.
 * "Azure Container Apps2" → "Azure Container Apps"
 * "Azure Functions3" → "Azure Functions"
 */
function normalizeSkillName(name) {
  if (!name) return name;
  const trimmed = name.trim();

  // Check explicit alias map first
  if (aliases[trimmed]) return aliases[trimmed];

  // Strip trailing digits that look like Excel dedup suffixes (e.g., "Foo3")
  // Only strip if the base name (without digits) is different and the suffix
  // is 1-2 digits — real names like "L200" or "SQL DB" should be preserved.
  const match = trimmed.match(/^(.+?)\d{1,2}$/);
  if (match) {
    const base = match[1];
    // Only strip if the base ends with a letter or closing paren (not a digit)
    if (base && /[a-zA-Z)\]]$/.test(base)) {
      return base;
    }
  }

  return trimmed;
}

module.exports = { normalizeSkillName, aliases };
