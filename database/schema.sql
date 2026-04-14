-- Team Skills Tracker Database Schema
-- PostgreSQL Schema for tracking user skills and proficiency levels
-- This is the SINGLE SOURCE OF TRUTH for the database schema.
-- Used by: /api/admin/init (fresh DB setup), startup migrations (incremental).
-- All statements use IF NOT EXISTS / OR REPLACE so re-running is a no-op.

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    entra_oid VARCHAR(36),  -- Microsoft Entra ID object ID (GUID)
    role VARCHAR(100),
    team VARCHAR(100),
    qualifier VARCHAR(100),
    is_admin BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast Entra ID lookups
CREATE INDEX IF NOT EXISTS idx_users_entra_oid ON users(entra_oid) WHERE entra_oid IS NOT NULL;

-- Skill categories table (hierarchical: Role > Domain > Subdomain)
CREATE TABLE IF NOT EXISTS skill_categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    parent_id INTEGER REFERENCES skill_categories(id) ON DELETE CASCADE,
    level INTEGER NOT NULL DEFAULT 1,  -- 1=Role, 2=Domain, 3=Subdomain
    sort_order INTEGER DEFAULT 0,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(parent_id, name)
);

-- Skills table
CREATE TABLE IF NOT EXISTS skills (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    preferred_label VARCHAR(255),
    concept_type VARCHAR(50),
    lifecycle_status VARCHAR(20) NOT NULL DEFAULT 'active',
    vendor_namespace VARCHAR(100),
    category_id INTEGER REFERENCES skill_categories(id) ON DELETE SET NULL,
    description TEXT,
    target_level VARCHAR(10) DEFAULT 'L200',
    is_core BOOLEAN DEFAULT false,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User skills with proficiency levels
CREATE TABLE IF NOT EXISTS user_skills (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    skill_id INTEGER REFERENCES skills(id) ON DELETE CASCADE,
    proficiency_level VARCHAR(10) NOT NULL CHECK (proficiency_level IN ('L100', 'L200', 'L300', 'L400')),
    notes TEXT,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, skill_id)
);

-- Skill relationships (parent-child hierarchy)
CREATE TABLE IF NOT EXISTS skill_relationships (
    id SERIAL PRIMARY KEY,
    parent_skill_id INTEGER REFERENCES skills(id) ON DELETE CASCADE,
    child_skill_id INTEGER REFERENCES skills(id) ON DELETE CASCADE,
    relationship_type VARCHAR(50) DEFAULT 'parent-child',
    UNIQUE(parent_skill_id, child_skill_id),
    CHECK (parent_skill_id != child_skill_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_skills_user ON user_skills(user_id);
CREATE INDEX IF NOT EXISTS idx_user_skills_skill ON user_skills(skill_id);
CREATE INDEX IF NOT EXISTS idx_skills_category ON skills(category_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_skills_name ON skills(name);
CREATE INDEX IF NOT EXISTS idx_skill_categories_parent ON skill_categories(parent_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_skill_categories_root_name ON skill_categories(name) WHERE parent_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_skill_relationships_parent ON skill_relationships(parent_skill_id);
CREATE INDEX IF NOT EXISTS idx_skill_relationships_child ON skill_relationships(child_skill_id);

-- Canonical alias registry for approved alternate skill labels
CREATE TABLE IF NOT EXISTS skill_aliases (
    id SERIAL PRIMARY KEY,
    skill_id INTEGER REFERENCES skills(id) ON DELETE CASCADE NOT NULL,
    alias VARCHAR(255) NOT NULL,
    source VARCHAR(50) DEFAULT 'manual',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(skill_id, alias)
);

CREATE INDEX IF NOT EXISTS idx_skill_aliases_skill ON skill_aliases(skill_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_skill_aliases_alias_lower ON skill_aliases(LOWER(alias));

-- Update trigger for user_skills
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

-- Update trigger for users
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

-- Proficiency history for tracking changes over time
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

-- Admin audit log (used by /api/admin endpoints)
CREATE TABLE IF NOT EXISTS admin_audit_log (
    id SERIAL PRIMARY KEY,
    action TEXT NOT NULL,
    performed_by TEXT,
    details JSONB,
    ip_address TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Trigger to record proficiency changes automatically
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
