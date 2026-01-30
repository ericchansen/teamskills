import React, { useState, useEffect } from 'react';
import './AddSkillModal.css';

function AddSkillModal({ userId, onClose, onSkillAdded }) {
  const [allSkills, setAllSkills] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSkill, setSelectedSkill] = useState(null);
  const [proficiencyLevel, setProficiencyLevel] = useState('L100');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSkills();
  }, []);

  const fetchSkills = async () => {
    try {
      const response = await fetch('/api/skills');
      const data = await response.json();
      setAllSkills(data);
      setLoading(false);
    } catch (err) {
      console.error('Failed to fetch skills:', err);
      setLoading(false);
    }
  };

  const filteredSkills = allSkills.filter(skill =>
    skill.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedSkill) return;

    try {
      const response = await fetch('/api/user-skills', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          skill_id: selectedSkill.id,
          proficiency_level: proficiencyLevel,
          notes: notes.trim() || null,
        }),
      });

      if (response.ok) {
        onSkillAdded();
      }
    } catch (err) {
      console.error('Failed to add skill:', err);
      alert('Failed to add skill. Please try again.');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Add Skill</h3>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Search Skills</label>
            <input
              type="text"
              placeholder="Type to search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
              autoFocus
            />
          </div>

          {searchTerm && (
            <div className="skills-dropdown">
              {loading ? (
                <div className="loading-text">Loading skills...</div>
              ) : filteredSkills.length === 0 ? (
                <div className="no-results">No skills found</div>
              ) : (
                filteredSkills.slice(0, 10).map(skill => (
                  <div
                    key={skill.id}
                    className={`skill-option ${selectedSkill?.id === skill.id ? 'selected' : ''}`}
                    onClick={() => setSelectedSkill(skill)}
                  >
                    <div className="skill-option-name">{skill.name}</div>
                    <div className="skill-option-category">{skill.category_name}</div>
                  </div>
                ))
              )}
            </div>
          )}

          {selectedSkill && (
            <div className="selected-skill">
              <div className="form-group">
                <label>Selected Skill</label>
                <div className="selected-skill-info">
                  <strong>{selectedSkill.name}</strong>
                  <span className="category-tag">{selectedSkill.category_name}</span>
                </div>
              </div>

              <div className="form-group">
                <label>Proficiency Level</label>
                <div className="proficiency-options">
                  {['L100', 'L200', 'L300', 'L400'].map(level => (
                    <label key={level} className="radio-option">
                      <input
                        type="radio"
                        value={level}
                        checked={proficiencyLevel === level}
                        onChange={(e) => setProficiencyLevel(e.target.value)}
                      />
                      <span>{level}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label>Notes (optional)</label>
                <textarea
                  placeholder="Add evidence or context for this skill (e.g., certifications, projects, years of experience)..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="notes-input"
                  rows={3}
                />
              </div>

              <div className="modal-actions">
                <button type="button" onClick={onClose} className="cancel-btn">
                  Cancel
                </button>
                <button type="submit" className="submit-btn">
                  Add Skill
                </button>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

export default AddSkillModal;
