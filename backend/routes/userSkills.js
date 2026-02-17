const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth, requireOwnership } = require('../auth');

// GET all skills for a user (public - no auth required)
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await db.query(`
      SELECT us.*, s.name as skill_name, s.description as skill_description,
             sc.name as category_name
      FROM user_skills us
      JOIN skills s ON us.skill_id = s.id
      LEFT JOIN skill_categories sc ON s.category_id = sc.id
      WHERE us.user_id = $1
      ORDER BY sc.name, s.name
    `, [userId]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch user skills' });
  }
});

// PUT update or create user skill (auth required, own data only)
router.put('/', requireAuth, requireOwnership(req => req.body.user_id), async (req, res) => {
  try {
    const { user_id, skill_id, proficiency_level, notes } = req.body;
    
    // Validate proficiency level
    if (!['L100', 'L200', 'L300', 'L400'].includes(proficiency_level)) {
      return res.status(400).json({ error: 'Invalid proficiency level' });
    }

    const result = await db.query(`
      INSERT INTO user_skills (user_id, skill_id, proficiency_level, notes)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_id, skill_id) 
      DO UPDATE SET proficiency_level = $3, notes = $4, last_updated = CURRENT_TIMESTAMP
      RETURNING *
    `, [user_id, skill_id, proficiency_level, notes]);
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update user skill' });
  }
});

// DELETE user skill (auth required, own data only)
router.delete('/', requireAuth, requireOwnership(req => req.body.user_id), async (req, res) => {
  try {
    const { user_id, skill_id } = req.body;
    const result = await db.query(
      'DELETE FROM user_skills WHERE user_id = $1 AND skill_id = $2 RETURNING *',
      [user_id, skill_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User skill not found' });
    }
    res.json({ message: 'User skill deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete user skill' });
  }
});

module.exports = router;
