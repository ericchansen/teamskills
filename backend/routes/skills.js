const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth, requireAdmin } = require('../auth');

// GET all skills
router.get('/', async (req, res) => {
  const result = await db.query(`
    SELECT s.*, sc.name as category_name 
    FROM skills s
    LEFT JOIN skill_categories sc ON s.category_id = sc.id
    ORDER BY sc.name, s.name
  `);
  res.json(result.rows);
});

// GET single skill
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  const result = await db.query(`
    SELECT s.*, sc.name as category_name 
    FROM skills s
    LEFT JOIN skill_categories sc ON s.category_id = sc.id
    WHERE s.id = $1
  `, [id]);
  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Skill not found' });
  }
  res.json(result.rows[0]);
});

// GET related skills (parent-child relationships)
router.get('/:id/related', async (req, res) => {
  const { id } = req.params;
  const result = await db.query(`
    SELECT s.*, sr.relationship_type,
      CASE WHEN sr.parent_skill_id = $1 THEN 'child' ELSE 'parent' END as relationship
    FROM skill_relationships sr
    JOIN skills s ON (sr.child_skill_id = s.id OR sr.parent_skill_id = s.id)
    WHERE (sr.parent_skill_id = $1 OR sr.child_skill_id = $1) AND s.id != $1
  `, [id]);
  res.json(result.rows);
});

// POST create skill (admin only)
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const { name, category_id, description } = req.body;
  const result = await db.query(
    'INSERT INTO skills (name, category_id, description) VALUES ($1, $2, $3) RETURNING *',
    [name, category_id, description]
  );
  res.status(201).json(result.rows[0]);
});

// PUT update skill (admin only)
router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, category_id, description } = req.body;
  const result = await db.query(
    'UPDATE skills SET name = $1, category_id = $2, description = $3 WHERE id = $4 RETURNING *',
    [name, category_id, description, id]
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Skill not found' });
  }
  res.json(result.rows[0]);
});

// DELETE skill (admin only)
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const result = await db.query('DELETE FROM skills WHERE id = $1 RETURNING *', [id]);
  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Skill not found' });
  }
  res.json({ message: 'Skill deleted successfully' });
});

module.exports = router;
