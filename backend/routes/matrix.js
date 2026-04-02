const express = require('express');
const router = express.Router();
const db = require('../db');

// GET matrix view (all users × skills)
router.get('/', async (req, res) => {
  // Get all users
  const usersResult = await db.query('SELECT * FROM users ORDER BY name');

  // Get all categories (hierarchical)
  const categoriesResult = await db.query(
    'SELECT id, name, parent_id, level, sort_order FROM skill_categories ORDER BY level, sort_order, name'
  );

  // Get all skills with full category path
  const skillsResult = await db.query(`
    SELECT s.id, s.name, s.preferred_label, s.concept_type, s.lifecycle_status, s.vendor_namespace,
           s.category_id, s.description, s.target_level, s.is_core, s.sort_order,
           sc.name as category_name,
           sc.parent_id as category_parent_id,
           sc.level as category_level
    FROM skills s
    LEFT JOIN skill_categories sc ON s.category_id = sc.id
    ORDER BY sc.sort_order NULLS LAST, s.sort_order, s.name
  `);

  // Build category lookup for path resolution
  const catMap = {};
  for (const cat of categoriesResult.rows) {
    catMap[cat.id] = cat;
  }

  // Add category_path to each skill (e.g. "Apps & AI > Containers > Solution")
  const skills = skillsResult.rows.map(s => {
    const path = [];
    let cur = s.category_id ? catMap[s.category_id] : null;
    while (cur) {
      path.unshift(cur.name);
      cur = cur.parent_id ? catMap[cur.parent_id] : null;
    }
    return { ...s, category_path: path.join(' > ') || 'Uncategorized' };
  });

  // Get all user-skill relationships
  const userSkillsResult = await db.query(
    'SELECT user_id, skill_id, proficiency_level, notes FROM user_skills'
  );

  // Build nested category tree
  const treeMap = {};
  for (const cat of categoriesResult.rows) {
    treeMap[cat.id] = { ...cat, children: [] };
  }
  const categoryTree = [];
  for (const cat of categoriesResult.rows) {
    const node = treeMap[cat.id];
    if (cat.parent_id && treeMap[cat.parent_id]) {
      treeMap[cat.parent_id].children.push(node);
    } else {
      categoryTree.push(node);
    }
  }

  // Build matrix structure
  const matrix = {
    users: usersResult.rows,
    skills,
    categories: categoryTree,
    userSkills: {}
  };

  // Create a lookup map for quick access
  userSkillsResult.rows.forEach(us => {
    const key = `${us.user_id}-${us.skill_id}`;
    matrix.userSkills[key] = {
      proficiency_level: us.proficiency_level,
      notes: us.notes
    };
  });

  res.json(matrix);
});

module.exports = router;
