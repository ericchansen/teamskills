-- Migration 005: Add target proficiency levels for gap analysis
-- Allows defining expected proficiency per skill (optionally per role)

BEGIN;

ALTER TABLE skills ADD COLUMN IF NOT EXISTS target_level VARCHAR(10) DEFAULT 'L200';
ALTER TABLE skills ADD COLUMN IF NOT EXISTS is_core BOOLEAN DEFAULT false;

COMMIT;
