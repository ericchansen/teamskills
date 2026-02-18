-- Migration: Add skill_proposals table for user-suggested skills
-- Users propose new skills, admins approve/reject them

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
