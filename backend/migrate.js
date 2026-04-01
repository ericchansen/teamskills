const db = require('./db');
const logger = require('./logger');

/**
 * Idempotent schema migrations — safe to run on every startup.
 * Each statement uses IF NOT EXISTS / IF EXISTS guards so re-running is a no-op.
 * Add new migrations at the bottom with a comment noting the PR/date.
 */
async function runMigrations() {
  try {
    // Check if core tables exist (skip if fresh DB — init endpoint handles creation)
    const tablesCheck = await db.query(`
      SELECT COUNT(*) as count FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'users'
    `);

    if (parseInt(tablesCheck.rows[0].count) === 0) {
      logger.info('No tables found — skipping startup migrations (init endpoint will create schema)');
      return;
    }

    await db.query(`
      -- PR #79: Hierarchical skill categories
      -- Guard each table group in case of partially-initialized schemas
      DO $$ BEGIN
        IF to_regclass('public.skill_categories') IS NOT NULL THEN
          ALTER TABLE skill_categories ADD COLUMN IF NOT EXISTS parent_id INTEGER REFERENCES skill_categories(id) ON DELETE CASCADE;
          ALTER TABLE skill_categories ADD COLUMN IF NOT EXISTS level INTEGER NOT NULL DEFAULT 1;
          ALTER TABLE skill_categories ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
          CREATE INDEX IF NOT EXISTS idx_skill_categories_parent ON skill_categories(parent_id);
          CREATE UNIQUE INDEX IF NOT EXISTS idx_skill_categories_root_name
              ON skill_categories(name) WHERE parent_id IS NULL;
          CREATE UNIQUE INDEX IF NOT EXISTS idx_skill_categories_parent_name
              ON skill_categories(parent_id, name);
        END IF;
      END $$;

      DO $$ BEGIN
        IF to_regclass('public.skills') IS NOT NULL THEN
          ALTER TABLE skills ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
        END IF;
      END $$;

      DO $$ BEGIN
        IF to_regclass('public.users') IS NOT NULL THEN
          ALTER TABLE users ADD COLUMN IF NOT EXISTS qualifier VARCHAR(100);
        END IF;
      END $$;

      -- Admin audit log (used by /api/admin endpoints)
      CREATE TABLE IF NOT EXISTS admin_audit_log (
        id SERIAL PRIMARY KEY,
        action VARCHAR(50) NOT NULL,
        performed_by VARCHAR(255),
        details JSONB,
        ip_address VARCHAR(45),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    logger.info('Startup migrations applied successfully');
  } catch (err) {
    // Log but don't crash — the server can still serve cached/demo data
    // and the health check will report schema issues
    logger.error({ err }, 'Startup migrations failed');
  }
}

module.exports = { runMigrations };
