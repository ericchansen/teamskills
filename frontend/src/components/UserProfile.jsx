import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import ProficiencyBadge, { PROFICIENCY_CONFIG } from './ProficiencyBadge';
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
  const [syncStatus, setSyncStatus] = useState({ configured: false, syncing: false, lastResult: null });

  // Check if SharePoint sync is available
  useEffect(() => {
    async function checkSyncStatus() {
      try {
        const response = await apiFetch('/api/sharepoint/status');
        if (response.ok) {
          const data = await response.json();
          setSyncStatus(prev => ({ ...prev, configured: data.configured }));
        }
      } catch {
        // Sync not available — ignore
      }
    }
    checkSyncStatus();
  }, []);

  const fetchUserData= useCallback(async () => {
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

  const handleSharePointPull = async () => {
    setSyncStatus(prev => ({ ...prev, syncing: true, lastResult: null }));
    try {
      const response = await apiFetch('/api/sharepoint/pull', { method: 'POST' });
      const data = await response.json();
      if (response.ok) {
        toast.success(`Synced from SharePoint: ${data.users?.created || 0} new, ${data.users?.updated || 0} updated`);
        setSyncStatus(prev => ({ ...prev, lastResult: 'pull-success' }));
        await Promise.all([fetchUserData(), fetchUserSkills()]);
        onSkillsUpdated?.();
      } else if (data.consentRequired) {
        toast.error('Admin consent required — a tenant admin must grant SharePoint access for this app.');
        setSyncStatus(prev => ({ ...prev, lastResult: 'pull-error' }));
      } else {
        toast.error(data.error || 'SharePoint pull failed');
        setSyncStatus(prev => ({ ...prev, lastResult: 'pull-error' }));
      }
    } catch (err) {
      toast.error('SharePoint sync failed');
      setSyncStatus(prev => ({ ...prev, lastResult: 'pull-error' }));
    } finally {
      setSyncStatus(prev => ({ ...prev, syncing: false }));
    }
  };

  const handleSharePointPush = async () => {
    setSyncStatus(prev => ({ ...prev, syncing: true, lastResult: null }));
    try {
      const response = await apiFetch('/api/sharepoint/push', { method: 'POST' });
      const data = await response.json();
      if (response.ok) {
        toast.success(`Pushed ${data.fieldsUpdated || 0} skills to SharePoint`);
        setSyncStatus(prev => ({ ...prev, lastResult: 'push-success' }));
      } else if (data.consentRequired) {
        toast.error('Admin consent required — a tenant admin must grant SharePoint access for this app.');
        setSyncStatus(prev => ({ ...prev, lastResult: 'push-error' }));
      } else {
        toast.error(data.error || 'SharePoint push failed');
        setSyncStatus(prev => ({ ...prev, lastResult: 'push-error' }));
      }
    } catch (err) {
      toast.error('SharePoint push failed');
      setSyncStatus(prev => ({ ...prev, lastResult: 'push-error' }));
    } finally {
      setSyncStatus(prev => ({ ...prev, syncing: false }));
    }
  };

  if (!userId)return <div className="no-user">Select a user to view their profile</div>;
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
          <div className="profile-actions">
            <button className="add-skill-btn" onClick={() => setShowAddModal(true)}>
              + Add Skill
            </button>
            {syncStatus.configured && (
              <>
                <button
                  className="sync-btn sync-pull"
                  onClick={handleSharePointPull}
                  disabled={syncStatus.syncing}
                  title="Pull latest skills from SharePoint for the team"
                >
                  {syncStatus.syncing ? '⏳' : '⬇'} Pull from SharePoint
                </button>
                <button
                  className="sync-btn sync-push"
                  onClick={handleSharePointPush}
                  disabled={syncStatus.syncing}
                  title="Push your skill levels to SharePoint"
                >
                  {syncStatus.syncing ? '⏳' : '⬆'} Push to SharePoint
                </button>
              </>
            )}
          </div>
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
                            {Object.entries(PROFICIENCY_CONFIG).map(([key, cfg]) => (
                              <option key={key} value={key}>{cfg.label}</option>
                            ))}
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
