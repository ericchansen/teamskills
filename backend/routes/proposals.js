const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth, requireAdmin } = require('../auth');
const { getCanonicalSkillInfo, suggestSkillProposal } = require('../utils/normalizeSkill');

async function findExistingSkillMatch(name) {
  return db.query(
    `SELECT DISTINCT s.id, s.name, s.preferred_label
     FROM skills s
     LEFT JOIN skill_aliases sa ON sa.skill_id = s.id
     WHERE LOWER(s.name) = LOWER($1)
        OR LOWER(COALESCE(s.preferred_label, s.name)) = LOWER($1)
        OR LOWER(sa.alias) = LOWER($1)
     ORDER BY s.id
     LIMIT 1`,
    [name]
  );
}

// Propose a new skill (authenticated users)
router.post('/', requireAuth, async (req, res) => {
  const { name, category_id, description } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Skill name is required' });
  }

  const trimmedName = name.trim();
  const suggestion = suggestSkillProposal(trimmedName);

  // Check if the skill already exists or is already known as an alias/preferred label
  const existing = await findExistingSkillMatch(trimmedName);
  if (existing.rows.length > 0) {
    return res.status(409).json({
      error: 'A skill with this name already exists',
      canonicalSkill: existing.rows[0],
    });
  }

  // Check for duplicate pending proposal
  const pendingDup = await db.query(
    "SELECT id FROM skill_proposals WHERE LOWER(name) = LOWER($1) AND status = 'pending'",
    [trimmedName]
  );
  if (pendingDup.rows.length > 0) {
    return res.status(409).json({ error: 'A proposal for this skill is already pending' });
  }

  let canonicalSkillId = null;
  if (suggestion.canonicalName && suggestion.canonicalName !== trimmedName) {
    const canonical = await db.query(
      'SELECT id FROM skills WHERE name = $1 LIMIT 1',
      [suggestion.canonicalName]
    );
    canonicalSkillId = canonical.rows[0]?.id || null;
  }

  const proposedBy = req.user ? req.user.id : null;
  const result = await db.query(
    `INSERT INTO skill_proposals (
       proposed_by, name, category_id, description,
       canonical_skill_id, suggested_action, confidence, review_notes
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      proposedBy,
      trimmedName,
      category_id || null,
      description || null,
      canonicalSkillId,
      suggestion.suggestedAction,
      suggestion.confidence,
      suggestion.reviewNotes,
    ]
  );

  res.status(201).json(result.rows[0]);
});

// List proposals (admin: all; users: their own)
router.get('/', requireAuth, async (req, res) => {
  const statusFilter = req.query.status || 'pending';
  let query, params;

  if (req.user && req.user.is_admin) {
    query = `
      SELECT sp.*, u.name as proposed_by_name, sc.name as category_name,
             cs.name as canonical_skill_name,
             COALESCE(cs.preferred_label, cs.name) as canonical_preferred_label
      FROM skill_proposals sp
      LEFT JOIN users u ON sp.proposed_by = u.id
      LEFT JOIN skill_categories sc ON sp.category_id = sc.id
      LEFT JOIN skills cs ON sp.canonical_skill_id = cs.id
      ${statusFilter !== 'all' ? 'WHERE sp.status = $1' : ''}
      ORDER BY sp.created_at DESC
    `;
    params = statusFilter !== 'all' ? [statusFilter] : [];
  } else {
    query = `
      SELECT sp.*, sc.name as category_name,
             cs.name as canonical_skill_name,
             COALESCE(cs.preferred_label, cs.name) as canonical_preferred_label
      FROM skill_proposals sp
      LEFT JOIN skill_categories sc ON sp.category_id = sc.id
      LEFT JOIN skills cs ON sp.canonical_skill_id = cs.id
      WHERE sp.proposed_by = $1
      ORDER BY sp.created_at DESC
    `;
    params = [req.user ? req.user.id : -1];
  }

  const result = await db.query(query, params);
  res.json(result.rows);
});

// Approve a proposal (admin only) — creates the skill
router.post('/:id/approve', requireAuth, requireAdmin, async (req, res) => {
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

  let skill;
  if (p.suggested_action === 'alias' && p.canonical_skill_id) {
    await db.query(
      `INSERT INTO skill_aliases (skill_id, alias, source)
       SELECT $1, $2, $3
       WHERE NOT EXISTS (
         SELECT 1 FROM skill_aliases WHERE LOWER(alias) = LOWER($2)
       )`,
      [p.canonical_skill_id, p.name, 'proposal-approved']
    );
    skill = await db.query('SELECT * FROM skills WHERE id = $1', [p.canonical_skill_id]);
  } else {
    const existingSkill = await db.query(
      'SELECT * FROM skills WHERE LOWER(name) = LOWER($1) LIMIT 1',
      [p.name]
    );
    if (existingSkill.rows.length > 0) {
      skill = existingSkill;
    } else {
      const info = getCanonicalSkillInfo(p.name);
      skill = await db.query(
        `INSERT INTO skills (
           name, category_id, description, preferred_label, concept_type, lifecycle_status, vendor_namespace
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          p.name,
          p.category_id,
          p.description,
          info.preferredLabel,
          info.conceptType,
          info.lifecycleStatus,
          info.vendorNamespace,
        ]
      );
    }
  }

  // Update proposal status
  await db.query(
    `UPDATE skill_proposals 
     SET status = 'approved', reviewed_by = $1, reviewed_at = CURRENT_TIMESTAMP 
     WHERE id = $2`,
    [req.user ? req.user.id : null, id]
  );

  res.json({ proposal: { ...p, status: 'approved' }, skill: skill.rows[0] });
});

// Reject a proposal (admin only)
router.post('/:id/reject', requireAuth, requireAdmin, async (req, res) => {
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
});

module.exports = router;
