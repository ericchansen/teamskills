const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth, requireAdmin } = require('../auth');

// GET all categories
router.get('/', async (req, res) => {
  const result = await db.query('SELECT * FROM skill_categories ORDER BY name');
  res.json(result.rows);
});

// POST create category
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const { name, description } = req.body;
  const result = await db.query(
    'INSERT INTO skill_categories (name, description) VALUES ($1, $2) RETURNING *',
    [name, description]
  );
  res.status(201).json(result.rows[0]);
});

module.exports = router;
