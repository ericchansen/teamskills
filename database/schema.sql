-- Team Skills Tracker Database Schema
-- PostgreSQL Schema for tracking user skills and proficiency levels

-- Users table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    entra_oid VARCHAR(36),  -- Microsoft Entra ID object ID (GUID)
    role VARCHAR(100),
    team VARCHAR(100),
    is_admin BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast Entra ID lookups
CREATE INDEX idx_users_entra_oid ON users(entra_oid) WHERE entra_oid IS NOT NULL;

-- Skill categories table (e.g., "Azure Services", "Soft Skills", "Use Cases")
CREATE TABLE skill_categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Skills table
CREATE TABLE skills (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    category_id INTEGER REFERENCES skill_categories(id) ON DELETE SET NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User skills with proficiency levels
CREATE TABLE user_skills (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    skill_id INTEGER REFERENCES skills(id) ON DELETE CASCADE,
    proficiency_level VARCHAR(10) NOT NULL CHECK (proficiency_level IN ('L100', 'L200', 'L300', 'L400')),
    notes TEXT,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, skill_id)
);

-- Skill relationships (parent-child hierarchy)
CREATE TABLE skill_relationships (
    id SERIAL PRIMARY KEY,
    parent_skill_id INTEGER REFERENCES skills(id) ON DELETE CASCADE,
    child_skill_id INTEGER REFERENCES skills(id) ON DELETE CASCADE,
    relationship_type VARCHAR(50) DEFAULT 'parent-child',
    UNIQUE(parent_skill_id, child_skill_id),
    CHECK (parent_skill_id != child_skill_id)
);

-- Indexes for performance
CREATE INDEX idx_user_skills_user ON user_skills(user_id);
CREATE INDEX idx_user_skills_skill ON user_skills(skill_id);
CREATE INDEX idx_skills_category ON skills(category_id);
CREATE INDEX idx_skill_relationships_parent ON skill_relationships(parent_skill_id);
CREATE INDEX idx_skill_relationships_child ON skill_relationships(child_skill_id);

-- Update trigger for user_skills
CREATE OR REPLACE FUNCTION update_user_skills_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_updated = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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

CREATE TRIGGER update_users_modtime
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_users_timestamp();
