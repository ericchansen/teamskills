const express = require('express');
const router = express.Router();
const db = require('../db');

// GET matrix view (all users × skills)
router.get('/', async (req, res) => {
  try {
    // Get all users
    const usersResult = await db.query('SELECT * FROM users ORDER BY name');
    
    // Get all skills with categories
    const skillsResult = await db.query(`
      SELECT s.*, sc.name as category_name 
      FROM skills s
      LEFT JOIN skill_categories sc ON s.category_id = sc.id
      ORDER BY sc.name, s.name
    `);
    
    // Get all user-skill relationships
    const userSkillsResult = await db.query(`
      SELECT user_id, skill_id, proficiency_level, notes
      FROM user_skills
    `);
    
    // Build matrix structure
    const matrix = {
      users: usersResult.rows,
      skills: skillsResult.rows,
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
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch matrix data' });
  }
});

module.exports = router;
