const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const db = require('../db');
const logger = require('../logger');
const { requireAuth, requireAdmin } = require('../auth');
const sharepointSync = require('../services/sharepoint');

// --- In-memory rate limiter for admin endpoints ---
const adminRateLimit = new Map();
const ADMIN_RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const ADMIN_RATE_LIMIT_MAX = 5;

function adminRateLimiter(req, res, next) {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  const now = Date.now();
  const windowStart = now - ADMIN_RATE_LIMIT_WINDOW_MS;

  if (!adminRateLimit.has(ip)) {
    adminRateLimit.set(ip, []);
  }

  const timestamps = adminRateLimit.get(ip).filter(t => t > windowStart);
  adminRateLimit.set(ip, timestamps);

  if (timestamps.length >= ADMIN_RATE_LIMIT_MAX) {
    return res.status(429).json({ error: 'Too many requests. Limit: 5 per minute on admin endpoints.' });
  }

  timestamps.push(now);
  next();
}

// Expose for testing
router._adminRateLimit = adminRateLimit;

// Apply rate limiter to all admin routes
router.use(adminRateLimiter);

// --- Audit logging helper ---
async function logAdminAction(action, performedBy, details, ipAddress) {
  try {
    await db.query(
      `INSERT INTO admin_audit_log (action, performed_by, details, ip_address)
       VALUES ($1, $2, $3, $4)`,
      [action, performedBy, JSON.stringify(details), ipAddress]
    );
  } catch (err) {
    // Audit logging should never block admin operations
    logger.error({ err }, 'Audit log write failed');
  }
}

// --- INIT_SECRET check middleware ---
function checkInitSecret(req, res, next) {
  const { secret } = req.body;
  const initSecret = process.env.INIT_SECRET;
  if (!initSecret || secret !== initSecret) {
    return res.status(401).json({ error: 'Unauthorized - INIT_SECRET required' });
  }
  next();
}

// --- Admin email allowlist middleware ---
function checkAdminAllowlist(req, res, next) {
  const allowlist = process.env.ADMIN_EMAILS;
  if (!allowlist) {
    return next(); // No allowlist configured — backwards compatible
  }

  const allowedEmails = allowlist.split(',').map(e => e.trim().toLowerCase());
  const userEmail = req.user?.email?.toLowerCase();

  if (!userEmail || !allowedEmails.includes(userEmail)) {
    return res.status(403).json({ error: 'Your email is not in the admin allowlist' });
  }

  next();
}

// Expose helpers for testing
router._logAdminAction = logAdminAction;
router._checkAdminAllowlist = checkAdminAllowlist;
router._checkInitSecret = checkInitSecret;
router._adminRateLimiter = adminRateLimiter;

// Database initialization endpoint (POST to prevent accidental execution)
// /init uses INIT_SECRET only — it runs before any users exist
router.post('/init', checkInitSecret, async (req, res) => {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  await logAdminAction('init', 'INIT_SECRET', { endpoint: '/init' }, ip);

  try {
    // Check if tables already exist
    const tablesCheck = await db.query(`
      SELECT COUNT(*) as count FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'users'
    `);
    
    if (parseInt(tablesCheck.rows[0].count) > 0) {
      // Tables exist — run schema migrations (reuses startup migration logic)
      const { runMigrations } = require('../migrate');
      await runMigrations();

      // Check if data exists
      const dataCheck = await db.query('SELECT COUNT(*) as count FROM users');
      if (parseInt(dataCheck.rows[0].count) > 0) {
        return res.json({ 
          message: 'Database already initialized (migrations applied)', 
          users: parseInt(dataCheck.rows[0].count),
          status: 'skipped'
        });
      }
    }

    // Run schema
    const schemaSQL = `
      -- Team Skills Tracker Database Schema
      CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          email VARCHAR(255) UNIQUE NOT NULL,
          entra_oid VARCHAR(36),
          role VARCHAR(100),
          team VARCHAR(100),
          qualifier VARCHAR(100),
          is_admin BOOLEAN DEFAULT false,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_users_entra_oid ON users(entra_oid) WHERE entra_oid IS NOT NULL;

      CREATE TABLE IF NOT EXISTS skill_categories (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          parent_id INTEGER REFERENCES skill_categories(id) ON DELETE CASCADE,
          level INTEGER NOT NULL DEFAULT 1,
          sort_order INTEGER DEFAULT 0,
          description TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(parent_id, name)
      );

      CREATE TABLE IF NOT EXISTS skills (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          category_id INTEGER REFERENCES skill_categories(id) ON DELETE SET NULL,
          description TEXT,
          target_level VARCHAR(10) DEFAULT 'L200',
          is_core BOOLEAN DEFAULT false,
          sort_order INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS user_skills (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          skill_id INTEGER REFERENCES skills(id) ON DELETE CASCADE,
          proficiency_level VARCHAR(10) NOT NULL CHECK (proficiency_level IN ('L100', 'L200', 'L300', 'L400')),
          notes TEXT,
          last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, skill_id)
      );

      CREATE TABLE IF NOT EXISTS skill_relationships (
          id SERIAL PRIMARY KEY,
          parent_skill_id INTEGER REFERENCES skills(id) ON DELETE CASCADE,
          child_skill_id INTEGER REFERENCES skills(id) ON DELETE CASCADE,
          relationship_type VARCHAR(50) DEFAULT 'parent-child',
          UNIQUE(parent_skill_id, child_skill_id),
          CHECK (parent_skill_id != child_skill_id)
      );

      CREATE INDEX IF NOT EXISTS idx_user_skills_user ON user_skills(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_skills_skill ON user_skills(skill_id);
      CREATE INDEX IF NOT EXISTS idx_skills_category ON skills(category_id);
      CREATE INDEX IF NOT EXISTS idx_skill_categories_parent ON skill_categories(parent_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_skill_categories_root_name
          ON skill_categories(name) WHERE parent_id IS NULL;
      CREATE INDEX IF NOT EXISTS idx_skill_relationships_parent ON skill_relationships(parent_skill_id);
      CREATE INDEX IF NOT EXISTS idx_skill_relationships_child ON skill_relationships(child_skill_id);

      CREATE TABLE IF NOT EXISTS skill_proposals (
          id SERIAL PRIMARY KEY,
          proposed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
          name VARCHAR(255) NOT NULL,
          category_id INTEGER REFERENCES skill_categories(id) ON DELETE SET NULL,
          description TEXT,
          status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
          reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
          reviewed_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_skill_proposals_status ON skill_proposals(status);

      CREATE OR REPLACE FUNCTION update_user_skills_timestamp()
      RETURNS TRIGGER AS $$
      BEGIN
          NEW.last_updated = CURRENT_TIMESTAMP;
          RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS update_user_skills_modtime ON user_skills;
      CREATE TRIGGER update_user_skills_modtime
          BEFORE UPDATE ON user_skills
          FOR EACH ROW
          EXECUTE FUNCTION update_user_skills_timestamp();

      CREATE OR REPLACE FUNCTION update_users_timestamp()
      RETURNS TRIGGER AS $$
      BEGIN
          NEW.updated_at = CURRENT_TIMESTAMP;
          RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS update_users_modtime ON users;
      CREATE TRIGGER update_users_modtime
          BEFORE UPDATE ON users
          FOR EACH ROW
          EXECUTE FUNCTION update_users_timestamp();

      CREATE TABLE IF NOT EXISTS user_skills_history (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          skill_id INTEGER REFERENCES skills(id) ON DELETE CASCADE,
          proficiency_level VARCHAR(10) NOT NULL CHECK (proficiency_level IN ('L100', 'L200', 'L300', 'L400')),
          changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_user_skills_history_user ON user_skills_history(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_skills_history_skill ON user_skills_history(skill_id);
      CREATE INDEX IF NOT EXISTS idx_user_skills_history_changed ON user_skills_history(changed_at);

      CREATE TABLE IF NOT EXISTS admin_audit_log (
        id SERIAL PRIMARY KEY,
        action TEXT NOT NULL,
        performed_by TEXT,
        details JSONB,
        ip_address TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE OR REPLACE FUNCTION record_skill_history()
      RETURNS TRIGGER AS $$
      BEGIN
          IF (TG_OP = 'INSERT') OR (OLD.proficiency_level IS DISTINCT FROM NEW.proficiency_level) THEN
              INSERT INTO user_skills_history (user_id, skill_id, proficiency_level)
              VALUES (NEW.user_id, NEW.skill_id, NEW.proficiency_level);
          END IF;
          RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS track_skill_changes ON user_skills;
      CREATE TRIGGER track_skill_changes
          AFTER INSERT OR UPDATE ON user_skills
          FOR EACH ROW
          EXECUTE FUNCTION record_skill_history();
    `;

    await db.query(schemaSQL);
    logger.info('Schema created successfully');

    // Seed data from seed.sql (hierarchical categories + skills + demo users)
    const seedPath = path.resolve(__dirname, '../../database/seed.sql');
    if (fs.existsSync(seedPath)) {
      const seedSQL = fs.readFileSync(seedPath, 'utf8');
      await db.query(seedSQL);
      logger.info('Seed data loaded from seed.sql');
    } else {
      logger.warn('seed.sql not found, skipping seed data');
    }

    // Get counts
    const userCount = await db.query('SELECT COUNT(*) as count FROM users');
    const skillCount = await db.query('SELECT COUNT(*) as count FROM skills');
    const userSkillCount = await db.query('SELECT COUNT(*) as count FROM user_skills');

    res.json({
      message: 'Database initialized successfully',
      status: 'success',
      counts: {
        users: parseInt(userCount.rows[0].count),
        skills: parseInt(skillCount.rows[0].count),
        userSkills: parseInt(userSkillCount.rows[0].count)
      }
    });
  } catch (error) {
    logger.error({ err: error }, 'Database initialization error');
    res.status(500).json({ error: error.message });
  }
});

// Check database status
router.get('/status', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await db.query('SELECT NOW() as time');
    const userCount = await db.query('SELECT COUNT(*) as count FROM users').catch(() => ({ rows: [{ count: 0 }] }));
    const skillCount = await db.query('SELECT COUNT(*) as count FROM skills').catch(() => ({ rows: [{ count: 0 }] }));
    
    res.json({
      connected: true,
      serverTime: result.rows[0].time,
      counts: {
        users: parseInt(userCount.rows[0].count),
        skills: parseInt(skillCount.rows[0].count)
      }
    });
  } catch {
    res.status(500).json({ connected: false, error: 'Database connection failed' });
  }
});

// List all users with admin status (admin only)
router.get('/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, name, email, role, team, is_admin FROM users ORDER BY name'
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Grant or revoke admin access (admin only)
router.put('/users/:id/admin', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { is_admin } = req.body;

    if (typeof is_admin !== 'boolean') {
      return res.status(400).json({ error: 'is_admin must be a boolean' });
    }

    const result = await db.query(
      'UPDATE users SET is_admin = $1 WHERE id = $2 RETURNING id, name, email, is_admin',
      [is_admin, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: update any user's skill (bypasses ownership)
router.put('/user-skills', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { user_id, skill_id, proficiency_level } = req.body;

    if (!user_id || !skill_id || !proficiency_level) {
      return res.status(400).json({ error: 'user_id, skill_id, and proficiency_level required' });
    }

    const validLevels = ['L100', 'L200', 'L300', 'L400'];
    if (!validLevels.includes(proficiency_level)) {
      return res.status(400).json({ error: 'Invalid proficiency level' });
    }

    const result = await db.query(`
      INSERT INTO user_skills (user_id, skill_id, proficiency_level)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id, skill_id) 
      DO UPDATE SET proficiency_level = $3
      RETURNING *
    `, [user_id, skill_id, proficiency_level]);

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: delete any user's skill (bypasses ownership)
router.delete('/user-skills', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { user_id, skill_id } = req.body;

    if (!user_id || !skill_id) {
      return res.status(400).json({ error: 'user_id and skill_id required' });
    }

    await db.query(
      'DELETE FROM user_skills WHERE user_id = $1 AND skill_id = $2',
      [user_id, skill_id]
    );

    res.json({ message: 'Skill removed' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: reset all users (wipe duplicates, start fresh)
// Defense-in-depth: requires BOTH valid Entra auth AND INIT_SECRET
router.post('/reset-users', requireAuth, checkAdminAllowlist, checkInitSecret, async (req, res) => {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  const performedBy = req.user?.email || 'unknown';
  await logAdminAction('reset-users', performedBy, { endpoint: '/reset-users' }, ip);

  try {
    // Delete in dependency order: history → skills → users
    await db.query('DELETE FROM user_skills_history');
    await db.query('DELETE FROM user_skills');
    await db.query('DELETE FROM users');

    res.json({
      message: 'All users, user_skills, and user_skills_history deleted. Re-initialize with /api/admin/init or sync.',
      status: 'success'
    });
  } catch (error) {
    logger.error({ err: error }, 'Reset users error');
    res.status(500).json({ error: 'Failed to reset users' });
  }
});

// Admin: sync skills from CSV or SharePoint
// POST /api/admin/sync-skills
// Body: { source: 'csv' | 'pivot-csv' | 'sharepoint', secret: string, csvContent?: string, filePath?: string }
// Defense-in-depth: requires BOTH valid Entra auth AND INIT_SECRET
router.post('/sync-skills', requireAuth, checkAdminAllowlist, checkInitSecret, async (req, res) => {
  const { source = 'csv', csvContent, filePath } = req.body;
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  const performedBy = req.user?.email || 'unknown';
  await logAdminAction('sync-skills', performedBy, { endpoint: '/sync-skills', source }, ip);

  try {
    const options = {};
    if (csvContent) {
      options.csvContent = csvContent;
    }
    if (filePath) {
      options.filePath = filePath;
    }

    if (source === 'sharepoint') {
      // SharePoint requires Graph API client — future enhancement
      return res.status(501).json({ 
        error: 'SharePoint sync not yet configured. Use source: "csv" or configure SHAREPOINT_CLIENT_ID.',
        hint: 'Set SHAREPOINT_CLIENT_ID, SHAREPOINT_CLIENT_SECRET, and SHAREPOINT_TENANT_ID env vars.'
      });
    }

    const stats = await sharepointSync.sync(source, options);
    res.json({ 
      message: 'Skill sync completed',
      ...stats
    });
  } catch (error) {
    logger.error({ err: error }, 'Sync error');
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
