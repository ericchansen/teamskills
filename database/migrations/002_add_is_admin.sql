-- Migration: Add is_admin column to users table
-- Enables admin role for designated users who can edit anyone's skills

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;
