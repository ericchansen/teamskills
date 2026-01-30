import React, { useState, useEffect } from 'react';
import ProficiencyBadge from './ProficiencyBadge';
import AddSkillModal from './AddSkillModal';
import apiFetch from '../api';
import './UserProfile.css';

function UserProfile({ userId, isOwnProfile = false, onSkillsUpdated }) {
  const [user, setUser] = useState(null);
  const [userSkills, setUserSkills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    if (userId) {
      fetchUserData();
      fetchUserSkills();
    }
  }, [userId]);

  const fetchUserData = async () => {
    try {
      const response = await apiFetch(`/api/users/${userId}`);
      const data = await response.json();
      setUser(data);
    } catch (err) {
      console.error('Failed to fetch user:', err);
    }
  };

  const fetchUserSkills = async () => {
    try {
      const response = await apiFetch(`/api/user-skills/${userId}`);
      const data = await response.json();
      setUserSkills(data);
      setLoading(false);
    } catch (err) {
      console.error('Failed to fetch user skills:', err);
      setLoading(false);
    }
  };

  const handleUpdateProficiency = async (skillId, newLevel) => {
    if (!isOwnProfile) return;
    try {
      const response = await apiFetch('/api/user-skills', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          skill_id: skillId,
          proficiency_level: newLevel,
        }),
      });
      if (response.ok) {
        fetchUserSkills();
        onSkillsUpdated?.();
      }
    } catch (err) {
      console.error('Failed to update proficiency:', err);
    }
  };

  const handleDeleteSkill = async (skillId) => {
    if (!isOwnProfile) return;
    if (!confirm('Remove this skill?')) return;
    try {
      const response = await apiFetch('/api/user-skills', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, skill_id: skillId }),
      });
      if (response.ok) {
        fetchUserSkills();
        onSkillsUpdated?.();
      }
    } catch (err) {
      console.error('Failed to delete skill:', err);
    }
  };

  const handleSkillAdded = () => {
    setShowAddModal(false);
    fetchUserSkills();
    onSkillsUpdated?.();
  };

  if (!userId) return <div className="no-user">Select a user to view their profile</div>;
  if (loading) return <div className="loading">Loading profile...</div>;
  if (!user) return <div className="error">User not found</div>;

  // Group skills by category
  const skillsByCategory = userSkills.reduce((acc, skill) => {
    const category = skill.category_name || 'Uncategorized';
    if (!acc[category]) acc[category] = [];
    acc[category].push(skill);
    return acc;
  }, {});

  return (
    <div className="user-profile">
      <div className="profile-header">
        <div className="profile-title">
          <h2>{user.name}</h2>
          {isOwnProfile && <span className="own-profile-badge">Your Profile</span>}
        </div>
        <p className="user-details">
          {user.role} • {user.team} • {user.email}
        </p>
        {isOwnProfile && (
          <button className="add-skill-btn" onClick={() => setShowAddModal(true)}>
            + Add Skill
          </button>
        )}
        {!isOwnProfile && (
          <p className="view-only-notice">Viewing {user.name.split(' ')[0]}'s profile (read-only)</p>
        )}
      </div>

      <div className="skills-section">
        <h3>Skills ({userSkills.length})</h3>
        {Object.keys(skillsByCategory).length === 0 ? (
          <p className="no-skills">
            {isOwnProfile 
              ? "No skills added yet. Click \"Add Skill\" to get started."
              : "No skills added yet."}
          </p>
        ) : (
          Object.entries(skillsByCategory).map(([category, skills]) => (
            <div key={category} className="category-group">
              <h4>{category}</h4>
              <div className="skills-list">
                {skills.map(skill => (
                  <div key={skill.skill_id} className="skill-item">
                    <div className="skill-info">
                      <div className="skill-title">{skill.skill_name}</div>
                      {skill.skill_description && (
                        <div className="skill-description">{skill.skill_description}</div>
                      )}
                      {skill.notes && (
                        <div className="skill-notes">{skill.notes}</div>
                      )}
                    </div>
                    <div className="skill-actions">
                      {isOwnProfile ? (
                        <>
                          <select
                            value={skill.proficiency_level}
                            onChange={(e) => handleUpdateProficiency(skill.skill_id, e.target.value)}
                            className="proficiency-select"
                          >
                            <option value="L100">L100 - Awareness</option>
                            <option value="L200">L200 - Conversant</option>
                            <option value="L300">L300 - Practitioner</option>
                            <option value="L400">L400 - Expert</option>
                          </select>
                          <button 
                            className="delete-btn"
                            onClick={() => handleDeleteSkill(skill.skill_id)}
                            title="Remove skill"
                          >
                            ✕
                          </button>
                        </>
                      ) : (
                        <ProficiencyBadge level={skill.proficiency_level} />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {showAddModal && isOwnProfile && (
        <AddSkillModal
          userId={userId}
          onClose={() => setShowAddModal(false)}
          onSkillAdded={handleSkillAdded}
        />
      )}
    </div>
  );
}

export default UserProfile;
