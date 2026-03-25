const express = require('express');
const router = express.Router();
const db = require('../db');
const logger = require('../logger');
const { requireAuth, requireAdmin } = require('../auth');

// GET all categories
router.get('/', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM skill_categories ORDER BY name');
    res.json(result.rows);
  } catch (err) {
    logger.error({ err }, 'Failed to fetch categories');
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// POST create category
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, description } = req.body;
    const result = await db.query(
      'INSERT INTO skill_categories (name, description) VALUES ($1, $2) RETURNING *',
      [name, description]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    logger.error({ err }, 'Failed to create category');
    res.status(500).json({ error: 'Failed to create category' });
  }
});

module.exports = router;
