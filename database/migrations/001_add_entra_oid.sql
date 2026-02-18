-- Migration: Add Entra ID support to users table
-- Date: 2026-02-17
-- Description: Adds entra_oid column for Microsoft Entra ID authentication

-- Add entra_oid column (nullable for backward compatibility with existing users)
ALTER TABLE users ADD COLUMN IF NOT EXISTS entra_oid VARCHAR(36);

-- Create index for fast lookups by Entra ID
CREATE INDEX IF NOT EXISTS idx_users_entra_oid ON users(entra_oid) WHERE entra_oid IS NOT NULL;

-- Verify migration
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'entra_oid') THEN
        RAISE NOTICE 'Migration successful: entra_oid column exists';
    ELSE
        RAISE EXCEPTION 'Migration failed: entra_oid column not created';
    END IF;
END $$;
