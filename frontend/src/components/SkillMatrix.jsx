import React, { useState, useEffect, useMemo } from 'react';
import ProficiencyBadge from './ProficiencyBadge';
import apiFetch from '../api';
import './SkillMatrix.css';

// Convert level to numeric value
const levelToNum = (level) => {
  if (!level) return 0;
  return parseInt(level.replace('L', ''), 10);
};

// Convert numeric average back to level
const numToLevel = (num) => {
  if (num === 0) return null;
  if (num < 150) return 'L100';
  if (num < 250) return 'L200';
  if (num < 350) return 'L300';
  return 'L400';
};

function SkillMatrix({ onUserSelect }) {
  const [matrixData, setMatrixData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterCategory, setFilterCategory] = useState('all');
  const [viewBy, setViewBy] = useState('skill'); // 'skill' or 'group'
  const [searchQuery, setSearchQuery] = useState('');
  const [minLevel, setMinLevel] = useState('any'); // 'any', 'L100', 'L200', 'L300', 'L400'
  const [selectedSkill, setSelectedSkill] = useState(null); // For "Find Expert" popup

  useEffect(() => {
    fetchMatrixData();
  }, []);

  const fetchMatrixData = async () => {
    try {
      const response = await apiFetch('/api/matrix');
      if (!response.ok) throw new Error('Failed to fetch matrix data');
      const data = await response.json();
      setMatrixData(data);
      setLoading(false);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  // Compute grouped data
  const { categories, columns, getUserColumnLevel, filteredUsers } = useMemo(() => {
    if (!matrixData) return { categories: [], columns: [], getUserColumnLevel: () => null, filteredUsers: [] };

    const cats = [...new Set(matrixData.skills.map(s => s.category_name))].sort();
    
    const getUserSkillLevel = (userId, skillId) => {
      const key = `${userId}-${skillId}`;
      return matrixData.userSkills[key]?.proficiency_level || null;
    };

    const query = searchQuery.trim().toLowerCase();
    
    // Smart search: filter BOTH users and skills that match
    let users = matrixData.users;
    let matchedUsers = new Set();
    let matchedSkillIds = new Set();
    
    if (query) {
      // Find matching users
      users.forEach(u => {
        if (u.name.toLowerCase().includes(query) || u.role?.toLowerCase().includes(query)) {
          matchedUsers.add(u.id);
        }
      });
      
      // Find matching skills
      matrixData.skills.forEach(s => {
        if (s.name.toLowerCase().includes(query) || s.category_name?.toLowerCase().includes(query)) {
          matchedSkillIds.add(s.id);
        }
      });
      
      // Filter users: show if user matches OR if they have any matching skill
      users = users.filter(u => {
        if (matchedUsers.has(u.id)) return true;
        // Also show users who have any of the matched skills
        for (const skillId of matchedSkillIds) {
          const key = `${u.id}-${skillId}`;
          if (matrixData.userSkills[key]?.proficiency_level) return true;
        }
        return false;
      });
    }

    if (viewBy === 'group') {
      // Group view: one column per category
      let cols = cats.map(cat => ({
        id: cat,
        name: cat,
        isGroup: true,
        skills: matrixData.skills.filter(s => s.category_name === cat)
      }));

      // Filter columns by search (category names)
      if (query) {
        cols = cols.filter(c => c.name.toLowerCase().includes(query));
      }

      const getGroupLevel = (userId, col) => {
        const levels = col.skills
          .map(s => getUserSkillLevel(userId, s.id))
          .filter(l => l !== null)
          .map(levelToNum);
        
        if (levels.length === 0) return null;
        const avg = levels.reduce((a, b) => a + b, 0) / levels.length;
        // Return raw average for group view (Phase 2)
        return { avg: Math.round(avg), level: numToLevel(avg) };
      };

      return { 
        categories: cats, 
        columns: cols, 
        getUserColumnLevel: (userId, col) => getGroupLevel(userId, col),
        filteredUsers: users
      };
    } else {
      // Skill view: one column per skill
      let cols = matrixData.skills.map(s => ({
        id: s.id,
        name: s.name,
        category: s.category_name,
        isGroup: false
      }));

      if (filterCategory !== 'all') {
        cols = cols.filter(c => c.category === filterCategory);
      }

      // Filter columns by search query (skill names)
      if (query) {
        cols = cols.filter(c => 
          c.name.toLowerCase().includes(query) || 
          c.category?.toLowerCase().includes(query)
        );
      }

      return { 
        categories: cats, 
        columns: cols, 
        getUserColumnLevel: (userId, col) => getUserSkillLevel(userId, col.id),
        filteredUsers: users
      };
    }
  }, [matrixData, viewBy, filterCategory, searchQuery]);

  // Get experts for a skill (for "Find Expert" modal)
  const getExpertsForSkill = (skillId) => {
    if (!matrixData) return [];
    const experts = matrixData.users
      .map(user => {
        const key = `${user.id}-${skillId}`;
        const level = matrixData.userSkills[key]?.proficiency_level;
        return { ...user, level };
      })
      .filter(u => u.level)
      .sort((a, b) => levelToNum(b.level) - levelToNum(a.level));
    return experts;
  };

  // Handle skill header click for "Find Expert"
  const handleSkillClick = (col) => {
    if (!col.isGroup) {
      setSelectedSkill(col);
    }
  };

  if (loading) return <div className="loading">Loading matrix...</div>;
  if (error) return <div className="error">Error: {error}</div>;
  if (!matrixData) return <div className="loading">No data available</div>;

  return (
    <div className="skill-matrix">
      <div className="matrix-header">
        <h2>Skills Matrix</h2>
        <div className="filters">
          <div className="search-bar">
            <input
              type="text"
              placeholder="Search people or skills..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
            {searchQuery && (
              <button 
                className="clear-search" 
                onClick={() => setSearchQuery('')}
                title="Clear search"
              >
                ×
              </button>
            )}
          </div>
          <div className="view-by-toggle">
            <button 
              className={viewBy === 'skill' ? 'active' : ''} 
              onClick={() => setViewBy('skill')}
            >
              By Skill
            </button>
            <button 
              className={viewBy === 'group' ? 'active' : ''} 
              onClick={() => setViewBy('group')}
            >
              By Group
            </button>
          </div>
          {viewBy === 'skill' && (
            <>
              <label>
                Category:
                <select 
                  value={filterCategory} 
                  onChange={(e) => setFilterCategory(e.target.value)}
                >
                  <option value="all">All</option>
                  {categories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </label>
              <label>
                Min Level:
                <select 
                  value={minLevel} 
                  onChange={(e) => setMinLevel(e.target.value)}
                >
                  <option value="any">Any</option>
                  <option value="L100">L100+</option>
                  <option value="L200">L200+</option>
                  <option value="L300">L300+</option>
                  <option value="L400">L400 only</option>
                </select>
              </label>
            </>
          )}
        </div>
      </div>

      <div className="matrix-container">
        <table className="matrix-table">
          <thead>
            <tr>
              <th className="sticky-col">Team Member</th>
              {columns.map(col => (
                <th 
                  key={col.id} 
                  className={`skill-header ${col.isGroup ? 'group-header' : 'clickable'}`}
                  onClick={() => handleSkillClick(col)}
                  title={!col.isGroup ? 'Click to find experts' : ''}
                >
                  <div className="skill-name">{col.name}</div>
                  {!col.isGroup && <div className="skill-category">{col.category}</div>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map(user => (
              <tr key={user.id}>
                <td className="sticky-col user-cell">
                  <div className="user-info">
                    <div 
                      className="user-name"
                      onClick={() => onUserSelect && onUserSelect(user.id)}
                    >
                      {user.name}
                    </div>
                    <div className="user-role">{user.role}</div>
                  </div>
                </td>
                {columns.map(col => {
                  const levelData = getUserColumnLevel(user.id, col);
                  
                  // Handle group view (returns {avg, level}) vs skill view (returns string)
                  const isGroupData = levelData && typeof levelData === 'object';
                  const level = isGroupData ? levelData.level : levelData;
                  const avgNum = isGroupData ? levelData.avg : null;
                  
                  // Apply min level filter
                  const minLevelNum = minLevel === 'any' ? 0 : levelToNum(minLevel);
                  const currentLevelNum = isGroupData ? avgNum : (level ? levelToNum(level) : 0);
                  const showLevel = level && currentLevelNum >= minLevelNum;
                  
                  return (
                    <td key={col.id} className="skill-cell">
                      {showLevel && (
                        isGroupData ? (
                          <span 
                            className={`avg-badge avg-${level?.toLowerCase()}`}
                            title={`Average: ${avgNum} (${level})`}
                          >
                            {avgNum}
                          </span>
                        ) : (
                          <ProficiencyBadge level={level} compact />
                        )
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="legend">
        <h3>Proficiency Levels:</h3>
        <div className="legend-items">
          <ProficiencyBadge level="L100" showDescription />
          <ProficiencyBadge level="L200" showDescription />
          <ProficiencyBadge level="L300" showDescription />
          <ProficiencyBadge level="L400" showDescription />
        </div>
        {viewBy === 'group' && (
          <div className="legend-note">
            Group view shows average proficiency (100-400 scale)
          </div>
        )}
      </div>

      {/* Find Expert Modal */}
      {selectedSkill && (
        <div className="find-expert-modal">
          <div className="find-expert-content">
            <div className="find-expert-header">
              <h3>Experts in: {selectedSkill.name}</h3>
              <button className="close-btn" onClick={() => setSelectedSkill(null)}>×</button>
            </div>
            <div className="find-expert-category">{selectedSkill.category}</div>
            <div className="experts-list">
              {getExpertsForSkill(selectedSkill.id).length === 0 ? (
                <div className="no-experts">No team members have this skill yet.</div>
              ) : (
                getExpertsForSkill(selectedSkill.id).map(expert => (
                  <div 
                    key={expert.id} 
                    className="expert-item"
                    onClick={() => {
                      setSelectedSkill(null);
                      onUserSelect && onUserSelect(expert.id);
                    }}
                  >
                    <div className="expert-info">
                      <span className="expert-name">{expert.name}</span>
                      <span className="expert-role">{expert.role}</span>
                    </div>
                    <ProficiencyBadge level={expert.level} />
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SkillMatrix;
