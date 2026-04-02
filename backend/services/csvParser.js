/**
 * CSV Parsing Utilities
 *
 * Pure functions for parsing CSV content — no database or Graph API dependencies.
 * Handles both flat skill-list CSVs and pivot-table (skills matrix) CSVs.
 */

const fs = require('fs');

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

module.exports = { parseCSVLine, parseCSVContent, parseCSV, parsePivotCSV };
