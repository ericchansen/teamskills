const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth, requireAdmin } = require('../auth');

// Propose a new skill (authenticated users)
router.post('/', requireAuth, async (req, res) => {
  try {
    const { name, category_id, description } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Skill name is required' });
    }

    // Check if skill already exists
    const existing = await db.query(
      'SELECT id FROM skills WHERE LOWER(name) = LOWER($1)',
      [name.trim()]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'A skill with this name already exists' });
    }

    // Check for duplicate pending proposal
    const pendingDup = await db.query(
      "SELECT id FROM skill_proposals WHERE LOWER(name) = LOWER($1) AND status = 'pending'",
      [name.trim()]
    );
    if (pendingDup.rows.length > 0) {
      return res.status(409).json({ error: 'A proposal for this skill is already pending' });
    }

    const proposedBy = req.user ? req.user.id : null;
    const result = await db.query(
      `INSERT INTO skill_proposals (proposed_by, name, category_id, description)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [proposedBy, name.trim(), category_id || null, description || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// List proposals (admin: all; users: their own)
router.get('/', requireAuth, async (req, res) => {
  try {
    const statusFilter = req.query.status || 'pending';
    let query, params;

    if (req.user && req.user.is_admin) {
      query = `
        SELECT sp.*, u.name as proposed_by_name, sc.name as category_name
        FROM skill_proposals sp
        LEFT JOIN users u ON sp.proposed_by = u.id
        LEFT JOIN skill_categories sc ON sp.category_id = sc.id
        ${statusFilter !== 'all' ? 'WHERE sp.status = $1' : ''}
        ORDER BY sp.created_at DESC
      `;
      params = statusFilter !== 'all' ? [statusFilter] : [];
    } else {
      query = `
        SELECT sp.*, sc.name as category_name
        FROM skill_proposals sp
        LEFT JOIN skill_categories sc ON sp.category_id = sc.id
        WHERE sp.proposed_by = $1
        ORDER BY sp.created_at DESC
      `;
      params = [req.user ? req.user.id : -1];
    }

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Approve a proposal (admin only) — creates the skill
router.post('/:id/approve', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Get the proposal
    const proposal = await db.query(
      "SELECT * FROM skill_proposals WHERE id = $1 AND status = 'pending'",
      [id]
    );
    if (proposal.rows.length === 0) {
      return res.status(404).json({ error: 'Pending proposal not found' });
    }

    const p = proposal.rows[0];

    // Create the skill
    const skill = await db.query(
      `INSERT INTO skills (name, category_id, description)
       VALUES ($1, $2, $3) RETURNING *`,
      [p.name, p.category_id, p.description]
    );

    // Update proposal status
    await db.query(
      `UPDATE skill_proposals 
       SET status = 'approved', reviewed_by = $1, reviewed_at = CURRENT_TIMESTAMP 
       WHERE id = $2`,
      [req.user ? req.user.id : null, id]
    );

    res.json({ proposal: { ...p, status: 'approved' }, skill: skill.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reject a proposal (admin only)
router.post('/:id/reject', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      `UPDATE skill_proposals 
       SET status = 'rejected', reviewed_by = $1, reviewed_at = CURRENT_TIMESTAMP 
       WHERE id = $2 AND status = 'pending'
       RETURNING *`,
      [req.user ? req.user.id : null, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Pending proposal not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
