const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/trends?userId=X — proficiency history for a user
router.get('/', async (req, res) => {
  try {
    const { userId } = req.query;
    
    let query, params;
    if (userId) {
      query = `
        SELECT h.user_id, h.skill_id, h.proficiency_level, h.changed_at,
               u.name as user_name, s.name as skill_name, sc.name as category_name
        FROM user_skills_history h
        JOIN users u ON h.user_id = u.id
        JOIN skills s ON h.skill_id = s.id
        LEFT JOIN skill_categories sc ON s.category_id = sc.id
        WHERE h.user_id = $1
        ORDER BY h.changed_at ASC
      `;
      params = [userId];
    } else {
      // Team-wide: aggregate average proficiency per month
      query = `
        SELECT 
          date_trunc('month', h.changed_at) as month,
          sc.name as category_name,
          ROUND(AVG(
            CASE h.proficiency_level
              WHEN 'L100' THEN 100
              WHEN 'L200' THEN 200
              WHEN 'L300' THEN 300
              WHEN 'L400' THEN 400
            END
          )) as avg_level,
          COUNT(DISTINCT h.user_id) as user_count
        FROM user_skills_history h
        JOIN skills s ON h.skill_id = s.id
        LEFT JOIN skill_categories sc ON s.category_id = sc.id
        GROUP BY date_trunc('month', h.changed_at), sc.name
        ORDER BY month ASC, category_name
      `;
      params = [];
    }

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching trends:', err.message);
    res.status(500).json({ error: 'Failed to fetch trends' });
  }
});

module.exports = router;
