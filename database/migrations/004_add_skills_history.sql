-- Migration: Add user_skills_history table for tracking proficiency changes over time
-- This enables the Proficiency Trends visualization

CREATE TABLE IF NOT EXISTS user_skills_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    skill_id INTEGER REFERENCES skills(id) ON DELETE CASCADE,
    proficiency_level VARCHAR(10) NOT NULL CHECK (proficiency_level IN ('L100', 'L200', 'L300', 'L400')),
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_user_skills_history_user ON user_skills_history(user_id);
CREATE INDEX idx_user_skills_history_skill ON user_skills_history(skill_id);
CREATE INDEX idx_user_skills_history_changed ON user_skills_history(changed_at);

-- Trigger to automatically record proficiency changes
CREATE OR REPLACE FUNCTION record_skill_history()
RETURNS TRIGGER AS $$
BEGIN
    -- Record on INSERT or when proficiency_level changes on UPDATE
    IF (TG_OP = 'INSERT') OR (OLD.proficiency_level IS DISTINCT FROM NEW.proficiency_level) THEN
        INSERT INTO user_skills_history (user_id, skill_id, proficiency_level)
        VALUES (NEW.user_id, NEW.skill_id, NEW.proficiency_level);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER track_skill_changes
    AFTER INSERT OR UPDATE ON user_skills
    FOR EACH ROW
    EXECUTE FUNCTION record_skill_history();

-- Backfill history from existing user_skills data
INSERT INTO user_skills_history (user_id, skill_id, proficiency_level, changed_at)
SELECT user_id, skill_id, proficiency_level, last_updated
FROM user_skills;
