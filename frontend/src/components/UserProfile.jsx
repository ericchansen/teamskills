import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import ProficiencyBadge from './ProficiencyBadge';
import AddSkillModal from './AddSkillModal';
import ConfirmModal from './ConfirmModal';
import apiFetch from '../api';
import './UserProfile.css';

function UserProfile({ userId, isOwnProfile = false, onSkillsUpdated }) {
  const [user, setUser] = useState(null);
  const [userSkills, setUserSkills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [updating, setUpdating] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, skillId: null, skillName: '' });

  const fetchUserData = useCallback(async () => {
    if (!userId) return;
    try {
      const response = await apiFetch(`/api/users/${userId}`);
      if (!response.ok) throw new Error('Failed to fetch user');
      const data = await response.json();
      setUser(data);
    } catch (err) {
      console.error('Failed to fetch user:', err);
      setError(err.message);
    }
  }, [userId]);

  const fetchUserSkills = useCallback(async () => {
    if (!userId) return;
    try {
      const response = await apiFetch(`/api/user-skills/${userId}`);
      if (!response.ok) throw new Error('Failed to fetch skills');
      const data = await response.json();
      setUserSkills(data);
    } catch (err) {
      console.error('Failed to fetch user skills:', err);
      setError(err.message);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) {
      setLoading(true);
      setError(null);
      Promise.all([fetchUserData(), fetchUserSkills()])
        .finally(() => setLoading(false));
    }
  }, [userId, fetchUserData, fetchUserSkills]);

  const handleUpdateProficiency = async (skillId, newLevel) => {
    if (!isOwnProfile) return;
    setUpdating(skillId);
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
        await fetchUserSkills();
        toast.success('Proficiency updated');
        onSkillsUpdated?.();
      } else {
        toast.error('Failed to update proficiency');
      }
    } catch (err) {
      console.error('Failed to update proficiency:', err);
      toast.error('Failed to update proficiency');
    } finally {
      setUpdating(null);
    }
  };

  const handleDeleteClick = (skillId, skillName) => {
    if (!isOwnProfile) return;
    setDeleteConfirm({ isOpen: true, skillId, skillName });
  };

  const handleDeleteConfirm = async () => {
    const { skillId } = deleteConfirm;
    setDeleteConfirm({ isOpen: false, skillId: null, skillName: '' });
    setUpdating(skillId);
    try {
      const response = await apiFetch('/api/user-skills', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, skill_id: skillId }),
      });
      if (response.ok) {
        await fetchUserSkills();
        toast.success('Skill removed');
        onSkillsUpdated?.();
      } else {
        toast.error('Failed to remove skill');
      }
    } catch (err) {
      console.error('Failed to delete skill:', err);
      toast.error('Failed to remove skill');
    } finally {
      setUpdating(null);
    }
  };

  const handleSkillAdded = async () => {
    setShowAddModal(false);
    await fetchUserSkills();
    toast.success('Skill added');
    onSkillsUpdated?.();
  };

  if (!userId) return <div className="no-user">Select a user to view their profile</div>;
  if (loading) return <div className="loading">Loading profile...</div>;
  if (error) return <div className="error">Error: {error}</div>;
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
                            <option value="L100">L100 - Foundational</option>
                            <option value="L200">L200 - Intermediate</option>
                            <option value="L300">L300 - Advanced</option>
                            <option value="L400">L400 - Expert</option>
                          </select>
                          <button 
                            className="delete-btn"
                            onClick={() => handleDeleteClick(skill.skill_id, skill.skill_name)}
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

      <ConfirmModal
        isOpen={deleteConfirm.isOpen}
        title="Remove Skill"
        message={`Are you sure you want to remove "${deleteConfirm.skillName}" from your profile?`}
        confirmText="Remove"
        cancelText="Cancel"
        variant="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteConfirm({ isOpen: false, skillId: null, skillName: '' })}
      />
    </div>
  );
}

export default UserProfile;
